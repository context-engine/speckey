import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { ParsePipeline, type PipelineConfig } from "../../packages/core/src";

const FIXTURES_DIR = resolve(import.meta.dir, "../fixtures");

describe("Pipeline Integration", () => {
    const pipeline = new ParsePipeline();

    // ============================================================
    // Feature: Package Integration (io → parser)
    // ============================================================

    describe("Package Integration (io → parser)", () => {
        it("should discover and parse single file", async () => {
            const config: PipelineConfig = {
                paths: [resolve(FIXTURES_DIR, "simple-spec")],
            };

            const result = await pipeline.run(config);

            // File should be discovered
            expect(result.stats.filesDiscovered).toBe(1);
            // File should be read
            expect(result.stats.filesRead).toBe(1);
            // File should be parsed
            expect(result.stats.filesParsed).toBe(1);
            // Blocks should be extracted (2 mermaid blocks)
            expect(result.stats.blocksExtracted).toBe(2);
            // Result should contain parsed file
            expect(result.files).toHaveLength(1);
            expect(result.files[0]?.blocks).toHaveLength(2);
            // Table should be extracted
            expect(result.files[0]?.tables).toHaveLength(1);
            // No errors
            expect(result.errors).toHaveLength(0);
        });

        it("should discover and parse multiple files", async () => {
            const config: PipelineConfig = {
                paths: [resolve(FIXTURES_DIR, "multi-file-spec")],
            };

            const result = await pipeline.run(config);

            // All 3 files should be discovered and parsed
            expect(result.stats.filesDiscovered).toBe(3);
            expect(result.stats.filesRead).toBe(3);
            expect(result.stats.filesParsed).toBe(3);
            // Each file has 1 block = 3 total
            expect(result.stats.blocksExtracted).toBe(3);
            expect(result.files).toHaveLength(3);
            expect(result.errors).toHaveLength(0);
        });

        it("should discover files in nested directories", async () => {
            const config: PipelineConfig = {
                paths: [resolve(FIXTURES_DIR, "nested-spec")],
            };

            const result = await pipeline.run(config);

            // All 3 files should be discovered (root, subdir, deep)
            expect(result.stats.filesDiscovered).toBe(3);
            expect(result.stats.filesParsed).toBe(3);
            expect(result.files).toHaveLength(3);
            expect(result.errors).toHaveLength(0);
        });
    });

    // ============================================================
    // Feature: Error Propagation
    // ============================================================

    describe("Error Propagation", () => {
        // "should handle discovery error for non-existent path" moved to pipeline-discovery.integration.test.ts
        // (covered by Error Mapping > PATH_NOT_FOUND with fuller assertions)

        it("should continue processing after discovery error", async () => {
            const config: PipelineConfig = {
                paths: [
                    resolve(FIXTURES_DIR, "non-existent"),
                    resolve(FIXTURES_DIR, "simple-spec"),
                ],
            };

            const result = await pipeline.run(config);

            // Should still process simple-spec
            expect(result.files.length).toBeGreaterThanOrEqual(1);
            expect(result.stats.blocksExtracted).toBeGreaterThan(0);
        });
    });

    // ============================================================
    // Feature: Stats Accuracy
    // ============================================================

    describe("Stats Accuracy", () => {
        it("should report accurate block counts across files", async () => {
            const config: PipelineConfig = {
                paths: [
                    resolve(FIXTURES_DIR, "simple-spec"),
                    resolve(FIXTURES_DIR, "multi-file-spec"),
                ],
            };

            const result = await pipeline.run(config);

            // simple-spec: 2 blocks, multi-file-spec: 3 blocks = 5 total
            expect(result.stats.blocksExtracted).toBe(5);

            // Verify sum matches individual files
            const sumBlocks = result.files.reduce((sum, f) => sum + f.blocks.length, 0);
            expect(result.stats.blocksExtracted).toBe(sumBlocks);
        });

        // "should report accurate error counts" moved to pipeline-discovery.integration.test.ts
        // (covered by Stats Accuracy > errorsCount invariant across 4 configs)
    });
});
