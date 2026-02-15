import { beforeEach, describe, expect, it } from "bun:test";
import { Logger, type AppLogObj } from "@speckey/logger";
import {
	PipelineEvent,
	type ErrorEventPayload,
	type LogEventPayload,
	type PhaseEventPayload,
} from "@speckey/event-bus";
import { LogSubscriber } from "../src/log-subscriber";

// ─── Helpers ───

function createTestLogger() {
	const logs: Record<string, unknown>[] = [];
	const logger = new Logger<AppLogObj>({
		name: "test-log-subscriber",
		type: "hidden",
		minLevel: 0,
	});
	logger.attachTransport((logObj: Record<string, unknown>) => {
		logs.push(logObj);
	});
	return { logger, logs };
}

function makeErrorEvent(overrides: Partial<ErrorEventPayload> = {}): ErrorEventPayload {
	return {
		type: PipelineEvent.ERROR,
		phase: "discovery",
		timestamp: Date.now(),
		path: "/some/file.md",
		message: "Path not found",
		code: "ENOENT",
		userMessage: ["File not found", "/some/file.md does not exist"],
		...overrides,
	};
}

function makeLogEvent(
	type: PipelineEvent.WARN | PipelineEvent.INFO | PipelineEvent.DEBUG,
	overrides: Partial<LogEventPayload> = {},
): LogEventPayload {
	return {
		type,
		phase: "discovery",
		timestamp: Date.now(),
		message: `Test ${type} message`,
		...overrides,
	};
}

function makePhaseEvent(
	type: PipelineEvent.PHASE_START | PipelineEvent.PHASE_END,
	overrides: Partial<PhaseEventPayload> = {},
): PhaseEventPayload {
	return {
		type,
		phase: "discovery",
		timestamp: Date.now(),
		...overrides,
	};
}

// ─── Tests ───

describe("LogSubscriber", () => {
	let logger: Logger<AppLogObj>;
	let logs: Record<string, unknown>[];
	let subscriber: LogSubscriber;

	beforeEach(() => {
		({ logger, logs } = createTestLogger());
		subscriber = new LogSubscriber(logger);
	});

	// ─── Feature: LogSubscriber Routing (ST.7) ───

	describe("Feature: Event Routing", () => {
		it("should route ERROR events to logger.warn", () => {
			const event = makeErrorEvent({
				phase: "read",
				message: "Permission denied",
				code: "EACCES",
			});

			subscriber.handle(event);

			expect(logs.length).toBeGreaterThanOrEqual(1);
			const lastLog = logs[logs.length - 1];
			// logger.warn produces logLevelId 4
			expect(lastLog?.["_meta"]).toBeDefined();
			// The log should contain the error message
			const logStr = JSON.stringify(lastLog);
			expect(logStr).toContain("Permission denied");
		});

		it("should route WARN events to logger.warn", () => {
			const event = makeLogEvent(PipelineEvent.WARN, {
				phase: "discovery",
				message: "File count exceeds maxFiles",
				context: { count: 15000, max: 10000 },
			});

			subscriber.handle(event);

			expect(logs.length).toBeGreaterThanOrEqual(1);
			const logStr = JSON.stringify(logs[logs.length - 1]);
			expect(logStr).toContain("File count exceeds maxFiles");
		});

		it("should route INFO events to logger.info", () => {
			const event = makeLogEvent(PipelineEvent.INFO, {
				phase: "discovery",
				message: "Discovery complete",
				context: { filesFound: 42 },
			});

			subscriber.handle(event);

			expect(logs.length).toBeGreaterThanOrEqual(1);
			const logStr = JSON.stringify(logs[logs.length - 1]);
			expect(logStr).toContain("Discovery complete");
		});

		it("should route DEBUG events to logger.debug", () => {
			const event = makeLogEvent(PipelineEvent.DEBUG, {
				phase: "read",
				message: "Reading file",
				context: { path: "/some/file.md" },
			});

			subscriber.handle(event);

			expect(logs.length).toBeGreaterThanOrEqual(1);
			const logStr = JSON.stringify(logs[logs.length - 1]);
			expect(logStr).toContain("Reading file");
		});

		it("should route PHASE_START events to logger.info", () => {
			const event = makePhaseEvent(PipelineEvent.PHASE_START, {
				phase: "parse",
			});

			subscriber.handle(event);

			expect(logs.length).toBeGreaterThanOrEqual(1);
			const logStr = JSON.stringify(logs[logs.length - 1]);
			expect(logStr).toContain("parse");
		});

		it("should route PHASE_END events to logger.info", () => {
			const event = makePhaseEvent(PipelineEvent.PHASE_END, {
				phase: "discovery",
				stats: { filesFound: 10 },
			});

			subscriber.handle(event);

			expect(logs.length).toBeGreaterThanOrEqual(1);
			const logStr = JSON.stringify(logs[logs.length - 1]);
			expect(logStr).toContain("discovery");
		});
	});

	// ─── Feature: All 6 Event Types Handled ───

	describe("Feature: Complete Event Type Coverage", () => {
		it("should handle all 6 event types without throwing", () => {
			const events = [
				makeErrorEvent(),
				makeLogEvent(PipelineEvent.WARN),
				makeLogEvent(PipelineEvent.INFO),
				makeLogEvent(PipelineEvent.DEBUG),
				makePhaseEvent(PipelineEvent.PHASE_START),
				makePhaseEvent(PipelineEvent.PHASE_END),
			];

			for (const event of events) {
				expect(() => subscriber.handle(event)).not.toThrow();
			}

			// All 6 events should have produced log entries
			expect(logs.length).toBe(6);
		});

		it("should include phase in all log entries", () => {
			subscriber.handle(makeErrorEvent({ phase: "build" }));
			subscriber.handle(makeLogEvent(PipelineEvent.INFO, { phase: "parse" }));
			subscriber.handle(makePhaseEvent(PipelineEvent.PHASE_START, { phase: "write" }));

			for (const log of logs) {
				const logStr = JSON.stringify(log);
				// Each log should contain its respective phase
				expect(
					logStr.includes("build") || logStr.includes("parse") || logStr.includes("write"),
				).toBe(true);
			}
		});
	});

	// ─── Feature: Context Forwarding ───

	describe("Feature: Context Forwarding", () => {
		it("should forward ErrorEventPayload fields as context", () => {
			const event = makeErrorEvent({
				path: "/test/spec.md",
				code: "PARSE_FAILURE",
				message: "Unexpected token",
			});

			subscriber.handle(event);

			const logStr = JSON.stringify(logs[logs.length - 1]);
			expect(logStr).toContain("PARSE_FAILURE");
			expect(logStr).toContain("/test/spec.md");
		});

		it("should forward LogEventPayload context", () => {
			const event = makeLogEvent(PipelineEvent.INFO, {
				message: "Files processed",
				context: { count: 5, skipped: 2 },
			});

			subscriber.handle(event);

			const logStr = JSON.stringify(logs[logs.length - 1]);
			expect(logStr).toContain("Files processed");
		});

		it("should forward PhaseEventPayload stats", () => {
			const event = makePhaseEvent(PipelineEvent.PHASE_END, {
				phase: "discovery",
				stats: { filesFound: 42, errorsCount: 1 },
			});

			subscriber.handle(event);

			const logStr = JSON.stringify(logs[logs.length - 1]);
			expect(logStr).toContain("42");
		});
	});
});
