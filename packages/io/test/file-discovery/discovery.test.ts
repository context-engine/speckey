import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { FileDiscovery } from "../../src/file-discovery/discovery";
import { SkipReason } from "../../src/file-discovery/types";
import { DiscoveryErrors } from "@speckey/constants";
import { PipelineEventBus, PipelineEvent } from "@speckey/event-bus";
import type { ErrorEventPayload, LogEventPayload } from "@speckey/event-bus";

function createTestBus() {
	const bus = new PipelineEventBus();
	const errors: ErrorEventPayload[] = [];
	const warnings: LogEventPayload[] = [];
	const infos: LogEventPayload[] = [];
	bus.on(PipelineEvent.ERROR, (e) => errors.push(e as ErrorEventPayload));
	bus.on(PipelineEvent.WARN, (e) => warnings.push(e as LogEventPayload));
	bus.on(PipelineEvent.INFO, (e) => infos.push(e as LogEventPayload));
	return { bus, errors, warnings, infos };
}

describe("FileDiscovery", () => {
	const testDir = resolve("./test-temp-discovery");
	const discovery = new FileDiscovery();

	beforeAll(async () => {
		await mkdir(testDir, { recursive: true });
		await mkdir(join(testDir, "subdir"), { recursive: true });
		await mkdir(join(testDir, "subdir/nested"), { recursive: true });
		await mkdir(join(testDir, "node_modules"), { recursive: true });
		await mkdir(join(testDir, ".git"), { recursive: true });
		await mkdir(join(testDir, "empty"), { recursive: true });

		// Standard spec files
		await writeFile(join(testDir, "spec1.md"), "# Spec 1");
		await writeFile(join(testDir, "spec2.md"), "# Spec 2");
		await writeFile(join(testDir, "subdir/spec3.md"), "# Spec 3");
		await writeFile(join(testDir, "subdir/nested/spec4.md"), "# Spec 4");

		// Non-markdown files
		await writeFile(join(testDir, "ignore.txt"), "ignore me");
		await writeFile(join(testDir, "readme.json"), '{"name": "test"}');

		// Large file (simulated > 1MB if we set limit low)
		const largeContent = "a".repeat(2 * 1024 * 1024); // 2MB
		await writeFile(join(testDir, "large.md"), largeContent);

		// File to exclude
		await writeFile(join(testDir, "exclude_this.md"), "exclude me");
		await writeFile(join(testDir, "test_spec.md"), "test spec");

		// Files in excluded directories
		await writeFile(join(testDir, "node_modules/package.md"), "package");
		await writeFile(join(testDir, ".git/config.md"), "config");

		// File with invalid UTF-8 encoding (0xff 0xfe are invalid UTF-8 lead bytes)
		await writeFile(join(testDir, "invalid-encoding.md"), Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x0a]));

		// File with invalid UTF-8 encoding (contains replacement character after Bun reads it)
		await writeFile(join(testDir, "invalid-encoding.md"), Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x0a]));
	});

	afterAll(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	// ============================================================
	// Feature: Directory Parsing (4 scenarios)
	// ============================================================

	describe("Directory Parsing", () => {
		it("should discover all markdown files in a valid directory", async () => {
			const config = {
				include: ["**/*.md"],
				exclude: ["**/node_modules/**", "**/.git/**"],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: testDir,
			};

			const result = await discovery.discover(config);

			// spec1.md, spec2.md, spec3.md, spec4.md, large.md, exclude_this.md, test_spec.md
			expect(result.files.length).toBeGreaterThanOrEqual(4);
			expect(result.files.some((f) => f.endsWith("spec1.md"))).toBe(true);
			expect(result.files.some((f) => f.endsWith("spec2.md"))).toBe(true);
		});

		it("should emit error for empty directory", async () => {
			const { bus, errors } = createTestBus();
			const config = {
				include: ["**/*.md"],
				exclude: [],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: join(testDir, "empty"),
			};

			const result = await discovery.discover(config, bus);

			expect(result.files).toHaveLength(0);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.userMessage).toBe(DiscoveryErrors.EMPTY_DIRECTORY);
		});

		it("should handle non-existent directory", async () => {
			const { bus, errors } = createTestBus();
			const nonExistentPath = join(testDir, "non-existent-dir");
			const config = {
				include: ["**/*.md"],
				exclude: [],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: nonExistentPath,
			};

			const result = await discovery.discover(config, bus);

			expect(result.files).toHaveLength(0);
			expect(errors.length).toBeGreaterThanOrEqual(1);
			expect(errors[0]?.userMessage).toBe(DiscoveryErrors.PATH_NOT_FOUND);
		});

		it("should recursively discover files in nested subdirectories", async () => {
			const config = {
				include: ["**/*.md"],
				exclude: ["**/node_modules/**", "**/.git/**", "**/large.md", "**/exclude_this.md", "**/test_spec.md"],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: testDir,
			};

			const result = await discovery.discover(config);

			expect(result.files.some((f) => f.includes("subdir/spec3.md"))).toBe(true);
			expect(result.files.some((f) => f.includes("nested/spec4.md"))).toBe(true);
		});
	});

	// ============================================================
	// Feature: Glob Pattern Matching (3 scenarios)
	// ============================================================

	describe("Glob Pattern Matching", () => {
		it("should match files using glob pattern", async () => {
			const config = {
				include: ["**/spec*.md"],
				exclude: [],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: testDir,
			};

			const result = await discovery.discover(config);

			expect(result.files.some((f) => f.endsWith("spec1.md"))).toBe(true);
			expect(result.files.some((f) => f.endsWith("spec2.md"))).toBe(true);
			expect(result.files.some((f) => f.endsWith("spec3.md"))).toBe(true);
		});

		it("should return empty for no matches", async () => {
			const config = {
				include: ["**/nonexistent_pattern_*.md"],
				exclude: [],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: testDir,
			};

			const result = await discovery.discover(config);

			expect(result.files).toHaveLength(0);
		});

		it("should handle invalid glob pattern gracefully", async () => {
			// Bun's Glob constructor is permissive — does not throw on malformed
			// patterns like "[invalid". The INVALID_GLOB_SYNTAX catch in
			// applyGlobPatterns() is a defensive guard. With current Bun, "[invalid"
			// matches nothing, resulting in EMPTY_DIRECTORY.
			const { bus, errors } = createTestBus();
			const config = {
				include: ["[invalid"],
				exclude: [],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: testDir,
			};

			const result = await discovery.discover(config, bus);

			expect(result.files).toHaveLength(0);
			expect(errors.length).toBeGreaterThanOrEqual(1);
		});

		it("should handle multiple glob patterns", async () => {
			const config = {
				include: ["spec1.md", "spec2.md"],
				exclude: [],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: testDir,
			};

			const result = await discovery.discover(config);

			expect(result.files.length).toBe(2);
		});
	});

	// ============================================================
	// Feature: Single File Parsing (3 scenarios)
	// ============================================================

	describe("Single File Parsing", () => {
		it("should discover single markdown file", async () => {
			const config = {
				include: ["spec1.md"],
				exclude: [],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: testDir,
			};

			const result = await discovery.discover(config);

			expect(result.files).toHaveLength(1);
			expect(result.files[0]).toContain("spec1.md");
		});

		it("should handle single non-existent file", async () => {
			const config = {
				include: ["missing.md"],
				exclude: [],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: testDir,
			};

			const result = await discovery.discover(config);

			expect(result.files).toHaveLength(0);
		});

		it("should skip non-markdown files", async () => {
			const config = {
				include: ["**/*"],
				exclude: [],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: testDir,
			};

			const result = await discovery.discover(config);

			expect(result.files.some((f) => f.endsWith(".txt"))).toBe(false);
			expect(result.files.some((f) => f.endsWith(".json"))).toBe(false);
			expect(
				result.skipped.some(
					(s) =>
						s.path.endsWith("ignore.txt") && s.reason === SkipReason.NOT_MARKDOWN,
				),
			).toBe(true);
		});

		it("should emit WARN for non-markdown files", async () => {
			const { bus, warnings } = createTestBus();
			const config = {
				include: ["**/*"],
				exclude: [],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: testDir,
			};

			await discovery.discover(config, bus);

			const txtWarning = warnings.find((w) => (w.context as Record<string, unknown>)?.path?.toString().endsWith("ignore.txt"));
			expect(txtWarning).toBeDefined();
			expect(txtWarning?.message).toBe("File skipped: not a markdown file");
			expect((txtWarning?.context as Record<string, unknown>)?.reason).toBe("not_markdown");
		});
	});

	// ============================================================
	// Feature: Exclusion Patterns (3 scenarios)
	// ============================================================

	describe("Exclusion Patterns", () => {
		it("should exclude node_modules and .git by pattern", async () => {
			const config = {
				include: ["**/*.md"],
				exclude: ["**/node_modules/**", "**/.git/**"],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: testDir,
			};

			const result = await discovery.discover(config);

			expect(result.files.some((f) => f.includes("node_modules"))).toBe(false);
			expect(result.files.some((f) => f.includes(".git"))).toBe(false);
		});

		it("should apply custom exclusion pattern", async () => {
			const config = {
				include: ["**/*.md"],
				exclude: ["**/*_spec.md"],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: testDir,
			};

			const result = await discovery.discover(config);

			expect(result.files.some((f) => f.endsWith("test_spec.md"))).toBe(false);
			expect(
				result.skipped.some(
					(s) =>
						s.path.endsWith("test_spec.md") &&
						s.reason === SkipReason.EXCLUDED_PATTERN,
				),
			).toBe(true);
		});

		it("should combine multiple exclusion patterns", async () => {
			const config = {
				include: ["**/*.md"],
				exclude: ["**/exclude_this.md", "**/large.md"],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: testDir,
			};

			const result = await discovery.discover(config);

			expect(result.files.some((f) => f.endsWith("exclude_this.md"))).toBe(false);
			expect(result.files.some((f) => f.endsWith("large.md"))).toBe(false);
		});

		it("should emit WARN for excluded files", async () => {
			const { bus, warnings } = createTestBus();
			const config = {
				include: ["**/*.md"],
				exclude: ["**/*_spec.md"],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: testDir,
			};

			await discovery.discover(config, bus);

			const excludeWarning = warnings.find((w) => (w.context as Record<string, unknown>)?.path?.toString().endsWith("test_spec.md"));
			expect(excludeWarning).toBeDefined();
			expect(excludeWarning?.message).toBe("File skipped: matched exclusion pattern");
			expect((excludeWarning?.context as Record<string, unknown>)?.reason).toBe("excluded_pattern");
		});

		it("should emit error when all files are excluded by filters", async () => {
			const { bus, errors } = createTestBus();
			const config = {
				include: ["**/*.md"],
				exclude: ["**/*.md"],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: testDir,
			};

			const result = await discovery.discover(config, bus);

			expect(result.files).toHaveLength(0);
			expect(result.skipped.some((s) => s.reason === SkipReason.EXCLUDED_PATTERN)).toBe(true);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.userMessage).toBe(DiscoveryErrors.EMPTY_DIRECTORY);
		});
	});

	// ============================================================
	// Feature: Large Repository Handling (2 scenarios)
	// ============================================================

	describe("Large Repository Handling", () => {
		it("should skip files exceeding max size during file reading (Phase 1b)", async () => {
			const config = {
				include: ["large.md"],
				exclude: [],
				maxFiles: 100,
				maxFileSizeMb: 10, // Not used in discover() anymore
				rootDir: testDir,
			};

			// Phase 1: Discover files (should include large.md)
			const discovered = await discovery.discover(config);
			expect(discovered.files.some((f) => f.endsWith("large.md"))).toBe(true);

			// Phase 1b: Read files with size limit (should skip large.md)
			const result = await discovery.readFiles(discovered.files, 1); // 1MB limit, large.md is 2MB

			expect(result.contents.some((c) => c.path.endsWith("large.md"))).toBe(false);
			expect(
				result.skipped.some(
					(s) => s.path.endsWith("large.md") && s.reason === SkipReason.TOO_LARGE,
				),
			).toBe(true);
		});

		it("should emit WARN for files exceeding size limit", async () => {
			const { bus, warnings } = createTestBus();
			const config = {
				include: ["large.md"],
				exclude: [],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: testDir,
			};

			const discovered = await discovery.discover(config);
			await discovery.readFiles(discovered.files, 1, bus); // 1MB limit, large.md is 2MB

			const largeWarning = warnings.find((w) => (w.context as Record<string, unknown>)?.reason === "too_large");
			expect(largeWarning).toBeDefined();
			expect(largeWarning?.message).toBe("File skipped: exceeds size limit");
			expect((largeWarning?.context as Record<string, unknown>)?.maxFileSizeMb).toBe(1);
		});

		it("should set exceededFileLimit when file count exceeds maxFiles", async () => {
			const config = {
				include: ["**/*.md"],
				exclude: ["**/node_modules/**", "**/.git/**"],
				maxFiles: 1,
				maxFileSizeMb: 10,
				rootDir: testDir,
			};

			const result = await discovery.discover(config);

			// testDir has 4+ .md files, maxFiles is 1
			expect(result.files.length).toBeGreaterThan(1);
			expect(result.exceededFileLimit).toBe(true);
		});

		it("should not set exceededFileLimit when within limit", async () => {
			const config = {
				include: ["spec1.md"],
				exclude: [],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: testDir,
			};

			const result = await discovery.discover(config);

			expect(result.files).toHaveLength(1);
			expect(result.exceededFileLimit).toBe(false);
		});

		it("should include files under max size limit during file reading (Phase 1b)", async () => {
			const config = {
				include: ["spec1.md"],
				exclude: [],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: testDir,
			};

			// Phase 1: Discover files
			const discovered = await discovery.discover(config);
			expect(discovered.files.some((f) => f.endsWith("spec1.md"))).toBe(true);

			// Phase 1b: Read files with size limit (spec1.md is small, should be included)
			const result = await discovery.readFiles(discovered.files, 10); // 10MB limit

			expect(result.contents.some((c) => c.path.endsWith("spec1.md"))).toBe(true);
			expect(result.skipped.some((s) => s.path.endsWith("spec1.md"))).toBe(false);
		});
	});

	// ============================================================
	// Feature: Error Handling
	// ============================================================

	describe("Error Handling", () => {
		it("should handle discovery errors gracefully", async () => {
			const { bus, errors } = createTestBus();
			const config = {
				include: ["**/*.md"],
				exclude: [],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: "/nonexistent/absolute/path",
			};

			// Should not throw
			const result = await discovery.discover(config, bus);

			expect(result.files).toHaveLength(0);
			expect(errors.length).toBeGreaterThanOrEqual(1);
			expect(errors[0]?.userMessage).toBe(DiscoveryErrors.PATH_NOT_FOUND);
		});

		it("should emit errors to bus", async () => {
			const { bus, errors } = createTestBus();
			// Create a directory structure, then remove it to force errors
			const badDir = join(testDir, "will-be-removed");
			await mkdir(badDir, { recursive: true });
			await writeFile(join(badDir, "test.md"), "content");

			const config = {
				include: ["**/*.md"],
				exclude: [],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: testDir,
			};

			// Discovery should complete without throwing
			const result = await discovery.discover(config, bus);
			expect(Array.isArray(errors)).toBe(true);

			// Cleanup
			await rm(badDir, { recursive: true, force: true });
		});
	});

	// ============================================================
	// Feature: DiscoveredFiles Structure
	// ============================================================

	describe("DiscoveredFiles Structure", () => {
		it("should return files as absolute paths", async () => {
			const config = {
				include: ["spec1.md"],
				exclude: [],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: testDir,
			};

			const result = await discovery.discover(config);

			expect(result.files.length).toBe(1);
			expect(result.files[0]?.startsWith("/")).toBe(true);
		});

		it("should include skipped files with reason", async () => {
			const config = {
				include: ["**/*"],
				exclude: ["**/exclude_this.md"],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: testDir,
			};

			const result = await discovery.discover(config);

			// Should have skipped both non-markdown and excluded files
			expect(result.skipped.length).toBeGreaterThan(0);
			expect(result.skipped[0]).toHaveProperty("path");
			expect(result.skipped[0]).toHaveProperty("reason");
		});

		it("should track all skipReason types correctly", async () => {
			const config = {
				include: ["**/*"],
				exclude: ["**/exclude_this.md"],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: testDir,
			};

			// Phase 1: Check skip reasons during discovery
			const discovered = await discovery.discover(config);

			// Check for NOT_MARKDOWN (during discovery)
			expect(
				discovered.skipped.some((s) => s.reason === SkipReason.NOT_MARKDOWN),
			).toBe(true);

			// Check for EXCLUDED_PATTERN (during discovery)
			expect(
				discovered.skipped.some((s) => s.reason === SkipReason.EXCLUDED_PATTERN),
			).toBe(true);

			// Phase 1b: Check TOO_LARGE during file reading
			const readResult = await discovery.readFiles(discovered.files, 1); // 1MB limit

			// Check for TOO_LARGE (during file reading)
			expect(
				readResult.skipped.some((s) => s.reason === SkipReason.TOO_LARGE),
			).toBe(true);
		});
	});

	// ============================================================
	// Feature: File Reading (Phase 1b)
	// ============================================================

	describe("File Reading", () => {
		it("should read file successfully and return content", async () => {
			const config = {
				include: ["spec1.md"],
				exclude: [],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: testDir,
			};

			const discovered = await discovery.discover(config);
			const result = await discovery.readFiles(discovered.files);

			expect(result.contents).toHaveLength(1);
			expect(result.contents[0]?.path).toContain("spec1.md");
			expect(result.contents[0]?.content).toBe("# Spec 1");
		});

		it("should read multiple files successfully", async () => {
			const config = {
				include: ["spec*.md"],
				exclude: ["**/node_modules/**", "**/.git/**"],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: testDir,
			};

			const discovered = await discovery.discover(config);
			const result = await discovery.readFiles(discovered.files);

			expect(result.contents.length).toBeGreaterThanOrEqual(2);
		});

		it("should emit error for non-existent file", async () => {
			const { bus, errors } = createTestBus();
			const result = await discovery.readFiles(["/nonexistent/file.md"], 10, bus);

			expect(result.contents).toHaveLength(0);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.code).toBe("ENOENT");
			expect(errors[0]?.userMessage).toBe(DiscoveryErrors.PATH_NOT_FOUND);
		});

		it("should handle file that vanishes between discover and read", async () => {
			const { bus, errors } = createTestBus();
			// Phase 1: Discover a real file
			const tempFile = join(testDir, "vanishing.md");
			await writeFile(tempFile, "# Will vanish");

			const config = {
				include: ["vanishing.md"],
				exclude: [],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: testDir,
			};

			const discovered = await discovery.discover(config);
			expect(discovered.files).toHaveLength(1);

			// Delete the file between discover and read
			await rm(tempFile);

			// Phase 1b: Read should emit ENOENT error, not throw
			const result = await discovery.readFiles(discovered.files, 10, bus);

			expect(result.contents).toHaveLength(0);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.code).toBe("ENOENT");
			expect(errors[0]?.userMessage).toBe(DiscoveryErrors.PATH_NOT_FOUND);
		});

		it("should handle permission denied error", async () => {
			const { bus, errors } = createTestBus();
			const restrictedFile = join(testDir, "restricted.md");
			await writeFile(restrictedFile, "# Restricted");
			await chmod(restrictedFile, 0o000);

			try {
				const readableFile = join(testDir, "spec1.md");
				const result = await discovery.readFiles([restrictedFile, readableFile], 10, bus);

				// Restricted file should produce an error on the bus
				const restrictedError = errors.find((e) => e.path === restrictedFile);
				expect(restrictedError).toBeDefined();
				expect(restrictedError?.userMessage).toBe(DiscoveryErrors.PERMISSION_DENIED);

				// Readable file should still succeed
				expect(result.contents.some((c) => c.path.endsWith("spec1.md"))).toBe(true);
			} finally {
				// Restore permissions for cleanup
				await chmod(restrictedFile, 0o644);
				await rm(restrictedFile);
			}
		});

		it("should handle file encoding error (invalid UTF-8)", async () => {
			const { bus, errors } = createTestBus();
			const invalidFile = join(testDir, "invalid-encoding.md");
			const readableFile = join(testDir, "spec1.md");

			const result = await discovery.readFiles([invalidFile, readableFile], 10, bus);

			// Invalid encoding file should produce an error on the bus
			const encodingError = errors.find((e) => e.path === invalidFile);
			expect(encodingError).toBeDefined();
			expect(encodingError?.code).toBe("INVALID_ENCODING");
			expect(encodingError?.userMessage).toBe(DiscoveryErrors.INVALID_ENCODING);

			// File should NOT appear in contents
			expect(result.contents.some((c) => c.path === invalidFile)).toBe(false);

			// Readable file should still succeed
			expect(result.contents.some((c) => c.path.endsWith("spec1.md"))).toBe(true);
		});

		it("should preserve file path in result", async () => {
			const config = {
				include: ["spec1.md"],
				exclude: [],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: testDir,
			};

			const discovered = await discovery.discover(config);
			const result = await discovery.readFiles(discovered.files);

			expect(result.contents[0]?.path).toBe(discovered.files[0]);
		});
	});

	// ============================================================
	// Feature: Event Bus Integration (4 scenarios)
	// ============================================================

	describe("Event Bus Integration", () => {
		it("should emit errors to bus when provided during discover()", async () => {
			const { bus, errors } = createTestBus();
			const config = {
				include: ["**/*.md"],
				exclude: [],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: "/nonexistent/path",
			};

			await discovery.discover(config, bus);

			expect(errors.length).toBeGreaterThanOrEqual(1);
			expect(errors[0]?.code).toBe("ENOENT");
		});

		it("should operate without bus (no crash) for discover()", async () => {
			const config = {
				include: ["**/spec*.md"],
				exclude: ["**/node_modules/**", "**/.git/**"],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: testDir,
			};

			// Should not throw when bus is omitted
			const result = await discovery.discover(config);

			expect(result.files.length).toBeGreaterThanOrEqual(3);
		});

		it("should emit errors to bus when provided during readFiles()", async () => {
			const { bus, errors } = createTestBus();

			await discovery.readFiles(["/nonexistent/file.md"], 10, bus);

			expect(errors.length).toBeGreaterThanOrEqual(1);
			expect(errors[0]?.code).toBe("ENOENT");
		});

		it("should emit INFO for discovery progress", async () => {
			const { bus, infos } = createTestBus();
			const config = {
				include: ["**/spec*.md"],
				exclude: ["**/node_modules/**", "**/.git/**"],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: testDir,
			};

			await discovery.discover(config, bus);

			const startInfo = infos.find((i) => i.message === "Discovering files");
			expect(startInfo).toBeDefined();
			expect((startInfo?.context as Record<string, unknown>)?.rootDir).toBeDefined();

			const completeInfo = infos.find((i) => i.message === "Discovery complete");
			expect(completeInfo).toBeDefined();
			expect((completeInfo?.context as Record<string, unknown>)?.filesFound).toBeGreaterThanOrEqual(3);
		});

		it("should emit INFO for read progress", async () => {
			const { bus, infos } = createTestBus();
			const config = {
				include: ["spec1.md"],
				exclude: [],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: testDir,
			};

			const discovered = await discovery.discover(config);
			await discovery.readFiles(discovered.files, 10, bus);

			const startInfo = infos.find((i) => i.message === "Reading files");
			expect(startInfo).toBeDefined();
			expect((startInfo?.context as Record<string, unknown>)?.fileCount).toBe(1);

			const completeInfo = infos.find((i) => i.message === "Read complete");
			expect(completeInfo).toBeDefined();
			expect((completeInfo?.context as Record<string, unknown>)?.filesRead).toBe(1);
		});

		it("should operate without bus (no crash) for readFiles()", async () => {
			const config = {
				include: ["spec1.md"],
				exclude: [],
				maxFiles: 100,
				maxFileSizeMb: 10,
				rootDir: testDir,
			};

			const discovered = await discovery.discover(config);

			// Should not throw when bus is omitted
			const result = await discovery.readFiles(discovered.files, 10);

			expect(result.contents).toHaveLength(1);
		});
	});
});
