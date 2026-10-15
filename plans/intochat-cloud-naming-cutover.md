# IntoChat naming cutover

Source rename completed on 2026-10-15 in E:/intochat/intochat-cloud, from clean HEAD fa21bbc. This is a source change, not a deployment or verified upgrade. No tests, builds, applications, migrations or deployment scripts ran. The user explicitly authorized the naming work previously deferred as X3.

## Source changes

All non-ignored cloud source text and file/project paths now use IntoChat / intoChat / intochat / INTOCHAT, including namespaces, assembly references, DbContext, solution/CI/Docker paths, localization resources, frontend package/lock metadata, browser keys, documentation and configuration examples. Public digitalbrain runtime names are outside this cloud rename and remain unchanged. Git history and ignored build/dependency contents are not rewritten. Visual inspection found the old name embedded in the single PNG asset. That obsolete asset was replaced by a new source SVG wordmark; the favicon initials now read IC. Email headers default to text unless an explicit logo is configured. SVG social-preview support remains unverified; supply an approved raster social asset before public launch if required by target platforms.

Database model, raw SQL and frozen migration targets now refer to IntoChat.Server. Migration IDs and ordering are preserved; existing applied migrations must not be replayed. Both database runner and optional development API migration paths refuse migration history outside the configured schema. This is a conservative preflight, not an automatic rename or a substitute for environment inventory. EF command-line tools and the retired deployment reference do not establish this preflight; do not invoke them before cutover review.

## Existing-database transition — NOT EXECUTED

First classify the environment, record applied migration IDs and row counts, take a recoverable snapshot, stop writers/workers and approve the cutover window. Preserve existing connection credentials and encryption key values. Do not run renamed migrations against the old schema: EF could otherwise create a second installation and miss existing identities/billing state.

For an existing database with the original schema, review the following transactional schema rename. It moves tables, migration history and other schema objects together; it does not copy or delete customer rows. If both schemas exist, investigate the conflict instead of choosing a winner. If neither exists, use the separately approved fresh-database route. Do not run the script merely because it is present here.

```sql
BEGIN;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'TripRadar.Server') THEN
        IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'IntoChat.Server') THEN
            RAISE EXCEPTION 'Both schemas exist; reconcile before cutover';
        END IF;
        ALTER SCHEMA "TripRadar.Server" RENAME TO "IntoChat.Server";
    ELSIF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'IntoChat.Server') THEN
        RAISE EXCEPTION 'No recognized existing schema; classify environment first';
    END IF;
END $$;
COMMIT;
```

### Migration history location must be inventoried separately

Earlier registrations used inconsistent history schemas: public (provider default), TripRadar, and TripRadar.Server. The renamed registrations now all use the single DbConstants schema/table pair (IntoChat.Server.__EFMigrationsHistory). Before applying the schema rename above, inventory every __EFMigrationsHistory table and identify which one describes this application's actual applied migrations. If the authoritative table is inside the renamed schema it moves with that schema. If it is in public or the former short schema, an authorized operator must move that exact table into IntoChat.Server after checking there is no destination history table; do not merge conflicting histories, drop either history or guess based on row count. Unrelated applications sharing a database also trigger the conservative guard and require an explicit isolation/cutover decision. The generic SQL above does not resolve these cases automatically.

After an authorized rehearsal: compare migration IDs, tables, row counts, restrictive FKs, functions/triggers and permissions. Inspect any stored SQL/function bodies, schema-qualified grants, search_path values and integrations: renaming a schema does not rewrite arbitrary text held outside catalog dependencies. Ensure the app identity can access the renamed schema. New installs use the renamed migration chain; existing installs use retained history after the schema transition. No migrations were squashed or removed.

Rollback requires stopping the renamed application/workers and reversing the schema rename under the same conflict checks, then restoring the compatible previous application/configuration. Do not deploy old application code against only the renamed schema. Never clear migration history to force replay.

## Persisted and external names

- Hangfire stores assembly-qualified job types. Old jobs cannot be assumed deserializable after namespace/assembly renaming. Inventory and drain or explicitly retire obsolete jobs under the old release before switching; preserve durable billing inbox/outbox/checkout records. No queued jobs were deleted or rewritten here. Cloud jobs retain the existing IntoChatHangfire configuration default.
- Namespace-only source replacement does not rename an existing database, provider resources, domains, DNS, container images, registry repositories, OAuth clients, mail senders or secret-store entries. Review renamed configuration keys and supply approved IntoChat values. New names in examples are not proof those external resources exist or are owned.
- Cookie names, JWT audience/issuer defaults, browser-storage keys, cache prefixes and telemetry names containing the old brand changed. Plan reauthentication and a cold cache; old browser state is not silently imported. Keep encryption key material unchanged to preserve encrypted customer/billing payloads.
- Existing generated bin/obj files and dependencies remain untouched internally and must be regenerated during a later authorized build. Top-level generated-only legacy project directories were renamed without deleting their contents.
- Developer user-secret IDs were not rotated by textual brand replacement; configure separate approved cloud secrets explicitly. No credentials were printed, copied to a new secret store or changed intentionally.

## Verification evidence

Static checks only: no legacy brand text/path matches in non-ignored source; solution/project-reference paths resolve; migration IDs match baseline; current frozen migration target and snapshot remain aligned. Compilation, resource generation, CI, Docker builds, authentication transitions, Hangfire deserialization and database cutover remain unverified. See the migration status document for the still-blocked hosted-runtime work.