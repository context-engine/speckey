import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ConfigLoader } from "../src/config-loader";

describe("ConfigLoader", () => {
    const testDir = resolve("./test-temp-config");

    beforeAll(async () => {
        await mkdir(testDir, { recursive: true });
        await mkdir(join(testDir, ".git"), { recursive: true }); // Simulate git root
    });

    afterAll(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    // ============================================================
    // Feature: Config File Discovery
    // ============================================================

    describe("findConfigFile", () => {
        it("should find config in current directory", async () => {
            const configPath = join(testDir, "speckey.config.json");
            await writeFile(configPath, JSON.stringify({ include: ["*.md"] }));

            const found = ConfigLoader.findConfigFile(testDir);

            expect(found).toBe(configPath);

            await rm(configPath);
        });

        it("should find .speckey.json alternative", async () => {
            const configPath = join(testDir, ".speckey.json");
            await writeFile(configPath, JSON.stringify({ include: ["*.md"] }));

            const found = ConfigLoader.findConfigFile(testDir);

            expect(found).toBe(configPath);

            await rm(configPath);
        });

        it("should return undefined when no config exists", () => {
            const found = ConfigLoader.findConfigFile(testDir);
            expect(found).toBeUndefined();
        });

        it("should find config at git root", async () => {
            const subDir = join(testDir, "nested", "deep");
            await mkdir(subDir, { recursive: true });
            const configPath = join(testDir, "speckey.config.json");
            await writeFile(configPath, JSON.stringify({ include: ["*.md"] }));

            const found = ConfigLoader.findConfigFile(subDir);

            expect(found).toBe(configPath);

            await rm(configPath);
            await rm(join(testDir, "nested"), { recursive: true });
        });

        it("should use SPECKEY_CONFIG env var when set", async () => {
            const envConfigPath = join(testDir, "env-config.json");
            await writeFile(envConfigPath, JSON.stringify({ include: ["*.md"] }));

            const originalEnv = process.env.SPECKEY_CONFIG;
            process.env.SPECKEY_CONFIG = envConfigPath;

            try {
                const found = ConfigLoader.findConfigFile(testDir);
                expect(found).toBe(envConfigPath);
            } finally {
                if (originalEnv === undefined) {
                    delete process.env.SPECKEY_CONFIG;
                } else {
                    process.env.SPECKEY_CONFIG = originalEnv;
                }
                await rm(envConfigPath);
            }
        });

        it("should prefer --config (caller) over SPECKEY_CONFIG", async () => {
            // This tests that when a caller provides a path, it takes priority.
            // The caller (CLI) checks --config before calling findConfigFile.
            // findConfigFile itself checks SPECKEY_CONFIG first among auto-discovery.
            const envConfigPath = join(testDir, "env-config.json");
            const flagConfigPath = join(testDir, "flag-config.json");
            await writeFile(envConfigPath, JSON.stringify({ include: ["env.md"] }));
            await writeFile(flagConfigPath, JSON.stringify({ include: ["flag.md"] }));

            const originalEnv = process.env.SPECKEY_CONFIG;
            process.env.SPECKEY_CONFIG = envConfigPath;

            try {
                // When --config is provided, CLI passes it directly to load(), bypassing findConfigFile
                const config = await ConfigLoader.load(flagConfigPath);
                expect(config.include).toEqual(["flag.md"]);
            } finally {
                if (originalEnv === undefined) {
                    delete process.env.SPECKEY_CONFIG;
                } else {
                    process.env.SPECKEY_CONFIG = originalEnv;
                }
                await rm(envConfigPath);
                await rm(flagConfigPath);
            }
        });
    });

    // ============================================================
    // Feature: Config Loading
    // ============================================================

    describe("load", () => {
        it("should return defaults when path is undefined", async () => {
            const config = await ConfigLoader.load(undefined);

            expect(config.include).toEqual(["**/*.md"]);
            expect(config.exclude).toEqual(["**/node_modules/**"]);
            expect(config.maxFiles).toBe(10000);
            expect(config.maxFileSizeMb).toBe(10);
        });

        it("should load valid JSON config file", async () => {
            const configPath = join(testDir, "valid.config.json");
            await writeFile(configPath, JSON.stringify({
                include: ["docs/**/*.md"],
                maxFiles: 500,
            }));

            const config = await ConfigLoader.load(configPath);

            expect(config.include).toEqual(["docs/**/*.md"]);
            expect(config.maxFiles).toBe(500);
            expect(config.exclude).toEqual(["**/node_modules/**"]);

            await rm(configPath);
        });

        it("should throw error for invalid JSON", async () => {
            const configPath = join(testDir, "invalid.config.json");
            await writeFile(configPath, "{ invalid json }");

            await expect(ConfigLoader.load(configPath)).rejects.toThrow("Invalid config file");

            await rm(configPath);
        });

        it("should use defaults for missing optional fields", async () => {
            const configPath = join(testDir, "partial.config.json");
            await writeFile(configPath, JSON.stringify({ include: ["*.md"] }));

            const config = await ConfigLoader.load(configPath);

            expect(config.include).toEqual(["*.md"]);
            expect(config.exclude).toEqual(["**/node_modules/**"]);
            expect(config.maxFiles).toBe(10000);
            expect(config.maxFileSizeMb).toBe(10);

            await rm(configPath);
        });

        it("should support nested config structure (discovery.*)", async () => {
            const configPath = join(testDir, "nested.config.json");
            await writeFile(configPath, JSON.stringify({
                discovery: {
                    exclude: ["**/test/**"],
                    max_file_count: 5000,
                    max_file_size_mb: 5,
                },
            }));

            const config = await ConfigLoader.load(configPath);

            expect(config.exclude).toEqual(["**/test/**"]);
            expect(config.maxFiles).toBe(5000);
            expect(config.maxFileSizeMb).toBe(5);

            await rm(configPath);
        });

        it("should prefer nested discovery.* over flat fields", async () => {
            const configPath = join(testDir, "mixed.config.json");
            await writeFile(configPath, JSON.stringify({
                maxFiles: 1000,
                discovery: {
                    max_file_count: 2000,
                },
            }));

            const config = await ConfigLoader.load(configPath);

            // Nested takes priority
            expect(config.maxFiles).toBe(2000);

            await rm(configPath);
        });
    });

    // ============================================================
    // Feature: Config Merging
    // ============================================================

    describe("Nested Config Mapping", () => {
        it("should map discovery.max_file_size_mb to maxFileSizeMb", async () => {
            const configPath = join(testDir, "size.config.json");
            await writeFile(configPath, JSON.stringify({
                discovery: {
                    max_file_size_mb: 25,
                },
            }));

            const config = await ConfigLoader.load(configPath);

            expect(config.maxFileSizeMb).toBe(25);

            await rm(configPath);
        });

        it("should map discovery.include to include", async () => {
            const configPath = join(testDir, "include.config.json");
            await writeFile(configPath, JSON.stringify({
                discovery: {
                    include: ["docs/**/*.md"],
                },
            }));

            const config = await ConfigLoader.load(configPath);

            expect(config.include).toEqual(["docs/**/*.md"]);

            await rm(configPath);
        });
    });

    describe("mergeWithCLI", () => {
        it("should append CLI exclude to base config exclude", () => {
            const base = {
                include: ["**/*.md"],
                exclude: ["**/node_modules/**"],
                maxFiles: 10000,
                maxFileSizeMb: 10,
            };

            const merged = ConfigLoader.mergeWithCLI(base, ["*.test.md", "README.md"], []);

            expect(merged.exclude).toContain("**/node_modules/**");
            expect(merged.exclude).toContain("*.test.md");
            expect(merged.exclude).toContain("README.md");
        });

        it("should replace base include when CLI include is provided", () => {
            const base = {
                include: ["**/*.md"],
                exclude: ["**/node_modules/**"],
                maxFiles: 10000,
                maxFileSizeMb: 10,
            };

            const merged = ConfigLoader.mergeWithCLI(base, [], ["phase-1/**/*.md"]);

            expect(merged.include).toEqual(["phase-1/**/*.md"]);
        });

        it("should keep base include when CLI include is empty", () => {
            const base = {
                include: ["**/*.md"],
                exclude: ["**/node_modules/**"],
                maxFiles: 10000,
                maxFileSizeMb: 10,
            };

            const merged = ConfigLoader.mergeWithCLI(base, [], []);

            expect(merged.include).toEqual(["**/*.md"]);
        });

        it("should handle include replace and exclude append together", () => {
            const base = {
                include: ["**/*.md"],
                exclude: ["**/node_modules/**"],
                maxFiles: 10000,
                maxFileSizeMb: 10,
            };

            const merged = ConfigLoader.mergeWithCLI(
                base,
                ["**/*test.md"],
                ["phase-1/**/*.md"],
            );

            expect(merged.include).toEqual(["phase-1/**/*.md"]);
            expect(merged.exclude).toEqual(["**/node_modules/**", "**/*test.md"]);
        });

        it("should replace with multiple CLI include patterns", () => {
            const base = {
                include: ["**/*.md"],
                exclude: ["**/node_modules/**"],
                maxFiles: 10000,
                maxFileSizeMb: 10,
            };

            const merged = ConfigLoader.mergeWithCLI(
                base,
                [],
                ["phase-1/**/*.md", "phase-2/**/*.md"],
            );

            expect(merged.include).toEqual(["phase-1/**/*.md", "phase-2/**/*.md"]);
        });

        it("should not modify base config", () => {
            const base = {
                include: ["**/*.md"],
                exclude: ["**/node_modules/**"],
                maxFiles: 10000,
                maxFileSizeMb: 10,
            };

            ConfigLoader.mergeWithCLI(base, ["*.test.md"], ["phase-1/**/*.md"]);

            expect(base.exclude).toEqual(["**/node_modules/**"]);
            expect(base.include).toEqual(["**/*.md"]);
        });
    });
});
