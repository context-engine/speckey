/**
 * Log severity level — orthogonal to event types.
 */
export enum LogLevel {
	ERROR = "ERROR",
	WARN = "WARN",
	INFO = "INFO",
	DEBUG = "DEBUG",
}

/**
 * Tier 1 — Generic events not tied to a specific domain.
 */
export enum GenericEvent {
	LOG = "LOG",
}

/**
 * Tier 2 — Pipeline phase boundary markers.
 */
export enum PhaseEvent {
	PHASE_START = "PHASE_START",
	PHASE_END = "PHASE_END",
}

/**
 * Tier 3 — IO module events.
 */
export enum IoEvent {
	FILE_DISCOVERY = "FILE_DISCOVERY",
	FILE_READ = "FILE_READ",
}

/**
 * Tier 3 — Parser module events.
 */
export enum ParserEvent {
	MARKDOWN_EXTRACTION = "MARKDOWN_EXTRACTION",
	MERMAID_VALIDATION = "MERMAID_VALIDATION",
}

/**
 * Union of all event types across all tiers.
 */
export type PipelineEvent = GenericEvent | PhaseEvent | IoEvent | ParserEvent;
