import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { CLI } from "../src/cli";
import { ExitCode } from "../src/types";

describe("CLI", () => {
    const testDir = resolve("./test-temp-cli");
    let cli: CLI;

    beforeAll(async () => {
        await mkdir(testDir, { recursive: true });
        await mkdir(join(testDir, "empty"), { recursive: true });

        // Create test markdown files
        await writeFile(
            join(testDir, "spec.md"),
            `# Test Spec\n\n\`\`\`mermaid\nclassDiagram\n    class Foo\n\`\`\`\n`,
        );
    });

    afterAll(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    beforeAll(() => {
        cli = new CLI();
    });

    // ============================================================
    // Feature: Help and Version
    // ============================================================

    describe("Help and Version", () => {
        it("should return SUCCESS for --help", async () => {
            const exitCode = await cli.run(["--help"]);
            expect(exitCode).toBe(ExitCode.SUCCESS);
        });

        it("should return SUCCESS for --version", async () => {
            const exitCode = await cli.run(["--version"]);
            expect(exitCode).toBe(ExitCode.SUCCESS);
        });
    });

    // ============================================================
    // Feature: Exit Codes
    // ============================================================

    describe("Exit Codes", () => {
        it("should return SUCCESS when files parsed without errors", async () => {
            const exitCode = await cli.run([testDir, "--quiet"]);
            expect(exitCode).toBe(ExitCode.SUCCESS);
        });

        it("should return PARSE_ERROR when no files found", async () => {
            const exitCode = await cli.run([join(testDir, "empty"), "--quiet"]);
            expect(exitCode).toBe(ExitCode.PARSE_ERROR);
        });

        it("should return CONFIG_ERROR for invalid arguments", async () => {
            const exitCode = await cli.run(["--unknown-flag"]);
            expect(exitCode).toBe(ExitCode.CONFIG_ERROR);
        });

        it("should return CONFIG_ERROR for invalid config file", async () => {
            const badConfigPath = join(testDir, "bad.config.json");
            await writeFile(badConfigPath, "{ invalid json }");

            const exitCode = await cli.run(["--config", badConfigPath, testDir]);

            await rm(badConfigPath);
            expect(exitCode).toBe(ExitCode.CONFIG_ERROR);
        });
    });

    // ============================================================
    // Feature: Output Modes
    // ============================================================

    describe("Output Modes", () => {
        it("should accept --verbose flag", async () => {
            const exitCode = await cli.run([testDir, "--verbose"]);
            expect(exitCode).toBe(ExitCode.SUCCESS);
        });

        it("should accept --quiet flag", async () => {
            const exitCode = await cli.run([testDir, "--quiet"]);
            expect(exitCode).toBe(ExitCode.SUCCESS);
        });

        it("should accept --json flag", async () => {
            const exitCode = await cli.run([testDir, "--json"]);
            expect(exitCode).toBe(ExitCode.SUCCESS);
        });
    });

    // ============================================================
    // Feature: Configuration
    // ============================================================

    describe("Configuration", () => {
        it("should use --no-config to skip config files", async () => {
            const exitCode = await cli.run([testDir, "--no-config", "--quiet"]);
            expect(exitCode).toBe(ExitCode.SUCCESS);
        });

        it("should apply --exclude patterns", async () => {
            const exitCode = await cli.run([testDir, "--exclude", "**/*.md", "--quiet"]);
            // Should find no files because all .md files are excluded
            expect(exitCode).toBe(ExitCode.PARSE_ERROR);
        });

        it("should use custom config file with --config", async () => {
            const customConfig = join(testDir, "custom.config.json");
            await writeFile(customConfig, JSON.stringify({ include: ["**/*.md"] }));

            const exitCode = await cli.run(["--config", customConfig, testDir, "--quiet"]);

            await rm(customConfig);
            expect(exitCode).toBe(ExitCode.SUCCESS);
        });
    });

    // ============================================================
    // Feature: Multiple Paths
    // ============================================================

    describe("Multiple Paths", () => {
        it("should accept multiple paths", async () => {
            const exitCode = await cli.run([testDir, testDir, "--quiet"]);
            expect(exitCode).toBe(ExitCode.SUCCESS);
        });
    });
});
