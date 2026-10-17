# Persona 3: Student

- **Sentence:** "remember what I read and recall it"
- **Contracts it may use:** the Memory app (`features/os/Memory`): ops `reindex`, `recall`, `open`.
- **Steps:** `IApp.Request ["reindex",""]` on `{brain}/apps/memory`, then `["recall","word count"]`.
- **Acceptance:** the recall result neuron (`{app}/recalls/{id}`, `IText`) lists the WordCount synapse first;
  `open` renders the apps tree with each behavior's status and run counts.
