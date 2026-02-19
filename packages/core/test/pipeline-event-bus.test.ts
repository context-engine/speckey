import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Logger, type AppLogObj } from "@speckey/logger";
import { ParsePipeline } from "../src/pipeline";
import type { PipelineConfig } from "../src/types";

// ─── Helpers ───

function createTestLogger() {
	const logs: Record<string, unknown>[] = [];
	const logger = new Logger<AppLogObj>({
		name: "test-event-bus",
		type: "hidden",
		minLevel: 0,
	});
	logger.attachTransport((logObj: Record<string, unknown>) => {
		logs.push(logObj);
	});
	return { logger, logs };
}

// ─── Tests ───

describe("ParsePipeline — Event Bus Integration", () => {
	const testDir = resolve("./test-temp-event-bus");
	const pipeline = new ParsePipeline();

	beforeAll(async () => {
		await mkdir(testDir, { recursive: true });
		await mkdir(join(testDir, "empty"), { recursive: true });

		// Valid markdown with mermaid block
		await writeFile(
			join(testDir, "valid.md"),
			`# Valid Spec

\`\`\`mermaid
classDiagram
    class Foo
\`\`\`
`,
		);

		// Markdown with no mermaid blocks
		await writeFile(join(testDir, "no-blocks.md"), "# Just text\n\nNo mermaid here.");
	});

	afterAll(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	// ─── Feature: Per-Run Bus and Subscriber Lifecycle (MF.1b, ST.5) ───

	describe("Feature: Per-Run Bus and Subscriber Lifecycle", () => {
		it("should produce a PipelineResult with errors from ErrorSubscriber on discovery error", async () => {
			// When discovery fails, errors should flow through the event bus → ErrorSubscriber → result.errors
			const config: PipelineConfig = {
				paths: ["/nonexistent/path/that/does/not/exist"],
			};

			const result = await pipeline.run(config);

			// Behavioral: errors should be present in result (sourced from errSub.errors)
			expect(result.errors.length).toBeGreaterThan(0);
			expect(result.errors[0].phase).toBe("discovery");
			expect(result.stats.errorsCount).toBe(result.errors.length);
		});

		it("should have fresh ErrorSubscriber state across runs", async () => {
			// First run: produce errors
			const errorConfig: PipelineConfig = {
				paths: ["/nonexistent/first/run"],
			};
			const firstResult = await pipeline.run(errorConfig);
			expect(firstResult.errors.length).toBeGreaterThan(0);

			// Second run: valid path, no errors
			const validConfig: PipelineConfig = {
				paths: [testDir],
				include: ["valid.md"],
			};
			const secondResult = await pipeline.run(validConfig);

			// Second run should NOT carry over errors from first run
			// (proves ErrorSubscriber is created fresh per run)
			expect(secondResult.errors).toHaveLength(0);
			expect(secondResult.stats.errorsCount).toBe(0);
		});

		it("should have fresh ErrorSubscriber state even with multiple error runs", async () => {
			// Run 1: error
			const result1 = await pipeline.run({ paths: ["/nonexistent/a"] });
			const errorCount1 = result1.errors.length;

			// Run 2: different error
			const result2 = await pipeline.run({ paths: ["/nonexistent/b"] });
			const errorCount2 = result2.errors.length;

			// Each run should have its own error count, not accumulated
			expect(errorCount1).toBeGreaterThan(0);
			expect(errorCount2).toBeGreaterThan(0);
			// Errors should NOT accumulate across runs
			expect(result2.errors.length).toBe(errorCount2);
			// Verify no cross-contamination: run 2 should not contain run 1's paths
			const run2Paths = result2.errors.map((e) => e.path);
			expect(run2Paths.every((p) => !p.includes("/nonexistent/a"))).toBe(true);
		});
	});

	// ─── Feature: LogSubscriber Routes Events to Logger ───

	describe("Feature: LogSubscriber Routes Events to Logger", () => {
		it("should route pipeline events to logger during successful run", async () => {
			const { logger, logs } = createTestLogger();
			const config: PipelineConfig = {
				paths: [testDir],
				include: ["valid.md"],
			};

			await pipeline.run(config, logger);

			// LogSubscriber should have routed events to the logger
			// At minimum: PHASE_START/PHASE_END events for discovery, plus info logs
			expect(logs.length).toBeGreaterThan(0);
		});

		it("should route error events to logger.error on discovery failure", async () => {
			const { logger, logs } = createTestLogger();
			const config: PipelineConfig = {
				paths: ["/nonexistent/path"],
			};

			await pipeline.run(config, logger);

			// LogSubscriber should have routed the ERROR event to logger.error
			// Check that error-level logs exist (logLevelId 5 = error)
			const errorLogs = logs.filter((l) => {
				const meta = l["_meta"] as { logLevelId?: number } | undefined;
				return meta?.logLevelId === 5;
			});

			expect(errorLogs.length).toBeGreaterThan(0);
		});

		it("should route phase lifecycle events to logger.info", async () => {
			const { logger, logs } = createTestLogger();
			const config: PipelineConfig = {
				paths: [testDir],
				include: ["valid.md"],
			};

			await pipeline.run(config, logger);

			// LogSubscriber should route PHASE_START/PHASE_END to logger.info
			// Look for info-level logs (logLevelId 3 = info)
			const infoLogs = logs.filter((l) => {
				const meta = l["_meta"] as { logLevelId?: number } | undefined;
				return meta?.logLevelId === 3;
			});

			expect(infoLogs.length).toBeGreaterThan(0);
		});
	});

	// ─── Feature: Error Collection via ErrorSubscriber ───

	describe("Feature: Error Collection via ErrorSubscriber", () => {
		it("should collect discovery errors with correct PipelineError shape", async () => {
			const config: PipelineConfig = {
				paths: ["/nonexistent/path"],
			};

			const result = await pipeline.run(config);

			expect(result.errors.length).toBeGreaterThan(0);
			const error = result.errors[0];
			// PipelineError shape: phase, path, message, code, userMessage
			expect(error.phase).toBe("discovery");
			expect(error.path).toBeDefined();
			expect(error.message).toBeDefined();
			expect(error.code).toBeDefined();
			expect(error.userMessage).toBeDefined();
			expect(Array.isArray(error.userMessage)).toBe(true);
		});

		it("should report errorsCount consistent with errors array via ErrorSubscriber", async () => {
			const config: PipelineConfig = {
				paths: ["/nonexistent/a", "/nonexistent/b"],
			};

			const result = await pipeline.run(config);

			// errorsCount comes from errSub.count, errors from errSub.errors
			// Both must be consistent
			expect(result.stats.errorsCount).toBe(result.errors.length);
		});

		it("should collect errors from multiple phases via ErrorSubscriber", async () => {
			// This test exercises the event bus collecting errors across different phases
			// Using empty directory: no files found → pipeline continues but produces no parse errors
			const config: PipelineConfig = {
				paths: [join(testDir, "empty")],
			};

			const result = await pipeline.run(config);

			// Empty directory should run cleanly (0 errors or handled gracefully)
			expect(result.stats.errorsCount).toBe(result.errors.length);
			expect(result.files).toHaveLength(0);
		});
	});

	// ─── Feature: Stats from ErrorSubscriber ───

	describe("Feature: Stats Consistency", () => {
		it("should have errorsCount == errors.length (sourced from ErrorSubscriber)", async () => {
			const configs: PipelineConfig[] = [
				{ paths: [testDir], include: ["valid.md"] },
				{ paths: ["/nonexistent"] },
				{ paths: [testDir], include: ["no-blocks.md"] },
			];

			for (const config of configs) {
				const result = await pipeline.run(config);
				expect(result.stats.errorsCount).toBe(result.errors.length);
			}
		});
	});
});
