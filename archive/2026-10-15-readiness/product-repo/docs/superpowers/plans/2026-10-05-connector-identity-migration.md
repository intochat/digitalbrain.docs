# Connector migration: persisted identity notes

All notes apply to #165. CLR names change while aliases, existing member IDs, JSON property names, grain types, key conventions and storage names are retained. This inventory compares `git show HEAD:src/Testing/tests/DigitalBrain.Architecture.Tests/PersistedStateIds.json` with the current baseline and resolves aliases from source. The historical reference `ca1c121c0` is unavailable locally and on GitHub; the checked-in branch baseline is the comparison source.

Connection.AuthMethodId appends Id(6), ConnectConnection.AuthMethodId appends Id(5), and ReleasedIntegration.Snapshot appends Id(1). The latter permits a coherent snapshot/secret release. Existing IntegrationId/WorkspaceId storage properties remain unchanged; HTTP rows independently use ConnectorId/AuthMethodId.

## PackageAccount -> PackageConnection

- Previous CLR identity: `DigitalBrain.Apps.PackageAccount`.
- New CLR identity: `DigitalBrain.Apps.PackageConnection`.
- Pinned Alias: `apps.package-account`.
- Serialized members: `Name` = 0, `Source` = 1, `Description` = 2.
- Source: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Packages/PackageConnection.cs`. Existing members retain their JSON names.
- Serialized contract/value type rather than a persistent grain: no grain key or storage name migration.

## AccountDisconnected -> ConnectionDisconnected

- Previous CLR identity: `DigitalBrain.Framework.Platform.Integrations.Accounts.AccountDisconnected`.
- New CLR identity: `DigitalBrain.Framework.Platform.Integrations.Accounts.ConnectionDisconnected`.
- Pinned Alias: `connections.disconnected`.
- No explicit `[Id]` members in the pre-rename baseline; the positional record/exception shape is retained unchanged.
- Source: `src/DigitalBrain/Framework/DigitalBrain.Framework/Platform/Integrations/Accounts/IConnectionRegistry.cs`. Existing members retain their JSON names.
- Serialized contract/value type rather than a persistent grain: no grain key or storage name migration.

## AccountNotConfiguredException -> ConnectionNotConfiguredException

- Previous CLR identity: `DigitalBrain.Framework.Platform.Integrations.Accounts.AccountNotConfiguredException`.
- New CLR identity: `DigitalBrain.Framework.Platform.Integrations.Accounts.ConnectionNotConfiguredException`.
- Pinned Alias: `connections.not-configured`.
- No explicit `[Id]` members in the pre-rename baseline; the positional record/exception shape is retained unchanged.
- Source: `src/DigitalBrain/Framework/DigitalBrain.Framework/Platform/Integrations/Accounts/ConnectionProbe.cs`. Existing members retain their JSON names.
- Serialized contract/value type rather than a persistent grain: no grain key or storage name migration.

## AccountProbeResult -> ConnectionProbeResult

- Previous CLR identity: `DigitalBrain.Framework.Platform.Integrations.Accounts.AccountProbeResult`.
- New CLR identity: `DigitalBrain.Framework.Platform.Integrations.Accounts.ConnectionProbeResult`.
- Pinned Alias: `connections.probe-result`.
- No explicit `[Id]` members in the pre-rename baseline; the positional record/exception shape is retained unchanged.
- Source: `src/DigitalBrain/Framework/DigitalBrain.Framework/Platform/Integrations/Accounts/ConnectionProbe.cs`. Existing members retain their JSON names.
- Serialized contract/value type rather than a persistent grain: no grain key or storage name migration.

## AccountStatusChanged -> ConnectionStatusChanged

- Previous CLR identity: `DigitalBrain.Framework.Platform.Integrations.Accounts.AccountStatusChanged`.
- New CLR identity: `DigitalBrain.Framework.Platform.Integrations.Accounts.ConnectionStatusChanged`.
- Pinned Alias: `connections.status-changed`.
- No explicit `[Id]` members in the pre-rename baseline; the positional record/exception shape is retained unchanged.
- Source: `src/DigitalBrain/Framework/DigitalBrain.Framework/Platform/Integrations/Accounts/IConnectionRegistry.cs`. Existing members retain their JSON names.
- Serialized contract/value type rather than a persistent grain: no grain key or storage name migration.

## ConnectAccount -> ConnectConnection

- Previous CLR identity: `DigitalBrain.Framework.Platform.Integrations.Accounts.ConnectAccount`.
- New CLR identity: `DigitalBrain.Framework.Platform.Integrations.Accounts.ConnectConnection`.
- Pinned Alias: `connections.connect`.
- Serialized members: `IntegrationId` = 0, `ConnectionId` = 1, `Label` = 2, `Value` = 3, `SecretReference` = 4, `AuthMethodId` = 5.
- Source: `src/DigitalBrain/Framework/DigitalBrain.Framework/Platform/Integrations/Accounts/IConnectionRegistry.cs`. Existing members retain their JSON names.
- Serialized contract/value type rather than a persistent grain: no grain key or storage name migration.

## IntegrationAccount -> Connection

- Previous CLR identity: `DigitalBrain.Framework.Platform.Integrations.Accounts.IntegrationAccount`.
- New CLR identity: `DigitalBrain.Framework.Platform.Integrations.Accounts.Connection`.
- Pinned Alias: `connections.connection`.
- Serialized members: `Id` = 0, `IntegrationId` = 1, `WorkspaceId` = 2, `Credential` = 3, `Status` = 4, `LastProbedAt` = 5, `AuthMethodId` = 6.
- Source: `src/DigitalBrain/Framework/DigitalBrain.Framework/Platform/Integrations/Accounts/Connection.cs`. Existing members retain their JSON names.
- Serialized contract/value type rather than a persistent grain: no grain key or storage name migration.

## ConfigureRegistration -> ConfigureIntegration

- Previous CLR identity: `DigitalBrain.Framework.Platform.Integrations.ConfigureRegistration`.
- New CLR identity: `DigitalBrain.Framework.Platform.Integrations.ConfigureIntegration`.
- Pinned Alias: `integration.registration.configure`.
- Serialized members: `Values` = 0.
- Source: `src/DigitalBrain/Framework/DigitalBrain.Framework/Platform/Integrations/IIntegration.cs`. Existing members retain their JSON names.
- Serialized contract/value type rather than a persistent grain: no grain key or storage name migration.

## RegistrationChanged -> IntegrationChanged

- Previous CLR identity: `DigitalBrain.Framework.Platform.Integrations.RegistrationChanged`.
- New CLR identity: `DigitalBrain.Framework.Platform.Integrations.IntegrationChanged`.
- Pinned Alias: `integration.registered`.
- No explicit `[Id]` members in the pre-rename baseline; the positional record/exception shape is retained unchanged.
- Source: `src/DigitalBrain/Framework/DigitalBrain.Framework/Platform/Integrations/IIntegration.cs`. Existing members retain their JSON names.
- Serialized contract/value type rather than a persistent grain: no grain key or storage name migration.

## RegistrationSnapshot -> IntegrationSnapshot

- Previous CLR identity: `DigitalBrain.Framework.Platform.Integrations.RegistrationSnapshot`.
- New CLR identity: `DigitalBrain.Framework.Platform.Integrations.IntegrationSnapshot`.
- Pinned Alias: `integration.registration.snapshot`.
- Serialized members: `IntegrationId` = 0, `Status` = 1, `MissingFields` = 2, `Settings` = 3, `Revision` = 4.
- Source: `src/DigitalBrain/Framework/DigitalBrain.Framework/Platform/Integrations/IIntegration.cs`. Existing members retain their JSON names.
- Serialized contract/value type rather than a persistent grain: no grain key or storage name migration.

## ReleasedRegistration -> ReleasedIntegration

- Previous CLR identity: `DigitalBrain.Framework.Platform.Integrations.ReleasedRegistration`.
- New CLR identity: `DigitalBrain.Framework.Platform.Integrations.ReleasedIntegration`.
- Pinned Alias: `integration.registration.released`.
- Serialized members: `Values` = 0, `Snapshot` = 1.
- Source: `src/DigitalBrain/Framework/DigitalBrain.Framework/Platform/Integrations/IIntegration.cs`. Existing members retain their JSON names.
- Serialized contract/value type rather than a persistent grain: no grain key or storage name migration.

## AccountRef -> ConnectionRef

- Previous CLR identity: `DigitalBrain.Integrations.AccountRef`.
- New CLR identity: `DigitalBrain.Integrations.ConnectionRef`.
- Pinned Alias: `integrations.account-ref`.
- Serialized members: `Kind` = 0, `Id` = 1.
- Source: `src/DigitalBrain/DigitalBrain/Integrations/ConnectionRef.cs`. Existing members retain their JSON names.
- Serialized contract/value type rather than a persistent grain: no grain key or storage name migration.

## AccountRequested -> ConnectionRequested

- Previous CLR identity: `DigitalBrain.Integrations.AccountRequested`.
- New CLR identity: `DigitalBrain.Integrations.ConnectionRequested`.
- Pinned Alias: `integrations.account-requested`.
- Serialized members: `Kind` = 0, `Id` = 1.
- Source: `src/DigitalBrain/DigitalBrain/Integrations/IConnectionRequests.cs`. Existing members retain their JSON names.
- Serialized contract/value type rather than a persistent grain: no grain key or storage name migration.

## IntegrationKind -> ConnectorKind

- Previous CLR identity: `DigitalBrain.Integrations.IntegrationKind`.
- New CLR identity: `DigitalBrain.Integrations.ConnectorKind`.
- Pinned Alias: `integrations.kind`.
- Serialized members: `Id` = 0, `DisplayName` = 1.
- Source: `src/DigitalBrain/DigitalBrain/Integrations/IConnectionRequests.cs`. Existing members retain their JSON names.
- Serialized contract/value type rather than a persistent grain: no grain key or storage name migration.

## IntegrationAccountsState -> ConnectionsState

- Previous CLR identity: `DigitalBrain.Platform.Integrations.Accounts.IntegrationAccountsState`.
- New CLR identity: `DigitalBrain.Platform.Integrations.Accounts.ConnectionsState`.
- Pinned Alias: `connections.state`.
- Serialized members: `Connections` = 0.
- Source: `src/DigitalBrain/Platform/DigitalBrain.Platform/Integrations/Accounts/ConnectionsState.cs`. Existing members retain their JSON names.
- Grain: `ConnectionsNeuron`; pinned grain type `connections`; existing brain-scoped registry key unchanged; persistent-state name `connections`; provider `DigitalBrainNames.DefaultGrainStorage`. State JSON retains Connections.

## ScriptAccountsState -> ConnectionRequestsState

- Previous CLR identity: `DigitalBrain.Platform.Integrations.Accounts.ScriptAccountsState`.
- New CLR identity: `DigitalBrain.Platform.Integrations.Accounts.ConnectionRequestsState`.
- Pinned Alias: `integrations.script-accounts`.
- Serialized members: `Pending` = 0.
- Source: `src/DigitalBrain/Platform/DigitalBrain.Platform/Integrations/Accounts/ConnectionRequestsNeuron.cs`. Existing members retain their JSON names.
- Grain: `ConnectionRequestsNeuron`; pinned grain type `integrations.accounts`; existing brain-scoped registry key unchanged; persistent-state name `state`; provider `DigitalBrainNames.DefaultGrainStorage`. State JSON retains Pending.

## RegistrationState -> IntegrationState

- Previous CLR identity: `DigitalBrain.Platform.Integrations.RegistrationState`.
- New CLR identity: `DigitalBrain.Platform.Integrations.IntegrationState`.
- Pinned Alias: `integration.registration.state`.
- Serialized members: `References` = 0, `Settings` = 1, `Revision` = 2.
- Source: `src/DigitalBrain/Platform/DigitalBrain.Platform/Integrations/IntegrationState.cs`. Existing members retain their JSON names.
- Grain: `IntegrationNeuron`; pinned grain type `integration.registration`; canonical key prefix `integration/`; persistent-state name `registration`; provider `DigitalBrainNames.DefaultGrainStorage`. State JSON retains References, Settings and Revision.

## ConnectSalesforceAccount -> ConnectSalesforceConnection

- Previous CLR identity: `DigitalBrain.Salesforce.ConnectSalesforceAccount`.
- New CLR identity: `DigitalBrain.Salesforce.ConnectSalesforceConnection`.
- Pinned Alias: `salesforce.connect-account`.
- Serialized members: `InstanceUrl` = 0, `ExpiresInSeconds` = 1, `Nonce` = 2, `SecretOwner` = 3.
- Source: `src/Modules/Salesforce/DigitalBrain.Modules.Salesforce.Contracts/Salesforce/ConnectSalesforceConnection.cs`. Existing members retain their JSON names.
- Serialized contract/value type rather than a persistent grain: no grain key or storage name migration.

## Additional identity anchors

AccountStatus becomes ConnectionStatus while retaining explicit alias `DigitalBrain.Framework.Platform.Integrations.Accounts.AccountStatus`. IIntegrationRegistration becomes IIntegration while retaining its existing contract alias and default grain type. IIntegrationAccounts becomes IConnectionRegistry with alias `connections` and default grain type `connections`. Script-facing IConnectionRequests retains alias/default grain type `integrations.accounts`; its method return types now use ConnectionRef and ConnectorKind. IntegrationStatus retains explicit alias `DigitalBrain.Framework.Platform.Integrations.RegistrationStatus`. These interface/enum identities are checked in source independently of the serialized-member baseline.

The new GmailMailboxIndexState uses alias `gmail.mailbox-index-state`, member Connections Id(0), grain type `gmail.mailbox-index`, persistent-state name `gmail-mailbox-index`, and the default grain storage provider. Its key is the normalized verified mailbox. New Gmail connection neuron keys are `connection/{escaped-brain}/{escaped-connector}/{escaped-connection}`. Old global/email-keyed Gmail state is intentionally not migrated: reconnect as a named Connection.

SalesforceExternalAccount and SalesforceAccountEndpoints become SalesforceExternalConnection and SalesforceConnectionEndpoints. They are nonserialized HTTP helpers; routes and persisted identities do not change.

Verification includes legacy JSON payload deserialization and connection deactivate/reactivate tests in Platform ConnectionCompatibilityFacts, plus architecture member-ID baseline checks.
