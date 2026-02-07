import type { UserErrorMessage } from "./types";

export const DiscoveryErrors = {
	PATH_NOT_FOUND: ["Path does not exist"],
	PERMISSION_DENIED: ["Permission denied"],
	INVALID_ENCODING: ["Invalid UTF-8 encoding"],
	UNEXPECTED_ERROR: ["Unexpected error accessing"],
	EMPTY_DIRECTORY: ["No markdown files found"],
	INVALID_GLOB_SYNTAX: ["Invalid glob pattern"],
} as const satisfies Record<string, UserErrorMessage>;
