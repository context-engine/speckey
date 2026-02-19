import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Pipeline, PipelineConfig, PipelineResult, PipelineStats } from "@speckey/core";
import type { Logger, AppLogObj } from "@speckey/logger";
import { PipelinePhase } from "@speckey/constants";
import { CLI } from "../src/cli";
import { Command, ExitCode } from "../src/types";

// ============================================================
// Mock Pipeline
// ============================================================

function createMockStats(overrides?: Partial<PipelineStats>): PipelineStats {
    return {
        filesDiscovered: 1,
        filesRead: 1,
        filesParsed: 1,
        blocksExtracted: 1,
        errorsCount: 0,
        entitiesBuilt: 1,
        entitiesInserted: 0,
        entitiesUpdated: 0,
        validationErrors: 0,
        ...overrides,
    };
}

function createMockResult(overrides?: Partial<PipelineResult>): PipelineResult {
    return {
        files: [],
        errors: [],
        stats: createMockStats(),
        classSpecs: [],
        ...overrides,
    };
}

function createMockPipeline(resultOrFn?: PipelineResult | ((config: PipelineConfig) => PipelineResult)): Pipeline {
    return {
        async run(config: PipelineConfig, _logger: Logger<AppLogObj>): Promise<PipelineResult> {
            if (typeof resultOrFn === "function") {
                return resultOrFn(config);
            }
            return resultOrFn ?? createMockResult();
        },
    };
}

