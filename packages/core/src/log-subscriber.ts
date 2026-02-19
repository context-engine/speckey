import type { Logger, AppLogObj } from "@speckey/logger";
import { LogLevel } from "@speckey/constants";
import type { BusPayload, ErrorPayload, LogPayload } from "@speckey/event-bus";

/**
 * Subscribes to all payloads via bus.onAll() and routes them to the
 * appropriate Logger method based on payload level.
 *
 * Routing:
 *   ERROR        → logger.error()
 *   WARN         → logger.warn()
 *   INFO         → logger.info()
 *   DEBUG        → logger.debug()
 *   PHASE_START/PHASE_END events → logger.info() (with phase start/end formatting)
 */
export class LogSubscriber {
	private readonly logger: Logger<AppLogObj>;

	constructor(logger: Logger<AppLogObj>) {
		this.logger = logger;
	}

	handle(event: BusPayload): void {
		this.routeToLogger(event);
	}

	private routeToLogger(event: BusPayload): void {
		// Phase events get special formatting
		if (event.event === "PHASE_START" || event.event === "PHASE_END") {
			const e = event as LogPayload;
			if (event.event === "PHASE_START") {
				this.logger.info(`Phase "${e.phase}" started`, { phase: e.phase, ...e.context });
			} else {
				this.logger.info(`Phase "${e.phase}" ended`, { phase: e.phase, ...e.context });
			}
			return;
		}

		switch (event.level) {
			case LogLevel.ERROR: {
				const e = event as ErrorPayload;
				this.logger.error(e.message, { phase: e.phase, path: e.path, code: e.code });
				break;
			}
			case LogLevel.WARN: {
				const e = event as LogPayload;
				this.logger.warn(e.message, { phase: e.phase, ...e.context });
				break;
			}
			case LogLevel.INFO: {
				const e = event as LogPayload;
				this.logger.info(e.message, { phase: e.phase, ...e.context });
				break;
			}
			case LogLevel.DEBUG: {
				const e = event as LogPayload;
				this.logger.debug(e.message, { phase: e.phase, ...e.context });
				break;
			}
		}
	}
}
