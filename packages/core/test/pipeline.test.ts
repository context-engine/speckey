import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ParsePipeline } from "../src/pipeline";
import type { PipelineConfig } from "../src/types";
import { DiscoveryErrors } from "@speckey/errors";

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
});
