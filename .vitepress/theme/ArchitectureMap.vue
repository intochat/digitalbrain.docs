<script setup>
import { ref, computed } from 'vue'
import { KERNEL, MODULES, ACTORS, BEHAVIORS } from './architecture-data.js'

const SLABEL = { built: 'Built', designed: 'Designed', scope: 'Out of scope' }
const DOT = { built: 'b', designed: 'd', scope: 's' }

const pinned = ref('mod:ai') // default: AI open so the facets and model config show on load
const hovered = ref(null)
const activeKey = computed(() => pinned.value ?? hovered.value)

const activeModule = computed(() =>
  activeKey.value?.startsWith('mod:') ? MODULES.find(m => 'mod:' + m.id === activeKey.value) : null)
const activeBehavior = computed(() =>
  activeKey.value?.startsWith('beh:') ? BEHAVIORS.find(b => 'beh:' + b.id === activeKey.value) : null)
const activeActor = computed(() => ACTORS.find(a => a.id === activeKey.value) ?? null)
const activeKernel = computed(() => activeKey.value === 'kernel')

const glow = computed(() => new Set(activeBehavior.value?.uses ?? []))
const dimVocab = computed(() => activeBehavior.value != null)
const flows = computed(() => {
  if (activeKernel.value) return ['t1-t2']
  if (activeBehavior.value || activeActor.value) return ['t1-t2', 't2-t3']
  return []
})

const facetsOf = m => {
  const f = []
  if (m.mcp) f.push('MCP')
  if (m.aspire.length) f.push('Aspire')
  if (m.ui) f.push('UI')
  return f
}
const isSynapse = t => /^[A-Z]/.test(t) && !t.startsWith('I')

const enter = key => { if (!pinned.value) hovered.value = key }
const leave = () => { hovered.value = null }
const toggle = key => { pinned.value = pinned.value === key ? null : key; hovered.value = null }
</script>

