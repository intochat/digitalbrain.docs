You are editing the Flutter shell of the repo at E:\intochat\digitalbrain. Other agents edit C# files at the same time. Do NOT run git. ASCII only. Touch only files under src/DigitalBrain.Modules/Google/Flutter/app/ (core/ and shell/).

GOAL: the Compute panel shows balance, spend, and usage grouped by Origin / App / Synapse / Neuron / Kind, against a NEW kernel API that replaces the old compute endpoints.

NEW HTTP API (all relative to the kernel base URI, same auth as existing calls in core/lib/src/ui_client.dart):
- GET /brains/{brainId}/compute?by={origin|app|synapse|neuron|kind}&since={ISO-8601 UTC} -> 200 JSON
  {"balanceMicros": 123, "spentMicros": 45, "rows": [{"key": "brain/apps/x/synapses/a.cs", "micros": 40, "count": 3}]}
  rows are already sorted most expensive first.
- GET /brains/{brainId}/compute/recent?take=50 -> 200 JSON array of
  {"traceId": "...", "costId": "...", "kind": "model|script|http|storage|operation", "item": "gpt-5.4:input", "quantity": 0.0012, "unit": "mtok", "micros": 1500, "synapse": null, "app": null, "neuron": null, "at": "2026-10-10T12:00:00Z"}
- Money is micro-credits: 1 credit = 1 USD / 1_000_000. Display as dollars: micros / 1e6 formatted with up to 6 decimals, e.g. "$0.0015".

STEPS
1. In core/lib/src/ui_client.dart replace readComputeUsage, readComputeSummary, readComputeLimits (around lines 520-560) with:
   Future<ComputeSummary> readCompute(String brainId, {String by = 'app', DateTime? since});
   Future<List<ComputeCost>> readComputeRecent(String brainId, {int take = 50});
   Add plain Dart classes ComputeSummary {int balanceMicros; int spentMicros; List<ComputeRow> rows}, ComputeRow {String key; int micros; int count}, ComputeCost {...fields above...} with fromJson, in the file where the old compute models live (find them; replace them). Remove the old models and every use of them.
2. Rewrite shell/lib/workspace/compute_usage_panel.dart: header with Balance and Spent (last 30 days); a SegmentedButton or ChoiceChips for grouping (Origin, App, Synapse, Neuron, Kind; default App); a list of rows (key, dollars, count) most expensive first; a "Recent" section listing the last 50 costs (item, kind, dollars, time). Keep the existing null-client "Not connected to a brain" state and the existing constructor parameters the workspace passes (look at workspace_app.dart _openCompute). Keep Key('compute-usage-button') untouched in workspace_islands.dart.
3. Delete compute_usage_history.dart and compute_usage_details.dart if nothing references them anymore after step 2 (update imports).
4. Update tests: shell/test/compute_entry_point_test.dart and any test referencing the removed API/models; make the fake client return the new shapes. Add a test that switching the grouping to Synapse calls readCompute with by='synapse' and renders its rows.
5. Run from shell/: flutter analyze (0 issues) and flutter test (all pass). Also flutter analyze in core/ if it is a package with its own analysis. Finish by printing the files changed.
