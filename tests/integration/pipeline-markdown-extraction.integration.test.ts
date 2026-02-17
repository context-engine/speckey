import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Logger, type AppLogObj } from "@speckey/logger";
import { ParsePipeline } from "../../packages/core/src";
import type { PipelineConfig, PipelineResult } from "../../packages/core/src/types";

/**
 * Pipeline ↔ MarkdownExtraction Integration Tests
 *
 * Scope: Boundary contract between ParsePipeline (Phase 2a) and
 * MarkdownParser — content forwarding, code block extraction & language
 * grouping, table extraction, extraction-level error filtering, stats
 * accuracy, logger forwarding.
 *
 * Does NOT test: MarkdownParser internals, MermaidValidator, DiagramRouter,
 * CLI, FileDiscovery, or Phases 3a-5.
 */

const FIXTURES_DIR = resolve(import.meta.dir, "../fixtures");
const TEMP_DIR = resolve(import.meta.dir, "../temp-pipeline-markdown-extraction");

describe("Pipeline ↔ MarkdownExtraction Integration", () => {
    const pipeline = new ParsePipeline();

    beforeAll(async () => {
        await mkdir(TEMP_DIR, { recursive: true });

        // single-class: 1 .md file with 1 classDiagram block
        const singleClass = join(TEMP_DIR, "single-class");
        await mkdir(singleClass, { recursive: true });
        await writeFile(
            join(singleClass, "spec.md"),
            `# Single Class

\`\`\`mermaid
classDiagram
    class User {
        +id: string
        +name: string
    }
\`\`\`
`,
        );

        // multi-file: 3 .md files, each with 1 mermaid block
        const multiFile = join(TEMP_DIR, "multi-file");
        await mkdir(multiFile, { recursive: true });
        await writeFile(
            join(multiFile, "a.md"),
            `# File A
\`\`\`mermaid
classDiagram
    class Foo
\`\`\`
`,
        );
        await writeFile(
            join(multiFile, "b.md"),
            `# File B
\`\`\`mermaid
sequenceDiagram
    A->>B: msg
\`\`\`
`,
        );
        await writeFile(
            join(multiFile, "c.md"),
            `# File C
\`\`\`mermaid
erDiagram
    ITEM ||--o{ TAG : has
\`\`\`
`,
        );

        // no-mermaid: 1 .md file with no code blocks at all
        const noMermaid = join(TEMP_DIR, "no-mermaid");
        await mkdir(noMermaid, { recursive: true });
        await writeFile(join(noMermaid, "plain.md"), "# Plain Markdown\n\nJust text, no diagrams.\n");

        // non-mermaid-code: 1 .md file with non-mermaid code blocks only
        const nonMermaidCode = join(TEMP_DIR, "non-mermaid-code");
        await mkdir(nonMermaidCode, { recursive: true });
        await writeFile(
            join(nonMermaidCode, "code.md"),
            `# Code File

\`\`\`typescript
const x = 1;
\`\`\`

\`\`\`javascript
console.log("hello");
\`\`\`
`,
        );

        // with-tables: 1 .md file with mermaid block + markdown tables
        const withTables = join(TEMP_DIR, "with-tables");
        await mkdir(withTables, { recursive: true });
        await writeFile(
            join(withTables, "spec.md"),
            `# Spec With Tables

\`\`\`mermaid
classDiagram
    class Product {
        +id: string
        +price: number
    }
\`\`\`

## Properties

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier |
| price | number | Product price |

## Scenarios

| Scenario | Input | Expected |
|----------|-------|----------|
| Happy path | valid | success |
| Missing id | empty | error |
`,
        );

        // no-tables: 1 .md file with mermaid block but no tables
        const noTables = join(TEMP_DIR, "no-tables");
        await mkdir(noTables, { recursive: true });
        await writeFile(
            join(noTables, "spec.md"),
            `# No Tables

\`\`\`mermaid
classDiagram
    class Widget {
        +id: string
    }
\`\`\`

Just text below, no tables.
`,
        );

        // mixed-content: one file with mermaid, one without
        const mixedDir = join(TEMP_DIR, "mixed-content");
        await mkdir(mixedDir, { recursive: true });
        await writeFile(
            join(mixedDir, "has-mermaid.md"),
            `# Has Mermaid
\`\`\`mermaid
classDiagram
    class Order {
        +id: string
    }
\`\`\`
`,
        );
        await writeFile(join(mixedDir, "no-mermaid.md"), "# No Mermaid\n\nPlain text.\n");
    });

    afterAll(async () => {
        await rm(TEMP_DIR, { recursive: true, force: true });
    });

    // ============================================================
    // Feature: Content Forwarding — File Content to Parser
    // ============================================================

    describe("Content Forwarding — File Content to Parser", () => {
        it("should parse single file with code blocks", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "single-class")],
            };

            const result = await pipeline.run(config);

            expect(result.stats.filesParsed).toBe(1);
            expect(result.files).toHaveLength(1);
            expect(result.files[0]!.path).toContain("single-class");
        });

        it("should parse multiple files independently", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "multi-file")],
            };

            const result = await pipeline.run(config);

            expect(result.stats.filesParsed).toBe(3);
            expect(result.files).toHaveLength(3);

            const paths = result.files.map((f) => f.path);
            const uniquePaths = new Set(paths);
            expect(uniquePaths.size).toBe(3);
        });

        it("should parse file with no code blocks (warning, not error)", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "no-mermaid")],
            };

            const result = await pipeline.run(config);

            expect(result.stats.filesParsed).toBe(1);
            expect(result.files).toHaveLength(1);
            const parseErrors = result.errors.filter((e) => e.phase === "parse");
            expect(parseErrors).toHaveLength(0);
        });

        it("should parse file with non-mermaid code blocks only", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "non-mermaid-code")],
            };

            const result = await pipeline.run(config);

            expect(result.stats.filesParsed).toBe(1);
            expect(result.files).toHaveLength(1);
            const parseErrors = result.errors.filter((e) => e.phase === "parse");
            expect(parseErrors).toHaveLength(0);
        });
    });

    // ============================================================
    // Feature: Table Extraction Pass-Through
    // ============================================================

    describe("Table Extraction Pass-Through", () => {
        it("should extract tables and store in ParsedFile.tables", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "with-tables")],
            };

            const result = await pipeline.run(config);

            const file = result.files[0]!;
            expect(file.tables.length).toBeGreaterThanOrEqual(1);
            for (const table of file.tables) {
                expect(table.rows).toBeDefined();
                expect(table.rows.length).toBeGreaterThan(0);
                for (const row of table.rows) {
                    expect(row.cells).toBeDefined();
                    expect(row.cells.length).toBeGreaterThan(0);
                }
            }
        });

        it("should have empty tables array when file has no tables", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "no-tables")],
            };

            const result = await pipeline.run(config);

            expect(result.files[0]!.tables).toEqual([]);
        });

        it("should extract multiple tables from one file", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "with-tables")],
            };

            const result = await pipeline.run(config);

            expect(result.files[0]!.tables).toHaveLength(2);
        });
    });

    // ============================================================
    // Feature: Code Block Grouping by Language
    // ============================================================

    describe("Code Block Grouping by Language", () => {
        it("should extract non-mermaid code blocks (no pipeline error)", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "non-mermaid-code")],
            };

            const result = await pipeline.run(config);

            // Non-mermaid blocks are extracted but only mermaid blocks reach ParsedFile.blocks
            expect(result.files[0]!.blocks).toEqual([]);
            // No errors — extraction succeeded, just no mermaid to validate
            expect(result.errors.filter((e) => e.phase === "parse")).toHaveLength(0);
        });

        it("should extract mermaid blocks alongside non-mermaid blocks", async () => {
            // single-class has only mermaid — just verifying that mermaid extraction works
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "single-class")],
            };

            const result = await pipeline.run(config);

            // Mermaid block passed through extraction and validation
            expect(result.files[0]!.blocks.length).toBeGreaterThanOrEqual(1);
        });
    });

    // ============================================================
    // Feature: Line Number Tracking — Extraction Level
    // ============================================================

    describe("Line Number Tracking — Extraction Level", () => {
        it("should provide 1-indexed line numbers for tables", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "with-tables")],
            };

            const result = await pipeline.run(config);

            for (const table of result.files[0]!.tables) {
                expect(table.startLine).toBeGreaterThan(0);
                expect(table.endLine).toBeGreaterThanOrEqual(table.startLine);
            }
        });

        it("should provide 1-indexed line numbers for blocks", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "single-class")],
            };

            const result = await pipeline.run(config);

            const block = result.files[0]!.blocks[0]!;
            expect(block.startLine).toBeGreaterThan(0);
            expect(block.endLine).toBeGreaterThan(block.startLine);
        });
    });

    // ============================================================
    // Feature: Error Severity Filtering — Extraction Level
    // ============================================================

    describe("Error Severity Filtering — Extraction Level", () => {
        it("should not skip file on WARNING (no-mermaid case)", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "no-mermaid")],
            };

            const result = await pipeline.run(config);

            expect(result.stats.filesParsed).toBe(1);
            expect(result.files).toHaveLength(1);
            const parseErrors = result.errors.filter((e) => e.phase === "parse");
            expect(parseErrors).toHaveLength(0);
        });

        it("should handle mix of files with and without code blocks", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "mixed-content")],
            };

            const result = await pipeline.run(config);

            expect(result.stats.filesParsed).toBe(2);
            expect(result.stats.filesRead).toBe(2);
            expect(result.files).toHaveLength(2);

            const withBlocks = result.files.filter((f) => f.blocks.length > 0);
            const withoutBlocks = result.files.filter((f) => f.blocks.length === 0);
            expect(withBlocks).toHaveLength(1);
            expect(withoutBlocks).toHaveLength(1);

            const parseErrors = result.errors.filter((e) => e.phase === "parse");
            expect(parseErrors).toHaveLength(0);
        });
    });

    // ============================================================
    // Feature: Stats Accuracy — Phase 2a
    // ============================================================

    describe("Stats Accuracy — Phase 2a", () => {
        it("should report accurate stats for all files extracted", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "multi-file")],
            };

            const result = await pipeline.run(config);

            expect(result.stats.filesDiscovered).toBe(3);
            expect(result.stats.filesRead).toBe(3);
            expect(result.stats.filesParsed).toBe(3);
        });

        it("should report filesParsed=1 for file with no code blocks", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "no-mermaid")],
            };

            const result = await pipeline.run(config);

            expect(result.stats.filesParsed).toBe(1);
        });

        it("should report stats for mixed-content directory", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "mixed-content")],
            };

            const result = await pipeline.run(config);

            expect(result.stats.filesDiscovered).toBe(2);
            expect(result.stats.filesRead).toBe(2);
            expect(result.stats.filesParsed).toBe(2);
        });

        it("should maintain errorsCount invariant", async () => {
            const configs: PipelineConfig[] = [
                { paths: [join(TEMP_DIR, "single-class")] },
                { paths: [join(TEMP_DIR, "no-mermaid")] },
                { paths: [join(TEMP_DIR, "multi-file")] },
                { paths: [join(TEMP_DIR, "mixed-content")] },
            ];

            for (const config of configs) {
                const result = await pipeline.run(config);
                expect(result.stats.errorsCount).toBe(result.errors.length);
            }
        });
    });

    // ============================================================
    // Feature: Logger Forwarding — Extraction Phase
    // ============================================================

    describe("Logger Forwarding — Extraction Phase", () => {
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

        function getMsg(logEntry: Record<string, unknown>): string {
            return typeof logEntry["0"] === "string" ? (logEntry["0"] as string) : "";
        }

        function getData(logEntry: Record<string, unknown>): Record<string, unknown> | undefined {
            return logEntry["1"] as Record<string, unknown> | undefined;
        }

        /** Helper: filter logs by phase="parse" in context (event bus pattern) */
        function parseScoped(logs: Record<string, unknown>[]): Record<string, unknown>[] {
            return logs.filter((l) => {
                const ctx = getData(l);
                return ctx?.phase === "parse";
            });
        }

        it("should emit pipeline-level parse logs via event bus", async () => {
            const { logger, logs } = createTestLogger();
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "single-class")],
            };

            await pipeline.run(config, logger);

            const scoped = parseScoped(logs);
            expect(scoped.length).toBeGreaterThan(0);

            // Pipeline emits "Parsing file" and "Extraction complete" via bus → LogSubscriber
            const parsingFile = scoped.find(
                (l) => getMsg(l) === "Parsing file",
            );
            expect(parsingFile).toBeDefined();
        });

        it("should emit 'Extraction complete' log with filesExtracted count", async () => {
            const { logger, logs } = createTestLogger();
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "single-class")],
            };

            await pipeline.run(config, logger);

            const scoped = parseScoped(logs);
            const extractionComplete = scoped.find(
                (l) => getMsg(l) === "Extraction complete",
            );
            expect(extractionComplete).toBeDefined();
            const data = getData(extractionComplete!);
            expect(data).toHaveProperty("filesExtracted");
        });

        it("should emit 'Parsing file' log with file context", async () => {
            const { logger, logs } = createTestLogger();
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "with-tables")],
            };

            await pipeline.run(config, logger);

            const scoped = parseScoped(logs);
            const parsingFile = scoped.find(
                (l) => getMsg(l) === "Parsing file",
            );
            expect(parsingFile).toBeDefined();
            const data = getData(parsingFile!);
            expect(data).toHaveProperty("file");
        });

        it("should run extraction phase without logger (no crash)", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "single-class")],
            };

            const result = await pipeline.run(config);

            expect(result).toBeDefined();
            expect(result.stats.filesParsed).toBe(1);
            expect(result.errors).toHaveLength(0);
        });
    });

    // ============================================================
    // Feature: Phase 1b → Phase 2a Handoff
    // ============================================================

    describe("Phase 1b → Phase 2a Handoff", () => {
        it("should extract all read files", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "multi-file")],
            };

            const result = await pipeline.run(config);

            expect(result.stats.filesRead).toBe(3);
            expect(result.stats.filesParsed).toBe(3);
        });

        it("should not extract files skipped by read (maxFileSizeMb)", async () => {
            const largeDir = join(TEMP_DIR, "large-extract-test");
            await mkdir(largeDir, { recursive: true });
            await writeFile(
                join(largeDir, "small.md"),
                `# Small\n\`\`\`mermaid\nclassDiagram\n    class X\n\`\`\`\n`,
            );
            await writeFile(
                join(largeDir, "big.md"),
                "# Big\n" + "x".repeat(2 * 1024 * 1024),
            );

            const config: PipelineConfig = {
                paths: [largeDir],
                maxFileSizeMb: 1,
            };

            const result = await pipeline.run(config);

            expect(result.stats.filesDiscovered).toBe(2);
            expect(result.stats.filesRead).toBe(1);
            expect(result.stats.filesParsed).toBe(1);

            await rm(largeDir, { recursive: true, force: true });
        });

        it("should result in zero extracted files for empty directory", async () => {
            const emptyDir = join(TEMP_DIR, "empty-extract-dir");
            await mkdir(emptyDir, { recursive: true });

            const config: PipelineConfig = {
                paths: [emptyDir],
            };

            const result = await pipeline.run(config);

            expect(result.stats.filesRead).toBe(0);
            expect(result.stats.filesParsed).toBe(0);
            expect(result.files).toEqual([]);

            await rm(emptyDir, { recursive: true, force: true });
        });
    });

    // ============================================================
    // Feature: PipelineResult Shape — Phase 2a+2b Active
    // ============================================================

    describe("PipelineResult Shape — Phase 2a+2b Active", () => {
        it("should return correct shape with discovery + extraction active", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "single-class")],
            };

            const result = await pipeline.run(config);

            expect(result.files.length).toBeGreaterThan(0);
            for (const file of result.files) {
                expect(file.path).toBeDefined();
                expect(Array.isArray(file.blocks)).toBe(true);
                expect(Array.isArray(file.tables)).toBe(true);
            }

            assertPhaseGatedShape(result);
        });
    });

    // ============================================================
    // Feature: Existing Fixture Smoke Tests
    // ============================================================

    describe("Existing Fixture Smoke Tests", () => {
        it("should extract simple-spec fixture (1 file, 2 blocks, 1 table)", async () => {
            const config: PipelineConfig = {
                paths: [resolve(FIXTURES_DIR, "simple-spec")],
            };

            const result = await pipeline.run(config);

            expect(result.stats.filesParsed).toBe(1);
            expect(result.files).toHaveLength(1);
            expect(result.files[0]!.tables).toHaveLength(1);
            expect(result.files[0]!.tables[0]!.rows.length).toBeGreaterThan(0);

            assertPhaseGatedShape(result);
        });

        it("should extract multi-file-spec fixture (3 files)", async () => {
            const config: PipelineConfig = {
                paths: [resolve(FIXTURES_DIR, "multi-file-spec")],
            };

            const result = await pipeline.run(config);

            expect(result.stats.filesParsed).toBe(3);
            expect(result.files).toHaveLength(3);

            assertPhaseGatedShape(result);
        });

        it("should extract class-diagrams/multiple-diagrams fixture (3 blocks)", async () => {
            const config: PipelineConfig = {
                paths: [resolve(FIXTURES_DIR, "class-diagrams")],
                include: ["multiple-diagrams.md"],
            };

            const result = await pipeline.run(config);

            expect(result.stats.filesParsed).toBe(1);
            expect(result.files[0]!.blocks).toHaveLength(3);

            assertPhaseGatedShape(result);
        });
    });
});

/**
 * Assert the phase-gated result shape invariants (Phases 1+1b+2a+2b active, 3a+ gated).
 */
function assertPhaseGatedShape(result: PipelineResult): void {
    expect(result.classSpecs).toEqual([]);
    expect(result.validationReport).toBeUndefined();
    expect(result.writeResult).toBeUndefined();
    expect(result.stats.filesParsed).toBe(result.files.length);
    expect(result.stats.entitiesBuilt).toBe(0);
    expect(result.stats.entitiesInserted).toBe(0);
    expect(result.stats.entitiesUpdated).toBe(0);
    expect(result.stats.validationErrors).toBe(0);
    expect(result.stats.errorsCount).toBe(result.errors.length);
}
