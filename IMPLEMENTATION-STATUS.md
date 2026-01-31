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
| CLI | `cli/` | `cli/src/cli.ts` | ✅ unit + e2e |

## Partially Implemented

| Component | Spec | Implementation | Gap |
|-----------|------|----------------|-----|
| RelationshipParsing | (part of class-parsing spec) | `parser/src/diagrams/class-diagram/relationship-parsing.ts` | Stub |

## Not Implemented

| # | Component | Spec | Target Location | Dependencies |
|---|-----------|------|-----------------|--------------|
| 1 | PackageRegistry | `core/package-registry/` | `core/src/package-registry.ts` | None |
| 2 | DeferredValidationQueue | `core/deferred-validation-queue/` | `core/src/deferred-validation-queue.ts` | None |
| 3 | EntityBuilder | `parser/class-diagram/entity-builder/` | `parser/src/diagrams/class-diagram/entity-builder/` | PackageRegistry, TypeResolver, DeferredValidationQueue |
| 4 | TypeResolver | `parser/class-diagram/type-resolver/` | `parser/src/diagrams/class-diagram/type-resolver/` | PackageRegistry, DeferredValidationQueue |
| 5 | IntegrationValidator | `parser/class-diagram/integration-validator/` | `parser/src/diagrams/class-diagram/integration-validator/` | PackageRegistry, DeferredEntry |
| 6 | DatabaseWriter | `database/writer/` | `database/src/writer/` | Transaction |
| 7 | DatabaseTransaction | `database/transaction/` | `database/src/transaction/` | — |

## Implementation Order

Based on dependency graph:

```
1. PackageRegistry          (no deps — core infrastructure)
2. DeferredValidationQueue  (no deps — core infrastructure)
3. TypeResolver             (needs PackageRegistry, DeferredValidationQueue)
4. EntityBuilder            (needs PackageRegistry, DeferredValidationQueue, TypeResolver)
5. IntegrationValidator     (needs PackageRegistry, DeferredEntry)
6. Pipeline updates         (wire new components into Phase 3a-2 and Phase 4)
7. DatabaseTransaction      (no deps)
8. DatabaseWriter           (needs Transaction)
```

Items 1-6 complete the parse pipeline through Phase 4.
Items 7-8 add Phase 5 (database write).

## Notes

- All spec paths relative to `speckey/3-how/specs/03-architecture/`
- All implementation paths relative to `speckey/implementation/packages/`
- Shared package (`packages/shared/`) exists but is empty — may be used for cross-package types like ClassSpec
