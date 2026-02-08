import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";

const BIN = resolve(import.meta.dir, "../../apps/cli/src/bin.ts");
const FIXTURES = resolve(import.meta.dir, "../fixtures/e2e");

function fixture(...segments: string[]): string {
    return resolve(FIXTURES, ...segments);
}

async function run(...args: string[]): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
}> {
    const proc = Bun.spawn(["bun", BIN, ...args], {
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, NO_COLOR: "1" },
    });

    const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
    ]);

    const exitCode = await proc.exited;

    return { exitCode, stdout, stderr };
}

// ============================================================
// Feature: Subprocess Binary Invocation — Exit Codes
// ============================================================

describe("CLI Subprocess", () => {
    describe("Exit Codes", () => {
        it("should exit 0 for --help", async () => {
            const result = await run("--help");

            expect(result.exitCode).toBe(0);
            expect(result.stdout.toLowerCase()).toContain("speckey");
        });

        it("should exit 0 for --version", async () => {
            const result = await run("--version");

            expect(result.exitCode).toBe(0);
        });

        it("should exit 2 for missing subcommand", async () => {
            const result = await run();

            expect(result.exitCode).toBe(2);
        });

        it("should exit 0 for parse with valid fixture", async () => {
            const result = await run("parse", fixture("single-file"), "--quiet", "--no-config");

            expect(result.exitCode).toBe(0);
        });

        it("should exit 1 for parse on empty directory", async () => {
            const result = await run("parse", fixture("empty-dir"), "--quiet", "--no-config");

            expect(result.exitCode).toBe(1);
        });

        it("should exit 1 for validate with unresolved references", async () => {
            const result = await run("validate", fixture("validation-failure"), "--quiet", "--no-config");

            expect(result.exitCode).toBe(1);
        });

        it("should exit 2 for sync without --db-path", async () => {
            const result = await run("sync", fixture("single-file"), "--no-config");

            expect(result.exitCode).toBe(2);
        });
    });

    // ============================================================
    // Feature: Subprocess — Logger Output Verification
    // ============================================================

    describe("Logger Output", () => {
        it("should suppress info output with --quiet", async () => {
            const result = await run("parse", fixture("single-file"), "--quiet", "--no-config");
            const allOutput = result.stdout + result.stderr;

            expect(result.exitCode).toBe(0);
            // Quiet mode: no info-level phase messages anywhere
            expect(allOutput).not.toContain("Discovery complete");
            expect(allOutput).not.toContain("Parse complete");
        });

        it("should produce debug output with --verbose", async () => {
            const result = await run("parse", fixture("single-file"), "--verbose", "--no-config");
            const allOutput = result.stdout + result.stderr;

            expect(result.exitCode).toBe(0);
            // Verbose mode: debug-level messages should appear (tslog writes to stdout)
            expect(allOutput).toContain("Discovering");
        });

        it("should produce JSON lines with --json", async () => {
            const result = await run("parse", fixture("single-file"), "--json", "--no-config");
            const allOutput = result.stdout + result.stderr;

            expect(result.exitCode).toBe(0);

            // Each non-empty line should be valid JSON (tslog writes to stdout)
            const lines = allOutput
                .split("\n")
                .map(l => l.trim())
                .filter(l => l.length > 0);

            expect(lines.length).toBeGreaterThan(0);
            for (const line of lines) {
                expect(() => JSON.parse(line)).not.toThrow();
            }
        });
    });
});
