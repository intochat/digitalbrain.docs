# Sketch: a neuron is born into a brain, a synapse is a program

Status: sketch, 2026-10-06. Not a spec. Written to agree on direction before any edit.
Companion to `2026-10-06-synapse-vocabulary-design.md`, which it partly supersedes (synapse as a
neuron) and partly keeps (the ring holds no handles, `IDigitalBrain` is resolve + watch).

## 1. What hurts

The ring says "state lives in neurons, the brain is the space they live in", but no type says
"this neuron is in that brain". So the question "who may call this" is answered four ways:

| Mechanism | Where | What it reads |
|-----------|-------|---------------|
| `NeuronAccess.ForBrainKey` | Framework/Enforcement | the grain key string: `workspace-` + 64 hex, `/` or `:`, special case `connection/` |
| `BrainScope.CurrentId()` | Framework/Enforcement | the caller stamped into Orleans `RequestContext` |
| `[PlatformOnly]`, `[PlatformAssembly]` | ring, honored in 6 places | hides contracts from scripts because a script could forge the caller |
| `Neuron.Access(operation)` override | every module | any mix of the above |

`CSharpFileNeuron` is where they collide: six interfaces (synapse, app binding, trigger inbox,
run-token edge, reminder, observer), a ten-branch `Access`, and four state fields for one fact
(`Owner`, `OwnerContext`, `AppId`, `AppBrain`). It is connection + program + execution host +
trust under one key. "ISynapse should not inherit INeuron" is the symptom; the grain being three
things is the cause.

The two attributes are enforcement, not vocabulary. They exist because internal interfaces
(`ICSharpAppBinding`, `IAspireResourceReporter`, Postgres `TableDescriptor`/`TableIndex`) were
placed in Contracts projects and then had to be hidden again.

## 2. Target shape (sketch)

### Ring

```
src/DigitalBrain/
  Neuron/INeuron.cs            Watch / Unwatch
  Neuron/INeuronObserver.cs
  Signal/Signal.cs             Publisher (kernel-stamped), Brain (kernel-stamped)   <- new field, see 2b
  Brain/IBrain.cs, BrainSnapshot.cs, EstablishBrain.cs
  Brain/Signals/Activated.cs
  Synapse/ISynapse.cs          a program, not a neuron (see 2c)
  Synapse/SynapseSnapshot.cs, SynapseWatch.cs
  Synapse/Signals/Started.cs, Stopped.cs, Changed.cs
  IDigitalBrain.cs             Get<T>, On<T>
```

Gone from the ring: `PlatformOnlyAttribute`, `PlatformAssemblyAttribute`. Orleans reference
stays (decided 2026-10-06; the pure-package route is parked, see the v0.2 notes).

### 2b. Born into a brain

A neuron carries its brain as a value, stamped at creation, never parsed from a key.

- `Neuron` base gets `BrainId` from state or from the key prefix once, at first activation, and
  stamps it on every published `Signal`.
- Access collapses to one rule in `NeuronCallFilter`: caller's brain == neuron's brain, or the
  operation is declared public by the neuron. `NeuronAccess.ForBrainKey` and the per-module
  `Access` overrides go away except for genuinely public operations (webhooks, the script edge
  doorbell).
- Platform neurons live in an OS-owned brain (open question 1), so a user brain's synapse cannot
  reach them. That is what `[PlatformOnly]` was protecting; the structure protects it instead.
- Discovery: a module declares its contracts assembly in `ModuleDefinition`; `ContractCatalog`,
  `ModuleInventory`, the MCP `NeuronContracts` tool and `ScriptEdge` stop scanning-with-exclusions.

### 2c. Synapse is a program; a runner hosts it

```csharp
// The word: what every synapse is, on any runner.
public interface ISynapse
{
    Task Run(IDigitalBrain brain, CancellationToken stopping);
}
```

Three runners, which are exactly the three hosting modes we want:

| Runner | Who writes the program | Where it runs | Today |
|--------|------------------------|---------------|-------|
| Sandbox | an agent, at runtime | `dotnet run app.cs` in the sandbox | `CSharpFileNeuron` minus binding/trust |
| Host | first-party app shipped in the OS image (DataVisualizer) | in-process, a class implementing `ISynapse` registered in `OsCatalog` | does not exist; today these are sandbox scripts |
| Remote | a third party self-hosting on the framework (IntoChat) | their process, through the edge, like a connector | does not exist |

