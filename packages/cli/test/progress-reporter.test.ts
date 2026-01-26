import { describe, expect, it, spyOn, beforeEach, afterEach } from "bun:test";
import { ProgressReporter } from "../src/progress-reporter";
import type { PipelineResult, PipelineStats, PipelineError } from "@speckey/core";

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

    const createMockResult = (overrides?: Partial<PipelineResult>): PipelineResult => ({
        files: [],
        errors: [],
        stats: {
            filesDiscovered: 5,
            filesRead: 5,
            filesParsed: 5,
            blocksExtracted: 10,
            errorsCount: 0,
        },
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

        it("should output JSON in json mode", () => {
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
    // Feature: Completion Summary
    // ============================================================

    describe("Completion Summary", () => {
        it("should show file and block counts on complete", () => {
            const reporter = new ProgressReporter("normal");
            const result = createMockResult();

            reporter.complete(result);

            expect(consoleLogs.some((log) => log.includes("5") && log.includes("10"))).toBe(true);
        });

        it("should output JSON on complete in json mode", () => {
            const reporter = new ProgressReporter("json");
            const result = createMockResult();

            reporter.complete(result);

            const jsonLine = consoleLogs.find((log) => log.includes("complete"));
            expect(jsonLine).toBeDefined();
            const parsed = JSON.parse(jsonLine!);
            expect(parsed.type).toBe("complete");
            expect(parsed.stats).toBeDefined();
        });

        it("should suppress output in quiet mode", () => {
            const reporter = new ProgressReporter("quiet");
            const result = createMockResult();

            reporter.complete(result);

            expect(consoleLogs).toHaveLength(0);
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
            };

            reporter.error(error);

            expect(consoleErrors.some((log) =>
                log.includes("read") && log.includes("Permission denied")
            )).toBe(true);
        });

        it("should output JSON error in json mode", () => {
            const reporter = new ProgressReporter("json");
            const error: PipelineError = {
                phase: "parse",
                path: "/path/to/file.md",
                message: "Invalid syntax",
                code: "PARSE_ERROR",
            };

            reporter.error(error);

            const jsonLine = consoleLogs.find((log) => log.includes("error"));
            expect(jsonLine).toBeDefined();
            const parsed = JSON.parse(jsonLine!);
            expect(parsed.type).toBe("error");
            expect(parsed.error.phase).toBe("parse");
        });
    });
});
