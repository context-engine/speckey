import { beforeEach, describe, expect, it } from "bun:test";
import {
	PipelineEvent,
	type ErrorEventPayload,
	type LogEventPayload,
	type PhaseEventPayload,
	type PipelineEventPayload,
} from "@speckey/event-bus";
import { ErrorSubscriber } from "../src/error-subscriber";

// ─── Helpers ───

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

describe("ErrorSubscriber", () => {
	let subscriber: ErrorSubscriber;

	beforeEach(() => {
		subscriber = new ErrorSubscriber();
	});

	// ─── Feature: ERROR Accumulation (ST.8) ───

	describe("Feature: ERROR Event Accumulation", () => {
		it("should accumulate a single ERROR event as PipelineError", () => {
			const event = makeErrorEvent({
				phase: "discovery",
				path: "/test/missing.md",
				message: "Path does not exist",
				code: "ENOENT",
				userMessage: ["File not found", "Path does not exist"],
			});

			subscriber.handle(event);

			expect(subscriber.errors).toHaveLength(1);
			expect(subscriber.count).toBe(1);

			const error = subscriber.errors[0];
			expect(error.phase).toBe("discovery");
			expect(error.path).toBe("/test/missing.md");
			expect(error.message).toBe("Path does not exist");
			expect(error.code).toBe("ENOENT");
			expect(error.userMessage).toEqual(["File not found", "Path does not exist"]);
		});

		it("should accumulate multiple ERROR events", () => {
			subscriber.handle(makeErrorEvent({ phase: "discovery", path: "/a.md", code: "ENOENT" }));
			subscriber.handle(makeErrorEvent({ phase: "read", path: "/b.md", code: "EACCES" }));
			subscriber.handle(makeErrorEvent({ phase: "parse", path: "/c.md", code: "PARSE_FAILURE" }));

			expect(subscriber.errors).toHaveLength(3);
			expect(subscriber.count).toBe(3);
		});

		it("should preserve field values from ErrorEventPayload", () => {
			const event = makeErrorEvent({
				phase: "build",
				path: "/specs/service.md",
				message: "Invalid FQN format",
				code: "INVALID_FQN",
				userMessage: ["Entity build error in service.md [INVALID_FQN]", "Invalid FQN format"],
			});

			subscriber.handle(event);

			const error = subscriber.errors[0];
			expect(error.phase).toBe("build");
			expect(error.path).toBe("/specs/service.md");
			expect(error.message).toBe("Invalid FQN format");
			expect(error.code).toBe("INVALID_FQN");
			expect(error.userMessage).toEqual([
				"Entity build error in service.md [INVALID_FQN]",
				"Invalid FQN format",
			]);
		});

		it("should preserve order of accumulated errors", () => {
			const phases = ["discovery", "read", "parse", "extract", "build"] as const;
			for (const phase of phases) {
				subscriber.handle(makeErrorEvent({ phase }));
			}

			expect(subscriber.errors).toHaveLength(5);
			for (let i = 0; i < phases.length; i++) {
				expect(subscriber.errors[i].phase).toBe(phases[i]);
			}
		});

		it("should accumulate errors across all 8 pipeline phases", () => {
			const allPhases = [
				"discovery",
				"read",
				"parse",
				"extract",
				"unit_validate",
				"build",
				"integration_validate",
				"write",
			] as const;

			for (const phase of allPhases) {
				subscriber.handle(makeErrorEvent({ phase }));
			}

			expect(subscriber.errors).toHaveLength(8);
			expect(subscriber.count).toBe(8);
			for (let i = 0; i < allPhases.length; i++) {
				expect(subscriber.errors[i].phase).toBe(allPhases[i]);
			}
		});
	});

	// ─── Feature: Non-ERROR Filtering (ST.8) ───

	describe("Feature: Non-ERROR Event Filtering", () => {
		it("should ignore WARN events", () => {
			subscriber.handle(makeLogEvent(PipelineEvent.WARN));

			expect(subscriber.errors).toHaveLength(0);
			expect(subscriber.count).toBe(0);
		});

		it("should ignore INFO events", () => {
			subscriber.handle(makeLogEvent(PipelineEvent.INFO));

			expect(subscriber.errors).toHaveLength(0);
			expect(subscriber.count).toBe(0);
		});

		it("should ignore DEBUG events", () => {
			subscriber.handle(makeLogEvent(PipelineEvent.DEBUG));

			expect(subscriber.errors).toHaveLength(0);
			expect(subscriber.count).toBe(0);
		});

		it("should ignore PHASE_START events", () => {
			subscriber.handle(makePhaseEvent(PipelineEvent.PHASE_START));

			expect(subscriber.errors).toHaveLength(0);
			expect(subscriber.count).toBe(0);
		});

		it("should ignore PHASE_END events", () => {
			subscriber.handle(makePhaseEvent(PipelineEvent.PHASE_END));

			expect(subscriber.errors).toHaveLength(0);
			expect(subscriber.count).toBe(0);
		});

		it("should ignore all non-ERROR event types", () => {
			const nonErrorEvents: PipelineEventPayload[] = [
				makeLogEvent(PipelineEvent.WARN),
				makeLogEvent(PipelineEvent.INFO),
				makeLogEvent(PipelineEvent.DEBUG),
				makePhaseEvent(PipelineEvent.PHASE_START),
				makePhaseEvent(PipelineEvent.PHASE_END),
			];

			for (const event of nonErrorEvents) {
				subscriber.handle(event);
			}

			expect(subscriber.errors).toHaveLength(0);
			expect(subscriber.count).toBe(0);
		});
	});

	// ─── Feature: Mixed Events ───

	describe("Feature: Mixed Event Stream", () => {
		it("should accumulate only ERROR events from a mixed stream", () => {
			subscriber.handle(makePhaseEvent(PipelineEvent.PHASE_START, { phase: "discovery" }));
			subscriber.handle(makeLogEvent(PipelineEvent.INFO, { message: "Starting discovery" }));
			subscriber.handle(makeErrorEvent({ phase: "discovery", code: "ENOENT" }));
			subscriber.handle(makeLogEvent(PipelineEvent.WARN, { message: "Large file skipped" }));
			subscriber.handle(makePhaseEvent(PipelineEvent.PHASE_END, { phase: "discovery" }));
			subscriber.handle(makePhaseEvent(PipelineEvent.PHASE_START, { phase: "read" }));
			subscriber.handle(makeErrorEvent({ phase: "read", code: "EACCES" }));
			subscriber.handle(makeLogEvent(PipelineEvent.DEBUG, { message: "File read complete" }));
			subscriber.handle(makePhaseEvent(PipelineEvent.PHASE_END, { phase: "read" }));

			expect(subscriber.errors).toHaveLength(2);
			expect(subscriber.count).toBe(2);
			expect(subscriber.errors[0].phase).toBe("discovery");
			expect(subscriber.errors[0].code).toBe("ENOENT");
			expect(subscriber.errors[1].phase).toBe("read");
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
			subscriber.handle(makeErrorEvent());
			const ref2 = subscriber.errors;

			// Both should reflect the accumulated state
			expect(ref2).toHaveLength(1);
		});
	});
});
