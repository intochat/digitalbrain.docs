---
layout: home

hero:
  name: DigitalBrain
  text: Durable agents for .NET
  tagline: Neurons, synapses, and executable tests on Orleans and Aspire
  image:
    src: /logo.svg
    alt: DigitalBrain
  actions:
    - theme: brand
      text: Quickstart
      link: /quickstart
    - theme: alt
      text: Concepts
      link: /concepts
    - theme: alt
      text: Architecture
      link: /architecture
    - theme: alt
      text: Specification
      link: /specification

features:
  - title: Neurons
    details: A neuron is a durable agent — an Orleans journaled grain with dual durable journals for incoming and outgoing synapses, typed identity, owner-bound authorization, and restart recovery.
  - title: Synapses
    details: A synapse is an immutable typed fact. The kernel delivers it in a read-only envelope carrying correlation and causation lineage on every hop. Neurons declare what they consume with IHandle and what they produce with IEmit, provable at build time.
  - title: TestBrain
    details: The method-scoped testing primitive. Fire a synapse into a real three-silo cluster, advance deterministic time, and assert on typed committed-journal evidence.
  - title: Programmable
    details: The goal is a brain you program by writing ordinary C#, and that can program itself. Modules contribute vocabulary at compile time; the Behavior SDK supplies a foundation for future single-file logic. Proposal, installation, and execution remain Designed, not Built — see Architecture.
---
