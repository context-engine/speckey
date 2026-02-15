import type { PipelinePhase, UserErrorMessage } from "@speckey/constants";

/**
 * Classifies the kind of event emitted during pipeline execution.
 */
export enum PipelineEvent {
	ERROR = "ERROR",
	WARN = "WARN",
	INFO = "INFO",
	DEBUG = "DEBUG",
	PHASE_START = "PHASE_START",
	PHASE_END = "PHASE_END",
}

/**
 * Base interface for all events emitted through the pipeline event bus.
 */
export interface PipelineEventPayload {
	type: PipelineEvent;
	phase: PipelinePhase;
	timestamp: number;
}

/**
 * Payload for ERROR events — represents a pipeline error with user-facing message.
 */
export interface ErrorEventPayload extends PipelineEventPayload {
	type: PipelineEvent.ERROR;
	path: string;
	message: string;
	code: string;
	userMessage: UserErrorMessage;
}

/**
 * Payload for WARN, INFO, and DEBUG events — carries a log message with optional context.
 */
export interface LogEventPayload extends PipelineEventPayload {
	type: PipelineEvent.WARN | PipelineEvent.INFO | PipelineEvent.DEBUG;
	message: string;
	context?: Record<string, unknown>;
}

/**
 * Payload for PHASE_START and PHASE_END events — marks phase boundaries.
 */
export interface PhaseEventPayload extends PipelineEventPayload {
	type: PipelineEvent.PHASE_START | PipelineEvent.PHASE_END;
	stats?: Record<string, number>;
}

/**
 * Callback type for event subscribers.
 */
export type EventHandler = (event: PipelineEventPayload) => void;