<template>
  <div class="arch-map">
    <div class="legend">
      <span><i class="dot k" /> Kernel</span>
      <span><i class="dot b" /> Built</span>
      <span><i class="dot d" /> Designed</span>
      <span><i class="dot s" /> Out of scope</span>
      <span><i class="dot f" /> Synapse (fact)</span>
    </div>

    <div class="layout">
      <div class="tiers">
        <!-- TIER 1 -->
        <section class="tier">
          <div class="tier-label"><span class="tier-num">01</span><h3>DigitalBrain</h3><span class="tl-sub">the substrate and everything a module ships — compile-time</span></div>
          <div class="platform">
            <button class="kernel-strip" :class="{ sel: activeKernel }"
              @mouseenter="enter('kernel')" @mouseleave="leave" @focus="enter('kernel')" @click="toggle('kernel')">
              <span class="kn"><i class="dot k" /> Kernel</span>
              <span class="ks-sub">routes synapses · dual journals · owner &amp; delivery invariants · one opaque delegation</span>
              <span class="ks-chips"><span v-for="t in KERNEL.synapses" :key="t" class="chip synapse">{{ t }}</span></span>
            </button>
            <div class="modgrid">
              <button v-for="m in MODULES" :key="m.id" class="mod" :class="{ sel: activeKey === 'mod:' + m.id }"
                :style="{ '--edge': 'var(--' + m.status + ')' }"
                @mouseenter="enter('mod:' + m.id)" @mouseleave="leave" @focus="enter('mod:' + m.id)" @click="toggle('mod:' + m.id)">
                <span class="mod-name">{{ m.label }}<span class="mod-status">{{ m.status === 'scope' ? 'scope' : SLABEL[m.status] }}</span></span>
                <div class="vocab" :class="{ dim: dimVocab }">
                  <p class="vlabel"><i class="dot n" /> Neurons</p>
                  <div v-if="m.neurons.length" class="chips">
                    <span v-for="t in m.neurons" :key="t" class="chip neuron" :class="{ glow: glow.has(t) }">{{ t }}</span>
                  </div>
                  <span v-else class="none">none</span>
                  <p class="vlabel"><i class="dot f" /> Synapses</p>
                  <div v-if="m.synapses.length" class="chips">
                    <span v-for="t in m.synapses" :key="t" class="chip synapse" :class="{ glow: glow.has(t) }">{{ t }}</span>
                  </div>
                  <span v-else class="none">none</span>
                </div>
                <div v-if="facetsOf(m).length" class="ships-footer">
                  <span class="sf-lbl">also ships</span>
                  <span v-for="f in facetsOf(m)" :key="f" class="fpill">{{ f }}</span>
                </div>
              </button>
            </div>
          </div>
        </section>

        <div class="tconnect" :class="{ hot: flows.includes('t1-t2') }"><span class="track" />actors operate the vocabulary ↑↓</div>

        <!-- TIER 2 -->
        <section class="tier">
          <div class="tier-label"><span class="tier-num">02</span><h3>People &amp; Agents</h3><span class="tl-sub">the actors in a workspace — owner "acme"</span></div>
          <div class="actors-tier">
            <button v-for="a in ACTORS" :key="a.id" class="actor" :class="{ sel: activeKey === a.id }"
              @mouseenter="enter(a.id)" @mouseleave="leave" @focus="enter(a.id)" @click="toggle(a.id)">
              <span class="a-top"><i class="dot" :class="DOT[a.status]" /> {{ a.label }}
                <span class="badge a-badge" :class="a.status">{{ SLABEL[a.status] }}</span></span>
              <p class="a-role">{{ a.role }}</p>
            </button>
          </div>
        </section>

        <div class="tconnect" :class="{ hot: flows.includes('t2-t3') }"><span class="track" />author ↓</div>

        <!-- TIER 3 -->
        <section class="tier">
          <div class="tier-label"><span class="tier-num">03</span><h3>Behaviors — scripting</h3><span class="tl-sub">designed · unbuilt · one C# file · human-approved install</span></div>
          <div class="behaviors-tier">
            <p class="beh-hint">Designed, not built. A behaviour will be one public <b>Behavior</b> class composing existing typed vocabulary. Until the rail ships, shell/OS logic lives as ordinary C# under <b>samples/DigitalBrain.Compositions</b> (pre-rail, not installed Behaviors). <b>Select one designed example.</b></p>
            <div class="behgrid">
              <button v-for="b in BEHAVIORS" :key="b.id" class="beh" :class="{ sel: activeKey === 'beh:' + b.id }"
                @mouseenter="enter('beh:' + b.id)" @mouseleave="leave" @focus="enter('beh:' + b.id)" @click="toggle('beh:' + b.id)">
                <span class="beh-name">{{ b.label }}</span>
                <p class="beh-trig">{{ b.trigger }}</p>
                <div class="beh-uses">
                  <span v-for="t in b.uses" :key="t" class="chip" :class="isSynapse(t) ? 'synapse' : 'neuron'">{{ t }}</span>
                </div>
              </button>
            </div>
          </div>
        </section>
      </div>

      <!-- PANEL -->
      <aside class="panel">
        <template v-if="activeModule">
          <div class="p-head"><i class="dot" :class="DOT[activeModule.status]" /><h4>{{ activeModule.label }}</h4>
            <span class="badge" :class="activeModule.status">{{ SLABEL[activeModule.status] }}</span></div>
          <p class="p-kind">module · ships onto the kernel</p>
          <p class="p-role">{{ activeModule.role }}</p>

          <p class="p-sec">Neurons — capabilities</p>
          <div v-if="activeModule.neurons.length" class="chips"><span v-for="t in activeModule.neurons" :key="t" class="chip neuron">{{ t }}</span></div>
          <span v-else class="none">none yet</span>

          <p class="p-sec" :class="{ off: !activeModule.synapses.length }">Synapses — typed facts</p>
          <div v-if="activeModule.synapses.length" class="chips"><span v-for="t in activeModule.synapses" :key="t" class="chip synapse">{{ t }}</span></div>
          <span v-else class="none">none</span>

          <p class="p-sec" :class="{ off: !activeModule.mcp }">MCP tools{{ activeModule.mcp ? '' : ' — none' }}</p>
          <p v-if="activeModule.mcp" class="p-note">A private pinned catalog. Projected to the model as selected exact tools — the raw MCP client, tool names, and JSON never cross the module contract.</p>

          <p class="p-sec" :class="{ off: !activeModule.aspire.length }">Aspire hosting{{ activeModule.aspire.length ? '' : ' — none' }}</p>
          <div v-for="a in activeModule.aspire" :key="a.res" class="res">
            <b>{{ a.res }}</b><span v-if="a.sub" class="arrow"> · {{ a.sub }}</span><span v-if="a.model"> → <span class="mono">{{ a.model }}</span></span>
            <div v-if="a.params.length" class="chips param-row">
              <span v-for="p in a.params" :key="p" class="chip param secret">{{ p }}</span>
            </div>
          </div>

          <p class="p-sec" :class="{ off: !activeModule.ui }">UI{{ activeModule.ui ? '' : ' — none' }}</p>
          <p v-if="activeModule.ui" class="p-note">UI vocabulary + C# northbound edge Built (L0/L1). Host mode is explicit Desktop or Headless — no Auto. Product AppHost OS Healthy is residual; full chrome Designed. Pre-rail OS compositions under samples/DigitalBrain.Compositions are logic samples, not installed Behaviors.</p>

          <template v-if="activeModule.example">
            <p class="p-sec">Model configuration</p>
            <pre class="code">brain.AddModule&lt;AIModule&gt;(ai =&gt; ai
    .WithLlm&lt;Llama32&gt;()   // Ollama · llama3.2
    .WithLlm&lt;Gpt56&gt;());  // OpenAI · gpt-5.6 · 🔒 openai-api-key</pre>
          </template>

          <a class="p-jump" :href="activeModule.section">Read the {{ activeModule.label }} section →</a>
        </template>

        <template v-else-if="activeBehavior">
          <div class="p-head"><h4>{{ activeBehavior.label }}</h4><span class="badge designed">behaviour</span></div>
          <p class="p-kind">scripting · composes {{ activeBehavior.uses.length }} pieces of vocabulary</p>
          <p class="p-role">{{ activeBehavior.role }}</p>
          <p class="p-sec">Composes</p>
          <div class="chips"><span v-for="t in activeBehavior.uses" :key="t" class="chip" :class="isSynapse(t) ? 'synapse' : 'neuron'">{{ t }}</span></div>
          <p class="p-sec">The whole file</p>
          <pre class="code">{{ activeBehavior.script }}</pre>
          <a class="p-jump" href="#_5-behaviors-and-scripting">Read Behaviors →</a>
        </template>

        <template v-else-if="activeActor">
          <div class="p-head"><i class="dot" :class="DOT[activeActor.status]" /><h4>{{ activeActor.label }}</h4>
            <span class="badge" :class="activeActor.status">{{ SLABEL[activeActor.status] }}</span></div>
          <p class="p-kind">actor · in the workspace</p>
          <p class="p-role">{{ activeActor.role }}</p>
        </template>

        <template v-else-if="activeKernel">
          <div class="p-head"><i class="dot k" /><h4>{{ KERNEL.label }}</h4><span class="badge core">Built</span></div>
          <p class="p-kind">neuron substrate</p>
          <p class="p-role">{{ KERNEL.role }}</p>
          <p class="p-sec">Owns</p>
          <div class="chips"><span v-for="t in KERNEL.owns" :key="t" class="chip neuron">{{ t }}</span></div>
          <a class="p-jump" :href="KERNEL.section">Read the Kernel section →</a>
        </template>

        <p v-else class="p-empty">Hover the platform, the actors, or a behaviour. Click a module for everything it ships, or a behaviour to light up the exact neurons and synapses it composes.</p>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.arch-map {
  --ground: var(--vp-c-bg);
  --board: var(--vp-c-bg);
  --panel: var(--vp-c-bg-soft);
  --sunk: var(--vp-c-bg-soft);
  --ink: var(--vp-c-text-1);
  --muted: var(--vp-c-text-2);
  --faint: var(--vp-c-text-3);
  --hair: var(--vp-c-divider);
  --accent: #0891b2; --built: #059669; --designed: #d97706; --scope: #64748b; --fact: #7c3aed;
  --shadow: 0 1px 2px rgba(20, 30, 60, .06), 0 8px 26px rgba(20, 30, 60, .08);
  margin: 20px 0 8px;
  font-size: 14px;
  color: var(--ink);
}
:global(html.dark) .arch-map {
  --accent: #22d3ee; --built: #34d399; --designed: #fbbf24; --scope: #7c89a3; --fact: #a78bfa;
  --shadow: 0 1px 2px rgba(0, 0, 0, .4), 0 12px 40px rgba(0, 0, 0, .4);
}
.arch-map .mono { font-family: var(--vp-font-family-mono, ui-monospace, Menlo, monospace); }

