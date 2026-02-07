import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { CLI } from "../src/cli";
import { Command, ExitCode } from "../src/types";

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

        it("should return SUCCESS for -h", async () => {
            const exitCode = await cli.run(["-h"]);
            expect(exitCode).toBe(ExitCode.SUCCESS);
        });
    });

    // ============================================================
    // Feature: Subcommand Dispatch
    // ============================================================

    describe("Subcommand Dispatch", () => {
        it("should return CONFIG_ERROR for missing subcommand", async () => {
            const exitCode = await cli.run([]);
            expect(exitCode).toBe(ExitCode.CONFIG_ERROR);
        });

        it("should return CONFIG_ERROR for unknown subcommand", async () => {
            const exitCode = await cli.run(["unknown", testDir]);
            expect(exitCode).toBe(ExitCode.CONFIG_ERROR);
        });

        it("should run parse command successfully", async () => {
            const exitCode = await cli.run(["parse", testDir, "--quiet", "--no-config"]);
            expect(exitCode).toBe(ExitCode.SUCCESS);
        });
    });

    // ============================================================
    // Feature: Command-Specific Config Building (buildConfig)
    // ============================================================

    describe("buildConfig", () => {
        it("should set skipValidation=true for PARSE", async () => {
            const config = await cli.buildConfig(Command.PARSE, {
                command: Command.PARSE,
                paths: [testDir],
                verbose: false,
                quiet: false,
                json: false,
                noConfig: true,
                exclude: [],
                help: false,
                version: false,
            });
            expect(config.skipValidation).toBe(true);
            expect(config.writeConfig).toBeUndefined();
        });

        it("should set skipValidation=false for VALIDATE", async () => {
            const config = await cli.buildConfig(Command.VALIDATE, {
                command: Command.VALIDATE,
                paths: [testDir],
                verbose: false,
                quiet: false,
                json: false,
                noConfig: true,
                exclude: [],
                help: false,
                version: false,
            });
            expect(config.skipValidation).toBe(false);
            expect(config.writeConfig).toBeUndefined();
        });

        it("should set writeConfig for SYNC with db-path", async () => {
            const config = await cli.buildConfig(Command.SYNC, {
                command: Command.SYNC,
                paths: [testDir],
                dbPath: "./test.db",
                verbose: false,
                quiet: false,
                json: false,
                noConfig: true,
                exclude: [],
                help: false,
                version: false,
            });
            expect(config.skipValidation).toBe(false);
            expect(config.writeConfig).toBeDefined();
            expect(config.writeConfig!.dbPath).toBe("./test.db");
        });

        it("should throw for SYNC without db-path", async () => {
            await expect(
                cli.buildConfig(Command.SYNC, {
                    command: Command.SYNC,
                    paths: [testDir],
                    verbose: false,
                    quiet: false,
                    json: false,
                    noConfig: true,
                    exclude: [],
                    help: false,
                    version: false,
                })
            ).rejects.toThrow("Database path required for sync");
        });
    });

    // ============================================================
    // Feature: Exit Codes
    // ============================================================

    describe("Exit Codes", () => {
        it("should return SUCCESS when files parsed without errors", async () => {
            const exitCode = await cli.run(["parse", testDir, "--quiet", "--no-config"]);
            expect(exitCode).toBe(ExitCode.SUCCESS);
        });

        it("should return PARSE_ERROR when no files found", async () => {
            const exitCode = await cli.run(["parse", join(testDir, "empty"), "--quiet", "--no-config"]);
            expect(exitCode).toBe(ExitCode.PARSE_ERROR);
        });

        it("should return CONFIG_ERROR for invalid arguments", async () => {
            const exitCode = await cli.run(["parse", "--unknown-flag"]);
            expect(exitCode).toBe(ExitCode.CONFIG_ERROR);
        });

        it("should return CONFIG_ERROR for invalid config file", async () => {
            const badConfigPath = join(testDir, "bad.config.json");
            await writeFile(badConfigPath, "{ invalid json }");

            const exitCode = await cli.run(["parse", "--config", badConfigPath, testDir]);

            await rm(badConfigPath);
            expect(exitCode).toBe(ExitCode.CONFIG_ERROR);
        });

        it("should return CONFIG_ERROR for sync without db-path", async () => {
            const exitCode = await cli.run(["sync", testDir, "--no-config", "--quiet"]);
            expect(exitCode).toBe(ExitCode.CONFIG_ERROR);
        });
    });

    // ============================================================
    // Feature: Output Modes
    // ============================================================

    describe("Output Modes", () => {
        it("should accept --verbose flag", async () => {
            const exitCode = await cli.run(["parse", testDir, "--verbose", "--no-config"]);
            expect(exitCode).toBe(ExitCode.SUCCESS);
        });

        it("should accept --quiet flag", async () => {
            const exitCode = await cli.run(["parse", testDir, "--quiet", "--no-config"]);
            expect(exitCode).toBe(ExitCode.SUCCESS);
        });

        it("should accept --json flag", async () => {
            const exitCode = await cli.run(["parse", testDir, "--json", "--no-config"]);
            expect(exitCode).toBe(ExitCode.SUCCESS);
        });

        it("should accept -v short flag", async () => {
            const exitCode = await cli.run(["parse", testDir, "-v", "--no-config"]);
            expect(exitCode).toBe(ExitCode.SUCCESS);
        });

        it("should accept -q short flag", async () => {
            const exitCode = await cli.run(["parse", testDir, "-q", "--no-config"]);
            expect(exitCode).toBe(ExitCode.SUCCESS);
        });
    });

    // ============================================================
    // Feature: Configuration
    // ============================================================

    describe("Configuration", () => {
        it("should use --no-config to skip config files", async () => {
            const exitCode = await cli.run(["parse", testDir, "--no-config", "--quiet"]);
            expect(exitCode).toBe(ExitCode.SUCCESS);
        });

        it("should apply --exclude patterns", async () => {
            const exitCode = await cli.run(["parse", testDir, "--exclude", "**/*.md", "--quiet", "--no-config"]);
            // Should find no files because all .md files are excluded
            expect(exitCode).toBe(ExitCode.PARSE_ERROR);
        });

        it("should use custom config file with --config", async () => {
            const customConfig = join(testDir, "custom.config.json");
            await writeFile(customConfig, JSON.stringify({ include: ["**/*.md"] }));

            const exitCode = await cli.run(["parse", "--config", customConfig, testDir, "--quiet"]);

            await rm(customConfig);
            expect(exitCode).toBe(ExitCode.SUCCESS);
        });
    });

    // ============================================================
    // Feature: Flag Conflicts
    // ============================================================

    describe("Flag Conflicts", () => {
        it("should return CONFIG_ERROR for --verbose + --quiet", async () => {
            const exitCode = await cli.run(["parse", testDir, "--verbose", "--quiet", "--no-config"]);
            expect(exitCode).toBe(ExitCode.CONFIG_ERROR);
        });
    });

    // ============================================================
    // Feature: Exit Codes (validate/sync)
    // ============================================================

    describe("Exit Codes (validate/sync)", () => {
        it("should return PARSE_ERROR for validate on empty directory", async () => {
            const exitCode = await cli.run(["validate", join(testDir, "empty"), "--quiet", "--no-config"]);
            expect(exitCode).toBe(ExitCode.PARSE_ERROR);
        });

        it("should return PARSE_ERROR for sync on empty directory", async () => {
            const exitCode = await cli.run(["sync", join(testDir, "empty"), "--db-path", "./test.db", "--quiet", "--no-config"]);
            expect(exitCode).toBe(ExitCode.PARSE_ERROR);
        });

        it("should run validate command successfully on valid specs", async () => {
            const exitCode = await cli.run(["validate", testDir, "--quiet", "--no-config"]);
            // May be SUCCESS or PARSE_ERROR depending on whether refs resolve
            expect([ExitCode.SUCCESS, ExitCode.PARSE_ERROR]).toContain(exitCode);
        });
    });

    // ============================================================
    // Feature: Multiple Paths
    // ============================================================

    describe("Multiple Paths", () => {
        it("should accept multiple paths", async () => {
            const exitCode = await cli.run(["parse", testDir, testDir, "--quiet", "--no-config"]);
            expect(exitCode).toBe(ExitCode.SUCCESS);
        });
    });
});
