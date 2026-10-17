"""Local benchmark: real HTTP ingress, gRPC signal delivery and neuron reads.
No polling; waits are bounded on change events. Does not measure Flutter paint.
"""
import sys, os, json, ssl, time, uuid, threading, queue, urllib.request, urllib.error
from pathlib import Path
BASE = Path(__file__).resolve().parents[3] / 'artifacts' / 'assistant-benchmark'
ROOT = Path(os.environ.get('ASSISTANT_BENCHMARK_OUTPUT', str(BASE / ('run-'+time.strftime('%Y%m%d-%H%M%S')+'-'+uuid.uuid4().hex[:8]))))
ROOT.mkdir(parents=True, exist_ok=True)
sys.path[:0] = [str(BASE / 'deps'), str(BASE)]
import grpc
import neurons_pb2 as pb
import neurons_pb2_grpc as rpc

APP = 'owner/apps/assistant'
TEXT = 'DigitalBrain.Flutter.Text.IText'
CHAT = 'DigitalBrain.Flutter.Chat.IChat'
COMPOSER = 'DigitalBrain.Flutter.Chat.IComposer'
AGENT = 'DigitalBrain.AI.Agents.IAgent'
WORKSPACE = 'DigitalBrain.Flutter.Workspace.IWorkspace'
FILES_WINDOW = 'owner/apps/files/window'
channel = grpc.secure_channel('localhost:59121', grpc.ssl_channel_credentials(ssl.get_server_certificate(('localhost', 59121)).encode()))
stub = rpc.NeuronsStub(channel)

def call(contract, key, method='Read', args=None):
    reply = stub.Call(pb.CallRequest(brain_id='owner', contract=contract, key=key, method=method, arguments=json.dumps(args or []).encode()), timeout=30)
    return json.loads(reply.result) if reply.result else None