.legend { display: flex; flex-wrap: wrap; gap: 7px 15px; align-items: center; font-size: 12.5px; color: var(--muted); margin-bottom: 16px; }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.dot { width: 9px; height: 9px; border-radius: 50%; flex: none; display: inline-block; }
.dot.k, .dot.n { background: var(--accent); } .dot.b { background: var(--built); }
.dot.d { background: var(--designed); } .dot.s { background: var(--scope); } .dot.f { background: var(--fact); }

.layout { display: grid; grid-template-columns: 1fr; gap: 16px; }
@media (min-width: 960px) { .layout { grid-template-columns: 1fr 330px; align-items: start; } }
.tiers { display: flex; flex-direction: column; }

.tier-label { display: flex; align-items: baseline; gap: 10px; margin: 0 2px 9px; flex-wrap: wrap; }
.tier-num { font-family: var(--vp-font-family-mono, monospace); font-size: 12px; font-weight: 700; color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--hair)); border-radius: 6px; padding: 2px 7px; }
.tier-label h3 { margin: 0; font-size: 16px; border: 0; padding: 0; }
.tier-label .tl-sub { color: var(--muted); font-size: 12.5px; }

.tconnect { display: flex; align-items: center; justify-content: center; height: 34px; color: var(--faint); font-size: 11px; letter-spacing: .07em; text-transform: uppercase; font-weight: 600; position: relative; }
.tconnect .track { position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; background: var(--hair); transform: translateX(-50%); }
.tconnect.hot .track { background: var(--accent); } .tconnect.hot { color: var(--accent); }

