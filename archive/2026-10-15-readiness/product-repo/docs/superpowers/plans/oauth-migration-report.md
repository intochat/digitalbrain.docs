# Salesforce and GitHub credential migration report

Implemented sequentially in src/Modules/Salesforce and src/Modules/Microsoft/GitHub. No commits or packaging changes.

## Salesforce

- SalesforceModule declares salesforce IntegrationSchema requiring secret ConsumerKey and ConsumerSecret, and salesforce ConnectorDefinition with org-oauth authentication.
- Deleted credential-bearing Contracts SalesforceOAuthOptions. PublicOrigin binds through ordinary SalesforceModuleOptions.
- SalesforceOAuthConfiguration receives IModuleIntegrations<SalesforceModule> and awaits readiness/key/secret release. Refresh exchanges read current integration values asynchronously.
- Middleware options registration uses nonsecret placeholders. A per-handler IOptionsMonitor clones the options before base initialization; challenge and code exchange await key release into that private clone. Shared OAuth options are not modified. Ordinary middleware initialization does not attempt optional-provider secret reads.
- Aspire seeds ConsumerKey/ConsumerSecret at IntegrationSchema keys and PublicOrigin under Module Options. Removed stale kernel phrasing.
- Salesforce service discovery/start routes now live under /brains/{brainId}/connections/services. Discovery and start await integration readiness. Projected ConnectionRow includes org-oauth AuthMethodId.

## GitHub

- GitHub integration retains required PrivateKeyPem/AppId and adds optional ClientSecret/WebhookSecret with OffersSecret. Connector declares app-installation and oauth methods.
- Deleted GitHubAppOptions. Public ClientId, Slug, origins and metadata live in GitHubModuleOptions; Repositories is under Options.
- Removed WebhookSecret from GitHubRepositoryOptions and GitHubRepositoryBinding; repositories contain identity and endpoints only.
- GitHubAppRegistration receives scoped IModuleIntegrations<GitHubModule>, reads metadata asynchronously and releases declared secrets through handles. Removed fabricated PlatformCaller/direct integration grain calls.
- OAuth per-handler cloned options follow Salesforce's asynchronous challenge/code-exchange pattern. AppId comes from integration snapshot.
- Webhook ingress releases the current shared GitHub integration WebhookSecret on every delivery; rotation takes effect immediately. Setup readiness awaits the optional webhook field.
- Aspire app/repository projections seed integration credentials only at IntegrationSchema keys. Metadata and repository declarations project under Module Options. Legacy per-repository secret environment variables are removed.

## Verification

- dotnet test src/Modules/Salesforce/tests/DigitalBrain.Modules.Salesforce.Tests --no-restore --verbosity quiet: passed 15, failed 0, skipped 0.
- New Salesforce regressions cover delayed secret release without shared-options mutation and refresh request using current integration credentials.
- dotnet test src/Modules/Microsoft/GitHub/tests/DigitalBrain.Modules.Microsoft.GitHub.Tests --no-restore --verbosity quiet: passed 13, failed 0, skipped 0.
- New GitHub regressions cover delayed OAuth secret release/shared-options isolation, optional OAuth fields preserving App installation auth, and real-grain webhook rotation rejecting the previous signature and accepting the new key.
- dotnet build src/Modules/Salesforce/DigitalBrain.Modules.Salesforce.Aspire.Hosting --no-restore --verbosity quiet: passed, zero warnings/errors.
- dotnet build src/Modules/Microsoft/GitHub/DigitalBrain.Modules.Microsoft.GitHub.Aspire.Hosting --no-restore --verbosity quiet: passed, zero warnings/errors.
- git diff --check for owned AI/Salesforce/GitHub paths: passed.
- No separate Salesforce or GitHub E2E projects exist in the current tree. Their suites exercise hosted Orleans grains. Live Salesforce/GitHub OAuth exchanges and whole-host Aspire smoke were not performed by this worker; parent owns composition checks.

## Public/shared follow-ups

GitHubModuleOptions.SectionName now identifies Module Options; retired AppSectionName was removed. No references remain in C# sources outside the owned GitHub tree. SalesforceOAuthOptions and SalesforceModule.OAuthConfigurationRoot are removed; no C# references remain outside the owned Salesforce tree.

OAuth handler option cloning is shallow because only ClientId/ClientSecret are changed; shared cookies/events/backchannel configuration is never mutated by credential loading. Optional integration secret absence follows the scoped handle's missing dictionary-field KeyNotFoundException contract, caught only for optional fields.

## Review corrections (2026-10-05)

GitHub App hosting accepts AppId/private-key-only installation configuration. OAuth metadata must be supplied as a ClientId/PublicOrigin pair; OAuth and webhook secret parameters are projected independently only when their corresponding feature metadata is configured. Added a physical GitHub hosting test project to the solution inventory (no solution-wide test command).

Verification: GitHub runtime **13 passed**, Salesforce runtime **15 passed**, GitHub hosting composition **4 passed** (installation-only, OAuth-only, webhook-only, both). GitHub hosting production build passes without warnings. Salesforce/GitHub fake integration handles implement coherent release. Connector metadata now names Salesforce and GitHub neuron and signal contracts.

Final credential-pair audit: Salesforce now reads ConsumerKey/ConsumerSecret from one atomic handle release; GitHub reads AppId and signing key from the same released snapshot/material. Paused-release regressions prohibit separate secret reads and verify changed identities use the new coherent pair. Latest project results: Salesforce **16 passed**, GitHub runtime **14 passed**.

Final taxonomy audit renamed the Salesforce request to `ConnectSalesforceConnection`, preserving alias `salesforce.connect-account` and members Id0-3; renamed endpoint/external helpers to Connection terminology. Salesforce suite remains **16 passed**.
