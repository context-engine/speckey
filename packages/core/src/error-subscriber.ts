import { LogLevel } from "@speckey/constants";
import type { BusPayload, ErrorPayload } from "@speckey/event-bus";
import type { PipelineError } from "./types";

/**
 * Subscribes to ERROR-level payloads via bus.onLevel(LogLevel.ERROR) and
 * accumulates them as PipelineError[].
 *
 * The bus guarantees only ERROR-level payloads are delivered. A defensive
 * level check is retained for safety.
 */
export class ErrorSubscriber {
	readonly errors: PipelineError[] = [];

	get count(): number {
		return this.errors.length;
	}

	handle(event: BusPayload): void {
		if (event.level !== LogLevel.ERROR) {
			return;
		}

		const e = event as ErrorPayload;
		this.errors.push({
			phase: e.phase,
			path: e.path,
			message: e.message,
			code: e.code,
			userMessage: e.userMessage,
		});
	}
}
