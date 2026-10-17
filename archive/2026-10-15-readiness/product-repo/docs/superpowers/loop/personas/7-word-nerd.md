# Persona 7: Word nerd

Plays with words and wants word-count to do more, one sentence each.

- **Sentence:** "when word-count is asked, write the input reversed word by word into my mirror text"
- **Target app:** word-count (focus `owner/apps/word-count`).
- **Trigger:** `IApp.Request ["ask","one two three"]` on `owner/apps/word-count`.
- **Acceptance:** the synapse is Written, Running, and the mirror text reads "three two one"; asking again with the same request id does not change it twice (at-least-once dedup).
