import type { UserErrorMessage } from "./types";

export const DiscoveryErrors = {
	PATH_NOT_FOUND: ["Path does not exist"],
	PERMISSION_DENIED: ["Permission denied"],
	INVALID_ENCODING: ["Invalid UTF-8 encoding"],
	UNEXPECTED_ERROR: ["Unexpected error accessing"],
} as const satisfies Record<string, UserErrorMessage>;
