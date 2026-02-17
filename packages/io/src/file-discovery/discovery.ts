import { accessSync } from "node:fs";
import { extname, resolve } from "node:path";
import { Glob } from "bun";
import { PipelineEventBus } from "@speckey/event-bus";
import { PipelinePhase } from "@speckey/constants";
import {
	type DiscoveredFiles,
	type DiscoveryConfig,
	type DiscoveryError,
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
	public async discover(config: DiscoveryConfig, bus?: PipelineEventBus): Promise<DiscoveredFiles> {
		const result: DiscoveredFiles = {
			files: [],
			skipped: [],
			exceededFileLimit: false,
		};

		let errorCount = 0;

		try {
			const rootDir = resolve(config.rootDir);

			// 0. Validate root path exists before scanning
			const configError = this.validateConfig(rootDir, config.rootDir);
			if (configError) {
				bus?.emitError(PipelinePhase.DISCOVERY, configError);
				return result;
			}

			bus?.emitInfo(PipelinePhase.DISCOVERY, "Discovering files", { rootDir, patterns: config.include.length });

			// 1. Expand glob patterns
			const allMatchedFiles = await this.applyGlobPatterns(
				config.include,
				rootDir,
			);

			// 2. Filter and validate
			errorCount = await this.filterFiles(allMatchedFiles, config, result, bus);

			// 3. Check for empty result
			if (result.files.length === 0 && errorCount === 0) {
				bus?.emitError(PipelinePhase.DISCOVERY, {
					path: config.rootDir,
					message: "No markdown files found",
					code: "EMPTY_DIRECTORY",
					userMessage: DiscoveryErrors.EMPTY_DIRECTORY,
				});
			}

			// 4. Limit check
			this.validateFileLimit(result, config.maxFiles);
		} catch (error: unknown) {
			const message =
				error instanceof Error
					? error.message
					: "Unknown error during discovery";
			const code = (error as { code?: string })?.code || "UNKNOWN";
			bus?.emitError(PipelinePhase.DISCOVERY, {
				path: config.rootDir,
				message,
				code,
				userMessage: this.toUserMessage(code),
			});
		}

		bus?.emitInfo(PipelinePhase.DISCOVERY, "Discovery complete", { filesFound: result.files.length, filesSkipped: result.skipped.length });

		return result;
	}

	/**
	 * Read file contents with validation.
	 * Phase 1b: File Reading
	 */
	public async readFiles(
		files: string[],
		maxFileSizeMb: number = 10,
		bus?: PipelineEventBus,
	): Promise<FileContents> {
		const result: FileContents = {
			contents: [],
			skipped: [],
		};

		bus?.emitInfo(PipelinePhase.READ, "Reading files", { fileCount: files.length, maxFileSizeMb });

		for (const filePath of files) {
			try {
				const file = Bun.file(filePath);

				// Check if file exists
				if (!(await file.exists())) {
					bus?.emitError(PipelinePhase.READ, {
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
					bus?.emitWarn(PipelinePhase.READ, "File skipped: exceeds size limit", { path: filePath, reason: "too_large", sizeMb: +sizeInMb.toFixed(2), maxFileSizeMb });
					continue;
				}

				// Read file content
				const content = await file.text();

				// Validate UTF-8 encoding by checking for replacement character
				// Bun.file().text() will replace invalid sequences with replacement char
				if (content.includes("\uFFFD")) {
					bus?.emitError(PipelinePhase.READ, {
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
				bus?.emitError(PipelinePhase.READ, {
					path: filePath,
					message,
					code,
					userMessage: this.toUserMessage(code),
				});
			}
		}

		bus?.emitInfo(PipelinePhase.READ, "Read complete", { filesRead: result.contents.length, filesSkipped: result.skipped.length });

		return result;
	}

	private validateConfig(
		rootDir: string,
		originalPath: string,
	): DiscoveryError | null {
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
		bus?: PipelineEventBus,
	): Promise<number> {
		const exclusionGlobs = config.exclude.map((p) => new Glob(p));
		let errorCount = 0;

		for (const filePath of files) {
			if (this.isSkipped(filePath, exclusionGlobs, result, bus)) {
				continue;
			}

			const error = await this.validateAndIncludeFile(filePath, result);
			if (error) {
				bus?.emitError(PipelinePhase.DISCOVERY, error);
				errorCount++;
			}
		}

		return errorCount;
	}

	private isSkipped(
		filePath: string,
		exclusionGlobs: Glob[],
		result: DiscoveredFiles,
		bus?: PipelineEventBus,
	): boolean {
		// Check if it's markdown
		if (extname(filePath).toLowerCase() !== ".md") {
			result.skipped.push({
				path: filePath,
				reason: SkipReason.NOT_MARKDOWN,
			});
			bus?.emitWarn(PipelinePhase.DISCOVERY, "File skipped: not a markdown file", { path: filePath, reason: "not_markdown" });
			return true;
		}

		// Check exclusions
		for (const glob of exclusionGlobs) {
			if (glob.match(filePath)) {
				result.skipped.push({
					path: filePath,
					reason: SkipReason.EXCLUDED_PATTERN,
				});
				bus?.emitWarn(PipelinePhase.DISCOVERY, "File skipped: matched exclusion pattern", { path: filePath, reason: "excluded_pattern" });
				return true;
			}
		}

		return false;
	}

	private async validateAndIncludeFile(
		filePath: string,
		result: DiscoveredFiles,
	): Promise<DiscoveryError | null> {
		try {
			const file = Bun.file(filePath);
			if (!(await file.exists())) {
				return {
					path: filePath,
					message: "File does not exist",
					code: "ENOENT",
					userMessage: this.toUserMessage("ENOENT"),
				};
			}

			// Phase 1: Only check file existence, not size
			// Size validation happens in Phase 1b (readFiles)
			result.files.push(filePath);
			return null;
		} catch (error: unknown) {
			const message =
				error instanceof Error ? error.message : "Error accessing file";
			const code = (error as { code?: string })?.code || "EACCES";
			return {
				path: filePath,
				message,
				code,
				userMessage: this.toUserMessage(code),
			};
		}
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
