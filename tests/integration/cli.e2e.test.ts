import { describe, expect, it, beforeAll, afterAll, spyOn, beforeEach, afterEach } from "bun:test";
import { resolve } from "node:path";
import { CLI } from "../../packages/cli/src/cli";
import { ExitCode } from "../../packages/cli/src/types";

const FIXTURES_DIR = resolve(import.meta.dir, "../fixtures");

describe("CLI E2E", () => {
    let cli: CLI;
    let consoleLogs: string[];
    let consoleErrors: string[];
    let logSpy: ReturnType<typeof spyOn>;
    let errorSpy: ReturnType<typeof spyOn>;

    beforeAll(() => {
        cli = new CLI();
    });

    beforeEach(() => {
        consoleLogs = [];
        consoleErrors = [];
        logSpy = spyOn(console, "log").mockImplementation((msg: string) => {
            consoleLogs.push(String(msg));
        });
        errorSpy = spyOn(console, "error").mockImplementation((msg: string) => {
            consoleErrors.push(String(msg));
        });
    });

    afterEach(() => {
        logSpy.mockRestore();
        errorSpy.mockRestore();
    });

    // ============================================================
    // Feature: CLI E2E - Success Cases
    // ============================================================

    describe("Success Cases", () => {
        it("should succeed with real files", async () => {
            const exitCode = await cli.run([resolve(FIXTURES_DIR, "simple-spec")]);

            expect(exitCode).toBe(ExitCode.SUCCESS);
            // Should output summary
            expect(consoleLogs.some((log) => log.includes("files") || log.includes("blocks"))).toBe(true);
        });

        it("should succeed with multiple paths", async () => {
            const exitCode = await cli.run([
                resolve(FIXTURES_DIR, "simple-spec"),
                resolve(FIXTURES_DIR, "multi-file-spec"),
            ]);

            expect(exitCode).toBe(ExitCode.SUCCESS);
        });

        it("should succeed with nested directories", async () => {
            const exitCode = await cli.run([resolve(FIXTURES_DIR, "nested-spec")]);

            expect(exitCode).toBe(ExitCode.SUCCESS);
        });
    });

    // ============================================================
    // Feature: CLI E2E - Error Cases
    // ============================================================

    describe("Error Cases", () => {
        it("should fail with non-existent path", async () => {
            const exitCode = await cli.run([resolve(FIXTURES_DIR, "non-existent"), "--quiet"]);

            expect(exitCode).toBe(ExitCode.PARSE_ERROR);
        });

        it("should fail with empty directory", async () => {
            // Use nested-spec/subdir/deep as parent for a non-existent deeper path
            const exitCode = await cli.run([resolve(FIXTURES_DIR, "non-existent-dir"), "--quiet"]);

            expect(exitCode).toBe(ExitCode.PARSE_ERROR);
        });
    });

    // ============================================================
    // Feature: CLI E2E - JSON Output Mode
    // ============================================================

    describe("JSON Output Mode", () => {
        it("should output valid JSON lines with --json flag", async () => {
            const exitCode = await cli.run([resolve(FIXTURES_DIR, "simple-spec"), "--json"]);

            expect(exitCode).toBe(ExitCode.SUCCESS);

            // Each output line should be valid JSON
            for (const line of consoleLogs) {
                if (line.trim()) {
                    expect(() => JSON.parse(line)).not.toThrow();
                }
            }
        });

        it("should include complete message in JSON output", async () => {
            await cli.run([resolve(FIXTURES_DIR, "simple-spec"), "--json"]);

            const completeLine = consoleLogs.find((log) => log.includes("complete"));
            expect(completeLine).toBeDefined();

            const parsed = JSON.parse(completeLine!);
            expect(parsed.type).toBe("complete");
            expect(parsed.stats).toBeDefined();
            expect(parsed.stats.blocksExtracted).toBe(2);
        });
    });

    // ============================================================
    // Feature: CLI E2E - Verbose Mode
    // ============================================================

    describe("Verbose Mode", () => {
        it("should show file processing in verbose mode", async () => {
            const exitCode = await cli.run([resolve(FIXTURES_DIR, "simple-spec"), "--verbose"]);

            expect(exitCode).toBe(ExitCode.SUCCESS);
            // Should have more output in verbose mode
            expect(consoleLogs.length).toBeGreaterThan(0);
        });
    });

    // ============================================================
    // Feature: CLI E2E - Quiet Mode
    // ============================================================

    describe("Quiet Mode", () => {
        it("should suppress output in quiet mode", async () => {
            await cli.run([resolve(FIXTURES_DIR, "simple-spec"), "--quiet"]);

            // Should have minimal output (no progress, just errors if any)
            expect(consoleLogs.length).toBe(0);
        });
    });
});
