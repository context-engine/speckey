import type { EventHandler, PipelineEvent, PipelineEventPayload } from "./types";

/**
 * Routes typed events from producers to registered subscribers by event type.
 *
 * @address speckey.eventBus#class.PipelineEventBus
 */
export class PipelineEventBus {
	private handlers = new Map<PipelineEvent, EventHandler[]>();

	/**
	 * Deliver event synchronously to all handlers registered for its type.
	 */
	emit(event: PipelineEventPayload): void {
		const list = this.handlers.get(event.type);
		if (!list) return;
		for (const handler of list) {
			handler(event);
		}
	}

	/**
	 * Register a handler for a specific event type.
	 */
	on(type: PipelineEvent, handler: EventHandler): void {
		let list = this.handlers.get(type);
		if (!list) {
			list = [];
			this.handlers.set(type, list);
		}
		list.push(handler);
	}

	/**
	 * Unregister a handler for a specific event type.
	 */
	off(type: PipelineEvent, handler: EventHandler): void {
		const list = this.handlers.get(type);
		if (!list) return;
		const index = list.indexOf(handler);
		if (index !== -1) {
			list.splice(index, 1);
		}
	}
}
