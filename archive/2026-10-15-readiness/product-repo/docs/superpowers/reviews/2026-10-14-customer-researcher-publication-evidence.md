# Customer Researcher publication verification

Date: 2026-10-14. Branch: codex/app-workspace.

Customer Researcher 1.2.2 is the first publication from owner in the local running marketplace. Its profile and feed render a C#-composed launch post with the release icon, description, story and Preview & fork action. Circle 2.0.15 uses full publication identity for post keys and pages of 24 posts.

The research app has a shared-theme introduction, company composer, research controls, initial activity state and live evidence area. Flutter changes are generic card/layout rendering only.

Published digest: 308c3ae281def8fcb0d751cbffa2eab58738700790d6da324be0cc6ce82e0f0b.

Visible Preview & fork / Fork to my brain / Open app flow installed customer-researcher-copy, version 1.2.2, with the exact publication origin, no copied connections and empty research state. The immutable release and installed app survived the isolated AppHost restart. The development marketplace index did not: republishing the unchanged release restored its listing. Durable marketplace hosting remains outstanding. Circle status was empty after the final runtime update; C# sandbox telemetry contained no error entries.

Validation: 184 Flutter UI tests and 148 shell tests passed; both analyzers clean. Two publication integration tests passed, including separate publisher/reader identities. Five PublicationButton tests passed, including reserved platform database fallback and genuine missing connection cases. AppHost build succeeded with zero errors and six transient copy-lock warnings. Read-only review confirmed publication identity and bounded-feed fixes.

Scope: publication is within the local runtime, not public internet hosting. The visible install test used the owner session; separate identities were exercised by integration tests. Automated research requires the desktop workspace browser and a configured model; an actual model research job was not run. Web preview shows the research UI but cannot automate the embedded browser.
