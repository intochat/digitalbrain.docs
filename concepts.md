# Concepts

This page is the vocabulary of IntoChat OS. The other pages use these terms without redefining them.

## Core model

- **Neuron:** addressable state with typed operations. Neurons are Orleans grains.
- **Signal:** a typed event with kernel-stamped provenance. Signals travel between neurons.
- **Behavior:** compiled C# that reacts to signals.
- **Connector:** a bridge to an external service, a device or a user interface.
- **Brain:** an identity and ownership scope. A personal brain holds a person's apps and state; a **circle** is a shared brain with members, chat and shared apps.
- **App:** a specification, a manifest, a program, configuration, a presentation, version history and a release origin.

## Apps

An app is a tool the user creates or installs. Its specification describes intended behavior, and its manifest declares operations, settings and connection slots. Compiled behaviors implement it, and a presentation exposes its current UI.

A **presentation** is a revision-bound declaration of the app's visible parts. Compilation checks code compatibility; a presentation declares visibility. Neither alone proves that the user's task succeeds.

## Connections and releases

- A **connection** is authorization to use an external account or device. A connector implements the bridge.
- An **integration** is operator-level configuration of a deployment. It is not the user's account.
- A **publication** is an immutable app release identified by publisher, source, version and digest.
- An **installation** is a copy owned by the recipient, with its own state and configuration. Editing the program detaches the copy from normal publisher updates.
- A **post** is personal social content. It is distinct from an app publication and from a circle chat message.

## Related

[Architecture](./architecture) shows how these parts are composed, and the [glossary](./reference/glossary) defines the wider set of terms.