The durable record (program reference, watches with watermarks, status, last error) lives in
one Framework neuron per synapse, `ISynapseRecord : INeuron`, keyed `{brain}/synapses/{name}`.
It is the only grain. The runner reports `Started`/`Stopped` to it; `On<T>` inside the program
registers watches on it. The sandbox runner keeps `Inspect`, `Swap`, `Arm`, `ReadLogs`,
`Configure` as its own contract beside the record, not inherited from the word.

### 2d. Lifecycle as handlers

`IBrainProvisioner.Provision(Activated)` already is the eShop `IActivationHandler`; `BrainNeuron`
is the default handler publishing `Activated`. Rename to `IActivationHandler<TSignal>` and give
synapses the same shape over `Started`/`Stopped`. Brains, synapses and connections publish a
lifecycle signal. Ordinary neurons do not: Orleans activation is a cache event, not a fact
(the per-grain broadcast deleted today stays deleted).

## 3. Open questions

1. Do platform neurons live in an OS-owned brain, or outside all brains with their own rule?
2. Host-mode synapses: a class registered in `OsCatalog` only, or still a bundle under
   `src/DigitalBrain.OS/Apps` so Marketplace lists first-party apps uniformly?
3. Keep `Activated` as the brain's signal name, or `BrainActivated` once `Started` exists?
4. `Signal.Brain` as a stamped field, or derive the brain from `Publisher` on read?
5. Does the app bundle keep `synapses/*.cs` as the unit, with host-mode as an alternative
   bundle shape (`synapses/*.dll`-less: classes by convention)?

## 4. How we would do it: semi-manual, in stages

Each stage is one branch, ends green, and is seen running (Aspire healthy, driven through
`digitalbrain-mcp`). "Mechanical" means I do it alone and you review the diff. "Together" means
a design choice sits inside the step and we pair on it before I write.

| Stage | What | Mode | Why this order |
|-------|------|------|----------------|
| 0 | Prune `Neuron.cs` usings left by today's deletion; commit the deleted activity signals | mechanical | finishes the open working tree first |
| 1 | Ring folders: `Neuron/`, `Signal/`; update `ExtractionFacts` and `VocabularyRingFacts` | mechanical | pure move, no behavior |
| 2 | Move every `[PlatformOnly]` interface out of Contracts into its implementation project as `internal`; architecture test forbids the attribute in `*.Contracts` | mechanical, one module at a time | removes the reason the attributes exist before touching the attributes |
| 3 | Declared contracts: `ModuleDefinition` names its contracts assembly; `ContractCatalog`, `ModuleInventory`, `NeuronContracts`, `ScriptEdge` read the declaration; delete both attributes | together (the declaration shape) then mechanical | the two attributes fall out; `ExtractionFacts` lists twelve types |
| 4 | Born into a brain: `Neuron.BrainId`, stamped `Signal.Brain`, one rule in `NeuronCallFilter`; delete `ForBrainKey`; remove `Access` overrides module by module, keeping only public operations | together (question 1, question 4), then mechanical per module | the biggest change; every module touched, but each step is "delete an override, run its suite" |
| 5 | `ISynapseRecord` neuron in Framework; `CSharpFileNeuron` becomes the sandbox runner + record; drop `ICSharpAppBinding`/`AppBrain`/`OwnerContext` fields now that stage 4 answers ownership | together (record shape), then mechanical | depends on 4 for the trust fields to go |
| 6 | `ISynapse` as the program interface; host runner with DataVisualizer as the first host-mode app; `Started`/`Stopped`; `IActivationHandler<T>` rename | together (question 2, question 3) | first new capability, built on a clean base |
| 7 | Remote runner for IntoChat | later, own spec | needs the connector story for a self-hosted process |

Stages 0 to 3 are safe to start now and change no runtime behavior. Stage 4 is the one that
needs a short written spec before the first edit; this sketch's section 2b is its seed.
