import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { ParsePipeline, type Pipeline, type PipelineConfig, type PipelineResult } from "../../packages/core/src";
import type { Logger, AppLogObj } from "@speckey/logger";
import { CLI, ExitCode } from "../../apps/cli/src";

const FIXTURES = resolve(import.meta.dir, "../fixtures/e2e");

function fixture(...segments: string[]): string {
    return resolve(FIXTURES, ...segments);
}

// ============================================================
// Spy Pipeline — wraps real ParsePipeline, captures logger
// ============================================================

function createSpyPipeline(): {
    pipeline: Pipeline;
    real: ParsePipeline;
    getLogger: () => Logger<AppLogObj> | undefined;
    getConfig: () => PipelineConfig | undefined;
} {
    const real = new ParsePipeline();
    let capturedLogger: Logger<AppLogObj> | undefined;
    let capturedConfig: PipelineConfig | undefined;

    const pipeline: Pipeline = {
        async run(config: PipelineConfig, logger: Logger<AppLogObj>): Promise<PipelineResult> {
            capturedLogger = logger;
            capturedConfig = config;
            return real.run(config, logger);
        },
    };

    return {
        pipeline,
        real,
        getLogger: () => capturedLogger,
        getConfig: () => capturedConfig,
    };
}

// ============================================================
// Feature: Logger Injection — Mode Selection
// ============================================================