describe("CLI", () => {
    const testDir = resolve("./test-temp-cli");
    let cli: CLI;

    beforeAll(async () => {
        await mkdir(testDir, { recursive: true });
        await mkdir(join(testDir, "empty"), { recursive: true });

        await writeFile(
            join(testDir, "spec.md"),
            `# Test Spec\n\n\`\`\`mermaid\nclassDiagram\n    class Foo\n\`\`\`\n`,
        );
    });

    afterAll(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    beforeEach(() => {
        cli = new CLI(createMockPipeline());
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
                include: [],
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
                include: [],
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
                include: [],
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
                    include: [],
                    exclude: [],
                    help: false,
                    version: false,
                })
            ).rejects.toThrow("Database path required for sync");
        });

        it("should reject single non-.md file", async () => {
            await expect(
                cli.buildConfig(Command.PARSE, {
                    command: Command.PARSE,
                    paths: ["file.txt"],
                    verbose: false,
                    quiet: false,
                    json: false,
                    noConfig: true,
                    include: [],
                    exclude: [],
                    help: false,
                    version: false,
                })
            ).rejects.toThrow("Not a markdown file");
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
            cli = new CLI(createMockPipeline(createMockResult({
                stats: createMockStats({ filesDiscovered: 0 }),
            })));
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

        it("should return PARSE_ERROR when parse has errors", async () => {
            cli = new CLI(createMockPipeline(createMockResult({
                errors: [{ phase: "parse", path: "file.md", message: "bad", code: "ERR", userMessage: ["Parse error"] }],
                stats: createMockStats({ errorsCount: 1 }),
            })));
            const exitCode = await cli.run(["parse", testDir, "--quiet", "--no-config"]);
            expect(exitCode).toBe(ExitCode.PARSE_ERROR);
        });

        it("should return PARSE_ERROR when validation has unresolved references", async () => {
            cli = new CLI(createMockPipeline(createMockResult({
                validationReport: {
                    resolved: [],
                    unresolved: [{ entityFqn: "A", targetFqn: "B", payloadType: "type", specFile: "a.md", specLine: 1 }],
                    errors: [],
                },
            })));
            const exitCode = await cli.run(["validate", testDir, "--quiet", "--no-config"]);
            expect(exitCode).toBe(ExitCode.PARSE_ERROR);
        });

        it("should return SUCCESS when validation has no unresolved references", async () => {
            cli = new CLI(createMockPipeline(createMockResult({
                validationReport: {
                    resolved: [{ entityFqn: "A", targetFqn: "B", payloadType: "type" }],
                    unresolved: [],
                    errors: [],
                },
            })));
            const exitCode = await cli.run(["validate", testDir, "--quiet", "--no-config"]);
            expect(exitCode).toBe(ExitCode.SUCCESS);
        });

        it("should return PARSE_ERROR for sync when validation fails", async () => {
            cli = new CLI(createMockPipeline(createMockResult({
                validationReport: {
                    resolved: [],
                    unresolved: [{ entityFqn: "A", targetFqn: "B", payloadType: "type", specFile: "a.md", specLine: 1 }],
                    errors: [],
                },
            })));
            const exitCode = await cli.run(["sync", testDir, "--db-path", "./test.db", "--quiet", "--no-config"]);
            expect(exitCode).toBe(ExitCode.PARSE_ERROR);
        });

        it("should return SUCCESS for sync when validation passes", async () => {
            cli = new CLI(createMockPipeline(createMockResult({
                validationReport: {
                    resolved: [],
                    unresolved: [],
                    errors: [],
                },
            })));
            const exitCode = await cli.run(["sync", testDir, "--db-path", "./test.db", "--quiet", "--no-config"]);
            expect(exitCode).toBe(ExitCode.SUCCESS);
        });
    });

    // ============================================================
    // Feature: Output Modes & Logger Creation
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

        it("should pass logger to pipeline", async () => {
            let capturedLogger: Logger<AppLogObj> | undefined;
            const spyPipeline: Pipeline = {
                async run(_config: PipelineConfig, logger: Logger<AppLogObj>): Promise<PipelineResult> {
                    capturedLogger = logger;
                    return createMockResult();
                },
            };
            cli = new CLI(spyPipeline);
            await cli.run(["parse", testDir, "--quiet", "--no-config"]);
            expect(capturedLogger).toBeDefined();
        });

        it("should create default logger before arg parse (errors are structured)", async () => {
            // When parseArgs fails, error should be logged through logger, not crash
            // This is verified by the fact that CONFIG_ERROR is returned (not an unhandled throw)
            const exitCode = await cli.run(["parse", "--unknown-flag"]);
            expect(exitCode).toBe(ExitCode.CONFIG_ERROR);
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
            cli = new CLI(createMockPipeline(createMockResult({
                stats: createMockStats({ filesDiscovered: 0 }),
            })));
            const exitCode = await cli.run(["parse", testDir, "--exclude", "**/*.md", "--quiet", "--no-config"]);
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
            cli = new CLI(createMockPipeline(createMockResult({
                stats: createMockStats({ filesDiscovered: 0 }),
            })));
            const exitCode = await cli.run(["validate", join(testDir, "empty"), "--quiet", "--no-config"]);
            expect(exitCode).toBe(ExitCode.PARSE_ERROR);
        });

        it("should return PARSE_ERROR for sync on empty directory", async () => {
            cli = new CLI(createMockPipeline(createMockResult({
                stats: createMockStats({ filesDiscovered: 0 }),
            })));
            const exitCode = await cli.run(["sync", join(testDir, "empty"), "--db-path", "./test.db", "--quiet", "--no-config"]);
            expect(exitCode).toBe(ExitCode.PARSE_ERROR);
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

    // ============================================================
    // Feature: Exit-Code Error Summary
    // ============================================================

    describe("Exit-Code Error Summary", () => {
        it("should log error summary when pipeline has errors", async () => {
            const logEntries: Record<string, unknown>[] = [];
            const spyPipeline: Pipeline = {
                async run(_config: PipelineConfig, logger: Logger<AppLogObj>): Promise<PipelineResult> {
                    logger.attachTransport((logObj: Record<string, unknown>) => {
                        logEntries.push(logObj);
                    });
                    return createMockResult({
                        errors: [{ phase: PipelinePhase.DISCOVERY, path: "/bad", message: "Path not found", code: "ENOENT", userMessage: ["File not found"] }],
                        stats: createMockStats({ errorsCount: 1 }),
                    });
                },
            };
            cli = new CLI(spyPipeline);
            const exitCode = await cli.run(["parse", testDir, "--quiet", "--no-config"]);

            expect(exitCode).toBe(ExitCode.PARSE_ERROR);
            const errorLogs = logEntries.filter(l => {
                const meta = l["_meta"] as Record<string, unknown> | undefined;
                return meta?.["logLevelName"] === "ERROR";
            });
            expect(errorLogs.length).toBeGreaterThanOrEqual(1);
            const logStr = JSON.stringify(errorLogs[errorLogs.length - 1]);
            expect(logStr).toContain("Path not found");
        });

        it("should NOT log error summary on successful exit", async () => {
            const logEntries: Record<string, unknown>[] = [];
            const spyPipeline: Pipeline = {
                async run(_config: PipelineConfig, logger: Logger<AppLogObj>): Promise<PipelineResult> {
                    logger.attachTransport((logObj: Record<string, unknown>) => {
                        logEntries.push(logObj);
                    });
                    return createMockResult();
                },
            };
            cli = new CLI(spyPipeline);
            const exitCode = await cli.run(["parse", testDir, "--quiet", "--no-config"]);

            expect(exitCode).toBe(ExitCode.SUCCESS);
            const errorLogs = logEntries.filter(l => {
                const meta = l["_meta"] as Record<string, unknown> | undefined;
                return meta?.["logLevelName"] === "ERROR";
            });
            expect(errorLogs.length).toBe(0);
        });
    });
});
