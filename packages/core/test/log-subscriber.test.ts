import { beforeEach, describe, expect, it } from "bun:test";
import { Logger, type AppLogObj } from "@speckey/logger";
import {
	LogLevel,
	IoEvent,
	ParserEvent,
	PhaseEvent,
	GenericEvent,
	PipelinePhase,
} from "@speckey/constants";
import {
	type BusPayload,
	type ErrorPayload,
	type LogPayload,
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

function makeErrorPayload(overrides: Partial<ErrorPayload> = {}): ErrorPayload {
	return {
		event: IoEvent.FILE_DISCOVERY,
		level: LogLevel.ERROR,
		phase: PipelinePhase.DISCOVERY,
		timestamp: Date.now(),
		path: "/some/file.md",
		message: "Path not found",
		code: "ENOENT",
		userMessage: ["File not found", "/some/file.md does not exist"],
		...overrides,
	};
}

function makeLogPayload(
	level: LogLevel.WARN | LogLevel.INFO | LogLevel.DEBUG = LogLevel.INFO,
	overrides: Partial<LogPayload> = {},
): LogPayload {
	return {
		event: IoEvent.FILE_DISCOVERY,
		level,
		phase: PipelinePhase.DISCOVERY,
		timestamp: Date.now(),
		message: `Test ${level} message`,
		...overrides,
	};
}

function makePhaseLogPayload(
	event: PhaseEvent.PHASE_START | PhaseEvent.PHASE_END = PhaseEvent.PHASE_START,
	overrides: Partial<LogPayload> = {},
): LogPayload {
	return {
		event,
		level: LogLevel.INFO,
		phase: PipelinePhase.DISCOVERY,
		timestamp: Date.now(),
		message: `Phase ${event}`,
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

	// ─── Feature: Level-Based Routing ───

	describe("Feature: Level-Based Routing", () => {
		it("should route ERROR-level payloads to logger.warn", () => {
			const payload = makeErrorPayload({
				phase: PipelinePhase.READ,
				message: "Permission denied",
				code: "EACCES",
			});

			subscriber.handle(payload);

			expect(logs.length).toBeGreaterThanOrEqual(1);
			const lastLog = logs[logs.length - 1];
			expect(lastLog?.["_meta"]).toBeDefined();
			const logStr = JSON.stringify(lastLog);
			expect(logStr).toContain("Permission denied");
		});

		it("should route WARN-level payloads to logger.warn", () => {
			const payload = makeLogPayload(LogLevel.WARN, {
				phase: PipelinePhase.DISCOVERY,
				message: "File count exceeds maxFiles",
				context: { count: 15000, max: 10000 },
			});

			subscriber.handle(payload);

			expect(logs.length).toBeGreaterThanOrEqual(1);
			const logStr = JSON.stringify(logs[logs.length - 1]);
			expect(logStr).toContain("File count exceeds maxFiles");
		});

		it("should route INFO-level payloads to logger.info", () => {
			const payload = makeLogPayload(LogLevel.INFO, {
				phase: PipelinePhase.DISCOVERY,
				message: "Discovery complete",
				context: { filesFound: 42 },
			});

			subscriber.handle(payload);

			expect(logs.length).toBeGreaterThanOrEqual(1);
			const logStr = JSON.stringify(logs[logs.length - 1]);
			expect(logStr).toContain("Discovery complete");
		});

		it("should route DEBUG-level payloads to logger.debug", () => {
			const payload = makeLogPayload(LogLevel.DEBUG, {
				phase: PipelinePhase.READ,
				message: "Reading file",
				context: { path: "/some/file.md" },
			});

			subscriber.handle(payload);

			expect(logs.length).toBeGreaterThanOrEqual(1);
			const logStr = JSON.stringify(logs[logs.length - 1]);
			expect(logStr).toContain("Reading file");
		});

		it("should route phase PHASE_START event to logger.info", () => {
			const payload = makePhaseLogPayload(PhaseEvent.PHASE_START, {
				phase: PipelinePhase.PARSE,
			});

			subscriber.handle(payload);

			expect(logs.length).toBeGreaterThanOrEqual(1);
			const logStr = JSON.stringify(logs[logs.length - 1]);
			expect(logStr).toContain("parse");
		});

		it("should route phase PHASE_END event to logger.info", () => {
			const payload = makePhaseLogPayload(PhaseEvent.PHASE_END, {
				phase: PipelinePhase.DISCOVERY,
				context: { filesFound: 10 },
			});

			subscriber.handle(payload);

			expect(logs.length).toBeGreaterThanOrEqual(1);
			const logStr = JSON.stringify(logs[logs.length - 1]);
			expect(logStr).toContain("discovery");
		});
	});

	// ─── Feature: Complete Coverage ───

	describe("Feature: Complete Payload Type Coverage", () => {
		it("should handle all payload types without throwing", () => {
			const payloads: BusPayload[] = [
				makeErrorPayload(),
				makeLogPayload(LogLevel.WARN),
				makeLogPayload(LogLevel.INFO),
				makeLogPayload(LogLevel.DEBUG),
				makePhaseLogPayload(PhaseEvent.PHASE_START),
				makePhaseLogPayload(PhaseEvent.PHASE_END),
			];

			for (const payload of payloads) {
				expect(() => subscriber.handle(payload)).not.toThrow();
			}

			// All 6 payloads should have produced log entries
			expect(logs.length).toBe(6);
		});

		it("should include phase in all log entries", () => {
			subscriber.handle(makeErrorPayload({ phase: PipelinePhase.BUILD }));
			subscriber.handle(makeLogPayload(LogLevel.INFO, { phase: PipelinePhase.PARSE }));
			subscriber.handle(makePhaseLogPayload(PhaseEvent.PHASE_START, { phase: PipelinePhase.WRITE }));

			for (const log of logs) {
				const logStr = JSON.stringify(log);
				expect(
					logStr.includes("build") || logStr.includes("parse") || logStr.includes("write"),
				).toBe(true);
			}
		});

		it("should handle payloads from different event types", () => {
			subscriber.handle(makeErrorPayload({ event: IoEvent.FILE_DISCOVERY }));
			subscriber.handle(makeLogPayload(LogLevel.WARN, { event: IoEvent.FILE_READ }));
			subscriber.handle(makeLogPayload(LogLevel.DEBUG, { event: ParserEvent.MERMAID_VALIDATION }));
			subscriber.handle(makeLogPayload(LogLevel.DEBUG, { event: GenericEvent.LOG }));

			expect(logs.length).toBe(4);
		});
	});

	// ─── Feature: Context Forwarding ───

	describe("Feature: Context Forwarding", () => {
		it("should forward ErrorPayload fields as context", () => {
			const payload = makeErrorPayload({
				path: "/test/spec.md",
				code: "PARSE_FAILURE",
				message: "Unexpected token",
			});

			subscriber.handle(payload);

			const logStr = JSON.stringify(logs[logs.length - 1]);
			expect(logStr).toContain("PARSE_FAILURE");
			expect(logStr).toContain("/test/spec.md");
		});

		it("should forward LogPayload context", () => {
			const payload = makeLogPayload(LogLevel.INFO, {
				message: "Files processed",
				context: { count: 5, skipped: 2 },
			});

			subscriber.handle(payload);

			const logStr = JSON.stringify(logs[logs.length - 1]);
			expect(logStr).toContain("Files processed");
		});

		it("should forward phase event context", () => {
			const payload = makePhaseLogPayload(PhaseEvent.PHASE_END, {
				phase: PipelinePhase.DISCOVERY,
				context: { filesFound: 42, errorsCount: 1 },
			});

			subscriber.handle(payload);

			const logStr = JSON.stringify(logs[logs.length - 1]);
			expect(logStr).toContain("42");
		});
	});
});
