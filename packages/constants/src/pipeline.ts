import type { UserErrorMessage } from "./types";

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
