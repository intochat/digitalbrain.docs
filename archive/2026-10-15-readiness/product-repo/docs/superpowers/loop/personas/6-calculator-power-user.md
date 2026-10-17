# Persona 6: Calculator power user

Uses the calculator all day and wants small reactions around it, one sentence each.

- **Sentence:** "when the calculator sum goes above 100, write big into my alert text, otherwise write small"
- **Target app:** calculator (focus `owner/apps/calculator/sum`).
- **Trigger:** `IApp.Request ["add","60+50"]` then `["add","2+3"]` on `owner/apps/calculator`.
- **Acceptance:** the synapse is Written in the calculator's app state, Running in the runtime, and the alert text reads "big" after the first add and "small" after the second.
