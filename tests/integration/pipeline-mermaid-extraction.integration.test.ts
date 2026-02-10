import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Logger, type AppLogObj } from "@speckey/logger";
import { ParsePipeline } from "../../packages/core/src";
import type { PipelineConfig, PipelineResult } from "../../packages/core/src/types";
import { DiagramType } from "../../packages/parser/src/mermaid-extraction/types";

/**
 * Pipeline ↔ MermaidExtraction Integration Tests
 *
 * Scope: Boundary contract between ParsePipeline (Phase 2) and
 * MarkdownParser + DiagramRouter.
 * Tests content forwarding, error severity filtering, ParsedFile
 * construction, diagram type routing, table pass-through, stats
 * accuracy, logger forwarding, and error mapping.
 *
 * Does NOT test: MarkdownParser internals, DiagramRouter internals,
 * FileDiscovery, CLI, or Phases 3a-5.
 */

const FIXTURES_DIR = resolve(import.meta.dir, "../fixtures");
const TEMP_DIR = resolve(import.meta.dir, "../temp-pipeline-mermaid-extraction");

describe("Pipeline ↔ MermaidExtraction Integration", () => {
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

        // multi-block: 1 .md file with 3 mermaid blocks (classDiagram, sequenceDiagram, erDiagram)
        const multiBlock = join(TEMP_DIR, "multi-block");
        await mkdir(multiBlock, { recursive: true });
        await writeFile(
            join(multiBlock, "spec.md"),
            `# Multi Block

\`\`\`mermaid
classDiagram
    class Alpha {
        +string name
    }
\`\`\`

Some text.

\`\`\`mermaid
sequenceDiagram
    Client->>Server: Request
    Server-->>Client: Response
\`\`\`

More text.

\`\`\`mermaid
erDiagram
    USER ||--o{ ORDER : places
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

        // empty-mermaid-block: 1 .md file with empty ```mermaid``` block
        const emptyBlock = join(TEMP_DIR, "empty-mermaid-block");
        await mkdir(emptyBlock, { recursive: true });
        await writeFile(
            join(emptyBlock, "spec.md"),
            `# Empty Block

\`\`\`mermaid
\`\`\`

Some text after.
`,
        );

        // mixed-valid-and-empty: some files with mermaid, some without
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

        // flowchart-file: .md file with flowchart
        const flowchartDir = join(TEMP_DIR, "flowchart-file");
        await mkdir(flowchartDir, { recursive: true });
        await writeFile(
            join(flowchartDir, "spec.md"),
            `# Flowchart

\`\`\`mermaid
flowchart TD
    A --> B
    B --> C
\`\`\`
`,
        );
    });

    afterAll(async () => {
        await rm(TEMP_DIR, { recursive: true, force: true });
    });

    // ============================================================
    // Feature: Content Forwarding — File Content to Parser
    // ============================================================

    describe("Content Forwarding — File Content to Parser", () => {
        it("should parse single file with mermaid blocks", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "single-class")],
            };

            const result = await pipeline.run(config);

            expect(result.stats.filesParsed).toBe(1);
            expect(result.stats.blocksExtracted).toBeGreaterThanOrEqual(1);
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

            // Each file has unique path
            const paths = result.files.map((f) => f.path);
            const uniquePaths = new Set(paths);
            expect(uniquePaths.size).toBe(3);
        });

        it("should parse file with no mermaid blocks (warning, not error)", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "no-mermaid")],
            };

            const result = await pipeline.run(config);

            // File is still parsed (WARNING doesn't skip)
            expect(result.stats.filesParsed).toBe(1);
            expect(result.stats.blocksExtracted).toBe(0);
            expect(result.files).toHaveLength(1);
            expect(result.files[0]!.blocks).toEqual([]);
            // No phase="parse" errors (warnings are not forwarded)
            const parseErrors = result.errors.filter((e) => e.phase === "parse");
            expect(parseErrors).toHaveLength(0);
        });

        it("should parse file with non-mermaid code blocks only", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "non-mermaid-code")],
            };

            const result = await pipeline.run(config);

            expect(result.stats.filesParsed).toBe(1);
            expect(result.stats.blocksExtracted).toBe(0);
            expect(result.files).toHaveLength(1);
            expect(result.files[0]!.blocks).toEqual([]);
            const parseErrors = result.errors.filter((e) => e.phase === "parse");
            expect(parseErrors).toHaveLength(0);
        });
    });

    // ============================================================
    // Feature: Diagram Type Routing
    // ============================================================

    describe("Diagram Type Routing", () => {
        it("should detect classDiagram and set isSupported=true", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "single-class")],
            };

            const result = await pipeline.run(config);

            expect(result.files[0]!.blocks).toHaveLength(1);
            const block = result.files[0]!.blocks[0]!;
            expect(block.diagramType).toBe(DiagramType.CLASS_DIAGRAM);
            expect(block.isSupported).toBe(true);
            expect(block.block.language).toBe("mermaid");
        });

        it("should detect multiple diagram types in one file", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "multi-block")],
            };

            const result = await pipeline.run(config);

            const blocks = result.files[0]!.blocks;
            expect(blocks).toHaveLength(3);
            expect(result.stats.blocksExtracted).toBe(3);

            const types = blocks.map((b) => b.diagramType);
            expect(types).toContain(DiagramType.CLASS_DIAGRAM);
            expect(types).toContain(DiagramType.SEQUENCE_DIAGRAM);
            expect(types).toContain(DiagramType.ER_DIAGRAM);
        });

        it("should detect mixed diagram types across multiple files", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "multi-file")],
            };

            const result = await pipeline.run(config);

            expect(result.stats.filesParsed).toBe(3);
            expect(result.stats.blocksExtracted).toBe(3);

            const allTypes = result.files.flatMap((f) => f.blocks.map((b) => b.diagramType));
            expect(allTypes).toContain(DiagramType.CLASS_DIAGRAM);
            expect(allTypes).toContain(DiagramType.SEQUENCE_DIAGRAM);
            expect(allTypes).toContain(DiagramType.ER_DIAGRAM);
        });

        it("should detect flowchart diagram type", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "flowchart-file")],
            };

            const result = await pipeline.run(config);

            expect(result.files[0]!.blocks).toHaveLength(1);
            expect(result.files[0]!.blocks[0]!.diagramType).toBe(DiagramType.FLOWCHART);
            expect(result.files[0]!.blocks[0]!.isSupported).toBe(true);
        });

        it("should route empty mermaid block as UNKNOWN with isSupported=false", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "empty-mermaid-block")],
            };

            const result = await pipeline.run(config);

            expect(result.files[0]!.blocks).toHaveLength(1);
            const block = result.files[0]!.blocks[0]!;
            expect(block.diagramType).toBe(DiagramType.UNKNOWN);
            expect(block.isSupported).toBe(false);
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

            // with-tables fixture has 2 tables
            expect(result.files[0]!.tables).toHaveLength(2);
        });
    });

    // ============================================================
    // Feature: Line Number Tracking
    // ============================================================

    describe("Line Number Tracking", () => {
        it("should provide 1-indexed line numbers for blocks", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "single-class")],
            };

            const result = await pipeline.run(config);

            const block = result.files[0]!.blocks[0]!.block;
            expect(block.startLine).toBeGreaterThan(0);
            expect(block.endLine).toBeGreaterThan(block.startLine);
        });

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

        it("should have distinct line ranges for multiple blocks", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "multi-block")],
            };

            const result = await pipeline.run(config);

            const blocks = result.files[0]!.blocks;
            expect(blocks.length).toBeGreaterThanOrEqual(2);

            // Each block's end line should be before next block's start line
            for (let i = 0; i < blocks.length - 1; i++) {
                expect(blocks[i]!.block.endLine).toBeLessThan(blocks[i + 1]!.block.startLine);
            }
        });
    });

    // ============================================================
    // Feature: Error Severity Filtering
    // ============================================================

    describe("Error Severity Filtering", () => {
        it("should not skip file on WARNING (no-mermaid case)", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "no-mermaid")],
            };

            const result = await pipeline.run(config);

            // WARNING doesn't skip — file is still in result.files
            expect(result.stats.filesParsed).toBe(1);
            expect(result.files).toHaveLength(1);
            // No parse phase errors
            const parseErrors = result.errors.filter((e) => e.phase === "parse");
            expect(parseErrors).toHaveLength(0);
        });

        it("should handle mix of files with and without mermaid blocks", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "mixed-content")],
            };

            const result = await pipeline.run(config);

            // Both files parsed (warning for no-mermaid doesn't skip)
            expect(result.stats.filesParsed).toBe(2);
            expect(result.stats.filesRead).toBe(2);
            expect(result.files).toHaveLength(2);

            // One file has blocks, one doesn't
            const withBlocks = result.files.filter((f) => f.blocks.length > 0);
            const withoutBlocks = result.files.filter((f) => f.blocks.length === 0);
            expect(withBlocks).toHaveLength(1);
            expect(withoutBlocks).toHaveLength(1);

            // No parse errors
            const parseErrors = result.errors.filter((e) => e.phase === "parse");
            expect(parseErrors).toHaveLength(0);
        });
    });

    // ============================================================
    // Feature: Stats Accuracy — Phase 2
    // ============================================================

    describe("Stats Accuracy — Phase 2", () => {
        it("should report accurate stats for all files with mermaid blocks", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "multi-file")],
            };

            const result = await pipeline.run(config);

            expect(result.stats.filesDiscovered).toBe(3);
            expect(result.stats.filesRead).toBe(3);
            expect(result.stats.filesParsed).toBe(3);
            expect(result.stats.blocksExtracted).toBe(3);
            expect(result.stats.errorsCount).toBe(0);
        });

        it("should count multiple blocks from one file", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "multi-block")],
            };

            const result = await pipeline.run(config);

            expect(result.stats.filesParsed).toBe(1);
            expect(result.stats.blocksExtracted).toBe(3);
        });

        it("should report zero blocks for no-mermaid file", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "no-mermaid")],
            };

            const result = await pipeline.run(config);

            expect(result.stats.filesParsed).toBe(1);
            expect(result.stats.blocksExtracted).toBe(0);
        });

        it("should count empty/unknown blocks in blocksExtracted", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "empty-mermaid-block")],
            };

            const result = await pipeline.run(config);

            // Empty blocks ARE routed (as UNKNOWN) and counted in blocksExtracted
            expect(result.stats.blocksExtracted).toBe(1);
        });

        it("should maintain errorsCount invariant with parse results", async () => {
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

        it("should report stats for mixed-content directory", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "mixed-content")],
            };

            const result = await pipeline.run(config);

            expect(result.stats.filesDiscovered).toBe(2);
            expect(result.stats.filesRead).toBe(2);
            expect(result.stats.filesParsed).toBe(2);
            // Only the mermaid file contributes blocks
            expect(result.stats.blocksExtracted).toBe(1);
        });
    });

    // ============================================================
    // Feature: Logger Forwarding — Parse Phase
    // ============================================================

    describe("Logger Forwarding — Parse Phase", () => {
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

        function parseScoped(logs: Record<string, unknown>[]): Record<string, unknown>[] {
            return logs.filter((l) => {
                const meta = l["_meta"] as { name?: string } | undefined;
                return meta?.name?.includes("parse");
            });
        }

        it("should create parse child logger and forward to MarkdownParser", async () => {
            const { logger, logs } = createTestLogger();
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "single-class")],
            };

            await pipeline.run(config, logger);

            const scoped = parseScoped(logs);
            expect(scoped.length).toBeGreaterThan(0);

            // Parser-originated logs prove the logger was forwarded
            const extractedBlocks = scoped.find(
                (l) => getMsg(l) === "Extracted code blocks",
            );
            expect(extractedBlocks).toBeDefined();
        });

        it("should emit pipeline-level parse boundary logs", async () => {
            const { logger, logs } = createTestLogger();
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "single-class")],
            };

            await pipeline.run(config, logger);

            const scoped = parseScoped(logs);

            // Pipeline boundary messages
            const parsingFile = scoped.find((l) => getMsg(l) === "Parsing file");
            const parseComplete = scoped.find((l) => getMsg(l) === "Parse complete");
            expect(parsingFile).toBeDefined();
            expect(parseComplete).toBeDefined();

            // Parse complete should include stats
            const completeData = getData(parseComplete!);
            expect(completeData).toHaveProperty("filesParsed");
            expect(completeData).toHaveProperty("blocksExtracted");
        });

        it("should emit parser-originated logs with extraction details", async () => {
            const { logger, logs } = createTestLogger();
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "single-class")],
            };

            await pipeline.run(config, logger);

            const scoped = parseScoped(logs);

            // MarkdownParser "Extracted code blocks"
            const extractedBlocks = scoped.find(
                (l) => getMsg(l) === "Extracted code blocks",
            );
            expect(extractedBlocks).toBeDefined();
            const blocksData = getData(extractedBlocks!);
            expect(blocksData).toHaveProperty("mermaid");
            expect(blocksData).toHaveProperty("total");
            expect(blocksData).toHaveProperty("file");

            // MarkdownParser "Extracted tables"
            const extractedTables = scoped.find(
                (l) => getMsg(l) === "Extracted tables",
            );
            expect(extractedTables).toBeDefined();
            const tablesData = getData(extractedTables!);
            expect(tablesData).toHaveProperty("count");
            expect(tablesData).toHaveProperty("file");
        });

        it("should emit warning logs for no-mermaid files", async () => {
            const { logger, logs } = createTestLogger();
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "no-mermaid")],
            };

            await pipeline.run(config, logger);

            const scoped = parseScoped(logs);

            // Parser should emit warning about no mermaid diagrams
            const noMermaidWarning = scoped.find(
                (l) => getMsg(l) === "No mermaid diagrams found in file",
            );
            expect(noMermaidWarning).toBeDefined();
        });

        it("should emit warning for non-mermaid code blocks only", async () => {
            const { logger, logs } = createTestLogger();
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "non-mermaid-code")],
            };

            await pipeline.run(config, logger);

            const scoped = parseScoped(logs);

            // Parser should emit warning about code blocks but no mermaid
            const warning = scoped.find(
                (l) => getMsg(l) === "File has code blocks but none are mermaid",
            );
            expect(warning).toBeDefined();
        });

        it("should emit warning for empty mermaid blocks", async () => {
            const { logger, logs } = createTestLogger();
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "empty-mermaid-block")],
            };

            await pipeline.run(config, logger);

            const scoped = parseScoped(logs);

            // Parser should emit warning about empty mermaid block
            const emptyWarning = scoped.find(
                (l) => getMsg(l).startsWith("Empty mermaid block at line"),
            );
            expect(emptyWarning).toBeDefined();
        });

        it("should run parse phase without logger (no crash)", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "single-class")],
            };

            const result = await pipeline.run(config);

            expect(result).toBeDefined();
            expect(result.stats.filesParsed).toBe(1);
            expect(result.stats.blocksExtracted).toBeGreaterThanOrEqual(1);
            expect(result.errors).toHaveLength(0);
        });
    });

    // ============================================================
    // Feature: PipelineResult Shape — Phase 2 Active
    // ============================================================

    describe("PipelineResult Shape — Phase 2 Active", () => {
        it("should return correct shape with discovery + parse active", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "multi-block")],
            };

            const result = await pipeline.run(config);

            // Phase 2 active: files has entries
            expect(result.files.length).toBeGreaterThan(0);
            for (const file of result.files) {
                expect(file.path).toBeDefined();
                expect(Array.isArray(file.blocks)).toBe(true);
                expect(Array.isArray(file.tables)).toBe(true);
            }

            // Phase 3a+ gated
            expect(result.classSpecs).toEqual([]);
            expect(result.validationReport).toBeUndefined();
            expect(result.writeResult).toBeUndefined();

            // Only valid phase errors
            for (const err of result.errors) {
                expect(["discovery", "read", "parse"]).toContain(err.phase);
            }

            // Stats accuracy
            expect(result.stats.filesParsed).toBe(result.files.length);
            assertPhaseGatedShape(result);
        });

        it("should preserve empty mermaid block in routedBlocks", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "empty-mermaid-block")],
            };

            const result = await pipeline.run(config);

            expect(result.files[0]!.blocks).toHaveLength(1);
            const block = result.files[0]!.blocks[0]!;
            expect(block.diagramType).toBe(DiagramType.UNKNOWN);
            expect(block.block.content.trim()).toBe("");
        });
    });

    // ============================================================
    // Feature: Phase 1b → Phase 2 Handoff
    // ============================================================

    describe("Phase 1b → Phase 2 Handoff", () => {
        it("should parse all read files", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "multi-file")],
            };

            const result = await pipeline.run(config);

            expect(result.stats.filesRead).toBe(3);
            expect(result.stats.filesParsed).toBe(3);
        });

        it("should not parse files skipped by read (maxFileSizeMb)", async () => {
            // Create a large file to trigger size-based skip
            const largeDir = join(TEMP_DIR, "large-parse-test");
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

            // Cleanup
            await rm(largeDir, { recursive: true, force: true });
        });

        it("should result in zero parsed files for empty directory", async () => {
            const emptyDir = join(TEMP_DIR, "empty-parse-dir");
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
    // Feature: Existing Fixture Smoke Tests
    // ============================================================

    describe("Existing Fixture Smoke Tests", () => {
        it("should parse simple-spec fixture (2 mermaid blocks + 1 table)", async () => {
            const config: PipelineConfig = {
                paths: [resolve(FIXTURES_DIR, "simple-spec")],
            };

            const result = await pipeline.run(config);

            expect(result.stats.filesParsed).toBe(1);
            expect(result.stats.blocksExtracted).toBe(2);
            expect(result.files).toHaveLength(1);

            const file = result.files[0]!;
            // classDiagram + sequenceDiagram
            const types = file.blocks.map((b) => b.diagramType);
            expect(types).toContain(DiagramType.CLASS_DIAGRAM);
            expect(types).toContain(DiagramType.SEQUENCE_DIAGRAM);

            // 1 table
            expect(file.tables).toHaveLength(1);
            expect(file.tables[0]!.rows.length).toBeGreaterThan(0);

            assertPhaseGatedShape(result);
        });

        it("should parse multi-file-spec fixture (3 files, 1 block each)", async () => {
            const config: PipelineConfig = {
                paths: [resolve(FIXTURES_DIR, "multi-file-spec")],
            };

            const result = await pipeline.run(config);

            expect(result.stats.filesParsed).toBe(3);
            expect(result.stats.blocksExtracted).toBe(3);
            expect(result.files).toHaveLength(3);

            // Mixed diagram types
            const allTypes = result.files.flatMap((f) => f.blocks.map((b) => b.diagramType));
            expect(allTypes).toContain(DiagramType.FLOWCHART);
            expect(allTypes).toContain(DiagramType.ER_DIAGRAM);
            expect(allTypes).toContain(DiagramType.STATE_DIAGRAM);

            assertPhaseGatedShape(result);
        });

        it("should parse class-diagrams/multiple-diagrams fixture (3 class blocks)", async () => {
            const config: PipelineConfig = {
                paths: [resolve(FIXTURES_DIR, "class-diagrams")],
                include: ["multiple-diagrams.md"],
            };

            const result = await pipeline.run(config);

            expect(result.stats.filesParsed).toBe(1);
            expect(result.stats.blocksExtracted).toBe(3);

            const blocks = result.files[0]!.blocks;
            for (const block of blocks) {
                expect(block.diagramType).toBe(DiagramType.CLASS_DIAGRAM);
            }

            assertPhaseGatedShape(result);
        });
    });
});

/**
 * Assert the phase-gated result shape invariants (Phases 1+1b+2 active, 3a+ gated).
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
