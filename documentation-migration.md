# Documentation migration

Product documentation now belongs in `E:\intochat\digitalbrain.docs`. The replacement handbook establishes current product vision, requirements, feature status, architecture assessment and delivery gates.

## Preservation

Before replacement, the previous handbook—including uncommitted changes to configuration, architecture and status, and the untracked CoreV2 page—was copied into `archive/2026-10-15-readiness/previous-handbook/`. Its working diff is also preserved.

Product documentation and evidence were copied to `archive/2026-10-15-readiness/product-repo/`. The migration manifest records each source path, SHA-256 digest and action. Historical content is excluded from VitePress navigation, page generation and search.

## Removal boundary

Narrative Markdown documentation and historical review evidence are removed from the product repository after replacement. Runtime prompts under features remain because they are app inputs. CLAUDE.md remains as agent instructions. Tooling and machine-readable schemas remain because deleting executable/support files is not a documentation cleanup.

Three testing packages require a README as a packaging input. Their old documentation is replaced with a short pointer to this handbook, keeping package structure valid without maintaining a second guide.

Inline app specifications and code comments remain part of source. Generated dependency/build output and ignored local session files are not treated as repository documentation.

## Current authority

The current handbook supersedes archived prose. The archive is evidence, not a set of current requirements. Product decisions still open are listed in the vision and requirements; historical plans must not silently resolve them.
