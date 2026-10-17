# Local operation and deployment boundaries

The product entry point is `dotnet run digitalbrain.cs` from the product repository. The launcher starts the Aspire AppHost. Read the selected profile and deployment configuration before starting it; a profile's name does not certify production readiness.

## Current prerequisites

- SDK version from product `global.json`: .NET 11 RC with roll-forward configuration.
- Infrastructure and native prerequisites required by the selected AppHost profile, including container services and the Flutter desktop shell when enabled.
- Required storage custody and identity settings.
- Credentials for selected model/providers when those capabilities are used.

AppHost currently selects RunProfile.Cloud. Local and Reference profiles also exist. Do not copy older Gemma-only or distributed-mesh instructions from archived docs.

## State and access

The runtime owns an encrypted local brain journal. Account/platform data, identity protection and application database state have their own storage responsibilities. Recovery requires the matching stores and keys; preserving only the features folder is insufficient.

Local run mode defaults to Open authentication posture unless configured otherwise. Public use requires an explicitly secured deployment and acceptance at its actual origin.

Customer Researcher's historical successful browser run used an authenticated desktop on the runtime machine. That does not demonstrate remote browser automation for a browser-only visitor.

This product assessment did not start, stop or reconfigure the user's product runtime. See [Requirements](product/requirements.md) for deployment acceptance.
