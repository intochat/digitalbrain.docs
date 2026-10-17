# Maintaining this handbook

Update the evidence before changing a readiness label. A new class, registration or screenshot is useful evidence of implementation, but does not establish a working user journey.

## Update procedure

1. Record repository, branch, commit, working-tree differences and date. Inspect applicable repository instructions. Preserve unrelated work.
2. Trace the changed capability from user entry point through authorization, runtime, persistence and external service boundaries. Record exact paths and symbols.
3. Run the smallest meaningful safe check. Record the full command, environment, exit status, pass/fail/skip totals, and relevant warnings. Do not copy secrets or credential-bearing URLs.
4. State what the check proves and what remains untested. Keep local, provider sandbox, deployed and production evidence separate.
5. Update the capability page, evidence inventory and dependent roadmap gate together. Adjust homepage claims only after the detailed evidence supports them.
6. Recheck external official sources when capability, pricing, license or submission rules affect a decision. Store verification date and direct citation; vendor claims are not customer demand.
7. Build VitePress and check internal links, keyboard navigation, mobile layouts and reduced motion when presentation changes. Preserve historical routes or document their replacements.

## Readiness labels

Record four independent fields: **implementation**, **wiring**, **local/external verification**, and **production verification**. Use **implemented** when concrete source behavior exists, even if no live or production test was run. Use **partial** only when a named behavior is incomplete, and state the missing part. Keep **stub/schema only** and **not found in inspected scope** distinct. Mark optional, excluded or retired wiring separately from implementation. Use **verified in the tested environment** only with a named passing behavioral check; default production evidence to **not verified in this audit** unless dated deployment evidence exists. Do not infer that a feature has never been tested by its owners.

Registration, UI presence, route reachability, tested behavior, local operation, deployment and production operation are separate observations. When a test skips, retain the skip in totals. Historical successful reports remain historical until rerun with equivalent environment and scope.

## Suggested evidence record

```text
Claim ID:
Classification: founder intent | inspected code | executed check |
                external primary source | proposed decision | unresolved hypothesis
Repository/revision and dirty-tree qualification:
Source path and symbol or official URL:
Check date and environment:
Command and outcome (including skips):
What this establishes:
What this does not establish:
Related readiness row and roadmap gate:
Next verification trigger:
```

## Publication hygiene

Keep source references repository-relative unless a verified stable public source URL exists. The published site must not rely on a contributor's Windows path. Treat configuration inventories as names and requirements, never values. Avoid copying raw logs, environment files, customer data or private operator details into the website.

Preserve useful previous documents as historical material with a clear date and superseding link. Do not silently promote claims from old plans into current facts. In particular, the travel README, preliminary application counts, prior test totals and presentation claims need their own temporal context.

The deck is a strategy input. The HTML reference defines visual language. Neither establishes production readiness. Changes to either source should prompt a review of the four homepage sections without overwriting source-backed findings.

Related: [evidence inventory](./evidence), [repository map](./repositories), [decision register](./decisions).
