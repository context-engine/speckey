import { beforeEach, describe, expect, it } from "bun:test";
import {
	PipelineEvent,
	type ErrorEventPayload,
	type EventHandler,
	type LogEventPayload,
	type PhaseEventPayload,
	type PipelineEventPayload,
} from "../src/types";
import { PipelineEventBus } from "../src/pipeline-event-bus";

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

describe("PipelineEventBus", () => {
	let bus: PipelineEventBus;

	beforeEach(() => {
		bus = new PipelineEventBus();
	});

	// ─── Feature: Handler Registration (on) ───

	describe("Feature: Handler Registration", () => {
		it("should call registered handler when matching event is emitted", () => {
			const received: PipelineEventPayload[] = [];
			const handler: EventHandler = (event) => received.push(event);

			bus.on(PipelineEvent.ERROR, handler);
			bus.emit(makeErrorEvent());

			expect(received).toHaveLength(1);
		});

		it("should call multiple handlers registered for the same event type", () => {
			const receivedA: PipelineEventPayload[] = [];
			const receivedB: PipelineEventPayload[] = [];
			const handlerA: EventHandler = (event) => receivedA.push(event);
			const handlerB: EventHandler = (event) => receivedB.push(event);

			bus.on(PipelineEvent.ERROR, handlerA);
			bus.on(PipelineEvent.ERROR, handlerB);
			bus.emit(makeErrorEvent());

			expect(receivedA).toHaveLength(1);
			expect(receivedB).toHaveLength(1);
		});

		it("should call handler once per matching event type when registered for multiple types", () => {
			const received: PipelineEventPayload[] = [];
			const handler: EventHandler = (event) => received.push(event);

			bus.on(PipelineEvent.ERROR, handler);
			bus.on(PipelineEvent.WARN, handler);

			bus.emit(makeErrorEvent());
			bus.emit(makeLogEvent(PipelineEvent.WARN));

			expect(received).toHaveLength(2);
			expect(received[0].type).toBe(PipelineEvent.ERROR);
			expect(received[1].type).toBe(PipelineEvent.WARN);
		});

		it("should call handler twice per emit when registered twice for the same type", () => {
			const received: PipelineEventPayload[] = [];
			const handler: EventHandler = (event) => received.push(event);

			bus.on(PipelineEvent.ERROR, handler);
			bus.on(PipelineEvent.ERROR, handler);
			bus.emit(makeErrorEvent());

			expect(received).toHaveLength(2);
		});
	});

	// ─── Feature: Handler Unregistration (off) ───

	describe("Feature: Handler Unregistration", () => {
		it("should not call handler after it is unregistered", () => {
			const received: PipelineEventPayload[] = [];
			const handler: EventHandler = (event) => received.push(event);

			bus.on(PipelineEvent.ERROR, handler);
			bus.off(PipelineEvent.ERROR, handler);
			bus.emit(makeErrorEvent());

			expect(received).toHaveLength(0);
		});

		it("should not throw when unregistering a handler that was never registered", () => {
			const handler: EventHandler = () => {};

			expect(() => bus.off(PipelineEvent.ERROR, handler)).not.toThrow();
		});

		it("should only remove the specified handler, leaving others intact", () => {
			const receivedA: PipelineEventPayload[] = [];
			const receivedB: PipelineEventPayload[] = [];
			const handlerA: EventHandler = (event) => receivedA.push(event);
			const handlerB: EventHandler = (event) => receivedB.push(event);

			bus.on(PipelineEvent.ERROR, handlerA);
			bus.on(PipelineEvent.ERROR, handlerB);
			bus.off(PipelineEvent.ERROR, handlerA);
			bus.emit(makeErrorEvent());

			expect(receivedA).toHaveLength(0);
			expect(receivedB).toHaveLength(1);
		});
	});

	// ─── Feature: Event Emission & Routing ───

	describe("Feature: Event Emission & Routing", () => {
		it("should route events only to handlers registered for that event type", () => {
			const errorReceived: PipelineEventPayload[] = [];
			const warnReceived: PipelineEventPayload[] = [];
			const errorHandler: EventHandler = (event) => errorReceived.push(event);
			const warnHandler: EventHandler = (event) => warnReceived.push(event);

			bus.on(PipelineEvent.ERROR, errorHandler);
			bus.on(PipelineEvent.WARN, warnHandler);
			bus.emit(makeErrorEvent());

			expect(errorReceived).toHaveLength(1);
			expect(warnReceived).toHaveLength(0);
		});

		it("should not throw when emitting with no registered handlers", () => {
			expect(() => bus.emit(makeErrorEvent())).not.toThrow();
		});

		it("should route each event type independently", () => {
			const received: Record<string, PipelineEventPayload[]> = {
				ERROR: [],
				WARN: [],
				INFO: [],
				DEBUG: [],
				PHASE_START: [],
				PHASE_END: [],
			};

			bus.on(PipelineEvent.ERROR, (e) => received.ERROR.push(e));
			bus.on(PipelineEvent.WARN, (e) => received.WARN.push(e));
			bus.on(PipelineEvent.INFO, (e) => received.INFO.push(e));
			bus.on(PipelineEvent.DEBUG, (e) => received.DEBUG.push(e));
			bus.on(PipelineEvent.PHASE_START, (e) => received.PHASE_START.push(e));
			bus.on(PipelineEvent.PHASE_END, (e) => received.PHASE_END.push(e));

			bus.emit(makeLogEvent(PipelineEvent.INFO));

			expect(received.INFO).toHaveLength(1);
			expect(received.ERROR).toHaveLength(0);
			expect(received.WARN).toHaveLength(0);
			expect(received.DEBUG).toHaveLength(0);
			expect(received.PHASE_START).toHaveLength(0);
			expect(received.PHASE_END).toHaveLength(0);
		});

		it("should route all six event types correctly", () => {
			const received: PipelineEventPayload[] = [];
			const handler: EventHandler = (event) => received.push(event);

			bus.on(PipelineEvent.ERROR, handler);
			bus.on(PipelineEvent.WARN, handler);
			bus.on(PipelineEvent.INFO, handler);
			bus.on(PipelineEvent.DEBUG, handler);
			bus.on(PipelineEvent.PHASE_START, handler);
			bus.on(PipelineEvent.PHASE_END, handler);

			bus.emit(makeErrorEvent());
			bus.emit(makeLogEvent(PipelineEvent.WARN));
			bus.emit(makeLogEvent(PipelineEvent.INFO));
			bus.emit(makeLogEvent(PipelineEvent.DEBUG));
			bus.emit(makePhaseEvent(PipelineEvent.PHASE_START));
			bus.emit(makePhaseEvent(PipelineEvent.PHASE_END));

			expect(received).toHaveLength(6);
			expect(received[0].type).toBe(PipelineEvent.ERROR);
			expect(received[1].type).toBe(PipelineEvent.WARN);
			expect(received[2].type).toBe(PipelineEvent.INFO);
			expect(received[3].type).toBe(PipelineEvent.DEBUG);
			expect(received[4].type).toBe(PipelineEvent.PHASE_START);
			expect(received[5].type).toBe(PipelineEvent.PHASE_END);
		});

		it("should call handler for each emission", () => {
			const received: PipelineEventPayload[] = [];
			const handler: EventHandler = (event) => received.push(event);

			bus.on(PipelineEvent.ERROR, handler);
			bus.emit(makeErrorEvent({ code: "E001" }));
			bus.emit(makeErrorEvent({ code: "E002" }));
			bus.emit(makeErrorEvent({ code: "E003" }));

			expect(received).toHaveLength(3);
			expect((received[0] as ErrorEventPayload).code).toBe("E001");
			expect((received[1] as ErrorEventPayload).code).toBe("E002");
			expect((received[2] as ErrorEventPayload).code).toBe("E003");
		});
	});

	// ─── Feature: Delivery Guarantees ───

	describe("Feature: Delivery Guarantees", () => {
		it("should deliver events synchronously", () => {
			let flag = false;
			const handler: EventHandler = () => {
				flag = true;
			};

			bus.on(PipelineEvent.ERROR, handler);
			bus.emit(makeErrorEvent());

			// Flag should be set immediately after emit() returns
			expect(flag).toBe(true);
		});

		it("should call handlers in registration order", () => {
			const callOrder: string[] = [];

			bus.on(PipelineEvent.ERROR, () => callOrder.push("A"));
			bus.on(PipelineEvent.ERROR, () => callOrder.push("B"));
			bus.on(PipelineEvent.ERROR, () => callOrder.push("C"));

			bus.emit(makeErrorEvent());

			expect(callOrder).toEqual(["A", "B", "C"]);
		});

		it("should deliver events in emission order", () => {
			const received: PipelineEventPayload[] = [];
			const handler: EventHandler = (event) => received.push(event);

			bus.on(PipelineEvent.ERROR, handler);

			const event1 = makeErrorEvent({ code: "E001" });
			const event2 = makeErrorEvent({ code: "E002" });

			bus.emit(event1);
			bus.emit(event2);

			expect(received).toHaveLength(2);
			expect((received[0] as ErrorEventPayload).code).toBe("E001");
			expect((received[1] as ErrorEventPayload).code).toBe("E002");
		});
	});

	// ─── Feature: Payload Integrity ───

	describe("Feature: Payload Integrity", () => {
		it("should deliver ErrorEventPayload unchanged (same object reference)", () => {
			let received: PipelineEventPayload | undefined;
			const handler: EventHandler = (event) => {
				received = event;
			};

			bus.on(PipelineEvent.ERROR, handler);

			const event = makeErrorEvent({
				phase: "discovery",
				path: "/bad",
				message: "Not found",
				code: "ENOENT",
				userMessage: ["File not found"],
			});

			bus.emit(event);

			expect(received).toBe(event); // Same object reference
			const err = received as ErrorEventPayload;
			expect(err.type).toBe(PipelineEvent.ERROR);
			expect(err.phase).toBe("discovery");
			expect(err.path).toBe("/bad");
			expect(err.message).toBe("Not found");
			expect(err.code).toBe("ENOENT");
			expect(err.userMessage).toEqual(["File not found"]);
		});

		it("should deliver LogEventPayload unchanged (same object reference)", () => {
			let received: PipelineEventPayload | undefined;
			const handler: EventHandler = (event) => {
				received = event;
			};

			bus.on(PipelineEvent.DEBUG, handler);

			const event = makeLogEvent(PipelineEvent.DEBUG, {
				phase: "discovery",
				message: "Scanning",
				context: { dir: "/src" },
			});

			bus.emit(event);

			expect(received).toBe(event);
			const log = received as LogEventPayload;
			expect(log.type).toBe(PipelineEvent.DEBUG);
			expect(log.phase).toBe("discovery");
			expect(log.message).toBe("Scanning");
			expect(log.context).toEqual({ dir: "/src" });
		});

		it("should deliver PhaseEventPayload unchanged (same object reference)", () => {
			let received: PipelineEventPayload | undefined;
			const handler: EventHandler = (event) => {
				received = event;
			};

			bus.on(PipelineEvent.PHASE_END, handler);

			const event = makePhaseEvent(PipelineEvent.PHASE_END, {
				phase: "discovery",
				stats: { filesFound: 42 },
			});

			bus.emit(event);

			expect(received).toBe(event);
			const phase = received as PhaseEventPayload;
			expect(phase.type).toBe(PipelineEvent.PHASE_END);
			expect(phase.phase).toBe("discovery");
			expect(phase.stats).toEqual({ filesFound: 42 });
		});
	});

	// ─── Feature: Edge Cases ───

	describe("Feature: Edge Cases", () => {
		it("should not throw or call handler after all handlers are unregistered", () => {
			const received: PipelineEventPayload[] = [];
			const handler: EventHandler = (event) => received.push(event);

			bus.on(PipelineEvent.ERROR, handler);
			bus.off(PipelineEvent.ERROR, handler);

			expect(() => bus.emit(makeErrorEvent())).not.toThrow();
			expect(received).toHaveLength(0);
		});

		it("should propagate handler errors to the emit caller", () => {
			const handler: EventHandler = () => {
				throw new Error("handler failed");
			};

			bus.on(PipelineEvent.ERROR, handler);

			expect(() => bus.emit(makeErrorEvent())).toThrow("handler failed");
		});

		it("should not throw when emitting on a fresh bus with no handlers", () => {
			const freshBus = new PipelineEventBus();

			expect(() => freshBus.emit(makeErrorEvent())).not.toThrow();
			expect(() => freshBus.emit(makeLogEvent(PipelineEvent.WARN))).not.toThrow();
			expect(() => freshBus.emit(makeLogEvent(PipelineEvent.INFO))).not.toThrow();
			expect(() => freshBus.emit(makeLogEvent(PipelineEvent.DEBUG))).not.toThrow();
			expect(() => freshBus.emit(makePhaseEvent(PipelineEvent.PHASE_START))).not.toThrow();
			expect(() => freshBus.emit(makePhaseEvent(PipelineEvent.PHASE_END))).not.toThrow();
		});

		it("should not affect other event types when unregistering from one type", () => {
			const received: PipelineEventPayload[] = [];
			const handler: EventHandler = (event) => received.push(event);

			bus.on(PipelineEvent.ERROR, handler);
			bus.on(PipelineEvent.WARN, handler);
			bus.off(PipelineEvent.ERROR, handler);

			bus.emit(makeLogEvent(PipelineEvent.WARN));

			expect(received).toHaveLength(1);
			expect(received[0].type).toBe(PipelineEvent.WARN);
		});
	});
});
