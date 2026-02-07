import { describe, expect, it } from "bun:test";
import { parseArgs } from "../src/args";
import { Command } from "../src/types";

// ============================================================
// Feature: Subcommand Dispatch
// ============================================================

describe("parseArgs", () => {
    describe("Subcommand Dispatch", () => {
        it("should resolve parse command", () => {
            const result = parseArgs(["parse", "./specs"]);
            expect(result.command).toBe(Command.PARSE);
        });

        it("should resolve validate command", () => {
            const result = parseArgs(["validate", "./specs"]);
            expect(result.command).toBe(Command.VALIDATE);
        });

        it("should resolve sync command", () => {
            const result = parseArgs(["sync", "./specs"]);
            expect(result.command).toBe(Command.SYNC);
        });

        it("should parse command with positional paths", () => {
            const result = parseArgs(["parse", "./docs", "./specs"]);
            expect(result.command).toBe(Command.PARSE);
            expect(result.paths).toEqual(["./docs", "./specs"]);
        });

        it("should default to current directory when no paths specified", () => {
            const result = parseArgs(["parse"]);
            expect(result.command).toBe(Command.PARSE);
            expect(result.paths).toEqual(["."]);
        });

        it("should throw for unknown subcommand", () => {
            expect(() => parseArgs(["unknown", "./specs"])).toThrow("unknown command");
        });

        it("should throw when only flags provided (no subcommand)", () => {
            expect(() => parseArgs(["--verbose"])).toThrow();
        });
    });

    // ============================================================
    // Feature: Boolean Flags
    // ============================================================

    describe("Boolean Flags", () => {
        it("should parse --verbose flag", () => {
            const result = parseArgs(["parse", "--verbose"]);
            expect(result.verbose).toBe(true);
        });

        it("should parse --quiet flag", () => {
            const result = parseArgs(["parse", "--quiet"]);
            expect(result.quiet).toBe(true);
        });

        it("should parse --json flag", () => {
            const result = parseArgs(["parse", "--json"]);
            expect(result.json).toBe(true);
        });

        it("should parse --no-config flag", () => {
            const result = parseArgs(["parse", "--no-config"]);
            expect(result.noConfig).toBe(true);
        });
    });

    // ============================================================
    // Feature: Short Flag Aliases
    // ============================================================

    describe("Short Flag Aliases", () => {
        it("should parse -v as verbose", () => {
            const result = parseArgs(["parse", "./specs", "-v"]);
            expect(result.verbose).toBe(true);
        });

        it("should parse -q as quiet", () => {
            const result = parseArgs(["parse", "./specs", "-q"]);
            expect(result.quiet).toBe(true);
        });
    });

    // ============================================================
    // Feature: Value Flags
    // ============================================================

    describe("Value Flags", () => {
        it("should parse --config with value", () => {
            const result = parseArgs(["parse", "--config", "/custom/config.json"]);
            expect(result.configPath).toBe("/custom/config.json");
        });

        it("should parse --exclude with value", () => {
            const result = parseArgs(["parse", "--exclude", "*.test.md"]);
            expect(result.exclude).toContain("*.test.md");
        });

        it("should parse multiple --exclude flags", () => {
            const result = parseArgs(["parse", "--exclude", "*.test.md", "--exclude", "README.md"]);
            expect(result.exclude).toEqual(["*.test.md", "README.md"]);
        });

        it("should parse --include with single pattern", () => {
            const result = parseArgs(["parse", "--include", "phase-1/**/*.md"]);
            expect(result.include).toEqual(["phase-1/**/*.md"]);
        });

        it("should parse multiple --include flags", () => {
            const result = parseArgs([
                "parse",
                "--include", "phase-1/**/*.md",
                "--include", "phase-2/**/*.md",
            ]);
            expect(result.include).toEqual(["phase-1/**/*.md", "phase-2/**/*.md"]);
        });

        it("should parse --db-path with value", () => {
            const result = parseArgs(["sync", "--db-path", "./data.db"]);
            expect(result.dbPath).toBe("./data.db");
        });

    });

    // ============================================================
    // Feature: Error Handling
    // ============================================================

    describe("Error Handling", () => {
        it("should throw error for unknown long flag", () => {
            expect(() => parseArgs(["parse", "--unknown-flag"])).toThrow("unknown option");
        });

        it("should throw error for unknown short flag", () => {
            expect(() => parseArgs(["parse", "-x"])).toThrow("unknown option");
        });

        it("should throw error for --verbose + --quiet conflict", () => {
            expect(() => parseArgs(["parse", "--verbose", "--quiet"])).toThrow("Conflicting flags");
        });
    });

    // ============================================================
    // Feature: Combined Arguments
    // ============================================================

    describe("Combined Arguments", () => {
        it("should handle command with paths and flags", () => {
            const result = parseArgs(["parse", "./docs", "--verbose", "./specs"]);
            expect(result.command).toBe(Command.PARSE);
            expect(result.paths).toEqual(["./docs", "./specs"]);
            expect(result.verbose).toBe(true);
        });

        it("should handle config with exclude and paths", () => {
            const result = parseArgs([
                "parse",
                "./docs",
                "--config",
                "/my/config.json",
                "--exclude",
                "*.test.md",
            ]);
            expect(result.command).toBe(Command.PARSE);
            expect(result.paths).toEqual(["./docs"]);
            expect(result.configPath).toBe("/my/config.json");
            expect(result.exclude).toContain("*.test.md");
        });

        it("should handle sync with db-path", () => {
            const result = parseArgs(["sync", "./specs", "--db-path", "./data.db"]);
            expect(result.command).toBe(Command.SYNC);
            expect(result.dbPath).toBe("./data.db");
        });

        it("should handle include with exclude and paths", () => {
            const result = parseArgs([
                "parse",
                "./specs",
                "--include", "phase-1/**/*.md",
                "--exclude", "**/*test.md",
            ]);
            expect(result.command).toBe(Command.PARSE);
            expect(result.paths).toEqual(["./specs"]);
            expect(result.include).toEqual(["phase-1/**/*.md"]);
            expect(result.exclude).toEqual(["**/*test.md"]);
        });
    });

    // ============================================================
    // Feature: Help/Version
    // ============================================================

    describe("Help/Version", () => {
        it("should return help flag for --help", () => {
            const result = parseArgs(["--help"]);
            expect(result.help).toBe(true);
        });

        it("should return version flag for --version", () => {
            const result = parseArgs(["--version"]);
            expect(result.version).toBe(true);
        });

        it("should return help flag for -h", () => {
            const result = parseArgs(["-h"]);
            expect(result.help).toBe(true);
        });

        it("should return help flag for subcommand --help", () => {
            const result = parseArgs(["parse", "--help"]);
            expect(result.help).toBe(true);
        });
    });

    // ============================================================
    // Feature: Equals Syntax (handled by commander)
    // ============================================================

    describe("Equals Syntax", () => {
        it("should parse --config=path syntax", () => {
            const result = parseArgs(["parse", "--config=/custom/config.json"]);
            expect(result.configPath).toBe("/custom/config.json");
        });

        it("should parse --include=pattern syntax", () => {
            const result = parseArgs(["parse", "--include=phase-1/**/*.md"]);
            expect(result.include).toEqual(["phase-1/**/*.md"]);
        });

    });
});
