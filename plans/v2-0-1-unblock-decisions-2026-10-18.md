# v2.0.1 unblock decisions (2026-10-18)

Decisions taken in phase 6 (unblock and triage) of milestone v2.0.1 for the os and platform repositories.

## Stale w4 pull requests archived

Platform pull requests from the abandoned w4 line (#9, #10, #11 and the other superseded ones) were not merged. Each head was preserved as an archive tag before the pull request was closed, so no work is lost and the branches resolve from the tags.

## Dev secrets are generated on first run

The platform AppHost no longer carries constant development secrets in source. JWT, encryption, API and database passwords are generated as persisted parameters on a developer's first AppHost run and stored in user secrets. Old constant values remain in git history, so affected environments are rotated by the owner rather than by a history rewrite.

## Platform feed authentication: Options A and B

Platform CI cannot restore os packages from the GitHub Packages feed with the default workflow token. Option A grants the platform repository read access on each os package (Manage Actions access). Option B stores a classic read:packages token as the NUGET_GITHUB_TOKEN secret, which needs no further code change. The owner chooses one; both are documented in the phase operator runbook.

## os master protection through an aggregate ci job

The os workflow is named ci but no job was, so a required check named ci could never report. An aggregate job named ci (needs format, build and test, runs always, fails on any failure, cancellation or skip) is added by pull request. Branch protection then requires only ci, linear history, no force pushes and no deletions, and is applied by the owner after that pull request merges. If protection is needed earlier, the individual job contexts are required instead.
