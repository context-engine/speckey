import { describe, expect, it, beforeAll, afterAll, spyOn, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CLI } from "../../apps/cli/src/cli";
import { ExitCode } from "../../apps/cli/src/types";

const FIXTURES_DIR = resolve(import.meta.dir, "../fixtures");

function fixture(...segments: string[]): string {
    return resolve(FIXTURES_DIR, "e2e", ...segments);
}

function parseJsonComplete(consoleLogs: string[]): Record<string, unknown> | undefined {
    const completeLine = consoleLogs.find((log) => log.includes('"complete"'));
    if (!completeLine) return undefined;
    return JSON.parse(completeLine);
}

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
    // Feature: CLI E2E - Parse Success Cases
    // ============================================================

    describe("Parse Success Cases", () => {
        it("should succeed with real files", async () => {
            const exitCode = await cli.run(["parse", resolve(FIXTURES_DIR, "simple-spec"), "--no-config"]);

            expect(exitCode).toBe(ExitCode.SUCCESS);
            expect(consoleLogs.some((log) => log.includes("files") || log.includes("blocks"))).toBe(true);
        });

        it("should succeed with multiple paths", async () => {
            const exitCode = await cli.run([
                "parse",
                resolve(FIXTURES_DIR, "simple-spec"),
                resolve(FIXTURES_DIR, "multi-file-spec"),
                "--no-config",
            ]);

            expect(exitCode).toBe(ExitCode.SUCCESS);
        });

        it("should succeed with nested directories", async () => {
            const exitCode = await cli.run(["parse", resolve(FIXTURES_DIR, "nested-spec"), "--no-config"]);

            expect(exitCode).toBe(ExitCode.SUCCESS);
        });
    });

    // ============================================================
    // Feature: CLI E2E - Parse Error Cases
    // ============================================================

    describe("Parse Error Cases", () => {
        it("should fail with non-existent path", async () => {
            const exitCode = await cli.run(["parse", resolve(FIXTURES_DIR, "non-existent"), "--quiet", "--no-config"]);

            expect(exitCode).toBe(ExitCode.PARSE_ERROR);
        });

        it("should fail with empty directory", async () => {
            const exitCode = await cli.run(["parse", resolve(FIXTURES_DIR, "non-existent-dir"), "--quiet", "--no-config"]);

            expect(exitCode).toBe(ExitCode.PARSE_ERROR);
        });
    });

    // ============================================================
    // Feature: CLI E2E - Parse JSON Output Mode
    // ============================================================

    describe("Parse JSON Output Mode", () => {
        it("should output valid JSON lines with --json flag", async () => {
            const exitCode = await cli.run(["parse", resolve(FIXTURES_DIR, "simple-spec"), "--json", "--no-config"]);

            expect(exitCode).toBe(ExitCode.SUCCESS);

            for (const line of consoleLogs) {
                if (line.trim()) {
                    expect(() => JSON.parse(line)).not.toThrow();
                }
            }
        });

        it("should include complete message in JSON output", async () => {
            await cli.run(["parse", resolve(FIXTURES_DIR, "simple-spec"), "--json", "--no-config"]);

            const parsed = parseJsonComplete(consoleLogs);
            expect(parsed).toBeDefined();
            expect(parsed!.type).toBe("complete");
            expect((parsed!.stats as Record<string, unknown>).blocksExtracted).toBe(2);
        });
    });

    // ============================================================
    // Feature: CLI E2E - Parse Verbose Mode
    // ============================================================

    describe("Parse Verbose Mode", () => {
        it("should show file processing in verbose mode", async () => {
            const exitCode = await cli.run(["parse", resolve(FIXTURES_DIR, "simple-spec"), "--verbose", "--no-config"]);

            expect(exitCode).toBe(ExitCode.SUCCESS);
            expect(consoleLogs.length).toBeGreaterThan(0);
        });
    });

    // ============================================================
    // Feature: CLI E2E - Parse Quiet Mode
    // ============================================================

    describe("Parse Quiet Mode", () => {
        it("should suppress output in quiet mode", async () => {
            await cli.run(["parse", resolve(FIXTURES_DIR, "simple-spec"), "--quiet", "--no-config"]);

            expect(consoleLogs.length).toBe(0);
        });
    });

    // ============================================================
    // Feature: CLI E2E - Validate Command
    // ============================================================

    describe("Validate Command", () => {
        it("should succeed with valid annotated specs", async () => {
            const exitCode = await cli.run(["validate", fixture("single-file"), "--no-config"]);

            expect(exitCode).toBe(ExitCode.SUCCESS);
            expect(consoleLogs.some((log) => log.includes("Validation complete"))).toBe(true);
        });

        it("should fail with unresolved references", async () => {
            const exitCode = await cli.run(["validate", fixture("validation-failure"), "--no-config"]);

            expect(exitCode).toBe(ExitCode.PARSE_ERROR);
        });

        it("should show unresolved reference details in output", async () => {
            await cli.run(["validate", fixture("validation-failure"), "--no-config"]);

            expect(consoleLogs.some((log) => log.includes("unresolved"))).toBe(true);
        });

        it("should output valid JSON with --json flag", async () => {
            const exitCode = await cli.run(["validate", fixture("single-file"), "--json", "--no-config"]);

            expect(exitCode).toBe(ExitCode.SUCCESS);

            const parsed = parseJsonComplete(consoleLogs);
            expect(parsed).toBeDefined();
            expect(parsed!.entities).toBe(2);
        });

        it("should include unresolved refs in JSON output", async () => {
            await cli.run(["validate", fixture("validation-failure"), "--json", "--no-config"]);

            const parsed = parseJsonComplete(consoleLogs);
            expect(parsed).toBeDefined();
            const report = parsed!.validationReport as Record<string, unknown[]>;
            expect(report).toBeDefined();
            expect(report.errors.length).toBeGreaterThan(0);
        });

        it("should suppress output in quiet mode", async () => {
            await cli.run(["validate", fixture("single-file"), "--quiet", "--no-config"]);

            expect(consoleLogs.length).toBe(0);
        });

        it("should succeed with multi-file cross-package refs", async () => {
            const exitCode = await cli.run(["validate", fixture("multi-file"), "--no-config"]);

            expect(exitCode).toBe(ExitCode.SUCCESS);
        });
    });

    // ============================================================
    // Feature: CLI E2E - Sync Command
    // ============================================================

    describe("Sync Command", () => {
        let tmpDbDir: string;

        beforeAll(() => {
            tmpDbDir = mkdtempSync(join(tmpdir(), "speckey-test-db-"));
        });

        afterAll(() => {
            rmSync(tmpDbDir, { recursive: true, force: true });
        });

        it("should fail without --db-path", async () => {
            const exitCode = await cli.run(["sync", fixture("single-file"), "--no-config"]);

            expect(exitCode).toBe(ExitCode.CONFIG_ERROR);
            expect(consoleErrors.some((e) => e.includes("Database path required"))).toBe(true);
        });

        it("should succeed with valid specs and --db-path", async () => {
            const dbPath = join(tmpDbDir, "sync-success.db");
            const exitCode = await cli.run(["sync", fixture("single-file"), "--db-path", dbPath, "--no-config"]);

            expect(exitCode).toBe(ExitCode.SUCCESS);
            expect(consoleLogs.some((log) => log.includes("Sync complete"))).toBe(true);
        });

        it("should fail when validation fails", async () => {
            const dbPath = join(tmpDbDir, "sync-fail.db");
            const exitCode = await cli.run(["sync", fixture("validation-failure"), "--db-path", dbPath, "--no-config"]);

            expect(exitCode).toBe(ExitCode.PARSE_ERROR);
        });

        it("should output valid JSON with --json flag", async () => {
            const dbPath = join(tmpDbDir, "sync-json.db");
            const exitCode = await cli.run(["sync", fixture("single-file"), "--db-path", dbPath, "--json", "--no-config"]);

            expect(exitCode).toBe(ExitCode.SUCCESS);

            const parsed = parseJsonComplete(consoleLogs);
            expect(parsed).toBeDefined();
            expect(parsed!.writeResult).toBeDefined();
            expect((parsed!.writeResult as Record<string, unknown>).inserted).toBe(2);
        });

        it("should suppress output in quiet mode", async () => {
            const dbPath = join(tmpDbDir, "sync-quiet.db");
            await cli.run(["sync", fixture("single-file"), "--db-path", dbPath, "--quiet", "--no-config"]);

            expect(consoleLogs.length).toBe(0);
        });
    });

    // ============================================================
    // Feature: CLI E2E - Entity Construction Verification
    // ============================================================

    describe("Entity Construction Verification", () => {
        it("should report correct entity count for single-file", async () => {
            await cli.run(["parse", fixture("single-file"), "--json", "--no-config"]);

            const parsed = parseJsonComplete(consoleLogs);
            expect(parsed).toBeDefined();
            expect(parsed!.entities).toBe(2);
            expect((parsed!.stats as Record<string, unknown>).entitiesBuilt).toBe(2);
        });

        it("should report correct entity count for multi-file", async () => {
            await cli.run(["parse", fixture("multi-file"), "--json", "--no-config"]);

            const parsed = parseJsonComplete(consoleLogs);
            expect(parsed).toBeDefined();
            expect(parsed!.entities).toBe(4);
            expect((parsed!.stats as Record<string, unknown>).entitiesBuilt).toBe(4);
        });

        it("should report entity count in validate JSON output", async () => {
            await cli.run(["validate", fixture("single-file"), "--json", "--no-config"]);

            const parsed = parseJsonComplete(consoleLogs);
            expect(parsed).toBeDefined();
            expect(parsed!.entities).toBe(2);
        });

        it("should report correct entity count across multiple files via validate", async () => {
            await cli.run(["validate", fixture("multi-file"), "--json", "--no-config"]);

            const parsed = parseJsonComplete(consoleLogs);
            expect(parsed).toBeDefined();
            expect(parsed!.entities).toBe(4);
        });
    });

    // ============================================================
    // Feature: CLI E2E - Include/Exclude Filtering
    // ============================================================

    describe("Include/Exclude Filtering", () => {
        it("should process all files with no include/exclude flags", async () => {
            await cli.run(["parse", fixture("filter-test"), "--json", "--no-config"]);

            const parsed = parseJsonComplete(consoleLogs);
            expect(parsed).toBeDefined();
            expect((parsed!.stats as Record<string, unknown>).filesDiscovered).toBe(3);
        });

        it("should filter with --include to process only matching files", async () => {
            await cli.run(["parse", fixture("filter-test"), "--include", "phase-1/**/*.md", "--json", "--no-config"]);

            const parsed = parseJsonComplete(consoleLogs);
            expect(parsed).toBeDefined();
            expect((parsed!.stats as Record<string, unknown>).filesDiscovered).toBe(1);
        });

        it("should filter with --exclude to skip matching files", async () => {
            await cli.run(["parse", fixture("filter-test"), "--exclude", "**/excluded/**", "--json", "--no-config"]);

            const parsed = parseJsonComplete(consoleLogs);
            expect(parsed).toBeDefined();
            expect((parsed!.stats as Record<string, unknown>).filesDiscovered).toBe(2);
        });

        it("should combine --include and --exclude", async () => {
            await cli.run([
                "parse", fixture("filter-test"),
                "--include", "**/*.md",
                "--exclude", "**/excluded/**",
                "--json", "--no-config",
            ]);

            const parsed = parseJsonComplete(consoleLogs);
            expect(parsed).toBeDefined();
            expect((parsed!.stats as Record<string, unknown>).filesDiscovered).toBe(2);
        });

        it("should return PARSE_ERROR when include pattern matches nothing", async () => {
            const exitCode = await cli.run([
                "parse", fixture("filter-test"),
                "--include", "nonexistent/**/*.md",
                "--no-config",
            ]);

            expect(exitCode).toBe(ExitCode.PARSE_ERROR);
        });
    });

    // ============================================================
    // Feature: CLI E2E - Config File Integration
    // ============================================================

    describe("Config File Integration", () => {
        const configDir = resolve(FIXTURES_DIR, "e2e", "config-integration");
        const configPath = resolve(configDir, "speckey.config.json");

        it("should apply config file exclude patterns", async () => {
            await cli.run(["parse", configDir, "--config", configPath, "--json"]);

            const parsed = parseJsonComplete(consoleLogs);
            expect(parsed).toBeDefined();
            // Config excludes **/excluded/**, so only included/model.md discovered
            expect((parsed!.stats as Record<string, unknown>).filesDiscovered).toBe(1);
        });

        it("should process all files when --no-config bypasses config", async () => {
            await cli.run(["parse", configDir, "--no-config", "--json"]);

            const parsed = parseJsonComplete(consoleLogs);
            expect(parsed).toBeDefined();
            // No config exclusions, both files discovered
            expect((parsed!.stats as Record<string, unknown>).filesDiscovered).toBe(2);
        });

        it("should combine config exclude with CLI --exclude", async () => {
            await cli.run([
                "parse", configDir,
                "--config", configPath,
                "--exclude", "**/included/**",
                "--json",
            ]);

            const parsed = parseJsonComplete(consoleLogs);
            expect(parsed).toBeDefined();
            // Config excludes **/excluded/**, CLI excludes **/included/** → nothing left
            expect((parsed!.stats as Record<string, unknown>).filesDiscovered).toBe(0);
        });

        it("should allow CLI --include to override config include", async () => {
            await cli.run([
                "parse", configDir,
                "--config", configPath,
                "--include", "included/**/*.md",
                "--json",
            ]);

            const parsed = parseJsonComplete(consoleLogs);
            expect(parsed).toBeDefined();
            expect((parsed!.stats as Record<string, unknown>).filesDiscovered).toBe(1);
        });
    });

    // ============================================================
    // Feature: CLI E2E - Commander Features
    // ============================================================

    describe("Commander Features", () => {
        it("should parse --include=pattern equals syntax", async () => {
            await cli.run(["parse", fixture("filter-test"), "--include=phase-1/**/*.md", "--json", "--no-config"]);

            const parsed = parseJsonComplete(consoleLogs);
            expect(parsed).toBeDefined();
            expect((parsed!.stats as Record<string, unknown>).filesDiscovered).toBe(1);
        });

        it("should parse --config=path equals syntax", async () => {
            const configDir = resolve(FIXTURES_DIR, "e2e", "config-integration");
            const configPath = resolve(configDir, "speckey.config.json");

            await cli.run(["parse", configDir, `--config=${configPath}`, "--json"]);

            const parsed = parseJsonComplete(consoleLogs);
            expect(parsed).toBeDefined();
            expect((parsed!.stats as Record<string, unknown>).filesDiscovered).toBe(1);
        });
    });
});
