import { beforeEach, describe, expect, it } from "bun:test";
import {
	LogLevel,
	IoEvent,
	ParserEvent,
	PhaseEvent,
	PipelinePhase,
} from "@speckey/constants";
import {
	type BusPayload,
	type ErrorPayload,
	type LogPayload,
	type PhasePayload,
} from "@speckey/event-bus";
import { ErrorSubscriber } from "../src/error-subscriber";

// ─── Helpers ───

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

function makePhasePayload(
	event: PhaseEvent.PHASE_START | PhaseEvent.PHASE_END = PhaseEvent.PHASE_START,
	overrides: Partial<PhasePayload> = {},
): PhasePayload {
	return {
		event,
		level: LogLevel.INFO,
		phase: PipelinePhase.DISCOVERY,
		timestamp: Date.now(),
		...overrides,
	};
}

// ─── Tests ───

describe("ErrorSubscriber", () => {
	let subscriber: ErrorSubscriber;

	beforeEach(() => {
		subscriber = new ErrorSubscriber();
	});

	// ─── Feature: ERROR Accumulation ───

	describe("Feature: ERROR Payload Accumulation", () => {
		it("should accumulate a single ErrorPayload as PipelineError", () => {
			const payload = makeErrorPayload({
				phase: PipelinePhase.DISCOVERY,
				path: "/test/missing.md",
				message: "Path does not exist",
				code: "ENOENT",
				userMessage: ["File not found", "Path does not exist"],
			});

			subscriber.handle(payload);

			expect(subscriber.errors).toHaveLength(1);
			expect(subscriber.count).toBe(1);

			const error = subscriber.errors[0];
			expect(error.phase).toBe(PipelinePhase.DISCOVERY);
			expect(error.path).toBe("/test/missing.md");
			expect(error.message).toBe("Path does not exist");
			expect(error.code).toBe("ENOENT");
			expect(error.userMessage).toEqual(["File not found", "Path does not exist"]);
		});

		it("should accumulate multiple ErrorPayload payloads", () => {
			subscriber.handle(makeErrorPayload({ phase: PipelinePhase.DISCOVERY, path: "/a.md", code: "ENOENT" }));
			subscriber.handle(makeErrorPayload({ phase: PipelinePhase.READ, path: "/b.md", code: "EACCES" }));
			subscriber.handle(makeErrorPayload({ phase: PipelinePhase.PARSE, path: "/c.md", code: "PARSE_FAILURE" }));

			expect(subscriber.errors).toHaveLength(3);
			expect(subscriber.count).toBe(3);
		});

		it("should preserve field values from ErrorPayload", () => {
			const payload = makeErrorPayload({
				phase: PipelinePhase.BUILD,
				path: "/specs/service.md",
				message: "Invalid FQN format",
				code: "INVALID_FQN",
				userMessage: ["Entity build error in service.md [INVALID_FQN]", "Invalid FQN format"],
			});

			subscriber.handle(payload);

			const error = subscriber.errors[0];
			expect(error.phase).toBe(PipelinePhase.BUILD);
			expect(error.path).toBe("/specs/service.md");
			expect(error.message).toBe("Invalid FQN format");
			expect(error.code).toBe("INVALID_FQN");
			expect(error.userMessage).toEqual([
				"Entity build error in service.md [INVALID_FQN]",
				"Invalid FQN format",
			]);
		});

		it("should preserve order of accumulated errors", () => {
			const phases = [
				PipelinePhase.DISCOVERY,
				PipelinePhase.READ,
				PipelinePhase.PARSE,
				PipelinePhase.EXTRACT,
				PipelinePhase.BUILD,
			] as const;
			for (const phase of phases) {
				subscriber.handle(makeErrorPayload({ phase }));
			}

			expect(subscriber.errors).toHaveLength(5);
			for (let i = 0; i < phases.length; i++) {
				expect(subscriber.errors[i].phase).toBe(phases[i]);
			}
		});

		it("should accumulate errors across all 8 pipeline phases", () => {
			const allPhases = [
				PipelinePhase.DISCOVERY,
				PipelinePhase.READ,
				PipelinePhase.PARSE,
				PipelinePhase.EXTRACT,
				PipelinePhase.UNIT_VALIDATE,
				PipelinePhase.BUILD,
				PipelinePhase.INTEGRATION_VALIDATE,
				PipelinePhase.WRITE,
			] as const;

			for (const phase of allPhases) {
				subscriber.handle(makeErrorPayload({ phase }));
			}

			expect(subscriber.errors).toHaveLength(8);
			expect(subscriber.count).toBe(8);
			for (let i = 0; i < allPhases.length; i++) {
				expect(subscriber.errors[i].phase).toBe(allPhases[i]);
			}
		});

		it("should handle ErrorPayload with different event types", () => {
			subscriber.handle(makeErrorPayload({ event: IoEvent.FILE_DISCOVERY }));
			subscriber.handle(makeErrorPayload({ event: IoEvent.FILE_READ }));
			subscriber.handle(makeErrorPayload({ event: ParserEvent.MERMAID_VALIDATION }));

			expect(subscriber.errors).toHaveLength(3);
			expect(subscriber.count).toBe(3);
		});
	});

	// ─── Feature: Bus-Level Filtering ───

	describe("Feature: Bus-Level Filtering", () => {
		// Note: In the new architecture, ErrorSubscriber registers via
		// bus.onLevel(LogLevel.ERROR) — the bus only delivers ERROR payloads.
		// These tests verify defensive behavior if handle() is called with
		// non-ERROR payloads.

		it("should ignore WARN-level payloads", () => {
			subscriber.handle(makeLogPayload(LogLevel.WARN) as unknown as ErrorPayload);

			expect(subscriber.errors).toHaveLength(0);
			expect(subscriber.count).toBe(0);
		});

		it("should ignore INFO-level payloads", () => {
			subscriber.handle(makeLogPayload(LogLevel.INFO) as unknown as ErrorPayload);

			expect(subscriber.errors).toHaveLength(0);
			expect(subscriber.count).toBe(0);
		});

		it("should ignore DEBUG-level payloads", () => {
			subscriber.handle(makeLogPayload(LogLevel.DEBUG) as unknown as ErrorPayload);

			expect(subscriber.errors).toHaveLength(0);
			expect(subscriber.count).toBe(0);
		});

		it("should ignore PhasePayload payloads", () => {
			subscriber.handle(makePhasePayload(PhaseEvent.PHASE_START) as unknown as ErrorPayload);
			subscriber.handle(makePhasePayload(PhaseEvent.PHASE_END) as unknown as ErrorPayload);

			expect(subscriber.errors).toHaveLength(0);
			expect(subscriber.count).toBe(0);
		});

		it("should ignore all non-ERROR payloads in a mixed stream", () => {
			const nonErrorPayloads: BusPayload[] = [
				makeLogPayload(LogLevel.WARN),
				makeLogPayload(LogLevel.INFO),
				makeLogPayload(LogLevel.DEBUG),
				makePhasePayload(PhaseEvent.PHASE_START),
				makePhasePayload(PhaseEvent.PHASE_END),
			];

			for (const payload of nonErrorPayloads) {
				subscriber.handle(payload as unknown as ErrorPayload);
			}

			expect(subscriber.errors).toHaveLength(0);
			expect(subscriber.count).toBe(0);
		});
	});

	// ─── Feature: Mixed Payload Stream ───

	describe("Feature: Mixed Payload Stream", () => {
		it("should accumulate only ERROR payloads from a mixed stream", () => {
			subscriber.handle(makePhasePayload(PhaseEvent.PHASE_START) as unknown as ErrorPayload);
			subscriber.handle(makeLogPayload(LogLevel.INFO) as unknown as ErrorPayload);
			subscriber.handle(makeErrorPayload({ phase: PipelinePhase.DISCOVERY, code: "ENOENT" }));
			subscriber.handle(makeLogPayload(LogLevel.WARN) as unknown as ErrorPayload);
			subscriber.handle(makePhasePayload(PhaseEvent.PHASE_END) as unknown as ErrorPayload);
			subscriber.handle(makePhasePayload(PhaseEvent.PHASE_START) as unknown as ErrorPayload);
			subscriber.handle(makeErrorPayload({ phase: PipelinePhase.READ, code: "EACCES" }));
			subscriber.handle(makeLogPayload(LogLevel.DEBUG) as unknown as ErrorPayload);
			subscriber.handle(makePhasePayload(PhaseEvent.PHASE_END) as unknown as ErrorPayload);

			expect(subscriber.errors).toHaveLength(2);
			expect(subscriber.count).toBe(2);
			expect(subscriber.errors[0].phase).toBe(PipelinePhase.DISCOVERY);
			expect(subscriber.errors[0].code).toBe("ENOENT");
			expect(subscriber.errors[1].phase).toBe(PipelinePhase.READ);
			expect(subscriber.errors[1].code).toBe("EACCES");
		});
	});

	// ─── Feature: Initial State ───

	describe("Feature: Initial State", () => {
		it("should start with empty errors array", () => {
			expect(subscriber.errors).toHaveLength(0);
		});

		it("should start with count of 0", () => {
			expect(subscriber.count).toBe(0);
		});

		it("should return a consistent errors array reference", () => {
			const ref1 = subscriber.errors;
			subscriber.handle(makeErrorPayload());
			const ref2 = subscriber.errors;

			// Both should reflect the accumulated state
			expect(ref2).toHaveLength(1);
		});
	});
});
