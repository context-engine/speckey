import { describe, expect, it, spyOn, beforeEach, afterEach } from "bun:test";
import { ProgressReporter } from "../src/progress-reporter";
import { Command } from "../src/types";
import type { PipelineResult, PipelineStats, PipelineError } from "@speckey/core";
import type { WriteResult } from "@speckey/database";

describe("ProgressReporter", () => {
    let consoleLogs: string[];
    let consoleErrors: string[];
    let logSpy: ReturnType<typeof spyOn>;
    let errorSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
        consoleLogs = [];
        consoleErrors = [];
        logSpy = spyOn(console, "log").mockImplementation((msg: string) => {
            consoleLogs.push(msg);
        });
        errorSpy = spyOn(console, "error").mockImplementation((msg: string) => {
            consoleErrors.push(msg);
        });
    });

    afterEach(() => {
        logSpy.mockRestore();
        errorSpy.mockRestore();
    });

    const createMockStats = (overrides?: Partial<PipelineStats>): PipelineStats => ({
        filesDiscovered: 47,
        filesRead: 47,
        filesParsed: 47,
        blocksExtracted: 50,
        errorsCount: 0,
        entitiesBuilt: 142,
        entitiesInserted: 0,
        entitiesUpdated: 0,
        validationErrors: 0,
        ...overrides,
    });

    const createMockResult = (overrides?: Partial<PipelineResult>): PipelineResult => ({
        files: [],
        errors: [],
        stats: createMockStats(),
        classSpecs: new Array(142).fill({ fqn: "test" }),
        ...overrides,
    });

    // ============================================================
    // Feature: Progress Updates
    // ============================================================

    describe("Progress Updates", () => {
        it("should initialize with total count", () => {
            const reporter = new ProgressReporter("normal");
            reporter.start(10);

            expect(consoleLogs.some((log) => log.includes("10"))).toBe(true);
        });

        it("should update progress in verbose mode", () => {
            const reporter = new ProgressReporter("verbose");
            reporter.start(10);
            reporter.update(1, "file1.md");

            expect(consoleLogs.some((log) => log.includes("1/10") && log.includes("file1.md"))).toBe(true);
        });

        it("should output JSON progress in json mode", () => {
            const reporter = new ProgressReporter("json");
            reporter.start(10);
            reporter.update(1, "file1.md");

            const jsonLine = consoleLogs.find((log) => log.startsWith("{"));
            expect(jsonLine).toBeDefined();
            const parsed = JSON.parse(jsonLine!);
            expect(parsed.type).toBe("progress");
            expect(parsed.current).toBe(1);
            expect(parsed.file).toBe("file1.md");
        });
    });

    // ============================================================
    // Feature: Parse Command Output
    // ============================================================

    describe("Parse Command Output", () => {
        it("should format parse result with file count, entity count, warnings", () => {
            const reporter = new ProgressReporter("normal");
            const result = createMockResult({
                stats: createMockStats({ filesParsed: 47, errorsCount: 2 }),
            });

            reporter.complete(Command.PARSE, result);

            expect(consoleLogs.some((log) =>
                log.includes("Parse complete") &&
                log.includes("47 files") &&
                log.includes("142 entities") &&
                log.includes("2 warnings")
            )).toBe(true);
        });

        it("should suppress parse output in quiet mode", () => {
            const reporter = new ProgressReporter("quiet");
            const result = createMockResult();

            reporter.complete(Command.PARSE, result);

            expect(consoleLogs).toHaveLength(0);
        });

        it("should output JSON for parse in json mode", () => {
            const reporter = new ProgressReporter("json");
            const result = createMockResult();

            reporter.complete(Command.PARSE, result);

            const jsonLine = consoleLogs.find((log) => log.includes("complete"));
            expect(jsonLine).toBeDefined();
            const parsed = JSON.parse(jsonLine!);
            expect(parsed.type).toBe("complete");
            expect(parsed.command).toBe("parse");
            expect(parsed.stats).toBeDefined();
            expect(parsed.entities).toBe(142);
        });
    });

    // ============================================================
    // Feature: Validate Command Output
    // ============================================================

    describe("Validate Command Output", () => {
        it("should format validation report with resolved counts", () => {
            const reporter = new ProgressReporter("normal");
            const result = createMockResult({
                validationReport: {
                    resolved: new Array(89).fill({ entityFqn: "a", targetFqn: "b", payloadType: "type" }),
                    unresolved: [],
                    errors: [],
                },
            });

            reporter.complete(Command.VALIDATE, result);

            expect(consoleLogs.some((log) => log.includes("89 resolved"))).toBe(true);
        });

        it("should format validation report with unresolved references", () => {
            const reporter = new ProgressReporter("normal");
            const result = createMockResult({
                validationReport: {
                    resolved: [],
                    unresolved: [
                        { entityFqn: "SessionManager", targetFqn: "CustomTransport", payloadType: "type", specFile: "session.md", specLine: 7 },
                        { entityFqn: "Config", targetFqn: "MissingType", payloadType: "type", specFile: "config.md", specLine: 12 },
                    ],
                    errors: [],
                },
            });

            reporter.complete(Command.VALIDATE, result);

            const output = consoleLogs.join("\n");
            expect(output).toInclude("2 unresolved");
            expect(output).toInclude("session.md:7");
            expect(output).toInclude("CustomTransport");
        });

        it("should output JSON for validate in json mode", () => {
            const reporter = new ProgressReporter("json");
            const result = createMockResult({
                validationReport: {
                    resolved: [{ entityFqn: "a", targetFqn: "b", payloadType: "type" }],
                    unresolved: [],
                    errors: [],
                },
            });

            reporter.complete(Command.VALIDATE, result);

            const jsonLine = consoleLogs.find((log) => log.includes("complete"));
            expect(jsonLine).toBeDefined();
            const parsed = JSON.parse(jsonLine!);
            expect(parsed.validationReport).toBeDefined();
            expect(parsed.validationReport.resolved).toHaveLength(1);
        });
    });

    // ============================================================
    // Feature: Sync Command Output
    // ============================================================

    describe("Sync Command Output", () => {
        it("should format sync result with write counts", () => {
            const reporter = new ProgressReporter("normal");
            const result = createMockResult({
                validationReport: { resolved: [], unresolved: [], errors: [] },
                writeResult: {
                    inserted: 12,
                    updated: 130,
                    orphaned: 3,
                    deleted: 0,
                    total: 145,
                    errors: [],
                    orphanedEntities: [],
                } as WriteResult,
            });

            reporter.complete(Command.SYNC, result);

            const output = consoleLogs.join("\n");
            expect(output).toInclude("Inserted: 12");
            expect(output).toInclude("Updated: 130");
            expect(output).toInclude("Orphaned: 3");
        });

        it("should show validation failure and write aborted", () => {
            const reporter = new ProgressReporter("normal");
            const result = createMockResult({
                validationReport: {
                    resolved: [],
                    unresolved: [],
                    errors: [{ code: "UNRESOLVED_TYPE" as any, message: "err", entityFqn: "a", targetFqn: "b" }],
                },
                writeResult: undefined,
            });

            reporter.complete(Command.SYNC, result);

            const output = consoleLogs.join("\n");
            expect(output).toInclude("Validation failed");
            expect(output).toInclude("write aborted");
        });

        it("should output JSON for sync in json mode", () => {
            const reporter = new ProgressReporter("json");
            const result = createMockResult({
                validationReport: { resolved: [], unresolved: [], errors: [] },
                writeResult: {
                    inserted: 5,
                    updated: 10,
                    orphaned: 0,
                    deleted: 0,
                    total: 15,
                    errors: [],
                    orphanedEntities: [],
                } as WriteResult,
            });

            reporter.complete(Command.SYNC, result);

            const jsonLine = consoleLogs.find((log) => log.includes("complete"));
            expect(jsonLine).toBeDefined();
            const parsed = JSON.parse(jsonLine!);
            expect(parsed.writeResult).toBeDefined();
            expect(parsed.writeResult.inserted).toBe(5);
        });
    });

    // ============================================================
    // Feature: Parse Edge Cases
    // ============================================================

    describe("Parse Edge Cases", () => {
        it("should show warnings count when parse has errors", () => {
            const reporter = new ProgressReporter("normal");
            const result = createMockResult({
                stats: createMockStats({ filesParsed: 10, errorsCount: 5 }),
                classSpecs: new Array(20).fill({ fqn: "test" }),
            });

            reporter.complete(Command.PARSE, result);

            expect(consoleLogs.some((log) =>
                log.includes("5 warnings")
            )).toBe(true);
        });
    });

    // ============================================================
    // Feature: Validate Edge Cases
    // ============================================================

    describe("Validate Edge Cases", () => {
        it("should fall back to parse format when no validationReport", () => {
            const reporter = new ProgressReporter("normal");
            const result = createMockResult({
                validationReport: undefined,
            });

            reporter.complete(Command.VALIDATE, result);

            expect(consoleLogs.some((log) => log.includes("Parse complete"))).toBe(true);
        });
    });

    // ============================================================
    // Feature: Sync Edge Cases
    // ============================================================

    describe("Sync Edge Cases", () => {
        it("should display orphaned count with policy", () => {
            const reporter = new ProgressReporter("normal");
            const result = createMockResult({
                validationReport: { resolved: [], unresolved: [], errors: [] },
                writeResult: {
                    inserted: 0,
                    updated: 10,
                    orphaned: 5,
                    deleted: 0,
                    total: 15,
                    errors: [],
                    orphanedEntities: [],
                } as WriteResult,
            });

            reporter.complete(Command.SYNC, result);

            const output = consoleLogs.join("\n");
            expect(output).toInclude("Orphaned: 5");
            expect(output).toInclude("keep");
        });
    });

    // ============================================================
    // Feature: Error Display
    // ============================================================

    describe("Error Display", () => {
        it("should format error with phase and message", () => {
            const reporter = new ProgressReporter("normal");
            const error: PipelineError = {
                phase: "read",
                path: "/path/to/file.md",
                message: "Permission denied",
                code: "EACCES",
                userMessage: "Permission denied: /path/to/file.md",
            };

            reporter.error(error);

            expect(consoleErrors.some((log) =>
                log.includes("read") && log.includes("Permission denied")
            )).toBe(true);
        });

        it("should display both userMessage and system message by default", () => {
            const reporter = new ProgressReporter("normal");
            const error: PipelineError = {
                phase: "discovery",
                path: "/bad/path",
                message: "ENOENT: no such file or directory",
                code: "ENOENT",
                userMessage: "Path does not exist: /bad/path",
            };

            reporter.error(error);

            const output = consoleErrors.join("\n");
            expect(output).toInclude("[discovery]");
            expect(output).toInclude("/bad/path");
            expect(output).toInclude("Path does not exist: /bad/path");
            expect(output).toInclude("ENOENT: no such file or directory");
        });

        it("should display both userMessage and system message in verbose mode", () => {
            const reporter = new ProgressReporter("verbose");
            const error: PipelineError = {
                phase: "discovery",
                path: "/bad/path",
                message: "ENOENT: no such file or directory",
                code: "ENOENT",
                userMessage: "Path does not exist: /bad/path",
            };

            reporter.error(error);

            const output = consoleErrors.join("\n");
            expect(output).toInclude("Path does not exist: /bad/path");
            expect(output).toInclude("ENOENT: no such file or directory");
        });

        it("should display only system message in quiet mode", () => {
            const reporter = new ProgressReporter("quiet");
            const error: PipelineError = {
                phase: "discovery",
                path: "/bad/path",
                message: "ENOENT: no such file or directory",
                code: "ENOENT",
                userMessage: "Path does not exist: /bad/path",
            };

            reporter.error(error);

            const output = consoleErrors.join("\n");
            expect(output).toInclude("[discovery] /bad/path: ENOENT: no such file or directory");
        });

        it("should output JSON error in json mode", () => {
            const reporter = new ProgressReporter("json");
            const error: PipelineError = {
                phase: "parse",
                path: "/path/to/file.md",
                message: "Invalid syntax",
                code: "PARSE_ERROR",
                userMessage: "Unexpected error accessing: /path/to/file.md",
            };

            reporter.error(error);

            const jsonLine = consoleLogs.find((log) => log.includes("error"));
            expect(jsonLine).toBeDefined();
            const parsed = JSON.parse(jsonLine!);
            expect(parsed.type).toBe("error");
            expect(parsed.error.phase).toBe("parse");
            expect(parsed.error.userMessage).toBe("Unexpected error accessing: /path/to/file.md");
        });
    });
});
