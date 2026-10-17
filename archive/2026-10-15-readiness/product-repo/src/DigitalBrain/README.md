# DigitalBrain

Neuron, signal, subscription, observer, and brain — the words — plus the shapes their contracts
carry: data rows, semantic types, account references, the call request and denial, and the
kernel-stamped caller. Hosting names, the local signal hub, the call filter and intent metering
live in `DigitalBrain.Framework`.

This is the vocabulary ring. It is what the kernel's compiled layer ships into the sandbox, what module
`*.Contracts` projects reference, and what the Clients build on. It references Orleans
abstractions because the words are grains, and never Orleans hosting: `Module.Configure`
and everything else host-shaped lives in `DigitalBrain.Framework`.