.platform { background: color-mix(in srgb, var(--accent) 5%, var(--sunk)); border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--hair)); border-radius: 14px; box-shadow: var(--shadow); padding: 12px; }
.kernel-strip { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; width: 100%; text-align: left; background: var(--board); border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--hair)); border-radius: 10px; padding: 10px 12px; margin-bottom: 11px; cursor: pointer; color: inherit; font: inherit; }
.kernel-strip.sel, .kernel-strip:hover { box-shadow: var(--shadow); }
.kernel-strip .kn { font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 8px; }
.kernel-strip .ks-sub { color: var(--muted); font-size: 12px; }
.kernel-strip .ks-chips { display: flex; gap: 5px; margin-left: auto; flex-wrap: wrap; }

.modgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 9px; }
.mod { background: var(--board); border: 1px solid var(--hair); border-top: 3px solid var(--edge); border-radius: 11px; padding: 10px 11px 11px; cursor: pointer; text-align: left; font: inherit; color: inherit; width: 100%; transition: transform .16s, box-shadow .16s; }
.mod:hover, .mod:focus-visible { transform: translateY(-2px); box-shadow: var(--shadow); outline: none; }
.mod.sel { box-shadow: 0 0 0 2px color-mix(in srgb, var(--edge) 40%, transparent), var(--shadow); }
.mod-name { font-weight: 700; font-size: 14px; display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.mod-status { font-size: 9.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--edge); }
.vocab { margin-top: 9px; }
.vlabel { font-size: 9.5px; letter-spacing: .09em; text-transform: uppercase; color: var(--faint); margin: 0 0 4px; display: flex; align-items: center; gap: 5px; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 7px; }
.chip { font-family: var(--vp-font-family-mono, monospace); font-size: 10.5px; border-radius: 5px; padding: 2px 6px; border: 1px solid var(--hair); background: var(--sunk); color: var(--muted); transition: all .18s; }
.chip.neuron { border-color: color-mix(in srgb, var(--accent) 22%, var(--hair)); color: var(--ink); }
.chip.synapse { border-color: color-mix(in srgb, var(--fact) 28%, var(--hair)); color: var(--ink); background: color-mix(in srgb, var(--fact) 6%, var(--sunk)); }
.chip.synapse::before { content: "↯"; color: var(--fact); margin-right: 3px; font-size: 9px; }
.chip.param { border-color: color-mix(in srgb, var(--designed) 35%, var(--hair)); }
.chip.param.secret::before { content: "🔒"; margin-right: 3px; font-size: 9px; }
.chip.neuron.glow { background: color-mix(in srgb, var(--accent) 20%, transparent); border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent); }
.chip.synapse.glow { background: color-mix(in srgb, var(--fact) 22%, transparent); border-color: var(--fact); box-shadow: 0 0 0 2px color-mix(in srgb, var(--fact) 25%, transparent); }
.vocab.dim .chip:not(.glow) { opacity: .32; }
.none { color: var(--faint); font-size: 11px; font-style: italic; }
.ships-footer { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 4px; padding-top: 9px; border-top: 1px dashed var(--hair); align-items: center; }
.sf-lbl { font-size: 9px; letter-spacing: .08em; text-transform: uppercase; color: var(--faint); }
.fpill { font-size: 9.5px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; padding: 2px 7px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 10%, transparent); color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--hair)); }

