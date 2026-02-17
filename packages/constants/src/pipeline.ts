import type { UserErrorMessage } from "./types";

/**
 * Pipeline execution phases.
 */
export enum PipelinePhase {
	DISCOVERY = "discovery",
	READ = "read",
	PARSE = "parse",
	EXTRACT = "extract",
	UNIT_VALIDATE = "unit_validate",
	BUILD = "build",
	INTEGRATION_VALIDATE = "integration_validate",
	WRITE = "write",
}

/**
 * Human-readable labels for each pipeline phase, used in log messages.
 */
export const PipelinePhaseLabels: Record<PipelinePhase, string> = {
	[PipelinePhase.DISCOVERY]: "Discovery",
	[PipelinePhase.READ]: "Read",
	[PipelinePhase.PARSE]: "Parse",
	[PipelinePhase.EXTRACT]: "Extract",
	[PipelinePhase.UNIT_VALIDATE]: "Unit validate",
	[PipelinePhase.BUILD]: "Build",
	[PipelinePhase.INTEGRATION_VALIDATE]: "Integration validate",
	[PipelinePhase.WRITE]: "Write",
};

export const PipelineErrors = {
	PARSE_FAILURE: (file: string, message: string): UserErrorMessage => [
		`Failed to parse "${file}"`,
		message,
	],
	EXTRACT_FAILURE: (file: string, message: string): UserErrorMessage => [
		`Failed to extract class diagram in "${file}"`,
		message,
	],
	BUILD_FAILURE: (file: string, code: string, message: string): UserErrorMessage => [
		`Entity build error in "${file}" [${code}]`,
		message,
	],
	VALIDATION_FAILURE: (code: string, message: string): UserErrorMessage => [
		`Integration validation error [${code}]`,
		message,
	],
	WRITE_FAILURE: (code: string, message: string): UserErrorMessage => [
		`Database write error [${code}]`,
		message,
	],
} as const;
