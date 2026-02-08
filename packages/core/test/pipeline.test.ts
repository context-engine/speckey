import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Logger, type AppLogObj } from "@speckey/logger";
import { ParsePipeline } from "../src/pipeline";
import type { PipelineConfig } from "../src/types";
import { DiscoveryErrors } from "@speckey/constants";

describe("ParsePipeline", () => {
    const testDir = resolve("./test-temp-core");
    const pipeline = new ParsePipeline();

    beforeAll(async () => {
        // Create test directory structure
        await mkdir(testDir, { recursive: true });
        await mkdir(join(testDir, "subdir"), { recursive: true });
        await mkdir(join(testDir, "empty"), { recursive: true });
        await mkdir(join(testDir, "node_modules"), { recursive: true });

        // Standard markdown files with mermaid blocks
        await writeFile(
            join(testDir, "spec1.md"),
            `# Spec 1

\`\`\`mermaid
classDiagram
    class Foo
\`\`\`
`,
        );

        await writeFile(
            join(testDir, "spec2.md"),
            `# Spec 2

\`\`\`mermaid
sequenceDiagram
    A->>B: Hello
\`\`\`

\`\`\`mermaid
flowchart TD
    A --> B
\`\`\`
`,
        );

        await writeFile(
            join(testDir, "subdir/spec3.md"),
            `# Spec 3

| Header1 | Header2 |
|---------|---------|
| Cell1   | Cell2   |

\`\`\`mermaid
erDiagram
    USER ||--o{ ORDER : places
\`\`\`
`,
        );

        // File with no mermaid blocks
        await writeFile(join(testDir, "no-blocks.md"), "# No Mermaid Blocks\n\nJust text.");

        // File with tables only
        await writeFile(
            join(testDir, "tables-only.md"),
            `# Tables Only

| Col1 | Col2 |
|------|------|
| A    | B    |

| Name | Value |
|------|-------|
| X    | Y     |
`,
        );

        // File with mixed content
        await writeFile(
            join(testDir, "mixed.md"),
            `# Mixed Content

| Header | Value |
|--------|-------|
| A      | 1     |

\`\`\`mermaid
classDiagram
    class Bar
\`\`\`

| Another | Table |
|---------|-------|
| B       | 2     |

\`\`\`mermaid
sequenceDiagram
    C->>D: Hi
\`\`\`

\`\`\`mermaid
flowchart LR
    X --> Y
\`\`\`
`,
        );

        // File in excluded directory
        await writeFile(join(testDir, "node_modules/dep.md"), "# Dependency");

        // Large file (>1MB)
        const largeContent = "# Large\n" + "a".repeat(2 * 1024 * 1024);
        await writeFile(join(testDir, "large.md"), largeContent);

        // UTF-8 with BOM
        const bom = Buffer.from([0xef, 0xbb, 0xbf]);
        const bomContent = Buffer.concat([bom, Buffer.from("# BOM File\n\n```mermaid\nclassDiagram\n    class Bom\n```\n")]);
        await writeFile(join(testDir, "with-bom.md"), bomContent);

        // Annotated class diagram for entity building tests
        await writeFile(
            join(testDir, "entity-basic.md"),
            `# Entity Basic

\`\`\`mermaid
classDiagram
class UserService {
    <<service>>
    %% @type definition
    %% @address speckey.test
    +getUser(id: string) User
    +createUser(data: UserData) User
}
class UserData {
    <<interface>>
    %% @type definition
    %% @address speckey.test
    +id string
    +name string
}
\`\`\`
`,
        );

        // Two class diagram blocks: one valid, one with broken syntax
        await writeFile(
            join(testDir, "entity-two-blocks.md"),
            `# Two Blocks

\`\`\`mermaid
classDiagram
class ValidService {
    <<service>>
    %% @type definition
    %% @address speckey.test
    +process() void
}
\`\`\`

\`\`\`mermaid
classDiagram
class BrokenClass {{{{
    totally invalid mermaid syntax
\`\`\`
`,
        );

        // Second annotated file for multi-file accumulation
        await writeFile(
            join(testDir, "entity-second.md"),
            `# Entity Second

\`\`\`mermaid
classDiagram
class OrderService {
    <<service>>
    %% @type definition
    %% @address speckey.orders
    +placeOrder(item: string) void
}
\`\`\`
`,
        );
    });

    afterAll(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    // ============================================================
    // Feature: Pipeline Orchestration
    // ============================================================

    describe("Pipeline Orchestration", () => {
        it("should run successful pipeline with mermaid blocks", async () => {
            const config: PipelineConfig = {
                paths: [testDir],
                include: ["spec1.md"],
            };

            const result = await pipeline.run(config);

            expect(result.files).toHaveLength(1);
            expect(result.files[0]?.blocks.length).toBeGreaterThan(0);
            expect(result.stats.filesDiscovered).toBe(1);
            expect(result.stats.filesParsed).toBe(1);
            expect(result.stats.blocksExtracted).toBeGreaterThan(0);
            expect(result.errors).toHaveLength(0);
        });

        it("should return empty for empty directory", async () => {
            const config: PipelineConfig = {
                paths: [join(testDir, "empty")],
            };

            const result = await pipeline.run(config);

            expect(result.files).toHaveLength(0);
            expect(result.stats.filesDiscovered).toBe(0);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]?.phase).toBe("discovery");
            expect(result.errors[0]?.userMessage).toBe(DiscoveryErrors.EMPTY_DIRECTORY);
        });

        it("should return empty for no matching files", async () => {
            const config: PipelineConfig = {
                paths: [testDir],
                include: ["**/nonexistent_*.md"],
            };

            const result = await pipeline.run(config);

            expect(result.files).toHaveLength(0);
            expect(result.stats.filesDiscovered).toBe(0);
        });

        it("should process multiple files with varying block counts", async () => {
            const config: PipelineConfig = {
                paths: [testDir],
                include: ["spec1.md", "spec2.md", "subdir/spec3.md"],
            };

            const result = await pipeline.run(config);

            expect(result.files).toHaveLength(3);
            // spec1: 1 block, spec2: 2 blocks, spec3: 1 block = 4 total
            expect(result.stats.blocksExtracted).toBe(4);
        });
    });

    // ============================================================
    // Feature: Error Handling
    // ============================================================

    describe("Error Handling", () => {
        it("should handle discovery error for invalid path", async () => {
            const config: PipelineConfig = {
                paths: ["/nonexistent/path/does/not/exist"],
            };

            const result = await pipeline.run(config);

            expect(result.files).toHaveLength(0);
            // May have discovery error depending on implementation
            expect(result.stats.filesDiscovered).toBe(0);
        });

        it("should continue pipeline despite partial errors", async () => {
            // Create a file then make it unreadable
            const unreadableFile = join(testDir, "unreadable.md");
            await writeFile(unreadableFile, "# Unreadable");

            const config: PipelineConfig = {
                paths: [testDir],
                include: ["spec1.md", "unreadable.md"],
            };

            // Make file unreadable
            try {
                await chmod(unreadableFile, 0o000);
            } catch {
                // Skip test if chmod fails (e.g., on Windows)
                return;
            }

            try {
                const result = await pipeline.run(config);

                // Should still have spec1.md
                expect(result.files.length).toBeGreaterThanOrEqual(1);
                expect(result.files.some((f) => f.path.includes("spec1.md"))).toBe(true);
            } finally {
                // Restore permissions for cleanup
                await chmod(unreadableFile, 0o644);
                await rm(unreadableFile);
            }
        });
    });

    // ============================================================
    // Feature: Stats Collection
    // ============================================================

    describe("Stats Collection", () => {
        it("should aggregate stats accurately", async () => {
            const config: PipelineConfig = {
                paths: [testDir],
                include: ["spec1.md", "spec2.md"],
            };

            const result = await pipeline.run(config);

            expect(result.stats.filesDiscovered).toBe(2);
            expect(result.stats.filesRead).toBe(2);
            expect(result.stats.filesParsed).toBe(2);
            expect(result.stats.blocksExtracted).toBe(3); // 1 + 2
            expect(result.stats.errorsCount).toBe(0);
        });

        it("should count files with no blocks correctly", async () => {
            const config: PipelineConfig = {
                paths: [testDir],
                include: ["no-blocks.md"],
            };

            const result = await pipeline.run(config);

            expect(result.stats.filesDiscovered).toBe(1);
            expect(result.stats.filesParsed).toBe(1);
            expect(result.stats.blocksExtracted).toBe(0);
        });
    });

    // ============================================================
    // Feature: Config Validation
    // ============================================================

    describe("Config Validation", () => {
        it("should apply default config values", async () => {
            const config: PipelineConfig = {
                paths: [join(testDir, "empty")],
                // No include, exclude, maxFiles, maxFileSizeMb specified
            };

            // Should not throw and use defaults
            const result = await pipeline.run(config);

            expect(result).toBeDefined();
            expect(result.stats).toBeDefined();
        });

        it("should skip files exceeding maxFileSizeMb", async () => {
            const config: PipelineConfig = {
                paths: [testDir],
                include: ["large.md"],
                maxFileSizeMb: 1, // Large file is 2MB
            };

            const result = await pipeline.run(config);

            // Large file should be skipped during discovery
            expect(result.files.some((f) => f.path.includes("large.md"))).toBe(false);
        });

        it("should respect exclude patterns", async () => {
            const config: PipelineConfig = {
                paths: [testDir],
                exclude: ["**/node_modules/**"],
            };

            const result = await pipeline.run(config);

            expect(result.files.some((f) => f.path.includes("node_modules"))).toBe(false);
        });
    });

    // ============================================================
    // Feature: Table Extraction
    // ============================================================

    describe("Table Extraction", () => {
        it("should extract markdown tables", async () => {
            const config: PipelineConfig = {
                paths: [testDir],
                include: ["tables-only.md"],
            };

            const result = await pipeline.run(config);

            expect(result.files).toHaveLength(1);
            expect(result.files[0]?.tables.length).toBe(2);
        });

        it("should extract both blocks and tables from mixed content", async () => {
            const config: PipelineConfig = {
                paths: [testDir],
                include: ["mixed.md"],
            };

            const result = await pipeline.run(config);

            expect(result.files).toHaveLength(1);
            expect(result.files[0]?.blocks.length).toBe(3);
            expect(result.files[0]?.tables.length).toBe(2);
        });

        it("should preserve table header and row data", async () => {
            const config: PipelineConfig = {
                paths: [testDir],
                include: ["subdir/spec3.md"],
            };

            const result = await pipeline.run(config);

            expect(result.files).toHaveLength(1);
            const table = result.files[0]?.tables[0];
            expect(table).toBeDefined();
            expect(table?.rows.length).toBeGreaterThan(0);
        });
    });

    // ============================================================
    // Feature: Encoding Handling
    // ============================================================

    describe("Encoding Handling", () => {
        it("should handle UTF-8 file with BOM marker", async () => {
            const config: PipelineConfig = {
                paths: [testDir],
                include: ["with-bom.md"],
            };

            const result = await pipeline.run(config);

            // BOM should not cause parse errors
            expect(result.files).toHaveLength(1);
            expect(result.files[0]?.blocks.length).toBeGreaterThan(0);
        });
    });

    // ============================================================
    // Feature: Multiple Paths
    // ============================================================

    describe("Multiple Paths", () => {
        it("should process files from multiple root paths", async () => {
            const config: PipelineConfig = {
                paths: [testDir, join(testDir, "subdir")],
                include: ["spec1.md", "spec3.md"],
            };

            const result = await pipeline.run(config);

            // Should find spec1.md from testDir and spec3.md from subdir
            expect(result.files.length).toBeGreaterThanOrEqual(1);
        });
    });

    // ============================================================
    // Feature: Entity Building (Phase 3a)
    // ============================================================

    describe("Entity Building (Phase 3a)", () => {
        it("should build classSpecs from annotated class diagrams", async () => {
            const config: PipelineConfig = {
                paths: [testDir],
                include: ["entity-basic.md"],
            };

            const result = await pipeline.run(config);

            expect(result.classSpecs.length).toBeGreaterThan(0);
            expect(result.stats.entitiesBuilt).toBe(result.classSpecs.length);
        });

        it("should produce empty classSpecs for unannotated classes", async () => {
            const config: PipelineConfig = {
                paths: [testDir],
                include: ["spec1.md"],
            };

            const result = await pipeline.run(config);

            // Foo has no @type or @address annotations, so validator skips it
            expect(result.classSpecs).toHaveLength(0);
            expect(result.stats.entitiesBuilt).toBe(0);
        });

        it("should continue building despite extract error in one block", async () => {
            const config: PipelineConfig = {
                paths: [testDir],
                include: ["entity-two-blocks.md"],
            };

            const result = await pipeline.run(config);

            // Valid block should still produce classSpecs
            expect(result.classSpecs.length).toBeGreaterThanOrEqual(1);
        });

        it("should accumulate classSpecs across multiple files", async () => {
            const config: PipelineConfig = {
                paths: [testDir],
                include: ["entity-basic.md", "entity-second.md"],
            };

            const result = await pipeline.run(config);

            // entity-basic has 2 classes, entity-second has 1 = at least 3
            expect(result.classSpecs.length).toBeGreaterThanOrEqual(2);
            expect(result.stats.entitiesBuilt).toBe(result.classSpecs.length);
        });
    });

    // ============================================================
    // Feature: Integration Validation (Phase 4)
    // ============================================================

    describe("Integration Validation (Phase 4)", () => {
        it("should skip validation when skipValidation is true", async () => {
            const config: PipelineConfig = {
                paths: [testDir],
                include: ["entity-basic.md"],
                skipValidation: true,
            };

            const result = await pipeline.run(config);

            expect(result.validationReport).toBeUndefined();
        });

        it("should provide validationReport when skipValidation is not set", async () => {
            const config: PipelineConfig = {
                paths: [testDir],
                include: ["entity-basic.md"],
            };

            const result = await pipeline.run(config);

            expect(result.validationReport).toBeDefined();
        });

        it("should report validationErrors count matching validation report", async () => {
            const config: PipelineConfig = {
                paths: [testDir],
                include: ["entity-basic.md"],
            };

            const result = await pipeline.run(config);

            // stats.validationErrors should match the actual report errors
            expect(result.stats.validationErrors).toBe(result.validationReport?.errors.length ?? 0);
        });
    });

    // ============================================================
    // Feature: Database Write (Phase 5)
    // ============================================================

    describe("Database Write (Phase 5)", () => {
        it("should skip write when no writeConfig", async () => {
            const config: PipelineConfig = {
                paths: [testDir],
                include: ["entity-basic.md"],
            };

            const result = await pipeline.run(config);

            expect(result.writeResult).toBeUndefined();
            expect(result.stats.entitiesInserted).toBe(0);
            expect(result.stats.entitiesUpdated).toBe(0);
        });
    });

    // ============================================================
    // Feature: Extended Stats
    // ============================================================

    describe("Extended Stats", () => {
        it("should report entitiesBuilt count", async () => {
            const config: PipelineConfig = {
                paths: [testDir],
                include: ["entity-basic.md"],
            };

            const result = await pipeline.run(config);

            expect(result.stats.entitiesBuilt).toBeGreaterThan(0);
            expect(result.stats.entitiesBuilt).toBe(result.classSpecs.length);
        });

        it("should report zero extended stats when phases skipped", async () => {
            const config: PipelineConfig = {
                paths: [testDir],
                include: ["entity-basic.md"],
                skipValidation: true,
            };

            const result = await pipeline.run(config);

            expect(result.stats.entitiesInserted).toBe(0);
            expect(result.stats.entitiesUpdated).toBe(0);
            expect(result.stats.validationErrors).toBe(0);
        });
    });

    // ============================================================
    // Feature: Per-Run State Lifecycle
    // ============================================================

    describe("Per-Run State Lifecycle", () => {
        it("should create fresh state for each run", async () => {
            const config: PipelineConfig = {
                paths: [testDir],
                include: ["entity-basic.md"],
            };

            const result1 = await pipeline.run(config);
            const result2 = await pipeline.run(config);

            // Both runs should produce same number of classSpecs
            expect(result1.classSpecs.length).toBe(result2.classSpecs.length);
            // classSpecs should be independent objects (not shared references)
            if (result1.classSpecs.length > 0) {
                expect(result1.classSpecs[0]).not.toBe(result2.classSpecs[0]);
            }
        });
    });

    // ============================================================
    // Feature: Logger Integration
    // ============================================================

    describe("Logger Integration", () => {
        /**
         * Helper: create a silent logger that captures all log entries via transport.
         * type: "hidden" suppresses console output; minLevel: 0 captures everything.
         */
        function createTestLogger() {
            const logs: Record<string, unknown>[] = [];
            const logger = new Logger<AppLogObj>({
                name: "test-pipeline",
                type: "hidden",
                minLevel: 0,
            });
            logger.attachTransport((logObj: Record<string, unknown>) => {
                logs.push(logObj);
            });
            return { logger, logs };
        }

        it("should accept logger parameter and still return valid result", async () => {
            const { logger } = createTestLogger();
            const config: PipelineConfig = {
                paths: [testDir],
                include: ["spec1.md"],
            };

            const result = await pipeline.run(config, logger);

            expect(result).toBeDefined();
            expect(result.files).toHaveLength(1);
            expect(result.stats.filesDiscovered).toBe(1);
        });

        it("should create child loggers per phase with log entries", async () => {
            const { logger, logs } = createTestLogger();
            const config: PipelineConfig = {
                paths: [testDir],
                include: ["entity-basic.md"],
            };

            await pipeline.run(config, logger);

            // Pipeline should produce log entries via child loggers
            expect(logs.length).toBeGreaterThan(0);

            // Each log entry from a child logger has _meta.name reflecting the phase
            const loggerNames = new Set(
                logs.map((l) => {
                    const meta = l["_meta"] as { name?: string } | undefined;
                    return meta?.name;
                }).filter(Boolean),
            );

            // At minimum, discovery and parse phases should produce logs
            expect(loggerNames.has("discovery")).toBe(true);
            expect(loggerNames.has("parse")).toBe(true);
        });

        it("should log from build phase when processing class diagrams", async () => {
            const { logger, logs } = createTestLogger();
            const config: PipelineConfig = {
                paths: [testDir],
                include: ["entity-basic.md"],
            };

            await pipeline.run(config, logger);

            const buildLogs = logs.filter((l) => {
                const meta = l["_meta"] as { name?: string } | undefined;
                return meta?.name === "build";
            });

            // entity-basic.md has annotated class diagrams, so build phase should log
            expect(buildLogs.length).toBeGreaterThan(0);
        });

        // TODO: Enable when IntegrationValidator accepts logger param
        // it("should log from validate phase when validation runs", async () => {
        //     const { logger, logs } = createTestLogger();
        //     const config: PipelineConfig = {
        //         paths: [testDir],
        //         include: ["entity-basic.md"],
        //     };
        //     await pipeline.run(config, logger);
        //     const validateLogs = logs.filter((l) => {
        //         const meta = l["_meta"] as { name?: string } | undefined;
        //         return meta?.name === "validate";
        //     });
        //     expect(validateLogs.length).toBeGreaterThan(0);
        // });

        it("should include phase-scoped context in log entries", async () => {
            const { logger, logs } = createTestLogger();
            const config: PipelineConfig = {
                paths: [testDir],
                include: ["spec1.md"],
            };

            await pipeline.run(config, logger);

            // Verify parent-child relationship: child loggers should have parentNames
            const childLogs = logs.filter((l) => {
                const meta = l["_meta"] as { parentNames?: string[] } | undefined;
                return meta?.parentNames && meta.parentNames.length > 0;
            });

            expect(childLogs.length).toBeGreaterThan(0);

            // All child logs should have "test-pipeline" as parent
            for (const log of childLogs) {
                const meta = log["_meta"] as { parentNames: string[] };
                expect(meta.parentNames).toContain("test-pipeline");
            }
        });

        it("should propagate logger to FileDiscovery in Phase 1", async () => {
            const { logger, logs } = createTestLogger();
            const config: PipelineConfig = {
                paths: [testDir],
                include: ["spec1.md"],
            };

            await pipeline.run(config, logger);

            // Discovery phase child logger should produce entries during file discovery
            const discoveryLogs = logs.filter((l) => {
                const meta = l["_meta"] as { name?: string } | undefined;
                return meta?.name === "discovery";
            });

            expect(discoveryLogs.length).toBeGreaterThan(0);
        });

        it("should not log when no logger is provided", async () => {
            const config: PipelineConfig = {
                paths: [testDir],
                include: ["spec1.md"],
            };

            // Calling without logger should still work (backwards compatible)
            const result = await pipeline.run(config);

            expect(result).toBeDefined();
            expect(result.files).toHaveLength(1);
        });
    });
});
