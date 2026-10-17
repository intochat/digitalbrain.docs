# Connection routes and Flutter shell migration

Implemented without commits in the current `os` checkout.

- Platform connection routes now mount under `/brains/{brainId}/connections`, including list/connect/probe/disconnect/requests.
- ConnectionRow wire fields now use ConnectorId and AuthMethodId; persisted Connection.IntegrationId remains unchanged.
- ConnectConnectionInput receives ConnectorId and AuthMethodId and maps them to the persisted connection request. Registry validation is owned by primary.
- Flutter client reads offered connectors from `/connectors`, connection rows from the new scoped route, and maps Gmail authorization to `/brains/{brainId}/connections/{connectionId}/gmail/login`. Salesforce uses `/connections/services/salesforce/start`.
- Renamed shell integrations UI folder to connections and IntegrationsMenu to ConnectorsMenu. Fixed provider arrays were removed; the connect window/settings offer only the provisioned catalog and its declared authentication methods. Empty catalogs disable connecting.
- Named Gmail OAuth connections request a connection name before starting authorization; existing rows reconnect using their own connection ID.
- Dart wire fields changed alongside C# to connectorId/authMethodId. Token entry stays masked and clears after submission.

Verification:
- `flutter analyze --no-pub` from shell: no issues (latest run after formatter and brace fixes).
- `flutter test` from shell: passed 122 tests, including catalog-only options, empty catalog, masked credentials, OAuth authorization and client route coverage.
- `dotnet test src/Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests --no-restore --verbosity quiet`: passed 92/92.
- `dotnet test src/Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests.Hosting --no-restore --verbosity quiet`: passed 7/7.
- Gmail follow-up suite after registry/push security work: passed 11/11 (see gmail-migration-report.md).
- Focused diff whitespace check passed. No live Google provider callback or Aspire healthy smoke performed by this subtask.
