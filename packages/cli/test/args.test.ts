import { describe, expect, it } from "bun:test";
import { parseArgs } from "../src/args";

describe("parseArgs", () => {
    // ============================================================
    // Feature: Argument Parsing - Positional Paths
    // ============================================================

    describe("Positional Paths", () => {
        it("should parse positional paths", () => {
            const result = parseArgs(["./docs", "./specs"]);
            expect(result.paths).toEqual(["./docs", "./specs"]);
        });

        it("should default to current directory when no paths specified", () => {
            const result = parseArgs([]);
            expect(result.paths).toEqual(["."]);
        });

        it("should handle single path", () => {
            const result = parseArgs(["./src"]);
            expect(result.paths).toEqual(["./src"]);
        });

        it("should handle multiple paths", () => {
            const result = parseArgs(["./docs", "./specs", "./README.md"]);
            expect(result.paths).toEqual(["./docs", "./specs", "./README.md"]);
        });
    });

    // ============================================================
    // Feature: Argument Parsing - Boolean Flags
    // ============================================================

    describe("Boolean Flags", () => {
        it("should parse --help flag", () => {
            const result = parseArgs(["--help"]);
            expect(result.help).toBe(true);
        });

        it("should parse --version flag", () => {
            const result = parseArgs(["--version"]);
            expect(result.version).toBe(true);
        });

        it("should parse --verbose flag", () => {
            const result = parseArgs(["--verbose"]);
            expect(result.verbose).toBe(true);
        });

        it("should parse --quiet flag", () => {
            const result = parseArgs(["--quiet"]);
            expect(result.quiet).toBe(true);
        });

        it("should parse --json flag", () => {
            const result = parseArgs(["--json"]);
            expect(result.json).toBe(true);
        });

        it("should parse --serial flag", () => {
            const result = parseArgs(["--serial"]);
            expect(result.serial).toBe(true);
        });

        it("should parse --no-config flag", () => {
            const result = parseArgs(["--no-config"]);
            expect(result.noConfig).toBe(true);
        });
    });

    // ============================================================
    // Feature: Argument Parsing - Value Flags
    // ============================================================

    describe("Value Flags", () => {
        it("should parse --config with value", () => {
            const result = parseArgs(["--config", "/custom/config.json"]);
            expect(result.configPath).toBe("/custom/config.json");
        });

        it("should throw error when --config missing value", () => {
            expect(() => parseArgs(["--config"])).toThrow("--config requires a value");
        });

        it("should parse --exclude with value", () => {
            const result = parseArgs(["--exclude", "*.test.md"]);
            expect(result.exclude).toContain("*.test.md");
        });

        it("should parse multiple --exclude flags", () => {
            const result = parseArgs(["--exclude", "*.test.md", "--exclude", "README.md"]);
            expect(result.exclude).toEqual(["*.test.md", "README.md"]);
        });
    });

    // ============================================================
    // Feature: Argument Parsing - Error Handling
    // ============================================================

    describe("Error Handling", () => {
        it("should throw error for unknown long flag", () => {
            expect(() => parseArgs(["--unknown-flag"])).toThrow("Unknown flag: --unknown-flag");
        });

        it("should throw error for unknown short flag", () => {
            expect(() => parseArgs(["-x"])).toThrow("Unknown flag: -x");
        });
    });

    // ============================================================
    // Feature: Combined Arguments
    // ============================================================

    describe("Combined Arguments", () => {
        it("should handle paths with flags", () => {
            const result = parseArgs(["./docs", "--verbose", "./specs"]);
            expect(result.paths).toEqual(["./docs", "./specs"]);
            expect(result.verbose).toBe(true);
        });

        it("should handle config with exclude and paths", () => {
            const result = parseArgs([
                "./docs",
                "--config",
                "/my/config.json",
                "--exclude",
                "*.test.md",
            ]);
            expect(result.paths).toEqual(["./docs"]);
            expect(result.configPath).toBe("/my/config.json");
            expect(result.exclude).toContain("*.test.md");
        });
    });
});