describe("CLI ↔ Pipeline Integration", () => {
    describe("Logger Injection — Mode Selection", () => {
        it("should pass a logger to pipeline on default mode", async () => {
            const spy = createSpyPipeline();
            const cli = new CLI(spy.pipeline);

            await cli.run(["parse", fixture("single-file"), "--no-config"]);

            const logger = spy.getLogger();
            expect(logger).toBeDefined();
            // Default mode → pretty logger at info level (minLevel=3)
            expect(logger!.settings.type).toBe("pretty");
            expect(logger!.settings.minLevel).toBe(3);
        });

        it("should pass a verbose logger (debug level) with --verbose", async () => {
            const spy = createSpyPipeline();
            const cli = new CLI(spy.pipeline);

            await cli.run(["parse", fixture("single-file"), "--verbose", "--no-config"]);

            const logger = spy.getLogger();
            expect(logger).toBeDefined();
            expect(logger!.settings.type).toBe("pretty");
            expect(logger!.settings.minLevel).toBe(2);
        });

        it("should pass a quiet logger (error level) with --quiet", async () => {
            const spy = createSpyPipeline();
            const cli = new CLI(spy.pipeline);

            await cli.run(["parse", fixture("single-file"), "--quiet", "--no-config"]);

            const logger = spy.getLogger();
            expect(logger).toBeDefined();
            expect(logger!.settings.type).toBe("pretty");
            expect(logger!.settings.minLevel).toBe(5);
        });

        it("should pass a JSON logger (debug level) with --json", async () => {
            const spy = createSpyPipeline();
            const cli = new CLI(spy.pipeline);

            await cli.run(["parse", fixture("single-file"), "--json", "--no-config"]);

            const logger = spy.getLogger();
            expect(logger).toBeDefined();
            expect(logger!.settings.type).toBe("json");
            expect(logger!.settings.minLevel).toBe(2);
        });

        it("should not call pipeline when --verbose + --quiet conflict", async () => {
            const spy = createSpyPipeline();
            const cli = new CLI(spy.pipeline);

            const exitCode = await cli.run(["parse", fixture("single-file"), "--verbose", "--quiet", "--no-config"]);

            expect(exitCode).toBe(ExitCode.CONFIG_ERROR);
            expect(spy.getLogger()).toBeUndefined();
        });
    });

    // ============================================================
    // Feature: Logger Injection — Child Logger Creation
    // ============================================================

    describe("Logger Injection — Child Logger Creation", () => {
        it("should create child loggers that inherit parent settings", async () => {
            const spy = createSpyPipeline();
            const cli = new CLI(spy.pipeline);

            await cli.run(["parse", fixture("single-file"), "--quiet", "--no-config"]);

            const logger = spy.getLogger();
            expect(logger).toBeDefined();

            // Verify child loggers can be created (same API pipeline uses)
            const childLogger = logger!.getSubLogger({ name: "test-child" });
            expect(childLogger).toBeDefined();
            expect(childLogger.settings.minLevel).toBe(logger!.settings.minLevel);
        });
    });

    // ============================================================
    // Feature: Exit Code — Success Cases
    // ============================================================

    describe("Exit Code — Success Cases", () => {
        it("should return SUCCESS (0) for parse with valid files", async () => {
            const spy = createSpyPipeline();
            const cli = new CLI(spy.pipeline);

            const exitCode = await cli.run(["parse", fixture("single-file"), "--quiet", "--no-config"]);

            expect(exitCode).toBe(ExitCode.SUCCESS);
        });

        it("should return SUCCESS (0) for validate with resolved references", async () => {
            const spy = createSpyPipeline();
            const cli = new CLI(spy.pipeline);

            const exitCode = await cli.run(["validate", fixture("single-file"), "--quiet", "--no-config"]);

            expect(exitCode).toBe(ExitCode.SUCCESS);
        });
    });

    // ============================================================
    // Feature: Exit Code — Parse Error Cases (exit 1)
    // ============================================================

    describe("Exit Code — Parse Error Cases", () => {
        it("should return PARSE_ERROR (1) when no files discovered (empty dir)", async () => {
            const spy = createSpyPipeline();
            const cli = new CLI(spy.pipeline);

            const exitCode = await cli.run(["parse", fixture("empty-dir"), "--quiet", "--no-config"]);

            expect(exitCode).toBe(ExitCode.PARSE_ERROR);
        });

        it("should return PARSE_ERROR (1) for non-existent path", async () => {
            const spy = createSpyPipeline();
            const cli = new CLI(spy.pipeline);

            const exitCode = await cli.run(["parse", fixture("nonexistent-path"), "--quiet", "--no-config"]);

            expect(exitCode).toBe(ExitCode.PARSE_ERROR);
        });

        it("should return PARSE_ERROR (1) for validate with unresolved references", async () => {
            const spy = createSpyPipeline();
            const cli = new CLI(spy.pipeline);

            const exitCode = await cli.run(["validate", fixture("validation-failure"), "--quiet", "--no-config"]);

            expect(exitCode).toBe(ExitCode.PARSE_ERROR);
        });
    });

    // ============================================================
    // Feature: Exit Code — Config Error Cases (exit 2)
    // ============================================================

    describe("Exit Code — Config Error Cases", () => {
        it("should return CONFIG_ERROR (2) for missing subcommand", async () => {
            const spy = createSpyPipeline();
            const cli = new CLI(spy.pipeline);

            const exitCode = await cli.run([]);

            expect(exitCode).toBe(ExitCode.CONFIG_ERROR);
            // Pipeline should never be called
            expect(spy.getLogger()).toBeUndefined();
        });

        it("should return CONFIG_ERROR (2) for sync without --db-path", async () => {
            const spy = createSpyPipeline();
            const cli = new CLI(spy.pipeline);

            const exitCode = await cli.run(["sync", fixture("single-file"), "--quiet", "--no-config"]);

            expect(exitCode).toBe(ExitCode.CONFIG_ERROR);
            // Pipeline should never be called — config error before pipeline.run()
            expect(spy.getLogger()).toBeUndefined();
        });

        it("should return CONFIG_ERROR (2) for --verbose + --quiet conflict", async () => {
            const spy = createSpyPipeline();
            const cli = new CLI(spy.pipeline);

            const exitCode = await cli.run(["parse", fixture("single-file"), "--verbose", "--quiet", "--no-config"]);

            expect(exitCode).toBe(ExitCode.CONFIG_ERROR);
            expect(spy.getLogger()).toBeUndefined();
        });
    });

    // ============================================================
    // Feature: Config Forwarding
    // ============================================================

    describe("Config Forwarding", () => {
        it("should pass skipValidation=true for parse command", async () => {
            const spy = createSpyPipeline();
            const cli = new CLI(spy.pipeline);

            await cli.run(["parse", fixture("single-file"), "--quiet", "--no-config"]);

            const config = spy.getConfig();
            expect(config).toBeDefined();
            expect(config!.skipValidation).toBe(true);
        });

        it("should pass skipValidation=false for validate command", async () => {
            const spy = createSpyPipeline();
            const cli = new CLI(spy.pipeline);

            await cli.run(["validate", fixture("single-file"), "--quiet", "--no-config"]);

            const config = spy.getConfig();
            expect(config).toBeDefined();
            expect(config!.skipValidation).toBe(false);
        });

        it("should pass paths from CLI args to pipeline config", async () => {
            const spy = createSpyPipeline();
            const cli = new CLI(spy.pipeline);

            const path = fixture("single-file");
            await cli.run(["parse", path, "--quiet", "--no-config"]);

            const config = spy.getConfig();
            expect(config).toBeDefined();
            expect(config!.paths).toEqual([path]);
        });
    });
});
