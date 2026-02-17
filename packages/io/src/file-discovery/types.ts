import type { UserErrorMessage } from "@speckey/constants";

/**
 * Configuration for file discovery.
 */
export interface DiscoveryConfig {
	/**
	 * Glob patterns to include (e.g., ["**\/*.md"]).
	 */
	include: string[];
	/**
	 * Glob patterns to exclude (e.g., ["**\/node_modules\/**"]).
	 */
	exclude: string[];
	/**
	 * Maximum number of files to discover before warning/stopping.
	 */
	maxFiles: number;
	/**
	 * Maximum file size in megabytes. Files larger than this will be skipped.
	 */
	maxFileSizeMb: number;
	/**
	 * Root directory to start discovery from.
	 */
	rootDir: string;
}

/**
 * Result of the discovery process.
 */
export interface DiscoveredFiles {
	/**
	 * Absolute paths to discovered files.
	 */
	files: string[];
	/**
	 * Files that were skipped during discovery.
	 */
	skipped: SkippedFile[];
	/**
	 * True if file count exceeds the configured maxFiles limit.
	 * The caller (CLI) should decide whether to prompt or abort.
	 */
	exceededFileLimit: boolean;
}

/**
 * Result of reading file contents.
 */
export interface FileContents {
	/**
	 * Successfully read file contents.
	 */
	contents: FileContent[];
	/**
	 * Files that were skipped during reading (Phase 1b).
	 */
	skipped: SkippedFile[];
}

/**
 * A single file's content.
 */
export interface FileContent {
	/**
	 * Absolute path to file.
	 */
	path: string;
	/**
	 * File content as UTF-8 string.
	 */
	content: string;
}

/**
 * Information about a skipped file.
 */
export interface SkippedFile {
	/**
	 * Path to the skipped file.
	 */
	path: string;
	/**
	 * The reason the file was skipped.
	 */
	reason: SkipReason;
}

/**
 * Potential reasons for skipping a file.
 */
export enum SkipReason {
	EXCLUDED_PATTERN = "excluded_pattern",
	TOO_LARGE = "too_large",
	NOT_MARKDOWN = "not_markdown",
}

/**
 * Error encountered during discovery.
 */
export interface DiscoveryError {
	/**
	 * Path to the file or directory that caused the error.
	 */
	path: string;
	/**
	 * Raw system error message.
	 */
	message: string;
	/**
	 * System error code (e.g., ENOENT, EACCES).
	 */
	code: string;
	/**
	 * Human-friendly error description.
	 */
	userMessage: UserErrorMessage;
}

