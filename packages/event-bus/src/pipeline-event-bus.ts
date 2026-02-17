import { LogLevel, type PipelineEvent, type PipelinePhase } from "@speckey/constants";
import type { BusPayload, ErrorPayload, EventHandler, LogPayload } from "./types";

/**
 * Routes typed payloads from producers to registered subscribers via three
 * independent channels: by log level, by event type, and broadcast.
 *
 * @address speckey.eventBus#class.PipelineEventBus
 */
export class PipelineEventBus {
	private levelHandlers = new Map<LogLevel, EventHandler[]>();
	private eventHandlers = new Map<PipelineEvent, EventHandler[]>();
	private allHandlers: EventHandler[] = [];

	/**
	 * Deliver payload synchronously to all matching handlers across all three channels:
	 * 1. Level channel — handlers registered for the payload's level
	 * 2. Event channel — handlers registered for the payload's event type
	 * 3. Broadcast channel — handlers registered via onAll()
	 */
	emit(payload: BusPayload): void {
		const levelList = this.levelHandlers.get(payload.level);
		if (levelList) {
			for (const handler of levelList) {
				handler(payload);
			}
		}

		const eventList = this.eventHandlers.get(payload.event);
		if (eventList) {
			for (const handler of eventList) {
				handler(payload);
			}
		}

		for (const handler of this.allHandlers) {
			handler(payload);
		}
	}

	// ─── Level-based registration ───

	onLevel(level: LogLevel, handler: EventHandler): void {
		let list = this.levelHandlers.get(level);
		if (!list) {
			list = [];
			this.levelHandlers.set(level, list);
		}
		list.push(handler);
	}

	offLevel(level: LogLevel, handler: EventHandler): void {
		const list = this.levelHandlers.get(level);
		if (!list) return;
		const index = list.indexOf(handler);
		if (index !== -1) {
			list.splice(index, 1);
		}
	}

	// ─── Event-based registration ───

	onEvent(event: PipelineEvent, handler: EventHandler): void {
		let list = this.eventHandlers.get(event);
		if (!list) {
			list = [];
			this.eventHandlers.set(event, list);
		}
		list.push(handler);
	}

	offEvent(event: PipelineEvent, handler: EventHandler): void {
		const list = this.eventHandlers.get(event);
		if (!list) return;
		const index = list.indexOf(handler);
		if (index !== -1) {
			list.splice(index, 1);
		}
	}

	// ─── Broadcast registration ───

	onAll(handler: EventHandler): void {
		this.allHandlers.push(handler);
	}

	offAll(handler: EventHandler): void {
		const index = this.allHandlers.indexOf(handler);
		if (index !== -1) {
			this.allHandlers.splice(index, 1);
		}
	}

	// ─── Convenience emit methods ───

	emitError(event: PipelineEvent, phase: PipelinePhase, error: Omit<ErrorPayload, "event" | "level" | "phase" | "timestamp">): void {
		this.emit({ ...error, event, level: LogLevel.ERROR, phase, timestamp: Date.now() } as ErrorPayload);
	}

	emitWarn(event: PipelineEvent, phase: PipelinePhase, message: string, context?: Record<string, unknown>): void {
		this.emit({ event, level: LogLevel.WARN, phase, timestamp: Date.now(), message, context } as LogPayload);
	}

	emitInfo(event: PipelineEvent, phase: PipelinePhase, message: string, context?: Record<string, unknown>): void {
		this.emit({ event, level: LogLevel.INFO, phase, timestamp: Date.now(), message, context } as LogPayload);
	}

	emitDebug(event: PipelineEvent, phase: PipelinePhase, message: string, context?: Record<string, unknown>): void {
		this.emit({ event, level: LogLevel.DEBUG, phase, timestamp: Date.now(), message, context } as LogPayload);
	}
}
