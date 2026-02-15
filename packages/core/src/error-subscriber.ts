import { PipelineEvent, type PipelineEventPayload, type ErrorEventPayload } from "@speckey/event-bus";
import type { PipelineError } from "./types";

/**
 * Subscribes to ERROR events only and accumulates them as PipelineError[].
 *
 * Non-ERROR events (WARN, INFO, DEBUG, PHASE_START, PHASE_END) are ignored.
 */
export class ErrorSubscriber {
	readonly errors: PipelineError[] = [];

	get count(): number {
		return this.errors.length;
	}

	handle(event: PipelineEventPayload): void {
		if (event.type !== PipelineEvent.ERROR) {
			return;
		}

		const e = event as ErrorEventPayload;
		this.errors.push({
			phase: e.phase,
			path: e.path,
			message: e.message,
			code: e.code,
			userMessage: e.userMessage,
		});
	}
}
