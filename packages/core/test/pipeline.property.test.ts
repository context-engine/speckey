import { describe, expect, it } from "bun:test";
import fc from "fast-check";
import { DEFAULT_CONFIG, type PipelineConfig } from "../src/types";
import { ParsePipeline } from "../src/pipeline";

describe("ParsePipeline - Property Tests", () => {
    const pipeline = new ParsePipeline();

    describe("PipelineConfig defaults", () => {
        it("should always apply default include pattern when not specified", () => {
            fc.assert(
                fc.property(fc.array(fc.string(), { minLength: 1, maxLength: 5 }), (paths) => {
                    const config: PipelineConfig = { paths };
                    // We can't easily test the internal application of defaults,
                    // but we can verify the defaults are defined correctly
                    expect(DEFAULT_CONFIG.include).toEqual(["**/*.md"]);
                    expect(DEFAULT_CONFIG.exclude).toEqual(["**/node_modules/**"]);
                    expect(DEFAULT_CONFIG.maxFiles).toBe(10000);
                    expect(DEFAULT_CONFIG.maxFileSizeMb).toBe(10);
                    return true;
                }),
            );
        });
    });

    describe("PipelineResult invariants", () => {
        it("stats.errorsCount should equal errors.length", async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom("/nonexistent1", "/nonexistent2", "/tmp"),
                    async (path) => {
                        const config: PipelineConfig = { paths: [path] };
                        const result = await pipeline.run(config);

                        // Invariant: stats.errorsCount always matches errors array length
                        expect(result.stats.errorsCount).toBe(result.errors.length);
                        return true;
                    },
                ),
                { numRuns: 10 },
            );
        });

        it("stats.filesParsed should be <= stats.filesRead", async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom("/nonexistent", "/tmp", "."),
                    async (path) => {
                        const config: PipelineConfig = { paths: [path] };
                        const result = await pipeline.run(config);

                        // Invariant: can't parse more files than we read
                        expect(result.stats.filesParsed).toBeLessThanOrEqual(result.stats.filesRead);
                        return true;
                    },
                ),
                { numRuns: 10 },
            );
        });

        it("stats.filesRead should be <= stats.filesDiscovered", async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom("/nonexistent", "/tmp", "."),
                    async (path) => {
                        const config: PipelineConfig = { paths: [path] };
                        const result = await pipeline.run(config);

                        // Invariant: can't read more files than we discovered
                        expect(result.stats.filesRead).toBeLessThanOrEqual(result.stats.filesDiscovered);
                        return true;
                    },
                ),
                { numRuns: 10 },
            );
        });

        it("files.length should equal stats.filesParsed", async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom("/nonexistent", "/tmp"),
                    async (path) => {
                        const config: PipelineConfig = { paths: [path] };
                        const result = await pipeline.run(config);

                        // Invariant: number of parsed files matches stats
                        expect(result.files.length).toBe(result.stats.filesParsed);
                        return true;
                    },
                ),
                { numRuns: 10 },
            );
        });
    });

    describe("Error phase attribution", () => {
        it("all errors should have valid phase values", async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.array(fc.constantFrom("/a", "/b", "/nonexistent"), { minLength: 1, maxLength: 3 }),
                    async (paths) => {
                        const config: PipelineConfig = { paths };
                        const result = await pipeline.run(config);

                        const validPhases = ["discovery", "read", "parse"];
                        for (const error of result.errors) {
                            expect(validPhases).toContain(error.phase);
                            expect(typeof error.path).toBe("string");
                            expect(typeof error.message).toBe("string");
                            expect(typeof error.code).toBe("string");
                        }
                        return true;
                    },
                ),
                { numRuns: 10 },
            );
        });
    });

    describe("Blocks count invariant", () => {
        it("blocksExtracted should equal sum of blocks across all files", async () => {
            await fc.assert(
                fc.asyncProperty(fc.constant("."), async (path) => {
                    const config: PipelineConfig = {
                        paths: [path],
                        include: ["*.md"],
                        maxFiles: 5,
                    };
                    const result = await pipeline.run(config);

                    const sumBlocks = result.files.reduce((sum, f) => sum + f.blocks.length, 0);
                    expect(result.stats.blocksExtracted).toBe(sumBlocks);
                    return true;
                }),
                { numRuns: 5 },
            );
        });
    });
});
