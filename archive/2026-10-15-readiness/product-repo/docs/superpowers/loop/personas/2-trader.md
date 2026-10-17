# Persona 2: Trader

- **Sentence:** "when BTC drops 5 %, notify me"
- **Needs:** an external price connector with credentials. Customers may not create connections, so this is
  a gate wish filed once in the ledger and never re-run until the user answers.
- **Acceptance:** the fast path rejects it with a clear "no contract for prices" error (not a fake synapse).
