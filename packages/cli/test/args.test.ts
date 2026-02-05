import { describe, expect, it } from "bun:test";
import { parseArgs, resolveCommand } from "../src/args";
import { Command } from "../src/types";

// ============================================================
// Feature: Subcommand Dispatch
// ============================================================

describe("resolveCommand", () => {
    it("should resolve 'parse' to Command.PARSE", () => {
        expect(resolveCommand("parse")).toBe(Command.PARSE);
    });

    it("should resolve 'validate' to Command.VALIDATE", () => {
        expect(resolveCommand("validate")).toBe(Command.VALIDATE);
    });

    it("should resolve 'sync' to Command.SYNC", () => {
        expect(resolveCommand("sync")).toBe(Command.SYNC);
    });

    it("should throw for missing subcommand", () => {
        expect(() => resolveCommand(undefined)).toThrow("Missing subcommand");
    });

    it("should throw for unknown subcommand", () => {
        expect(() => resolveCommand("unknown")).toThrow('Unknown command "unknown"');
    });

    it("should throw for flag as subcommand", () => {
        expect(() => resolveCommand("--verbose")).toThrow("Missing subcommand");
    });
});

// ============================================================
// Feature: Argument Parsing - Subcommand + Paths
// ============================================================

describe("parseArgs", () => {
    describe("Subcommand Parsing", () => {
        it("should parse command and positional paths", () => {
            const result = parseArgs(["parse", "./docs", "./specs"]);
            expect(result.command).toBe(Command.PARSE);
            expect(result.paths).toEqual(["./docs", "./specs"]);
        });

        it("should parse validate command", () => {
            const result = parseArgs(["validate", "./specs"]);
            expect(result.command).toBe(Command.VALIDATE);
            expect(result.paths).toEqual(["./specs"]);
        });

        it("should parse sync command", () => {
            const result = parseArgs(["sync", "./specs"]);
            expect(result.command).toBe(Command.SYNC);
            expect(result.paths).toEqual(["./specs"]);
        });

        it("should default to current directory when no paths specified", () => {
            const result = parseArgs(["parse"]);
            expect(result.command).toBe(Command.PARSE);
            expect(result.paths).toEqual(["."]);
        });

        it("should throw when no subcommand provided", () => {
            expect(() => parseArgs([])).toThrow("Missing subcommand");
        });

        it("should throw when only flags provided (no subcommand)", () => {
            expect(() => parseArgs(["--verbose"])).toThrow("Missing subcommand");
        });

        it("should throw for unknown subcommand", () => {
            expect(() => parseArgs(["unknown", "./specs"])).toThrow('Unknown command "unknown"');
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

        it("should parse --serial flag", () => {
            const result = parseArgs(["parse", "--serial"]);
            expect(result.serial).toBe(true);
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

        it("should parse -h as help", () => {
            const result = parseArgs(["-h"]);
            expect(result.help).toBe(true);
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

        it("should throw error when --config missing value", () => {
            expect(() => parseArgs(["parse", "--config"])).toThrow("--config requires a value");
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

        it("should throw error when --db-path missing value", () => {
            expect(() => parseArgs(["sync", "--db-path"])).toThrow("--db-path requires a value");
        });

        it("should parse --workers with value", () => {
            const result = parseArgs(["parse", "--workers", "4"]);
            expect(result.workers).toBe(4);
        });

        it("should throw error when --workers value is out of range", () => {
            expect(() => parseArgs(["parse", "--workers", "0"])).toThrow("--workers must be a number between 1 and 32");
        });

        it("should throw error when --workers value is not a number", () => {
            expect(() => parseArgs(["parse", "--workers", "abc"])).toThrow("--workers must be a number between 1 and 32");
        });
    });

    // ============================================================
    // Feature: Error Handling
    // ============================================================

    describe("Error Handling", () => {
        it("should throw error for unknown long flag", () => {
            expect(() => parseArgs(["parse", "--unknown-flag"])).toThrow("Unknown flag: --unknown-flag");
        });

        it("should throw error for unknown short flag", () => {
            expect(() => parseArgs(["parse", "-x"])).toThrow("Unknown flag: -x");
        });

        it("should throw error for --verbose + --quiet conflict", () => {
            expect(() => parseArgs(["parse", "--verbose", "--quiet"])).toThrow("Conflicting flags");
        });

        it("should throw error for --exclude missing value", () => {
            expect(() => parseArgs(["parse", "--exclude"])).toThrow("--exclude requires a value");
        });

        it("should throw error for --include missing value", () => {
            expect(() => parseArgs(["parse", "--include"])).toThrow("--include requires a value");
        });

        it("should throw error for --workers above max (33)", () => {
            expect(() => parseArgs(["parse", "--workers", "33"])).toThrow("--workers must be a number between 1 and 32");
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

        it("should handle sync with db-path and workers", () => {
            const result = parseArgs(["sync", "./specs", "--db-path", "./data.db", "--workers", "2"]);
            expect(result.command).toBe(Command.SYNC);
            expect(result.dbPath).toBe("./data.db");
            expect(result.workers).toBe(2);
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
    // Feature: Help/Version without subcommand
    // ============================================================

    describe("Help/Version without subcommand", () => {
        it("should allow --help without subcommand", () => {
            const result = parseArgs(["--help"]);
            expect(result.help).toBe(true);
        });

        it("should allow --version without subcommand", () => {
            const result = parseArgs(["--version"]);
            expect(result.version).toBe(true);
        });

        it("should allow -h without subcommand", () => {
            const result = parseArgs(["-h"]);
            expect(result.help).toBe(true);
        });
    });
});
