import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const BIN_PATH = resolve(import.meta.dir, "../../packages/cli/src/bin.ts");
const FIXTURES = resolve(import.meta.dir, "../fixtures/e2e");

function fixture(...segments: string[]): string {
    return resolve(FIXTURES, ...segments);
}

async function runCLI(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const proc = Bun.spawn(["bun", BIN_PATH, ...args], {
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, NO_COLOR: "1" },
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    return { stdout, stderr, exitCode };
}

// ============================================================
// Feature: Binary Entry Point
// ============================================================

describe("Binary Entry Point", () => {
    it("should exit 0 for --help", async () => {
        const { exitCode, stdout } = await runCLI(["--help"]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain("speckey");
    });

    it("should exit 0 for --version", async () => {
        const { exitCode, stdout } = await runCLI(["--version"]);

        expect(exitCode).toBe(0);
        expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it("should exit 2 for missing subcommand", async () => {
        const { exitCode } = await runCLI([]);

        expect(exitCode).toBe(2);
    });

    it("should exit 2 for unknown subcommand", async () => {
        const { exitCode } = await runCLI(["bogus"]);

        expect(exitCode).toBe(2);
    });
});

// ============================================================
// Feature: Parse via Subprocess
// ============================================================

describe("Parse Command (subprocess)", () => {
    it("should parse real fixture and exit 0", async () => {
        const { exitCode, stdout } = await runCLI(["parse", fixture("single-file"), "--no-config"]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain("Parse complete");
    });

    it("should output JSON lines when --json is used", async () => {
        const { exitCode, stdout } = await runCLI(["parse", fixture("single-file"), "--json", "--no-config"]);

        expect(exitCode).toBe(0);

        const lines = stdout.trim().split("\n").filter(Boolean);
        for (const line of lines) {
            expect(() => JSON.parse(line)).not.toThrow();
        }

        const completeLine = lines.find((l) => l.includes('"complete"'));
        expect(completeLine).toBeDefined();

        const parsed = JSON.parse(completeLine!);
        expect(parsed.stats.entitiesBuilt).toBe(2);
    });

    it("should exit 1 for non-existent path", async () => {
        const { exitCode } = await runCLI(["parse", "/nonexistent-path-speckey", "--no-config"]);

        expect(exitCode).toBe(1);
    });

    it("should produce no stdout in --quiet mode on success", async () => {
        const { exitCode, stdout } = await runCLI(["parse", fixture("single-file"), "--quiet", "--no-config"]);

        expect(exitCode).toBe(0);
        expect(stdout.trim()).toBe("");
    });
});

// ============================================================
// Feature: Validate via Subprocess
// ============================================================

describe("Validate Command (subprocess)", () => {
    it("should validate successfully and exit 0", async () => {
        const { exitCode, stdout } = await runCLI(["validate", fixture("single-file"), "--no-config"]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain("Validation complete");
    });

    it("should exit 1 with unresolved references", async () => {
        const { exitCode } = await runCLI(["validate", fixture("validation-failure"), "--no-config"]);

        expect(exitCode).toBe(1);
    });
});

// ============================================================
// Feature: Sync via Subprocess
// ============================================================

describe("Sync Command (subprocess)", () => {
    let tmpDbDir: string;

    beforeAll(() => {
        tmpDbDir = mkdtempSync(join(tmpdir(), "speckey-subprocess-db-"));
    });

    afterAll(() => {
        rmSync(tmpDbDir, { recursive: true, force: true });
    });

    it("should exit 2 when --db-path is missing", async () => {
        const { exitCode, stderr } = await runCLI(["sync", fixture("single-file"), "--no-config"]);

        expect(exitCode).toBe(2);
        expect(stderr).toContain("Database path required");
    });

    it("should sync successfully with --db-path", async () => {
        const dbPath = join(tmpDbDir, "subprocess-sync.db");
        const { exitCode, stdout } = await runCLI(["sync", fixture("single-file"), "--db-path", dbPath, "--no-config"]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain("Sync complete");
    });
});

// ============================================================
// Feature: Error Output Separation
// ============================================================

describe("Error Output Separation", () => {
    it("should write errors to stderr not stdout", async () => {
        const { stderr } = await runCLI(["parse", "/nonexistent-path-speckey", "--quiet", "--no-config"]);

        // In quiet mode errors go to stderr via console.error
        expect(stderr.length).toBeGreaterThan(0);
    });
});
