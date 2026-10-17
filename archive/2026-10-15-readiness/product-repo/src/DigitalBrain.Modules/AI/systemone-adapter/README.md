# systemone-adapter

A local, LLM-backed stand-in for the hosted TypeSafe Jev API. It exposes `POST /v1/systemone` with
the same request and response shape the brain's `ISystemOne` capability speaks, answered by any
OpenAI-compatible chat model.

Jev itself is a hosted model; this adapter is the offline path. The brain needs no code change --
only the `typesafe` integration `Endpoint` moves.

## Run

```bash
# Start the adapter and a local model (Ollama).
cd src/DigitalBrain.Modules/AI/systemone-adapter
docker compose up -d
docker compose exec ollama ollama pull llama3.1
```

The adapter is now at `http://localhost:8080`; `GET /health` answers 503 `{"status":"warming"}` while one warm-up
inference loads the model, then `{"status":"ok"}`, so Aspire marks it healthy only once the model is warm.

## Point the brain at it

Set the `typesafe` integration endpoint (and any non-empty API key) for your deployment:

```
DigitalBrain:Integrations:typesafe:ApiKey   = local
DigitalBrain:Integrations:typesafe:Endpoint = http://localhost:8080
```

Then the brain's router asks this service exactly as it would ask `https://api.typesafe.ai`.

## Against a different backend

`OPENAI_BASE_URL` / `OPENAI_API_KEY` / `SYSTEMONE_MODEL` select the model. For a hosted
OpenAI-compatible provider, drop the `ollama` service and set them to the provider's values.
