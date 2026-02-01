# Implementation Status

> Tracks architecture spec coverage in code. Updated: 2026-02-01

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
| ClassDiagram Integration | `04-test-specs/integration/03-*` | `tests/integration/class-diagram.integration.test.ts` | ✅ integration |
| Pipeline Integration | `04-test-specs/integration/01-*` | `tests/integration/pipeline.integration.test.ts` | ✅ integration |
| E2E Pipeline | `04-test-specs/e2e/07-*`, `08-*` | `tests/e2e/pipeline.e2e.test.ts` | ✅ e2e |
| Shared Types | — | `shared/src/` (`types.ts`, `interfaces.ts`) | — |

## Pipeline Wiring

All phases are wired end-to-end in `core/src/pipeline.ts`:

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | File discovery | ✅ Wired |
| 1b | File size validation | ✅ Wired |
| 2 | Mermaid extraction + routing | ✅ Wired |
| 3a.0 | Class extraction | ✅ Wired |
| 3a.1 | Unit validation | ✅ Wired |
| 3a.2 | Entity building (EntityBuilder + TypeResolver) | ✅ Wired |
| 4 | Integration validation (DeferredValidationQueue drain) | ✅ Wired |
| 5 | Database write (DgraphWriter) | ✅ Wired (gated on writeConfig + validation pass) |

## Test Specs

| Level | Spec Files | Status |
|-------|-----------|--------|
| Unit | `04-test-specs/unit/` (cli, core, database, io, parser) | ✅ Written |
| Integration | `04-test-specs/integration/` (6 scenario/matrix files) | ✅ Written |
| E2E | `04-test-specs/e2e/07-*`, `08-*` | ✅ Written |

## Not Implemented

No outstanding components — all spec'd modules have implementations and tests.

## Notes

- All spec paths relative to `speckey/3-how/specs/03-architecture/`
- All implementation paths relative to `speckey/implementation/packages/`
- Shared package (`packages/shared/src/`) provides cross-package types (`types.ts`, `interfaces.ts`)
- 530 tests passing across 23 files (1763 assertions)
