# Product concepts

An **app** is a tool the user creates or installs. Its specification describes intended behavior; its manifest declares operations, settings and connection slots. Compiled behaviors implement it, and a presentation exposes its current UI.

A **brain** is an ownership scope. A personal brain holds the person's apps and state. A **circle** is a shared brain with members, chat and shared apps.

A **connection** is authorization to use an external account or device. A **connector** implements the bridge. A deployment **integration** provides operator-level configuration; it is not the user's account.

A **publication** is an immutable app release identified by publisher, source, version and digest. An **installation** is a copy owned by the recipient with its own state and configuration. Program edits detach normal publisher-update eligibility.

A **post** is personal social content. It is distinct from an app publication and from a circle chat message.

A **presentation** is a revision-bound declaration of the app's visible parts. Compilation checks code compatibility; a presentation declares visibility; neither alone proves that the user's task succeeds.