def http(path, body):
    request = urllib.request.Request('http://localhost:5080/brains/owner' + path, data=json.dumps(body).encode(), headers={'Content-Type':'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as e:
        raise RuntimeError(str(e)+': '+e.read().decode()) from e

class Watch:
    def __init__(self, sources):
        self.queue = queue.Queue()
        self.stream = stub.Watch(pb.WatchRequest(brain_id='owner', sources=[pb.WatchSource(contract=c, key=k, signal_types=t) for c,k,t in sources]))
        threading.Thread(target=self.pump, daemon=True).start()
    def pump(self):
        try:
            for s in self.stream:
                self.queue.put({'received':time.time(), 'perf':time.perf_counter(), 'source':s.source, 'type':s.type, 'sequence':s.sequence, 'serverTimeMs':s.server_time_ms, 'payload':json.loads(s.payload)})
        except Exception as e: self.queue.put(e)
    def next(self, timeout=30):
        item = self.queue.get(timeout=timeout)
        if isinstance(item, Exception): raise item
        return item
    def close(self): self.stream.cancel()

def select(conversation):
    desired = APP+'/conversations/'+conversation
    if call(COMPOSER, APP+'/composer')['context'] == desired: return desired
    w = Watch([(COMPOSER, APP+'/composer', ['ComposerChanged'])])
    try:
        call(TEXT, APP+'/conversation', 'Set', [conversation])
        while True:
            state = call(COMPOSER, APP+'/composer')
            if state['context'] == desired: return desired
            w.next()
    finally: w.close()

def restore(saved):
    select(saved['conversation']['markdown'])
    call(COMPOSER, APP+'/composer', 'Edit', [saved['composer']['context'], saved['composer']['draft']])
    call(TEXT, APP+'/status', 'Set', [saved['status']['markdown']])
    state = call(WORKSPACE, 'owner')
    old_open = {w['id'] for w in saved['workspace']['windows'] if w.get('isOpen', True)}
    # The state uses closed windows too; inspect actual flag before changing anything.
    for window in state['windows']:
        if window['id'] not in old_open and window.get('isOpen', True):
            state = call(WORKSPACE, 'owner', 'Close', [window['id'],state['revision'],str(uuid.uuid4())])
    for window in saved['workspace']['windows']:
        if window['id'] in old_open and not any(w['id']==window['id'] and w['isOpen'] for w in state['windows']):
            state = call(WORKSPACE,'owner','Open',[{'operationId':str(uuid.uuid4()),'windowId':window['id'],'title':window['title'],'reference':window['reference'],'expectedRevision':state['revision']}])['state']
    focus = saved['workspace'].get('focusedWindow')
    if focus != state.get('focusedWindow'):
        call(WORKSPACE, 'owner', 'Focus', [focus,str(uuid.uuid4()),state['revision']])

def snapshot():
    return {'conversation':call(TEXT,APP+'/conversation'),'composer':call(COMPOSER,APP+'/composer'),
            'status':call(TEXT,APP+'/status'),'workspace':call(WORKSPACE,'owner')}

def files_open(state):
    return any(w['id']==FILES_WINDOW and w['isOpen'] and
               w['reference']=={'kind':'surface','neuronId':'owner/apps/files/surface'} for w in state['windows'])

def prepare_window(opened):
    manifest=call('DigitalBrain.Apps.IApp','owner/apps/files')['manifest']
    assert manifest['entry']=={'kind':'surface','name':'surface'}, 'Files entry changed; update benchmark target.'
    state=call(WORKSPACE,'owner')
    if opened:
        call(WORKSPACE,'owner','Open',[{'operationId':str(uuid.uuid4()),'windowId':FILES_WINDOW,
             'title':manifest['title'],'reference':{'kind':'surface','neuronId':'owner/apps/files/surface'},'expectedRevision':state['revision']}])
    elif files_open(state):
        call(WORKSPACE,'owner','Close',[FILES_WINDOW,state['revision'],str(uuid.uuid4())])
    assert files_open(call(WORKSPACE,'owner'))==opened

def run(path, prompt, label):
    if any((ROOT/(label+suffix)).exists() for suffix in ['.json','-error.json']):
        raise FileExistsError('Choose a fresh output directory; evidence already exists for '+label)
    conversation = 'bench-'+uuid.uuid4().hex
    source = select(conversation)
    call(TEXT,APP+'/status','Set',[''])
    if path == 'composer': call(COMPOSER,APP+'/composer','Edit',[source,prompt])
    watch = Watch([(CHAT,APP+'/transcript',['ChatChanged']), (TEXT,APP+'/status',['TextChanged']),
                   (WORKSPACE,'owner',['WorkspaceChanged']), (AGENT,source,['TurnStarted','TurnProgressed','TurnCompleted'])])
    events=[]
    workspace_before=call(WORKSPACE,'owner')
    try:
        # Initial state is read after watch creation; retained change signals also replay.
        request_id = str(uuid.uuid4())
        start_wall=time.time(); start=time.perf_counter()
        if path == 'composer':
            accepted=http('/apps/event', {'kind':'composer','name':APP+'/composer','action':'submit','context':source,'operationId':request_id,'value':prompt})
        else:
            accepted=http('/apps/assistant/request', {'operation':'send','input':prompt})
            request_id=accepted['requestId']
        ack=time.perf_counter()-start
        first=None; done=None; run_state=None; status=''; projection=None
        window_open=0.0 if files_open(workspace_before) else None
        workspace_changed=None
        deadline=start+120
        while done is None:
            e=watch.next(max(0.01,deadline-time.perf_counter()))
            if e['perf'] < start: continue
            e['elapsed']=e['perf']-start
            if e['source']==APP+'/transcript':
                state=call(CHAT,APP+'/transcript'); e['read']=state; e['readElapsed']=time.perf_counter()-start
                projection=state.get('projection')
                if projection and projection['source']==source:
                    messages=projection.get('messages',[])
                    assistants=[m for m in messages if m.get('role') in ['assistant',1]]
                    if any(m.get('text','').strip() for m in assistants) and first is None: first=e['readElapsed']
                    if assistants and all(m.get('status') in ['done','completed','failed','cancelled'] for m in assistants): done=e['readElapsed']
            elif e['source']==source:
                state=call(AGENT,source); e['read']=state; e['readElapsed']=time.perf_counter()-start
                if state.get('runs'): run_state=state['runs'][-1]
            elif e['source']==APP+'/status':
                status=call(TEXT,APP+'/status')['markdown']; e['read']=status
                if '-> opened ' in status: done=time.perf_counter()-start
            elif e['source']=='owner':
                state=call(WORKSPACE,'owner'); e['read']=state; e['readElapsed']=time.perf_counter()-start
                if state['revision']>workspace_before['revision'] and workspace_changed is None:
                    workspace_changed=e['readElapsed']
                if files_open(state) and window_open is None: window_open=e['readElapsed']
            events.append(e)
            if time.perf_counter()>=deadline: raise TimeoutError('120-second measurement cap')
        final=call(AGENT,source)
        workspace_after=call(WORKSPACE,'owner')
        runs=final.get('runs',[])
        outcome=runs[-1]['status'] if runs else 'direct'
        result={'label':label,'path':path,'prompt':prompt,'source':source,'requestId':request_id,'started':start_wall,'ack':ack,'firstText':first,'complete':done,'agent':final,'status':status,'projection':projection,'events':events,
                'outcome':outcome,'workspaceBefore':workspace_before,'workspaceAfter':workspace_after,
                'windowOpen':window_open,'workspaceChanged':workspace_changed,
                'windowVerified':files_open(workspace_after) and workspace_after.get('focusedWindow')==FILES_WINDOW if prompt=='Open Files' else None}
        (ROOT/(label+'.json')).write_text(json.dumps(result,indent=2),encoding='utf-8')
        print(json.dumps({k:result[k] for k in ['label','path','requestId','ack','firstText','complete','status']}),flush=True)
        return result
    except Exception as e:
        failed_state=call(AGENT,source)
        active=failed_state.get('activeRun')
        if active and active['runId']==request_id.replace('-',''):
            call(AGENT,source,'CancelRun',[active['runId']])
        (ROOT/(label+'-error.json')).write_text(json.dumps({'label':label,'path':path,'prompt':prompt,'error':str(e),'source':source,'requestId':request_id,'events':events,'agent':failed_state,'workspaceBefore':workspace_before,'workspaceAfter':call(WORKSPACE,'owner')},indent=2),encoding='utf-8')
        raise
    finally: watch.close()

if __name__=='__main__':
    saved=snapshot()
    if call(AGENT,saved['composer']['context']).get('activeRun') or saved['composer'].get('voice'):
        raise RuntimeError('An agent turn or voice capture is active; do not benchmark over it.')
    with (ROOT/'saved-state.json').open('x',encoding='utf-8') as file:
        json.dump(saved,file,indent=2)
    try:
        if sys.argv[1:] == ['inspect']:
            print(json.dumps(saved,indent=2))
        elif sys.argv[1:] == ['matrix']:
            failures=[]
            measured=[]
            cases=[('plain','Reply with exactly: benchmark ready. Do not use tools.'),
                   ('open','Open Files'),
                   ('lookup','Use your tools to list the installed apps. Answer with the app names only.'),
                   ('closed','Open Files')]
            for round in range(1,4):
                for case,prompt in cases:
                    for path in (['composer','send'] if round%2 else ['send','composer']):
                        if case in ['open','closed']: prepare_window(case=='open')
                        label=f'{case}-{round}-{path}'
                        try:
                            result=run(path,prompt,label)
                            measured.append(label)
                            if result['outcome'] not in [1,'Completed','completed','direct'] or result['windowVerified'] is False:
                                failures.append({'label':label,'outcome':result['outcome'],'windowVerified':result['windowVerified']})
                        except Exception as error:
                            failure={'label':label,'failure':str(error)}
                            failures.append(failure)
                            print(json.dumps(failure),flush=True)
                        finally: restore(saved)
            summary={'expected':24,'measured':measured,'failures':failures}
            (ROOT/'matrix.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
            if failures or len(measured)!=24: raise RuntimeError('Matrix contains failures; see matrix.json and per-run evidence.')
        else:
            run(sys.argv[1],sys.argv[2],sys.argv[3])
    finally:
        restore(saved)
        restored=snapshot()
        checks={'conversation':restored['conversation']['markdown']==saved['conversation']['markdown'],
                'draft':all(restored['composer'][k]==saved['composer'][k] for k in ['context','draft']),
                'status':restored['status']['markdown']==saved['status']['markdown'],
                'focus':restored['workspace']['focusedWindow']==saved['workspace']['focusedWindow'],
                'openWindows':{w['id'] for w in restored['workspace']['windows'] if w['isOpen']}=={w['id'] for w in saved['workspace']['windows'] if w['isOpen']}}
        (ROOT/'restoration.json').write_text(json.dumps({'checks':checks,'state':restored},indent=2),encoding='utf-8')
        assert all(checks.values()), checks
