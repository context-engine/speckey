import { afterAll, beforeAll, describe, expect, it } from "bun:test";
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
            // Defaults for unspecified fields
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
    });

    // ============================================================
    // Feature: Config Merging
    // ============================================================

    describe("mergeWithCLI", () => {
        it("should merge CLI exclude with base config", () => {
            const base = {
                include: ["**/*.md"],
                exclude: ["**/node_modules/**"],
                maxFiles: 10000,
                maxFileSizeMb: 10,
            };

            const merged = ConfigLoader.mergeWithCLI(base, ["*.test.md", "README.md"]);

            expect(merged.exclude).toContain("**/node_modules/**");
            expect(merged.exclude).toContain("*.test.md");
            expect(merged.exclude).toContain("README.md");
        });

        it("should not modify base config", () => {
            const base = {
                include: ["**/*.md"],
                exclude: ["**/node_modules/**"],
                maxFiles: 10000,
                maxFileSizeMb: 10,
            };

            ConfigLoader.mergeWithCLI(base, ["*.test.md"]);

            expect(base.exclude).toEqual(["**/node_modules/**"]);
        });
    });
});
