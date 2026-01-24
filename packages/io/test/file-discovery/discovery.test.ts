import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { FileDiscovery } from "../../src/file-discovery/discovery";
import { SkipReason } from "../../src/file-discovery/types";

describe("FileDiscovery", () => {
	const testDir = resolve("./test-temp-discovery");
	const discovery = new FileDiscovery();

	beforeAll(async () => {
		await mkdir(testDir, { recursive: true });
		await mkdir(join(testDir, "subdir"), { recursive: true });

		// Standard spec files
		await writeFile(join(testDir, "spec1.md"), "# Spec 1");
		await writeFile(join(testDir, "spec2.md"), "# Spec 2");
		await writeFile(join(testDir, "subdir/spec3.md"), "# Spec 3");

		// Non-markdown files
		await writeFile(join(testDir, "ignore.txt"), "ignore me");

		// Large file (simulated > 1MB if we set limit low)
		const largeContent = "a".repeat(2 * 1024 * 1024); // 2MB
		await writeFile(join(testDir, "large.md"), largeContent);

		// File to exclude
		await writeFile(join(testDir, "exclude_this.md"), "exclude me");
	});

	afterAll(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	it("should discover all markdown files recursively by default", async () => {
		const config = {
			include: ["**/*.md"],
			exclude: [],
			maxFiles: 100,
			maxFileSizeMb: 10,
			rootDir: testDir,
		};

		const result = await discovery.discover(config);

		expect(result.files.length).toBe(5);
		expect(result.files.some((f) => f.endsWith("spec1.md"))).toBe(true);
		expect(result.files.some((f) => f.endsWith("spec2.md"))).toBe(true);
		expect(result.files.some((f) => f.endsWith("spec3.md"))).toBe(true);
		expect(result.files.some((f) => f.endsWith("large.md"))).toBe(true);
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

		expect(result.files.some((f) => f.endsWith("ignore.txt"))).toBe(false);
		expect(
			result.skipped.some(
				(s) =>
					s.path.endsWith("ignore.txt") && s.reason === SkipReason.NOT_MARKDOWN,
			),
		).toBe(true);
	});

	it("should apply exclusion patterns", async () => {
		const config = {
			include: ["**/*.md"],
			exclude: ["**/exclude_this.md"],
			maxFiles: 100,
			maxFileSizeMb: 10,
			rootDir: testDir,
		};

		const result = await discovery.discover(config);

		expect(result.files.some((f) => f.endsWith("exclude_this.md"))).toBe(false);
		expect(
			result.skipped.some(
				(s) =>
					s.path.endsWith("exclude_this.md") &&
					s.reason === SkipReason.EXCLUDED_PATTERN,
			),
		).toBe(true);
	});

	it("should skip files exceeding max size", async () => {
		const config = {
			include: ["large.md"],
			exclude: [],
			maxFiles: 100,
			maxFileSizeMb: 1, // 1MB limit, large.md is 2MB
			rootDir: testDir,
		};

		const result = await discovery.discover(config);

		expect(result.files.some((f) => f.endsWith("large.md"))).toBe(false);
		expect(
			result.skipped.some(
				(s) => s.path.endsWith("large.md") && s.reason === SkipReason.TOO_LARGE,
			),
		).toBe(true);
	});

	it("should handle non-existent root directory", async () => {
		const config = {
			include: ["**/*.md"],
			exclude: [],
			maxFiles: 100,
			maxFileSizeMb: 1,
			rootDir: join(testDir, "non-existent"),
		};

		const result = await discovery.discover(config);

		expect(result.errors.length).toBeGreaterThan(0);
		// Bun.glob currently might just return empty if rootDir doesn't exist,
		// but resolve() will still point to it.
		// Let's see how our implementation handles it.
	});
});
