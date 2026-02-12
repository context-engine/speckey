import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Logger, type AppLogObj } from "@speckey/logger";
import { ParsePipeline } from "../../packages/core/src";
import type { PipelineConfig, PipelineResult } from "../../packages/core/src/types";
import { DiagramType } from "../../packages/parser/src/mermaid-validation/types";

/**
 * Pipeline ↔ MermaidValidation Integration Tests
 *
 * Scope: Boundary contract between ParsePipeline (Phase 2b) and
 * MermaidValidator + ValidationDiagramRouter — mermaid syntax validation,
 * diagram type detection, block rejection/acceptance, routing, ParsedFile
 * construction, stats accuracy, error mapping.
 *
 * Does NOT test: MermaidValidator internals, DiagramRouter internals,
 * MarkdownParser, CLI, FileDiscovery, or Phases 3a-5.
 */

const FIXTURES_DIR = resolve(import.meta.dir, "../fixtures");
const TEMP_DIR = resolve(import.meta.dir, "../temp-pipeline-mermaid-validation");

describe("Pipeline ↔ MermaidValidation Integration", () => {
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

        // mixed-content: some files with mermaid, some without
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

        // --- NEW: Invalid mermaid fixtures ---

        // invalid-mermaid: 1 .md file with invalid mermaid syntax
        const invalidMermaid = join(TEMP_DIR, "invalid-mermaid");
        await mkdir(invalidMermaid, { recursive: true });
        await writeFile(
            join(invalidMermaid, "spec.md"),
            `# Invalid Mermaid

\`\`\`mermaid
classDiagram
    class Broken {
        this is not valid mermaid %%%
\`\`\`
`,
        );

        // mixed-valid-invalid: 1 valid classDiagram + 1 invalid block
        const mixedValidInvalid = join(TEMP_DIR, "mixed-valid-invalid");
        await mkdir(mixedValidInvalid, { recursive: true });
        await writeFile(
            join(mixedValidInvalid, "spec.md"),
            `# Mixed Valid Invalid

\`\`\`mermaid
classDiagram
    class Good {
        +id: string
    }
\`\`\`

\`\`\`mermaid
classDiagram
    class Bad {
        this is not valid mermaid %%%
\`\`\`
`,
        );

        // all-invalid-mermaid: 2 invalid mermaid blocks
        const allInvalid = join(TEMP_DIR, "all-invalid-mermaid");
        await mkdir(allInvalid, { recursive: true });
        await writeFile(
            join(allInvalid, "spec.md"),
            `# All Invalid

\`\`\`mermaid
classDiagram
    class Bad1 {
        this is not valid %%%
\`\`\`

\`\`\`mermaid
classDiagram
    class Bad2 {
        also not valid %%%
\`\`\`
`,
        );

        // multi-file-mixed-validity: 2 files — one valid, one invalid
        const multiFileMixed = join(TEMP_DIR, "multi-file-mixed-validity");
        await mkdir(multiFileMixed, { recursive: true });
        await writeFile(
            join(multiFileMixed, "valid.md"),
            `# Valid
\`\`\`mermaid
classDiagram
    class Good {
        +id: string
    }
\`\`\`
`,
        );
        await writeFile(
            join(multiFileMixed, "invalid.md"),
            `# Invalid
\`\`\`mermaid
classDiagram
    class Bad {
        this is not valid mermaid %%%
\`\`\`
`,
        );

        // multiple-empty-blocks: 2 empty mermaid blocks in one file
        const multipleEmpty = join(TEMP_DIR, "multiple-empty-blocks");
        await mkdir(multipleEmpty, { recursive: true });
        await writeFile(
            join(multipleEmpty, "spec.md"),
            `# Multiple Empty

\`\`\`mermaid
\`\`\`

\`\`\`mermaid
\`\`\`
`,
        );

        // valid-with-empty: 1 valid block + 1 empty block in same file
        const validWithEmpty = join(TEMP_DIR, "valid-with-empty");
        await mkdir(validWithEmpty, { recursive: true });
        await writeFile(
            join(validWithEmpty, "spec.md"),
            `# Valid With Empty

\`\`\`mermaid
classDiagram
    class Widget {
        +id: string
    }
\`\`\`

\`\`\`mermaid
\`\`\`
`,
        );
    });

    afterAll(async () => {
        await rm(TEMP_DIR, { recursive: true, force: true });
    });

    // ============================================================
    // Feature: Diagram Type Routing
    // ============================================================

    describe("Diagram Type Routing", () => {
        it("should detect classDiagram type", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "single-class")],
            };

            const result = await pipeline.run(config);

            expect(result.files[0]!.blocks).toHaveLength(1);
            const block = result.files[0]!.blocks[0]!;
            expect(block.diagramType).toBe(DiagramType.CLASS_DIAGRAM);
            expect(block.content).toContain("classDiagram");
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
        });

        it("should exclude empty mermaid blocks from validated results", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "empty-mermaid-block")],
            };

            const result = await pipeline.run(config);

            expect(result.files[0]!.blocks).toHaveLength(0);
        });
    });

    // ============================================================
    // Feature: Mermaid Syntax Validation Errors
    // ============================================================

    describe("Mermaid Syntax Validation Errors", () => {
        it("should produce PipelineError for invalid mermaid syntax", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "invalid-mermaid")],
            };

            const result = await pipeline.run(config);

            const parseErrors = result.errors.filter((e) => e.phase === "parse");
            expect(parseErrors.length).toBeGreaterThanOrEqual(1);
            expect(parseErrors[0]!.path).toContain("invalid-mermaid");
            expect(parseErrors[0]!.message).toBeDefined();
        });

        it("should reject invalid mermaid block from ParsedFile.blocks", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "invalid-mermaid")],
            };

            const result = await pipeline.run(config);

            expect(result.files[0]!.blocks).toHaveLength(0);
            expect(result.stats.blocksExtracted).toBe(0);
        });

        it("should keep valid blocks and reject invalid in same file", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "mixed-valid-invalid")],
            };

            const result = await pipeline.run(config);

            expect(result.files[0]!.blocks).toHaveLength(1);
            expect(result.files[0]!.blocks[0]!.diagramType).toBe(DiagramType.CLASS_DIAGRAM);
            expect(result.stats.blocksExtracted).toBe(1);

            const parseErrors = result.errors.filter((e) => e.phase === "parse");
            expect(parseErrors.length).toBeGreaterThanOrEqual(1);
        });

        it("should reject all blocks when all are invalid", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "all-invalid-mermaid")],
            };

            const result = await pipeline.run(config);

            expect(result.files[0]!.blocks).toHaveLength(0);
            expect(result.stats.blocksExtracted).toBe(0);

            const parseErrors = result.errors.filter((e) => e.phase === "parse");
            expect(parseErrors.length).toBeGreaterThanOrEqual(2);
        });

        it("should isolate invalid file from valid file", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "multi-file-mixed-validity")],
            };

            const result = await pipeline.run(config);

            // Both files are parsed (validation errors don't skip the file)
            expect(result.stats.filesParsed).toBe(2);

            // One file has valid blocks, one doesn't
            const withBlocks = result.files.filter((f) => f.blocks.length > 0);
            const withoutBlocks = result.files.filter((f) => f.blocks.length === 0);
            expect(withBlocks).toHaveLength(1);
            expect(withoutBlocks).toHaveLength(1);

            // Only valid blocks counted
            expect(result.stats.blocksExtracted).toBe(1);

            // Parse errors present for invalid file
            const parseErrors = result.errors.filter((e) => e.phase === "parse");
            expect(parseErrors.length).toBeGreaterThanOrEqual(1);
        });
    });

    // ============================================================
    // Feature: Empty/Invalid Block Rejection
    // ============================================================

    describe("Empty/Invalid Block Rejection", () => {
        it("should reject empty mermaid block with no pipeline error", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "empty-mermaid-block")],
            };

            const result = await pipeline.run(config);

            expect(result.files[0]!.blocks).toHaveLength(0);
            expect(result.stats.blocksExtracted).toBe(0);
            // Empty blocks produce WARNING, not ERROR — no PipelineError
            const parseErrors = result.errors.filter((e) => e.phase === "parse");
            expect(parseErrors).toHaveLength(0);
        });

        it("should not affect valid blocks when empty block present in same file", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "valid-with-empty")],
            };

            const result = await pipeline.run(config);

            expect(result.files[0]!.blocks).toHaveLength(1);
            expect(result.files[0]!.blocks[0]!.diagramType).toBe(DiagramType.CLASS_DIAGRAM);
            expect(result.stats.blocksExtracted).toBe(1);
        });

        it("should reject multiple empty blocks all without pipeline errors", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "multiple-empty-blocks")],
            };

            const result = await pipeline.run(config);

            expect(result.files[0]!.blocks).toHaveLength(0);
            expect(result.stats.blocksExtracted).toBe(0);
            const parseErrors = result.errors.filter((e) => e.phase === "parse");
            expect(parseErrors).toHaveLength(0);
        });
    });

    // ============================================================
    // Feature: Line Number Tracking — Validated Blocks
    // ============================================================

    describe("Line Number Tracking — Validated Blocks", () => {
        it("should provide 1-indexed line numbers for validated blocks", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "single-class")],
            };

            const result = await pipeline.run(config);

            const block = result.files[0]!.blocks[0]!;
            expect(block.startLine).toBeGreaterThan(0);
            expect(block.endLine).toBeGreaterThan(block.startLine);
        });

        it("should have distinct line ranges for multiple validated blocks", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "multi-block")],
            };

            const result = await pipeline.run(config);

            const blocks = result.files[0]!.blocks;
            expect(blocks.length).toBeGreaterThanOrEqual(2);

            for (let i = 0; i < blocks.length - 1; i++) {
                expect(blocks[i]!.endLine).toBeLessThan(blocks[i + 1]!.startLine);
            }
        });
    });

    // ============================================================
    // Feature: Error Mapping — Validation Phase
    // ============================================================

    describe("Error Mapping — Validation Phase", () => {
        it("should map validation error with phase='parse' and line-based code", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "invalid-mermaid")],
            };

            const result = await pipeline.run(config);

            const parseErrors = result.errors.filter((e) => e.phase === "parse");
            expect(parseErrors.length).toBeGreaterThanOrEqual(1);

            const err = parseErrors[0]!;
            expect(err.phase).toBe("parse");
            expect(err.path).toContain("invalid-mermaid");
            expect(err.message).toBeDefined();
            expect(err.code).toMatch(/^LINE_\d+$/);
            expect(err.userMessage).toEqual([err.message]);
        });

        it("should map multiple validation errors from one file", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "all-invalid-mermaid")],
            };

            const result = await pipeline.run(config);

            const parseErrors = result.errors.filter((e) => e.phase === "parse");
            expect(parseErrors.length).toBeGreaterThanOrEqual(2);

            for (const err of parseErrors) {
                expect(err.phase).toBe("parse");
                expect(err.code).toMatch(/^LINE_\d+$/);
            }
        });

        it("should preserve file path in validation errors across files", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "multi-file-mixed-validity")],
            };

            const result = await pipeline.run(config);

            const parseErrors = result.errors.filter((e) => e.phase === "parse");
            expect(parseErrors.length).toBeGreaterThanOrEqual(1);

            // Error path should point to the invalid file
            for (const err of parseErrors) {
                expect(err.path).toContain("invalid.md");
            }

            // Valid file should have no errors
            const validFileErrors = result.errors.filter(
                (e) => e.phase === "parse" && e.path.includes("valid.md") && !e.path.includes("invalid.md"),
            );
            expect(validFileErrors).toHaveLength(0);
        });
    });

    // ============================================================
    // Feature: Stats Accuracy — Phase 2b
    // ============================================================

    describe("Stats Accuracy — Phase 2b", () => {
        it("should report accurate blocksExtracted for all files with mermaid", async () => {
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

        it("should not count empty/rejected blocks in blocksExtracted", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "empty-mermaid-block")],
            };

            const result = await pipeline.run(config);

            expect(result.stats.blocksExtracted).toBe(0);
        });

        it("should maintain errorsCount invariant with validation errors", async () => {
            const configs: PipelineConfig[] = [
                { paths: [join(TEMP_DIR, "single-class")] },
                { paths: [join(TEMP_DIR, "no-mermaid")] },
                { paths: [join(TEMP_DIR, "multi-file")] },
                { paths: [join(TEMP_DIR, "mixed-content")] },
                { paths: [join(TEMP_DIR, "invalid-mermaid")] },
                { paths: [join(TEMP_DIR, "mixed-valid-invalid")] },
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
            expect(result.stats.blocksExtracted).toBe(1);
        });
    });

    // ============================================================
    // Feature: Mermaid Presence Warnings
    // ============================================================

    describe("Mermaid Presence Warnings", () => {
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

        function parseScoped(logs: Record<string, unknown>[]): Record<string, unknown>[] {
            return logs.filter((l) => {
                const meta = l["_meta"] as { name?: string } | undefined;
                return meta?.name?.includes("parse");
            });
        }

        it("should emit warning for no-mermaid files", async () => {
            const { logger, logs } = createTestLogger();
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "no-mermaid")],
            };

            await pipeline.run(config, logger);

            const scoped = parseScoped(logs);
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
            const emptyWarning = scoped.find(
                (l) => getMsg(l).startsWith("Empty mermaid block at line"),
            );
            expect(emptyWarning).toBeDefined();
        });
    });

    // ============================================================
    // Feature: Logger Forwarding — Validation Phase
    // ============================================================

    describe("Logger Forwarding — Validation Phase", () => {
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

        it("should emit 'Parse complete' boundary log with stats", async () => {
            const { logger, logs } = createTestLogger();
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "single-class")],
            };

            await pipeline.run(config, logger);

            const scoped = parseScoped(logs);
            const parseComplete = scoped.find((l) => getMsg(l) === "Parse complete");
            expect(parseComplete).toBeDefined();

            const data = getData(parseComplete!);
            expect(data).toHaveProperty("filesParsed");
            expect(data).toHaveProperty("blocksExtracted");
        });

        it("should emit 'Parsing file' boundary log", async () => {
            const { logger, logs } = createTestLogger();
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "single-class")],
            };

            await pipeline.run(config, logger);

            const scoped = parseScoped(logs);
            const parsingFile = scoped.find((l) => getMsg(l) === "Parsing file");
            expect(parsingFile).toBeDefined();
        });

        it("should emit validator logs for successful validation", async () => {
            const { logger, logs } = createTestLogger();
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "single-class")],
            };

            await pipeline.run(config, logger);

            const scoped = parseScoped(logs);
            // Validator should log something through the parse logger
            expect(scoped.length).toBeGreaterThan(0);
        });

        it("should emit error-level logs for invalid mermaid", async () => {
            const { logger, logs } = createTestLogger();
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "invalid-mermaid")],
            };

            await pipeline.run(config, logger);

            const scoped = parseScoped(logs);
            // Should have error-level entries for syntax failures
            const errorLogs = scoped.filter((l) => {
                const level = l["_meta"] as { logLevelId?: number } | undefined;
                // error level is typically 0 in tslog
                return level?.logLevelId !== undefined && level.logLevelId <= 3;
            });
            expect(errorLogs.length).toBeGreaterThan(0);
        });

        it("should run validation phase without logger (no crash)", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "single-class")],
            };

            const result = await pipeline.run(config);

            expect(result).toBeDefined();
            expect(result.stats.blocksExtracted).toBeGreaterThanOrEqual(1);
        });
    });

    // ============================================================
    // Feature: ParsedFile Construction
    // ============================================================

    describe("ParsedFile Construction", () => {
        it("should correctly assemble ParsedFile from validated blocks and tables", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "with-tables")],
            };

            const result = await pipeline.run(config);

            const file = result.files[0]!;
            expect(file.path).toContain("with-tables");
            expect(file.blocks.length).toBeGreaterThanOrEqual(1);
            expect(file.blocks[0]!.diagramType).toBe(DiagramType.CLASS_DIAGRAM);
            expect(file.tables.length).toBeGreaterThanOrEqual(1);
        });

        it("should return correct phase-gated shape", async () => {
            const config: PipelineConfig = {
                paths: [join(TEMP_DIR, "multi-block")],
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
        it("should validate simple-spec fixture (2 mermaid blocks)", async () => {
            const config: PipelineConfig = {
                paths: [resolve(FIXTURES_DIR, "simple-spec")],
            };

            const result = await pipeline.run(config);

            expect(result.stats.filesParsed).toBe(1);
            expect(result.stats.blocksExtracted).toBe(2);
            expect(result.files).toHaveLength(1);

            const types = result.files[0]!.blocks.map((b) => b.diagramType);
            expect(types).toContain(DiagramType.CLASS_DIAGRAM);
            expect(types).toContain(DiagramType.SEQUENCE_DIAGRAM);

            assertPhaseGatedShape(result);
        });

        it("should validate multi-file-spec fixture (3 files, mixed types)", async () => {
            const config: PipelineConfig = {
                paths: [resolve(FIXTURES_DIR, "multi-file-spec")],
            };

            const result = await pipeline.run(config);

            expect(result.stats.filesParsed).toBe(3);
            expect(result.stats.blocksExtracted).toBe(3);
            expect(result.files).toHaveLength(3);

            const allTypes = result.files.flatMap((f) => f.blocks.map((b) => b.diagramType));
            expect(allTypes).toContain(DiagramType.FLOWCHART);
            expect(allTypes).toContain(DiagramType.ER_DIAGRAM);
            expect(allTypes).toContain(DiagramType.STATE_DIAGRAM);

            assertPhaseGatedShape(result);
        });

        it("should validate class-diagrams/multiple-diagrams fixture (3 class blocks)", async () => {
            const config: PipelineConfig = {
                paths: [resolve(FIXTURES_DIR, "class-diagrams")],
                include: ["multiple-diagrams.md"],
            };

            const result = await pipeline.run(config);

            expect(result.stats.filesParsed).toBe(1);
            expect(result.stats.blocksExtracted).toBe(3);

            for (const block of result.files[0]!.blocks) {
                expect(block.diagramType).toBe(DiagramType.CLASS_DIAGRAM);
            }

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
