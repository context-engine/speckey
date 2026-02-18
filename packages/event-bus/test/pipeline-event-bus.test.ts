import { beforeEach, describe, expect, it } from "bun:test";
import {
	LogLevel,
	GenericEvent,
	PhaseEvent,
	IoEvent,
	ParserEvent,
	PipelinePhase,
} from "@speckey/constants";
import {
	type BusPayload,
	type ErrorPayload,
	type LogPayload,
	type EventHandler,
} from "../src/types";
import { PipelineEventBus } from "../src/pipeline-event-bus";

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

describe("PipelineEventBus", () => {
	let bus: PipelineEventBus;

	beforeEach(() => {
		bus = new PipelineEventBus();
	});

	// ─── Feature: Level-Based Registration (onLevel) ───

	describe("Feature: Level-Based Registration (onLevel)", () => {
		it("should call registered handler when matching level is emitted", () => {
			const received: BusPayload[] = [];
			const handler: EventHandler = (event) => received.push(event);

			bus.onLevel(LogLevel.ERROR, handler);
			bus.emit(makeErrorPayload());

			expect(received).toHaveLength(1);
		});

		it("should call multiple handlers registered for same log level", () => {
			const receivedA: BusPayload[] = [];
			const receivedB: BusPayload[] = [];
			const handlerA: EventHandler = (event) => receivedA.push(event);
			const handlerB: EventHandler = (event) => receivedB.push(event);

			bus.onLevel(LogLevel.ERROR, handlerA);
			bus.onLevel(LogLevel.ERROR, handlerB);
			bus.emit(makeErrorPayload());

			expect(receivedA).toHaveLength(1);
			expect(receivedB).toHaveLength(1);
		});

		it("should call handler once per matching level when registered for multiple levels", () => {
			const received: BusPayload[] = [];
			const handler: EventHandler = (event) => received.push(event);

			bus.onLevel(LogLevel.ERROR, handler);
			bus.onLevel(LogLevel.WARN, handler);

			bus.emit(makeErrorPayload());
			bus.emit(makeLogPayload(LogLevel.WARN));

			expect(received).toHaveLength(2);
			expect(received[0].level).toBe(LogLevel.ERROR);
			expect(received[1].level).toBe(LogLevel.WARN);
		});

		it("should call handler twice per emit when registered twice for same level (duplicates allowed)", () => {
			const received: BusPayload[] = [];
			const handler: EventHandler = (event) => received.push(event);

			bus.onLevel(LogLevel.ERROR, handler);
			bus.onLevel(LogLevel.ERROR, handler);
			bus.emit(makeErrorPayload());

			expect(received).toHaveLength(2);
		});
	});

	// ─── Feature: Event-Based Registration (onEvent) ───

	describe("Feature: Event-Based Registration (onEvent)", () => {
		it("should call handler for specific event type", () => {
			const received: BusPayload[] = [];
			const handler: EventHandler = (event) => received.push(event);

			bus.onEvent(IoEvent.FILE_DISCOVERY, handler);
			bus.emit(makeErrorPayload({ event: IoEvent.FILE_DISCOVERY }));

			expect(received).toHaveLength(1);
		});

		it("should not trigger handler for different event type", () => {
			const received: BusPayload[] = [];
			const handler: EventHandler = (event) => received.push(event);

			bus.onEvent(IoEvent.FILE_DISCOVERY, handler);
			bus.emit(makeLogPayload(LogLevel.INFO, { event: IoEvent.FILE_READ }));

			expect(received).toHaveLength(0);
		});

		it("should receive payloads regardless of level", () => {
			const received: BusPayload[] = [];
			const handler: EventHandler = (event) => received.push(event);

			bus.onEvent(IoEvent.FILE_DISCOVERY, handler);

			bus.emit(makeErrorPayload({ event: IoEvent.FILE_DISCOVERY }));
			bus.emit(makeLogPayload(LogLevel.WARN, { event: IoEvent.FILE_DISCOVERY }));
			bus.emit(makeLogPayload(LogLevel.INFO, { event: IoEvent.FILE_DISCOVERY }));

			expect(received).toHaveLength(3);
		});
	});

	// ─── Feature: Broadcast Registration (onAll) ───

	describe("Feature: Broadcast Registration (onAll)", () => {
		it("should receive all payloads regardless of event or level", () => {
			const received: BusPayload[] = [];
			const handler: EventHandler = (event) => received.push(event);

			bus.onAll(handler);

			bus.emit(makeErrorPayload());
			bus.emit(makeLogPayload(LogLevel.WARN));
			bus.emit(makeLogPayload(LogLevel.INFO));
			bus.emit(makeLogPayload(LogLevel.DEBUG));
			bus.emit(makePhaseLogPayload(PhaseEvent.PHASE_START));
			bus.emit(makePhaseLogPayload(PhaseEvent.PHASE_END));

			expect(received).toHaveLength(6);
		});

		it("should call multiple broadcast handlers", () => {
			const receivedA: BusPayload[] = [];
			const receivedB: BusPayload[] = [];

			bus.onAll((event) => receivedA.push(event));
			bus.onAll((event) => receivedB.push(event));

			bus.emit(makeLogPayload(LogLevel.INFO));

			expect(receivedA).toHaveLength(1);
			expect(receivedB).toHaveLength(1);
		});

		it("should coexist with level and event handlers", () => {
			const levelReceived: BusPayload[] = [];
			const eventReceived: BusPayload[] = [];
			const allReceived: BusPayload[] = [];

			bus.onLevel(LogLevel.ERROR, (e) => levelReceived.push(e));
			bus.onEvent(IoEvent.FILE_DISCOVERY, (e) => eventReceived.push(e));
			bus.onAll((e) => allReceived.push(e));

			bus.emit(makeErrorPayload({ event: IoEvent.FILE_DISCOVERY, level: LogLevel.ERROR }));

			expect(levelReceived).toHaveLength(1);
			expect(eventReceived).toHaveLength(1);
			expect(allReceived).toHaveLength(1);
		});
	});

	// ─── Feature: Handler Unregistration (offLevel/offEvent/offAll) ───

	describe("Feature: Handler Unregistration", () => {
		it("should not call handler after offLevel", () => {
			const received: BusPayload[] = [];
			const handler: EventHandler = (event) => received.push(event);

			bus.onLevel(LogLevel.ERROR, handler);
			bus.offLevel(LogLevel.ERROR, handler);
			bus.emit(makeErrorPayload());

			expect(received).toHaveLength(0);
		});

		it("should not call handler after offEvent", () => {
			const received: BusPayload[] = [];
			const handler: EventHandler = (event) => received.push(event);

			bus.onEvent(IoEvent.FILE_DISCOVERY, handler);
			bus.offEvent(IoEvent.FILE_DISCOVERY, handler);
			bus.emit(makeErrorPayload({ event: IoEvent.FILE_DISCOVERY }));

			expect(received).toHaveLength(0);
		});

		it("should not call handler after offAll", () => {
			const received: BusPayload[] = [];
			const handler: EventHandler = (event) => received.push(event);

			bus.onAll(handler);
			bus.offAll(handler);
			bus.emit(makeErrorPayload());

			expect(received).toHaveLength(0);
		});

		it("should not throw when unregistering non-existent handler", () => {
			const handler: EventHandler = () => {};

			expect(() => bus.offLevel(LogLevel.ERROR, handler)).not.toThrow();
			expect(() => bus.offEvent(IoEvent.FILE_DISCOVERY, handler)).not.toThrow();
			expect(() => bus.offAll(handler)).not.toThrow();
		});
	});

	// ─── Feature: Dual-Dimension Routing ───

	describe("Feature: Dual-Dimension Routing", () => {
		it("should route level handler only to matching level", () => {
			const errorReceived: BusPayload[] = [];
			const warnReceived: BusPayload[] = [];

			bus.onLevel(LogLevel.ERROR, (e) => errorReceived.push(e));
			bus.onLevel(LogLevel.WARN, (e) => warnReceived.push(e));

			bus.emit(makeErrorPayload({ event: IoEvent.FILE_DISCOVERY, level: LogLevel.ERROR }));

			expect(errorReceived).toHaveLength(1);
			expect(warnReceived).toHaveLength(0);
		});

		it("should route event handler only to matching event type", () => {
			const fileDiscoveryReceived: BusPayload[] = [];
			const mermaidReceived: BusPayload[] = [];

			bus.onEvent(IoEvent.FILE_DISCOVERY, (e) => fileDiscoveryReceived.push(e));
			bus.onEvent(ParserEvent.MERMAID_VALIDATION, (e) => mermaidReceived.push(e));

			bus.emit(makeErrorPayload({ event: IoEvent.FILE_DISCOVERY }));

			expect(fileDiscoveryReceived).toHaveLength(1);
			expect(mermaidReceived).toHaveLength(0);
		});

		it("should deliver same payload to level, event, and broadcast handlers", () => {
			let levelPayload: BusPayload | undefined;
			let eventPayload: BusPayload | undefined;
			let allPayload: BusPayload | undefined;

			bus.onLevel(LogLevel.ERROR, (e) => { levelPayload = e; });
			bus.onEvent(IoEvent.FILE_DISCOVERY, (e) => { eventPayload = e; });
			bus.onAll((e) => { allPayload = e; });

			const payload = makeErrorPayload({ event: IoEvent.FILE_DISCOVERY, level: LogLevel.ERROR });
			bus.emit(payload);

			expect(levelPayload).toBe(payload);
			expect(eventPayload).toBe(payload);
			expect(allPayload).toBe(payload);
		});

		it("should correctly route WARN-level FILE_READ payload", () => {
			const errorHandler = { received: [] as BusPayload[] };
			const warnHandler = { received: [] as BusPayload[] };
			const fileReadHandler = { received: [] as BusPayload[] };
			const allHandler = { received: [] as BusPayload[] };

			bus.onLevel(LogLevel.ERROR, (e) => errorHandler.received.push(e));
			bus.onLevel(LogLevel.WARN, (e) => warnHandler.received.push(e));
			bus.onEvent(IoEvent.FILE_READ, (e) => fileReadHandler.received.push(e));
			bus.onAll((e) => allHandler.received.push(e));

			bus.emit(makeLogPayload(LogLevel.WARN, { event: IoEvent.FILE_READ }));

			expect(errorHandler.received).toHaveLength(0);
			expect(warnHandler.received).toHaveLength(1);
			expect(fileReadHandler.received).toHaveLength(1);
			expect(allHandler.received).toHaveLength(1);
		});

		it("should accumulate correctly across multiple emissions", () => {
			const levelReceived: BusPayload[] = [];
			const eventReceived: BusPayload[] = [];
			const allReceived: BusPayload[] = [];

			bus.onLevel(LogLevel.ERROR, (e) => levelReceived.push(e));
			bus.onEvent(IoEvent.FILE_DISCOVERY, (e) => eventReceived.push(e));
			bus.onAll((e) => allReceived.push(e));

			bus.emit(makeErrorPayload({ event: IoEvent.FILE_DISCOVERY, level: LogLevel.ERROR }));
			bus.emit(makeErrorPayload({ event: IoEvent.FILE_DISCOVERY, level: LogLevel.ERROR }));
			bus.emit(makeErrorPayload({ event: IoEvent.FILE_DISCOVERY, level: LogLevel.ERROR }));

			expect(levelReceived).toHaveLength(3);
			expect(eventReceived).toHaveLength(3);
			expect(allReceived).toHaveLength(3);
		});
	});

	// ─── Feature: Delivery Guarantees ───

	describe("Feature: Delivery Guarantees", () => {
		it("should deliver events synchronously", () => {
			let flag = false;
			const handler: EventHandler = () => { flag = true; };

			bus.onLevel(LogLevel.ERROR, handler);
			bus.emit(makeErrorPayload());

			// Flag should be set immediately after emit() returns
			expect(flag).toBe(true);
		});

		it("should call handlers in registration order within each channel", () => {
			const callOrder: string[] = [];

			bus.onLevel(LogLevel.ERROR, () => callOrder.push("A"));
			bus.onLevel(LogLevel.ERROR, () => callOrder.push("B"));
			bus.onLevel(LogLevel.ERROR, () => callOrder.push("C"));

			bus.emit(makeErrorPayload());

			expect(callOrder).toEqual(["A", "B", "C"]);
		});

		it("should deliver payloads in emission order", () => {
			const received: BusPayload[] = [];
			bus.onLevel(LogLevel.ERROR, (event) => received.push(event));

			const payload1 = makeErrorPayload({ code: "E001" });
			const payload2 = makeErrorPayload({ code: "E002" });

			bus.emit(payload1);
			bus.emit(payload2);

			expect(received).toHaveLength(2);
			expect((received[0] as ErrorPayload).code).toBe("E001");
			expect((received[1] as ErrorPayload).code).toBe("E002");
		});
	});

	// ─── Feature: Payload Integrity ───

	describe("Feature: Payload Integrity", () => {
		it("should deliver ErrorPayload unchanged (same object reference)", () => {
			let received: BusPayload | undefined;
			bus.onLevel(LogLevel.ERROR, (e) => { received = e; });

			const payload = makeErrorPayload({
				event: IoEvent.FILE_DISCOVERY,
				phase: PipelinePhase.DISCOVERY,
				path: "/bad",
				message: "Not found",
				code: "ENOENT",
				userMessage: ["File not found"],
			});

			bus.emit(payload);

			expect(received).toBe(payload); // Same object reference
			const err = received as ErrorPayload;
			expect(err.event).toBe(IoEvent.FILE_DISCOVERY);
			expect(err.level).toBe(LogLevel.ERROR);
			expect(err.phase).toBe(PipelinePhase.DISCOVERY);
			expect(err.path).toBe("/bad");
			expect(err.message).toBe("Not found");
			expect(err.code).toBe("ENOENT");
			expect(err.userMessage).toEqual(["File not found"]);
		});

		it("should deliver LogPayload unchanged (same object reference)", () => {
			let received: BusPayload | undefined;
			bus.onAll((e) => { received = e; });

			const payload = makeLogPayload(LogLevel.DEBUG, {
				event: IoEvent.FILE_DISCOVERY,
				phase: PipelinePhase.DISCOVERY,
				message: "Scanning",
				context: { dir: "/src" },
			});

			bus.emit(payload);

			expect(received).toBe(payload);
			const log = received as LogPayload;
			expect(log.event).toBe(IoEvent.FILE_DISCOVERY);
			expect(log.level).toBe(LogLevel.DEBUG);
			expect(log.phase).toBe(PipelinePhase.DISCOVERY);
			expect(log.message).toBe("Scanning");
			expect(log.context).toEqual({ dir: "/src" });
		});

		it("should deliver phase LogPayload unchanged (same object reference)", () => {
			let received: BusPayload | undefined;
			bus.onEvent(PhaseEvent.PHASE_END, (e) => { received = e; });

			const payload = makePhaseLogPayload(PhaseEvent.PHASE_END, {
				phase: PipelinePhase.DISCOVERY,
				context: { filesFound: 42 },
			});

			bus.emit(payload);

			expect(received).toBe(payload);
			const log = received as LogPayload;
			expect(log.event).toBe(PhaseEvent.PHASE_END);
			expect(log.level).toBe(LogLevel.INFO);
			expect(log.phase).toBe(PipelinePhase.DISCOVERY);
			expect(log.context).toEqual({ filesFound: 42 });
		});
	});

	// ─── Feature: Convenience Methods ───

	describe("Feature: Convenience Methods", () => {
		it("emitError should construct ErrorPayload with correct fields", () => {
			let received: BusPayload | undefined;
			bus.onLevel(LogLevel.ERROR, (e) => { received = e; });

			bus.emitError(IoEvent.FILE_DISCOVERY, PipelinePhase.DISCOVERY, {
				path: "/bad/file.md",
				message: "Not found",
				code: "ENOENT",
				userMessage: ["File not found"],
			});

			expect(received).toBeDefined();
			const err = received as ErrorPayload;
			expect(err.event).toBe(IoEvent.FILE_DISCOVERY);
			expect(err.level).toBe(LogLevel.ERROR);
			expect(err.phase).toBe(PipelinePhase.DISCOVERY);
			expect(err.path).toBe("/bad/file.md");
			expect(err.message).toBe("Not found");
			expect(err.code).toBe("ENOENT");
			expect(err.userMessage).toEqual(["File not found"]);
			expect(err.timestamp).toBeGreaterThan(0);
		});

		it("emitWarn should construct LogPayload with WARN level", () => {
			let received: BusPayload | undefined;
			bus.onAll((e) => { received = e; });

			bus.emitWarn(IoEvent.FILE_DISCOVERY, PipelinePhase.DISCOVERY, "File skipped", { path: "/a.txt" });

			expect(received).toBeDefined();
			const log = received as LogPayload;
			expect(log.event).toBe(IoEvent.FILE_DISCOVERY);
			expect(log.level).toBe(LogLevel.WARN);
			expect(log.phase).toBe(PipelinePhase.DISCOVERY);
			expect(log.message).toBe("File skipped");
			expect(log.context).toEqual({ path: "/a.txt" });
			expect(log.timestamp).toBeGreaterThan(0);
		});

		it("emitInfo should construct LogPayload with INFO level", () => {
			let received: BusPayload | undefined;
			bus.onAll((e) => { received = e; });

			bus.emitInfo(IoEvent.FILE_DISCOVERY, PipelinePhase.DISCOVERY, "Discovery complete", { filesFound: 42 });

			expect(received).toBeDefined();
			const log = received as LogPayload;
			expect(log.level).toBe(LogLevel.INFO);
		});

		it("emitDebug should construct LogPayload with DEBUG level", () => {
			let received: BusPayload | undefined;
			bus.onAll((e) => { received = e; });

			bus.emitDebug(GenericEvent.LOG, PipelinePhase.PARSE, "Processing block", { index: 3 });

			expect(received).toBeDefined();
			const log = received as LogPayload;
			expect(log.event).toBe(GenericEvent.LOG);
			expect(log.level).toBe(LogLevel.DEBUG);
			expect(log.phase).toBe(PipelinePhase.PARSE);
			expect(log.message).toBe("Processing block");
			expect(log.context).toEqual({ index: 3 });
		});

		it("convenience methods should auto-generate timestamp", () => {
			const before = Date.now();
			const received: BusPayload[] = [];
			bus.onAll((e) => received.push(e));

			bus.emitError(IoEvent.FILE_DISCOVERY, PipelinePhase.DISCOVERY, {
				path: "/x", message: "err", code: "E", userMessage: ["e"],
			});
			bus.emitWarn(IoEvent.FILE_DISCOVERY, PipelinePhase.DISCOVERY, "warn msg");
			bus.emitInfo(IoEvent.FILE_DISCOVERY, PipelinePhase.DISCOVERY, "info msg");
			bus.emitDebug(GenericEvent.LOG, PipelinePhase.DISCOVERY, "debug msg");
			const after = Date.now();

			expect(received).toHaveLength(4);
			for (const payload of received) {
				expect(payload.timestamp).toBeGreaterThanOrEqual(before);
				expect(payload.timestamp).toBeLessThanOrEqual(after);
			}
		});

		it("emitWarn should work without context parameter", () => {
			let received: BusPayload | undefined;
			bus.onAll((e) => { received = e; });

			bus.emitWarn(IoEvent.FILE_DISCOVERY, PipelinePhase.PARSE, "Something happened");

			expect(received).toBeDefined();
			const log = received as LogPayload;
			expect(log.message).toBe("Something happened");
			expect(log.context).toBeUndefined();
		});
	});

	// ─── Feature: Edge Cases ───

	describe("Feature: Edge Cases", () => {
		it("should not throw or call handler after all handlers unregistered", () => {
			const received: BusPayload[] = [];
			const handler: EventHandler = (event) => received.push(event);

			bus.onLevel(LogLevel.ERROR, handler);
			bus.offLevel(LogLevel.ERROR, handler);

			expect(() => bus.emit(makeErrorPayload())).not.toThrow();
			expect(received).toHaveLength(0);
		});

		it("should propagate handler errors to emit caller", () => {
			const handler: EventHandler = () => {
				throw new Error("handler failed");
			};

			bus.onLevel(LogLevel.ERROR, handler);

			expect(() => bus.emit(makeErrorPayload())).toThrow("handler failed");
		});

		it("should not throw when emitting on a fresh bus with no handlers", () => {
			const freshBus = new PipelineEventBus();

			expect(() => freshBus.emit(makeErrorPayload())).not.toThrow();
			expect(() => freshBus.emit(makeLogPayload(LogLevel.WARN))).not.toThrow();
			expect(() => freshBus.emit(makeLogPayload(LogLevel.INFO))).not.toThrow();
			expect(() => freshBus.emit(makeLogPayload(LogLevel.DEBUG))).not.toThrow();
			expect(() => freshBus.emit(makePhaseLogPayload(PhaseEvent.PHASE_START))).not.toThrow();
			expect(() => freshBus.emit(makePhaseLogPayload(PhaseEvent.PHASE_END))).not.toThrow();
		});

		it("offLevel should not affect onEvent or onAll handlers", () => {
			const received: BusPayload[] = [];
			const handler: EventHandler = (event) => received.push(event);

			bus.onLevel(LogLevel.ERROR, handler);
			bus.onEvent(IoEvent.FILE_DISCOVERY, handler);
			bus.onAll(handler);

			bus.offLevel(LogLevel.ERROR, handler);

			bus.emit(makeErrorPayload({ event: IoEvent.FILE_DISCOVERY, level: LogLevel.ERROR }));

			// onLevel removed → 0, onEvent → 1, onAll → 1 = 2 calls
			expect(received).toHaveLength(2);
		});

		it("same handler registered on all 3 channels should be called 3 times", () => {
			const received: BusPayload[] = [];
			const handler: EventHandler = (event) => received.push(event);

			bus.onLevel(LogLevel.ERROR, handler);
			bus.onEvent(IoEvent.FILE_DISCOVERY, handler);
			bus.onAll(handler);

			bus.emit(makeErrorPayload({ event: IoEvent.FILE_DISCOVERY, level: LogLevel.ERROR }));

			expect(received).toHaveLength(3);
		});
	});
});
