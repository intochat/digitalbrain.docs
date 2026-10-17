# Persona 1: Notes writer

Keeps short notes and wants small automations around them, typed as one sentence.

- **Sentence:** "when I drop a file on my notes input, count its words and put the count in my notes answer text"
- **Contracts it may use:** Flutter `IFileInput` (`FileCaptured`), Flutter `IText`.
- **Trigger:** capture a file on `{app}/notes/input` (`IFileInput`), e.g. a text file with nine words.
- **Acceptance:** within 10 s of the request the app state shows the synapse written (`IApp.Read()`), the
  runtime shows it Running with a subscription, and after the capture `{app}/notes/answer` reads the word count.
- **Recorded wish:** "when a file is written to my notes folder, …" waits on G10 (`FileWritten`).