.actors-tier { background: var(--sunk); border: 1px solid var(--hair); border-radius: 14px; padding: 12px; display: flex; gap: 10px; flex-wrap: wrap; }
.actor { flex: 1 1 220px; background: var(--board); border: 1px solid var(--hair); border-radius: 11px; padding: 11px 13px; cursor: pointer; text-align: left; font: inherit; color: inherit; transition: transform .16s, box-shadow .16s, border-color .16s; }
.actor:hover, .actor:focus-visible { transform: translateY(-2px); box-shadow: var(--shadow); border-color: var(--accent); outline: none; }
.actor.sel { box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent), var(--shadow); }
.a-top { display: flex; align-items: center; gap: 9px; font-weight: 700; font-size: 14px; }
.a-role { color: var(--muted); font-size: 12.5px; margin: 7px 0 0; }
.a-badge { margin-left: auto; }

.behaviors-tier { background: var(--sunk); border: 1px dashed color-mix(in srgb, var(--designed) 42%, var(--hair)); border-radius: 14px; padding: 12px; }
.beh-hint { color: var(--muted); font-size: 12.5px; margin: 0 0 10px; }
.beh-hint b { color: var(--designed); }
.behgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(228px, 1fr)); gap: 9px; }
.beh { background: var(--board); border: 1px solid var(--hair); border-left: 3px solid var(--designed); border-radius: 11px; padding: 11px 12px; cursor: pointer; text-align: left; font: inherit; color: inherit; width: 100%; transition: transform .16s, box-shadow .16s; }
.beh:hover, .beh:focus-visible { transform: translateY(-2px); box-shadow: var(--shadow); outline: none; }
.beh.sel { box-shadow: 0 0 0 2px color-mix(in srgb, var(--designed) 40%, transparent), var(--shadow); }
.beh-name { font-weight: 700; font-size: 14px; }
.beh-trig { color: var(--muted); font-size: 12px; margin: 6px 0 0; }
.beh-uses { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 9px; }

.panel { background: var(--panel); border: 1px solid var(--hair); border-radius: 14px; padding: 18px; position: sticky; top: 90px; box-shadow: var(--shadow); }
.p-empty { color: var(--muted); font-size: 13.5px; margin: 0; }
.p-head { display: flex; align-items: center; gap: 9px; margin: 0 0 3px; }
.p-head h4 { margin: 0; font-size: 18px; border: 0; padding: 0; }
.p-kind { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); margin: 0 0 11px; }
.p-role { color: var(--muted); font-size: 13px; margin: 0 0 6px; }
.p-sec { font-size: 10.5px; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); margin: 15px 0 6px; }
.p-sec.off { color: var(--faint); }
.p-note { color: var(--muted); font-size: 12.5px; margin: 0; }
.res { background: var(--board); border: 1px solid var(--hair); border-radius: 8px; padding: 8px 10px; font-size: 12.5px; margin-bottom: 6px; }
.res .arrow { color: var(--faint); }
.param-row { margin-top: 6px; }
.code { background: var(--board); border: 1px solid var(--hair); border-radius: 9px; padding: 11px 12px; margin-top: 8px; font-family: var(--vp-font-family-mono, monospace); font-size: 11px; line-height: 1.7; overflow-x: auto; white-space: pre; color: var(--ink); }
.badge { font-size: 10px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; padding: 2px 7px; border-radius: 999px; margin-left: auto; }
.badge.built { background: color-mix(in srgb, var(--built) 16%, transparent); color: var(--built); }
.badge.designed { background: color-mix(in srgb, var(--designed) 18%, transparent); color: var(--designed); }
.badge.scope { background: color-mix(in srgb, var(--scope) 18%, transparent); color: var(--scope); }
.badge.core { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); }
.p-jump { display: inline-flex; gap: 5px; margin-top: 16px; font-size: 13.5px; font-weight: 600; color: var(--accent); text-decoration: none; }
.p-jump:hover { text-decoration: underline; }

@media (prefers-reduced-motion: reduce) { .arch-map * { transition: none !important; } }
</style>
