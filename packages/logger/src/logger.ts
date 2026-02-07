import { Logger, type ILogObj } from "tslog";

/**
 * Structured log object with common context fields.
 * Extend this interface for domain-specific fields.
 */
export interface AppLogObj extends ILogObj {
	phase?: string;
	file?: string;
	count?: number;
	[key: string]: unknown;
}

/**
 * Log verbosity mode.
 */
export type LogMode = "silent" | "error" | "info" | "debug";

const MIN_LEVELS: Record<LogMode, number> = {
	silent: 7,
	error: 5,
	info: 3,
	debug: 2,
};

/**
 * Create a logger with human-readable pretty output.
 */
export function createLogger(
	name: string,
	mode: LogMode = "info",
): Logger<AppLogObj> {
	return new Logger<AppLogObj>({
		name,
		type: mode === "silent" ? "hidden" : "pretty",
		minLevel: MIN_LEVELS[mode],
		hideLogPositionForProduction: true,
	});
}

/**
 * Create a logger with structured JSON output.
 */
export function createJsonLogger(
	name: string,
	mode: LogMode = "debug",
): Logger<AppLogObj> {
	return new Logger<AppLogObj>({
		name,
		type: "json",
		minLevel: MIN_LEVELS[mode],
		hideLogPositionForProduction: true,
	});
}
