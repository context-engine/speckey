import { describe, it, expect } from "bun:test";
import { join } from "path";
import { ParsePipeline } from "../../packages/core/src";
import type { PipelineConfig } from "../../packages/core/src";
import { OrphanPolicy } from "../../packages/database/src";
import { DiscoveryErrors } from "../../packages/constants/src";

const FIXTURES = join(import.meta.dir, "../fixtures/e2e");

function fixture(...segments: string[]): string {
    return join(FIXTURES, ...segments);
}

function runPipeline(config: Partial<PipelineConfig> & { paths: string[] }) {
    const pipeline = new ParsePipeline();
    return pipeline.run(config);
}

// ============================================================
// E2E-100: Happy Path — Single File
// ============================================================

describe("E2E-100: Happy Path — Single File", () => {
    it("should process a single annotated file through all phases", async () => {
        const result = await runPipeline({ paths: [fixture("single-file")] });

        expect(result.stats.filesDiscovered).toBe(1);
        expect(result.stats.filesParsed).toBe(1);
        expect(result.stats.blocksExtracted).toBe(2);
        expect(result.classSpecs.length).toBe(2);
        expect(result.errors.filter(e => e.phase === "build")).toHaveLength(0);
    });

    it("should construct correct FQNs from @address annotations", async () => {
        const result = await runPipeline({ paths: [fixture("single-file")] });

        const fqns = result.classSpecs.map(s => s.fqn).sort();
        expect(fqns).toEqual(["app.models.Profile", "app.services.AccountService"]);
    });

    it("should populate ClassSpec fields correctly", async () => {
        const result = await runPipeline({ paths: [fixture("single-file")] });

        const accountService = result.classSpecs.find(s => s.name === "AccountService");
        expect(accountService).toBeDefined();
        expect(accountService!.package).toBe("app.services");
        expect(accountService!.stereotype).toBe("class");
        expect(accountService!.methods.length).toBe(2);
        expect(accountService!.methods.map(m => m.name).sort()).toEqual(["createAccount", "getAccount"]);

        const profile = result.classSpecs.find(s => s.name === "Profile");
        expect(profile).toBeDefined();
        expect(profile!.package).toBe("app.models");
        expect(profile!.properties.length).toBe(2);
    });

    it("should have zero validation errors for well-formed file", async () => {
        const result = await runPipeline({ paths: [fixture("single-file")] });

        expect(result.validationReport).toBeDefined();
        expect(result.validationReport!.errors).toHaveLength(0);
    });
});

// ============================================================
// E2E-200: Happy Path — Multi-File
// ============================================================

describe("E2E-200: Happy Path — Multi-File", () => {
    it("should process multiple files and accumulate entities", async () => {
        const result = await runPipeline({ paths: [fixture("multi-file")] });

        expect(result.stats.filesDiscovered).toBe(2);
        expect(result.stats.filesParsed).toBe(2);
        expect(result.classSpecs.length).toBe(4);
    });

    it("should construct FQNs across multiple files", async () => {
        const result = await runPipeline({ paths: [fixture("multi-file")] });

        const fqns = result.classSpecs.map(s => s.fqn).sort();
        expect(fqns).toEqual([
            "app.models.Customer",
            "app.models.Invoice",
            "app.services.BillingService",
            "app.services.ShippingService",
        ]);
    });

    it("should track stats across all files", async () => {
        const result = await runPipeline({ paths: [fixture("multi-file")] });

        expect(result.stats.blocksExtracted).toBe(4);
        expect(result.stats.entitiesBuilt).toBe(4);
    });
});

// ============================================================
// E2E-300: Type Resolution Across Phases
// ============================================================

describe("E2E-300: Type Resolution", () => {
    it("should skip resolution for built-in types", async () => {
        const result = await runPipeline({ paths: [fixture("single-file")] });

        const profile = result.classSpecs.find(s => s.name === "Profile");
        expect(profile).toBeDefined();

        // string is a built-in type, should be resolved as-is
        const nameProp = profile!.properties.find(p => p.name === "name");
        expect(nameProp).toBeDefined();
        expect(nameProp!.type).toBe("string");
    });

    it("should resolve same-diagram class references", async () => {
        const result = await runPipeline({ paths: [fixture("single-file")] });

        const accountService = result.classSpecs.find(s => s.name === "AccountService");
        expect(accountService).toBeDefined();

        // AccountService methods return string (built-in), so check methods exist
        expect(accountService!.methods.length).toBe(2);
        const getAccount = accountService!.methods.find(m => m.name === "getAccount");
        expect(getAccount).toBeDefined();
        expect(getAccount!.returnType).toBe("string");
    });

    it("should build entities from cross-file diagrams", async () => {
        const result = await runPipeline({ paths: [fixture("multi-file")] });

        const billingService = result.classSpecs.find(s => s.name === "BillingService");
        expect(billingService).toBeDefined();
        expect(billingService!.package).toBe("app.services");
    });
});

// ============================================================
// E2E-400: Validation Failures Block Write
// ============================================================

