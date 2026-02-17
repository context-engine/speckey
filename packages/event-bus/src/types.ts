import type { LogLevel, PipelineEvent, PhaseEvent, PipelinePhase, UserErrorMessage } from "@speckey/constants";

/**
 * Base interface for all payloads emitted through the pipeline event bus.
 * Every payload carries two orthogonal dimensions: event (what happened) and level (severity).
 */
export interface BusPayload {
	event: PipelineEvent;
	level: LogLevel;
	phase: PipelinePhase;
	timestamp: number;
}

/**
 * Payload for ERROR-level events — represents a pipeline error with user-facing message.
 */
export interface ErrorPayload extends BusPayload {
	level: LogLevel.ERROR;
	path: string;
	message: string;
	code: string;
	userMessage: UserErrorMessage;
}

/**
 * Payload for WARN, INFO, and DEBUG-level events — carries a log message with optional context.
 */
export interface LogPayload extends BusPayload {
	level: LogLevel.WARN | LogLevel.INFO | LogLevel.DEBUG;
	message: string;
	context?: Record<string, unknown>;
}

/**
 * Payload for phase boundary events — marks PHASE_START and PHASE_END.
 */
export interface PhasePayload extends BusPayload {
	event: PhaseEvent;
	level: LogLevel.INFO;
	stats?: Record<string, number>;
}

/**
 * Callback type for event subscribers.
 */
export type EventHandler = (event: BusPayload) => void;
