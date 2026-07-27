export const KERNEL = {
  label: 'Kernel',
  section: '#the-kernel',
  role: 'DigitalBrain.Kernel.Neuron mechanics only — receive and dispatch synapses, journal both directions, enforce owner and delivery invariants, mint the one opaque CapabilityDelegation. No AI, provider, integration, or memory concepts live here.',
  owns: ['Neuron', 'Synapse', 'CapabilityDelegation'],
  synapses: ['CapabilityRequested', 'CapabilityCompleted'],
}

export const MODULES = [
  {
    id: 'ai', label: 'AI', status: 'built', section: '#ai',
    role: 'MAF-backed agents and orchestration over typed models. The public wire is Microsoft.Extensions.AI; MAF types stay internal.',
    neurons: ['ILLM', 'IAgent', 'IGroupChat', 'ILlama32', 'IGpt56'], synapses: [],
    mcp: false, ui: false,
    aspire: [
      { res: 'Ollama', sub: 'data volume', model: 'llama3.2', params: [] },
      { res: 'OpenAI', sub: '', model: 'gpt-5.6', params: ['<brain>-ai-openai-api-key'] },
    ],
    example: true,
  },
  {
    id: 'tasks', label: 'Tasks', status: 'built', section: '#tasks',
    role: 'Durable desired-outcome identity and attempt/worker vocabulary. Exactly one Attempt is active at a time. Supervised MAF-per-attempt workers are designed; no live worker producer ships yet. Attempt facts are accepted when produced.',
    neurons: ['ITask', 'IWorker'],
    synapses: ['AttemptSucceeded', 'AttemptFailed', 'AttemptWaiting', 'AttemptProgressed', 'AttemptOutcomeUncertain'],
    mcp: false, ui: false, aspire: [],
  },
  {
    id: 'google', label: 'Google', status: 'built', section: '#google',
    role: 'Gmail as a semantic capability root. Exact hosted-MCP admission and mapping stay module-private; raw MCP types never cross IGmail.',
    neurons: ['IGmail'], synapses: [], mcp: true, ui: false,
    aspire: [{ res: 'Google OAuth', sub: 'loopback callback', model: '', params: ['google-client-id', 'google-client-secret', 'google-redirect-uri'] }],
  },
  {
    id: 'salesforce', label: 'Salesforce', status: 'built', section: '#salesforce',
    role: 'Approved, reconciled external mutations bound to a CommandId. Never claims exactly-once effects.',
    neurons: ['ISalesforce'], synapses: [], mcp: true, ui: false,
    aspire: [{ res: 'Salesforce OAuth', sub: 'external client app', model: '', params: ['salesforce-client-id', 'salesforce-redirect-uri'] }],
  },
  {
    id: 'time', label: 'Time', status: 'built', section: '#time',
    role: 'Built: durable one-shot ICountdown. Designed/unbuilt: IReminder and recurring calendar schedules. Separate from kernel-private outbox timers; reuses the shared kernel reminder provider.',
    neurons: ['ICountdown'],
    synapses: ['CountdownElapsed'],
    mcp: false, ui: false, aspire: [],
  },
  {
    id: 'flutter', label: 'Flutter', status: 'built', section: '#flutter',
    role: 'Semantic UI vocabulary (IShell, IScene) with journaled scene/control facts. Flutter/Dart host is a northbound client edge, not an embedded silo. Module Aspire.Hosting composes the OS surface when host options are selected. Drift guard is a golden wire manifest over Contracts.',
    neurons: ['IShell', 'IScene'],
    synapses: ['SceneOpened', 'ControlActivated'],
    mcp: false, ui: true,
    aspire: [
      { res: 'digitalbrain-ui', sub: 'AsClient edge', model: '', params: ['DigitalBrain__Owner'] },
      { res: 'digitalbrain-flutter', sub: 'Desktop (default) or Headless — no Auto', model: '', params: ['DIGITALBRAIN_UI_BASE', 'DIGITALBRAIN_SHELL'] },
    ],
  },
  {
    id: 'memory', label: 'Memory', status: 'scope', section: '#memory',
    role: 'Deliberately out of scope. Designed independently around its own vocabulary, later.',
    neurons: [], synapses: [], mcp: false, ui: false, aspire: [],
  },
]

export const ACTORS = [
  {
    id: 'people', label: 'People', status: 'built',
    role: 'Operate the brain through the owner-bound IDigitalBrain facade (AddDigitalBrainClient in production DI; Connect only for Testing/host wiring). They send and emit typed facts, and they are the approval authority for every behaviour install.',
  },
  {
    id: 'agents', label: 'Agents', status: 'designed',
    role: 'LLM-powered neurons that also act inside the workspace. An agent can propose a behaviour or operate a neuron, but a mutating action still passes through the same human approval rail — an agent advises, it never owns authority.',
  },
]

export const BEHAVIORS = [
  {
    id: 'digest', label: 'Morning digest', status: 'designed', trigger: 'on CountdownElapsed',
    uses: ['CountdownElapsed', 'ICountdown', 'IGmail', 'ILlama32'],
    role: 'When a one-shot countdown elapses, read a message and summarise it with a local model. Composes shipped Time, Google, and AI vocabulary — no new contract. (A future IReminder would replace the daily re-arm pattern.)',
    script: `public sealed class MorningDigest(
    ICountdown daily, IGmail gmail, ILlama32 llama)
    : Behavior, IHandle<CountdownElapsed>
{
    public async Task HandleAsync(CountdownElapsed e, ...)
    {
        var message = await gmail.ReadMessage(...);
        await llama.Respond([new ChatMessage(ChatRole.User, Summarise(message))]);
    }
}`,
  },
  {
    id: 'lead', label: 'Lead follow-up', status: 'designed', trigger: 'on AttemptWaiting',
    uses: ['AttemptWaiting', 'ISalesforce', 'ICountdown'],
    role: 'When an attempt reports it is waiting on approval, propose a Salesforce update and set a follow-up countdown. Composes Tasks, Salesforce, and Time — the mutation stays behind the module\'s approval rail.',
    script: `public sealed class LeadFollowUp(
    ISalesforce crm, ICountdown followUp)
    : Behavior, IHandle<AttemptWaiting>
{
    public async Task HandleAsync(AttemptWaiting a, ...)
    {
        if (a.Blocker is not ApprovalRequired) return;
        await crm.ProposeAccountDescription(...);
        await followUp.Start(new StartCountdown(CommandId.New(), TimeSpan.FromDays(2), dest));
    }
}`,
  },
]