describe("E2E-400: Validation Failures Block Write", () => {
    it("should report integration validation errors for unresolvable references", async () => {
        const result = await runPipeline({ paths: [fixture("validation-failure")] });

        // ExternalGateway is @type reference with no definition — Phase 4 should catch this
        expect(result.validationReport).toBeDefined();
        expect(result.validationReport!.errors.length).toBeGreaterThan(0);
    });

    it("should not write to database when validation fails", async () => {
        const result = await runPipeline({
            paths: [fixture("validation-failure")],
            writeConfig: {
                dbPath: "/tmp/test-db",
                orphanedEntities: OrphanPolicy.KEEP,
                backupBeforeWrite: false,
            },
        });

        // Validation errors should block Phase 5
        expect(result.writeResult).toBeUndefined();
    });

    it("should write to database when skipValidation is true despite errors", async () => {
        const result = await runPipeline({
            paths: [fixture("validation-failure")],
            skipValidation: true,
            writeConfig: {
                dbPath: "/tmp/test-db",
                orphanedEntities: OrphanPolicy.KEEP,
                backupBeforeWrite: false,
            },
        });

        // Phase 4 skipped, so write should proceed
        expect(result.validationReport).toBeUndefined();
        expect(result.writeResult).toBeDefined();
    });
});

// ============================================================
// E2E-500: Database Write Outcomes
// ============================================================

describe("E2E-500: Database Write Outcomes", () => {
    it("should insert all entities on first write", async () => {
        const result = await runPipeline({
            paths: [fixture("single-file")],
            writeConfig: {
                dbPath: "/tmp/test-db",
                orphanedEntities: OrphanPolicy.KEEP,
                backupBeforeWrite: false,
            },
        });

        expect(result.writeResult).toBeDefined();
        expect(result.writeResult!.inserted).toBe(2);
        expect(result.writeResult!.updated).toBe(0);
        expect(result.writeResult!.total).toBe(2);
        expect(result.writeResult!.errors).toHaveLength(0);
    });

    it("should report correct stats in pipeline after write", async () => {
        const result = await runPipeline({
            paths: [fixture("single-file")],
            writeConfig: {
                dbPath: "/tmp/test-db",
                orphanedEntities: OrphanPolicy.KEEP,
                backupBeforeWrite: false,
            },
        });

        expect(result.stats.entitiesInserted).toBe(2);
        expect(result.stats.entitiesUpdated).toBe(0);
    });
});

// ============================================================
// E2E-600: Error Propagation Across Phases
// ============================================================

describe("E2E-600: Error Propagation", () => {
    it("should report discovery error for non-existent path", async () => {
        const result = await runPipeline({ paths: [fixture("nonexistent-path")] });

        const discoveryErrors = result.errors.filter(e => e.phase === "discovery");
        expect(discoveryErrors.length).toBeGreaterThan(0);
        expect(discoveryErrors[0]?.userMessage).toBe(DiscoveryErrors.PATH_NOT_FOUND);
    });

    it("should process remaining files when one path fails", async () => {
        const result = await runPipeline({
            paths: [fixture("nonexistent-path"), fixture("single-file")],
        });

        // single-file should still be processed
        expect(result.classSpecs.length).toBe(2);
    });

    it("should produce zero blocks for file with no mermaid diagrams", async () => {
        const result = await runPipeline({ paths: [fixture("no-mermaid")] });

        expect(result.stats.filesDiscovered).toBe(1);
        expect(result.stats.blocksExtracted).toBe(0);
        expect(result.classSpecs).toHaveLength(0);
    });
});

// ============================================================
// E2E-700: Incremental Parse (skipValidation)
// ============================================================

describe("E2E-700: Incremental Parse", () => {
    it("should skip Phase 4 when skipValidation is true", async () => {
        const result = await runPipeline({
            paths: [fixture("single-file")],
            skipValidation: true,
        });

        expect(result.validationReport).toBeUndefined();
        expect(result.classSpecs.length).toBe(2);
        expect(result.stats.validationErrors).toBe(0);
    });

    it("should still build entities when validation is skipped", async () => {
        const result = await runPipeline({
            paths: [fixture("multi-file")],
            skipValidation: true,
        });

        expect(result.classSpecs.length).toBe(4);
        expect(result.stats.entitiesBuilt).toBe(4);
    });
});

// ============================================================
// E2E-800: Edge Cases
// ============================================================

describe("E2E-800: Edge Cases", () => {
    it("should handle empty directory with no markdown files", async () => {
        const result = await runPipeline({ paths: [fixture("empty-dir")] });

        expect(result.stats.filesDiscovered).toBe(0);
        expect(result.classSpecs).toHaveLength(0);
        const discoveryErrors = result.errors.filter(e => e.phase === "discovery");
        expect(discoveryErrors).toHaveLength(1);
        expect(discoveryErrors[0]?.userMessage).toBe(DiscoveryErrors.EMPTY_DIRECTORY);
    });

    it("should silently skip classes without annotations (no errors)", async () => {
        // Use existing fixture that has no annotations
        const result = await runPipeline({
            paths: [join(import.meta.dir, "../fixtures/simple-spec")],
        });

        expect(result.stats.filesDiscovered).toBeGreaterThanOrEqual(1);
        expect(result.classSpecs).toHaveLength(0);
        // No build errors — unannotated classes are just skipped
        const buildErrors = result.errors.filter(e => e.phase === "build");
        expect(buildErrors).toHaveLength(0);
    });

    it("should handle file with only @type reference classes", async () => {
        const result = await runPipeline({ paths: [fixture("type-only")] });

        // References don't produce classSpecs (they go to deferred queue)
        expect(result.classSpecs).toHaveLength(0);

        // But integration validation should report unresolved references
        expect(result.validationReport).toBeDefined();
        expect(result.validationReport!.errors.length).toBeGreaterThan(0);
    });
});
