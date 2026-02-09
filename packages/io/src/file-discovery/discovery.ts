import { accessSync } from "node:fs";
import { extname, resolve } from "node:path";
import { Glob } from "bun";
import type { Logger, AppLogObj } from "@speckey/logger";
import {
	type DiscoveredFiles,
	type DiscoveryConfig,
	type FileContent,
	type FileContents,
	SkipReason,
} from "./types";
import { DiscoveryErrors, type UserErrorMessage } from "@speckey/constants";

/**
 * High-performance file discovery using Bun APIs.
 */
export class FileDiscovery {
	/**
	 * Discover files based on the provided configuration.
	 */
	public async discover(config: DiscoveryConfig, logger?: Logger<AppLogObj>): Promise<DiscoveredFiles> {
		const result: DiscoveredFiles = {
			files: [],
			skipped: [],
			errors: [],
			exceededFileLimit: false,
		};

		try {
			const rootDir = resolve(config.rootDir);

			// 0. Validate root path exists before scanning
			const configError = this.validateConfig(rootDir, config.rootDir);
			if (configError) {
				result.errors.push(configError);
				return result;
			}

			// 1. Expand glob patterns
			const allMatchedFiles = await this.applyGlobPatterns(
				config.include,
				rootDir,
			);

			// 2. Filter and validate
			await this.filterFiles(allMatchedFiles, config, result);

			// 3. Check for empty result
			if (result.files.length === 0 && result.errors.length === 0) {
				result.errors.push({
					path: config.rootDir,
					message: "No markdown files found",
					code: "EMPTY_DIRECTORY",
					userMessage: DiscoveryErrors.EMPTY_DIRECTORY,
				});
			}

			// 4. Limit check
			this.validateFileLimit(result, config.maxFiles);

			logger?.info("Discovery complete", {
				filesFound: result.files.length,
				skipped: result.skipped.length,
				errors: result.errors.length,
			});
		} catch (error: unknown) {
			const message =
				error instanceof Error
					? error.message
					: "Unknown error during discovery";
			const code = (error as { code?: string })?.code || "UNKNOWN";
			result.errors.push({
				path: config.rootDir,
				message,
				code,
				userMessage: this.toUserMessage(code),
			});
		}

		return result;
	}

	private validateConfig(
		rootDir: string,
		originalPath: string,
	): DiscoveredFiles["errors"][number] | null {
		try {
			accessSync(rootDir);
		} catch {
			return {
				path: originalPath,
				message: `Path does not exist: ${rootDir}`,
				code: "ENOENT",
				userMessage: this.toUserMessage("ENOENT"),
			};
		}
		return null;
	}

	private async applyGlobPatterns(
		patterns: string[],
		rootDir: string,
	): Promise<string[]> {
		const matchedFilesSet = new Set<string>();

		for (const pattern of patterns) {
			let glob: Glob;
			try {
				glob = new Glob(pattern);
			} catch (error: unknown) {
				const message =
					error instanceof Error
						? error.message
						: `Invalid glob pattern: ${pattern}`;
				throw Object.assign(new Error(message), {
					code: "INVALID_GLOB_SYNTAX",
				});
			}

			const matches = glob.scan({
				cwd: rootDir,
				onlyFiles: true,
				absolute: true,
			});

			for await (const match of matches) {
				matchedFilesSet.add(match);
			}
		}

		return Array.from(matchedFilesSet);
	}

	private async filterFiles(
		files: string[],
		config: DiscoveryConfig,
		result: DiscoveredFiles,
	): Promise<void> {
		const exclusionGlobs = config.exclude.map((p) => new Glob(p));

		for (const filePath of files) {
			if (this.isSkipped(filePath, exclusionGlobs, result)) {
				continue;
			}

			await this.validateAndIncludeFile(filePath, result);
		}
	}

