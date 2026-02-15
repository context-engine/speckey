import type { Logger, AppLogObj } from "@speckey/logger";
import {
	PipelineEvent,
	type PipelineEventPayload,
	type ErrorEventPayload,
	type LogEventPayload,
	type PhaseEventPayload,
} from "@speckey/event-bus";

/**
 * Subscribes to all event types and routes them to the appropriate Logger method.
 *
 * Routing:
 *   ERROR, WARN  → logger.warn()
 *   INFO         → logger.info()
 *   DEBUG        → logger.debug()
 *   PHASE_START  → logger.info()
 *   PHASE_END    → logger.info()
 */
export class LogSubscriber {
	private readonly logger: Logger<AppLogObj>;

	constructor(logger: Logger<AppLogObj>) {
		this.logger = logger;
	}

	handle(event: PipelineEventPayload): void {
		this.routeToLogger(event);
	}

	private routeToLogger(event: PipelineEventPayload): void {
		switch (event.type) {
			case PipelineEvent.ERROR: {
				const e = event as ErrorEventPayload;
				this.logger.warn(e.message, { phase: e.phase, path: e.path, code: e.code });
				break;
			}
			case PipelineEvent.WARN: {
				const e = event as LogEventPayload;
				this.logger.warn(e.message, { phase: e.phase, ...e.context });
				break;
			}
			case PipelineEvent.INFO: {
				const e = event as LogEventPayload;
				this.logger.info(e.message, { phase: e.phase, ...e.context });
				break;
			}
			case PipelineEvent.DEBUG: {
				const e = event as LogEventPayload;
				this.logger.debug(e.message, { phase: e.phase, ...e.context });
				break;
			}
			case PipelineEvent.PHASE_START: {
				const e = event as PhaseEventPayload;
				this.logger.info(`Phase "${e.phase}" started`, { phase: e.phase, ...e.stats });
				break;
			}
			case PipelineEvent.PHASE_END: {
				const e = event as PhaseEventPayload;
				this.logger.info(`Phase "${e.phase}" ended`, { phase: e.phase, ...e.stats });
				break;
			}
		}
	}
}
