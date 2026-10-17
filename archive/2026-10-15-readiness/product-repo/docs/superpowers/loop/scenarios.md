| App | Scenario | Result |
|---|---|---|
| assistant | Opening the assistant composes its surface | passed (run 2, spec reworded 1.9.2) |
| assistant | Opening docked composes the surface without a window (rewritten: the old text expected a r | passed |
| assistant | The dock is the assistant's toolbar | passed |
| assistant | The dock's mic begins a voice message (new scenario; before this, no synapse handled the " | passed |
| assistant | A message is answered in the transcript | passed |
| assistant | A plain answer leaves nothing behind but its turn | passed |
| assistant | The tools a turn uses appear in the transcript | passed |
| assistant | A failed turn says so and the next message still works | passed |
| assistant | A confident route answers without the language model | passed |
| assistant | A route back into the assistant is answered by the model (new) | passed |
| assistant | A route to an app the message does not name is answered by the model (new) | passed (run 2, 2/4 runs hit the branch) |
| assistant | An app operation that needs input is answered by the model (new) | passed |
| assistant | An unsure route runs the agent turn with Jev's hints | passed |
| assistant | Jev being unavailable never blocks a message | passed |
| assistant | Stop cancels only the running turn (spec text, not a ## Scenario) | passed |
| assistant | New conversation | passed |
| assistant | A long message skips Jev; a busy conversation keeps the message | passed |
| assistant | Composer path | passed |
| calculator | Opening the calculator shows the keypad | passed |
| calculator | A digit grows the expression | passed |
| calculator | Equals evaluates the expression | passed |
| calculator | Clear resets it | passed |
| calculator | Clear from the dock empties the display | passed |
| calculator | Dividing by zero shows Error (scenario added to the spec) | passed |
| calculator | Add answers a sum | passed |
| calculator | Add answers Error for what is not a sum (scenario added to the spec) | passed |
| circle | Creating a circle shows it | passed |
| circle | An invitation waits for an answer | blocked (G13: needs a second brain/account to invite brain 'owner'. neurons_context shows brains [") |
| circle | A line spoken anywhere appears in every transcript (this brain's transcript) | passed |
| circle | A line spoken anywhere appears in every transcript (other member brains) | blocked (G13: a second member brain is needed to see the line fan out to another brain's copy.) |
| circle | The slider sets the compute share | passed |
| circle | Sharing an app lists it on the circle (scenario added in 1.0.1/1.0.2) | passed |
| circleroom | A line said in the circle is in its transcript | blocked (G13 (needs a second brain: a circle brain) and a missing contract. The running OS has no w) |
| customer-researcher | Opening the researcher composes its surface | blocked (The OS went down at about 08:32 UTC, right after the v1.1.45 push, before this scenario wa) |
| customer-researcher | Opening docked answers the surface without a window | blocked (OS down since about 08:32 UTC (Monnet silo startup crash). The plan was IWorkspace.Close o) |
| customer-researcher | Stopping an idle researcher is safe | passed |
| customer-researcher | Research verifies the company against observed pages and saves it | blocked (No connected browser. IPlaywright owner/apps/customer-researcher/browser shows connected=f) |
| customer-researcher | An unverifiable company is refused and saves nothing | passed |
| customer-researcher | Stop during research cancels it or the research completes, never half-saves | passed |
| customer-researcher | Research runs live (live) | blocked (Needs a connected desktop window browser and a real model (live scenario).) |
| customer-researcher | Queued research and cancellation survive behavior recovery | passed |
| customer-researcher | Model output is bounded and honest | blocked (The model steps (link choice, extraction) are only reached after the browser observes page) |
| customer-researcher | Activity survives reopening and behavior recovery | blocked (OS down since about 08:32 UTC, before the reopen/restart comparison.) |
| customer-researcher | Research needs no storage configuration | blocked (The save-to-default-database clause needs a connected browser. The 'open shows no database) |
| datavisualizer | Opening the visualizer lists the views | passed |
| datavisualizer | Show registers a view and opens its window | passed |
| datavisualizer | A view whose source cannot be read fails visibly | passed |
| datavisualizer | A SQL view shows its rows | blocked (G14: needs a Postgres connection bound to the db slot. Creating connections is not allowed) |
| datavisualizer | An app-table view follows its rows | blocked (No table defined by this app exists, and the app has no operation that defines one; an out) |
| datavisualizer | Read refreshes a view | passed |
| datavisualizer | Refine adds a visible filter | blocked (G14: refine validates filter columns against the SQL output through the db Postgres connec) |
| datavisualizer | Typing in a filter refreshes every view sharing it | blocked (G14 for the linked half: refine with filterColumns/linkFiltersTo validates SQL columns thr) |
| datavisualizer | A refresh interval re-runs the view | passed |
| datavisualizer | Close removes the view and its window | passed |
| files | Opening Files lists the roots | blocked (G14: no 'windows' connection in brain owner (IConnectionRequests.ListConnections on 'owner) |
| files | Browsing a folder lists its entries | blocked (G14: listing entries, the '..' parent inside a connected folder, the 'Showing 40 of N' cap) |
| files | Reading a file shows its text | blocked (G14: needs IFileSystem.Read on a windows connection) |
| files | A C# file in an installed app's folder shows the app | blocked (G14: needs a file read from the PC via the windows connection) |
| files | Without a PC the surface says so (scenario added to the spec) | passed |
| filmcraft | Opening connects the tools and shows the window | passed |
| filmcraft | Opening again keeps one window | passed |
| filmcraft | Cut by asking | blocked (The page tool needs the FilmCraft page rendered in a person's desktop shell. Only the Wind) |
| photocraft | Opening connects the tools and shows the window | passed |
| photocraft | Opening again keeps one connection and one window | passed |
| photocraft | Edit by asking | passed |
| photocraft | An empty edit is refused | passed |
| photocraft | One edit at a time | passed |
| photocraft | A cancelled edit says so | passed |
| photocraft | Asking the assistant reaches PhotoCraft | passed |
| photocraft | Changes made with PhotoCraft's tools reach the preview (new scenario, added with tool-ran. | passed |
| router | Opening the console shows the prompt | passed |
| router | Send asks | passed |
| router | A request is routed and carried out | passed (run 2, 4/4 live) |
| router | A timer is shown as a window | passed (run 2, live) |
| router | An unclear request is refused | passed |
| selfimprove | Opening shows the list | passed |
| selfimprove | A malformed change set is refused (new scenario added to the spec) | passed |
| selfimprove | A request proposes and starts a candidate | blocked (G15: proposing a candidate starts a sibling cluster and restarts live resources) |
| selfimprove | A healthy candidate is verified with its plan | blocked (G15: needs a running candidate cluster) |
| selfimprove | A verified candidate is promoted | blocked (G15: Promote restarts the live cluster) |
| selfimprove | A failed candidate shows its report and keeps its worktree | blocked (G15 (needs a candidate), plus the missing contract field for the worktree path (see wishes) |
| selfimprove | A candidate that ends early does not hold up the next | blocked (G15: needs two candidate clusters) |
| settings | Opening Settings shows the connections surface | passed |
| settings | Read publishes the stored preferences | passed |
| settings | Refresh lists connections and app bindings without duplicates | passed |
| settings | The Refresh connections button rebuilds the list | passed |
| settings | Reload then save stores the preferences | passed |
| settings | A stale or invalid save is rejected | passed |
| settings | (Spec behavior with no scenario) A connection change or authorization request rebuilds the | blocked (G14: no credential-free way to emit ConnectionsChanged or ConnectionRequested without crea) |
| word-count | Words are separated by spaces | passed |
| word-count | Extra spaces do not count as words | passed |
| word-count | One word is singular | passed |

| memory | reindex / open / run counts / recall (run 2: recall.cs ran from shipped code; reindex works again after Task T: 107 synapses, 148 vectors) | passed |
blocked: 25, passed: 67, refuted: 0 (run 2: router ×2 and assistant ×2 passed live)