	private isSkipped(
		filePath: string,
		exclusionGlobs: Glob[],
		result: DiscoveredFiles,
	): boolean {
		// Check if it's markdown
		if (extname(filePath).toLowerCase() !== ".md") {
			result.skipped.push({
				path: filePath,
				reason: SkipReason.NOT_MARKDOWN,
			});
			return true;
		}

		// Check exclusions
		for (const glob of exclusionGlobs) {
			if (glob.match(filePath)) {
				result.skipped.push({
					path: filePath,
					reason: SkipReason.EXCLUDED_PATTERN,
				});
				return true;
			}
		}

		return false;
	}

	private async validateAndIncludeFile(
		filePath: string,
		result: DiscoveredFiles,
	): Promise<void> {
		try {
			const file = Bun.file(filePath);
			if (!(await file.exists())) {
				result.errors.push({
					path: filePath,
					message: "File does not exist",
					code: "ENOENT",
					userMessage: this.toUserMessage("ENOENT"),
				});
				return;
			}

			// Phase 1: Only check file existence, not size
			// Size validation happens in Phase 1b (readFiles)
			result.files.push(filePath);
		} catch (error: unknown) {
			const message =
				error instanceof Error ? error.message : "Error accessing file";
			const code = (error as { code?: string })?.code || "EACCES";
			result.errors.push({
				path: filePath,
				message,
				code,
				userMessage: this.toUserMessage(code),
			});
		}
	}

	/**
	 * Read file contents with validation.
	 * Phase 1b: File Reading
	 */
	public async readFiles(
		files: string[],
		maxFileSizeMb: number = 10,
		logger?: Logger<AppLogObj>,
	): Promise<FileContents> {
		const result: FileContents = {
			contents: [],
			skipped: [],
			errors: [],
		};

		for (const filePath of files) {
			try {
				const file = Bun.file(filePath);

				// Check if file exists
				if (!(await file.exists())) {
					result.errors.push({
						path: filePath,
						message: "File does not exist",
						code: "ENOENT",
						userMessage: this.toUserMessage("ENOENT"),
					});
					continue;
				}

				// Phase 1b: Validate file size before reading
				const sizeInBytes = file.size;
				const sizeInMb = sizeInBytes / (1024 * 1024);

				if (sizeInMb > maxFileSizeMb) {
					result.skipped.push({
						path: filePath,
						reason: SkipReason.TOO_LARGE,
					});
					continue;
				}

				// Read file content
				const content = await file.text();

				// Validate UTF-8 encoding by checking for replacement character
				// Bun.file().text() will replace invalid sequences with replacement char
				if (content.includes("\uFFFD")) {
					result.errors.push({
						path: filePath,
						message: "Invalid UTF-8 encoding",
						code: "INVALID_ENCODING",
						userMessage: this.toUserMessage("INVALID_ENCODING"),
					});
					continue;
				}

				result.contents.push({
					path: filePath,
					content,
				});
			} catch (error: unknown) {
				const message =
					error instanceof Error ? error.message : "Error reading file";
				const code = (error as { code?: string })?.code || "EACCES";
				result.errors.push({
					path: filePath,
					message,
					code,
					userMessage: this.toUserMessage(code),
				});
			}
		}

		logger?.info("Read complete", {
			filesRead: result.contents.length,
			skipped: result.skipped.length,
			errors: result.errors.length,
		});

		return result;
	}

	private validateFileLimit(
		result: DiscoveredFiles,
		limit: number,
	): void {
		if (result.files.length > limit) {
			result.exceededFileLimit = true;
		}
	}

	private toUserMessage(code: string): UserErrorMessage {
		switch (code) {
			case "ENOENT":
				return DiscoveryErrors.PATH_NOT_FOUND;
			case "EACCES":
				return DiscoveryErrors.PERMISSION_DENIED;
			case "INVALID_ENCODING":
				return DiscoveryErrors.INVALID_ENCODING;
			case "INVALID_GLOB_SYNTAX":
				return DiscoveryErrors.INVALID_GLOB_SYNTAX;
			default:
				return DiscoveryErrors.UNEXPECTED_ERROR;
		}
	}
}

