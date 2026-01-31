# Implementation Status

> Tracks architecture spec coverage in code. Updated: 2026-01-31

## Implemented

| Component | Spec | Implementation | Tests |
|-----------|------|----------------|-------|
| ParsePipeline | `core/pipeline/` | `core/src/pipeline.ts` | ✅ unit + property + integration |
| FileDiscovery | `io/file-discovery/` | `io/src/file-discovery/discovery.ts` | ✅ unit |
| MarkdownParser | `parser/mermaid-extraction/` | `parser/src/mermaid-extraction/parser.ts` | ✅ unit |
| DiagramRouter | `parser/mermaid-extraction/` | `parser/src/mermaid-extraction/router.ts` | ✅ unit |
| AnnotationParser | `parser/class-diagram/annotation-handling/` | `parser/src/diagrams/class-diagram/annotation-handling.ts` | via class-extractor tests |
| ClassExtractor | `parser/class-diagram/class-parsing/` | `parser/src/diagrams/class-diagram/class-parsing.ts` | ✅ unit |
| UnitValidator | `parser/class-diagram/unit-validator/` | `parser/src/diagrams/class-diagram/unit-validator/` | ✅ unit |
| PackageRegistry | `core/package-registry/` | `core/src/package-registry/` | ✅ unit |
| DeferredValidationQueue | `core/deferred-validation-queue/` | `core/src/deferred-validation-queue/` | ✅ unit |
| TypeResolver | `parser/class-diagram/type-resolver/` | `parser/src/diagrams/class-diagram/type-resolver/` | ✅ unit |
| EntityBuilder | `parser/class-diagram/entity-builder/` | `parser/src/diagrams/class-diagram/entity-builder/` | ✅ unit |
| IntegrationValidator | `parser/class-diagram/integration-validator/` | `parser/src/diagrams/class-diagram/integration-validator/` | ✅ unit |
| DatabaseTransaction | `database/transaction/` | `database/src/transaction/` | ✅ unit (32 scenarios) |
| DatabaseWriter | `database/writer/` | `database/src/writer/` | ✅ unit (28 scenarios) |
| CLI | `cli/` | `cli/src/cli.ts` | ✅ unit + e2e |

## Pipeline Wiring

All phases are wired end-to-end in `core/src/pipeline.ts`:

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | File discovery | ✅ Wired |
| 2 | Mermaid extraction + routing | ✅ Wired |
| 3a.0 | Class extraction | ✅ Wired |
| 3a.1 | Unit validation | ✅ Wired |
| 3a.2 | Entity building (EntityBuilder + TypeResolver) | ✅ Wired |
| 4 | Integration validation (DeferredValidationQueue drain) | ✅ Wired |
| 5 | Database write (DgraphWriter) | ✅ Wired (gated on writeConfig + validation pass) |

## Not Implemented

| # | Component | Spec | Target Location | Notes |
|---|-----------|------|-----------------|-------|
| 1 | E2E Pipeline Tests | `04-test-specs/integration/07-*`, `08-*` | `tests/e2e/` | Test specs written, implementation pending |

## Notes

- All spec paths relative to `speckey/3-how/specs/03-architecture/`
- All implementation paths relative to `speckey/implementation/packages/`
- Shared package (`packages/shared/`) exists but is empty — may be used for cross-package types like ClassSpec
- 475 tests passing across 22 files
