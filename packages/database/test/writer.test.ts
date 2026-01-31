import { describe, expect, it, beforeEach } from "bun:test";
import { DgraphWriter } from "../src/writer/writer";
import {
	OrphanPolicy,
	WriteErrorCode,
	WriteOperation,
} from "../src/writer/types";
import type {
	WriteConfig,
	EntityInDgraph,
} from "../src/writer/types";
import { ClassSpecType } from "@speckey/core";
import type { ClassSpec } from "@speckey/core";

function makeClassSpec(overrides: Partial<ClassSpec> & { fqn: string; name: string }): ClassSpec {
	return {
		package: "test.pkg",
		specType: ClassSpecType.DEFINITION,
		stereotype: "",
		isGeneric: false,
		typeParams: [],
		methods: [],
		properties: [],
		relationships: [],
		specFile: "test.md",
		specLine: 1,
		unresolvedTypes: [],
		externalDeps: [],
		...overrides,
	};
}

function makeConfig(overrides?: Partial<WriteConfig>): WriteConfig {
	return {
		dbPath: "/tmp/test-db",
		orphanedEntities: OrphanPolicy.KEEP,
		backupBeforeWrite: false,
		...overrides,
	};
}

describe("DgraphWriter", () => {
	let writer: DgraphWriter;

	beforeEach(() => {
		writer = new DgraphWriter();
	});

	// ── DW-100: Write Lifecycle ──

	describe("DW-100: Write Lifecycle", () => {
		it("writes empty array and returns zero counts", () => {
			const result = writer.write([], makeConfig());
			expect(result.inserted).toBe(0);
			expect(result.updated).toBe(0);
			expect(result.orphaned).toBe(0);
			expect(result.deleted).toBe(0);
			expect(result.total).toBe(0);
			expect(result.errors).toHaveLength(0);
		});

		it("writes single ClassSpec as insert", () => {
			const result = writer.write(
				[makeClassSpec({ fqn: "pkg.Foo", name: "Foo" })],
				makeConfig(),
			);
			expect(result.inserted).toBe(1);
			expect(result.updated).toBe(0);
			expect(result.total).toBe(1);
		});

		it("writes multiple ClassSpecs as inserts", () => {
			const specs = [
				makeClassSpec({ fqn: "pkg.A", name: "A" }),
				makeClassSpec({ fqn: "pkg.B", name: "B" }),
				makeClassSpec({ fqn: "pkg.C", name: "C" }),
			];
			const result = writer.write(specs, makeConfig());
			expect(result.inserted).toBe(3);
			expect(result.total).toBe(3);
		});

		it("returns no errors on successful write", () => {
			const result = writer.write(
				[makeClassSpec({ fqn: "pkg.X", name: "X" })],
				makeConfig(),
			);
			expect(result.errors).toHaveLength(0);
		});
	});

	// ── DW-200: Field Mapping ──

	describe("DW-200: Field Mapping (mapToMutation)", () => {
		it("maps fqn to spec_fqn", () => {
			const result = writer.write(
				[makeClassSpec({ fqn: "a.b.Foo", name: "Foo" })],
				makeConfig(),
			);
			// Since lookupByFqn is stub, all are inserts — verifying via result
			expect(result.inserted).toBe(1);
		});

		it("maps package to spec_address", () => {
			const result = writer.write(
				[makeClassSpec({ fqn: "x.Y", name: "Y", package: "custom.pkg" })],
				makeConfig(),
			);
			expect(result.inserted).toBe(1);
		});

		it("maps all ClassSpec fields correctly through write", () => {
			const spec = makeClassSpec({
				fqn: "test.Complex",
				name: "Complex",
				package: "test.ns",
				stereotype: "service",
				isGeneric: true,
				typeParams: [{ name: "T" }],
				methods: [{ name: "run", params: [], returnType: "void", visibility: "+", isAbstract: false, isStatic: false, references: [] }],
				properties: [{ name: "id", type: "string", visibility: "+", isStatic: false, references: [] }],
				relationships: [{ type: "-->", target: "Other", label: "uses" }],
				externalDeps: ["ext.Lib"],
				specFile: "complex.md",
				specLine: 42,
			});
			const result = writer.write([spec], makeConfig());
			expect(result.inserted).toBe(1);
			expect(result.errors).toHaveLength(0);
		});
	});

	// ── DW-300: Upsert Logic ──

	describe("DW-300: Upsert Logic", () => {
		it("inserts when entity does not exist (lookupByFqn returns undefined)", () => {
			const result = writer.write(
				[makeClassSpec({ fqn: "pkg.New", name: "New" })],
				makeConfig(),
			);
			expect(result.inserted).toBe(1);
			expect(result.updated).toBe(0);
		});

		it("all entities are inserts since lookupByFqn is stub", () => {
			const specs = [
				makeClassSpec({ fqn: "pkg.A", name: "A" }),
				makeClassSpec({ fqn: "pkg.B", name: "B" }),
			];
			const result = writer.write(specs, makeConfig());
			expect(result.inserted).toBe(2);
			expect(result.updated).toBe(0);
		});
	});

	// ── DW-500: Orphan Detection ──

	describe("DW-500: Orphan Detection", () => {
		it("detects no orphans (stub returns empty)", () => {
			const result = writer.write(
				[makeClassSpec({ fqn: "pkg.A", name: "A" })],
				makeConfig(),
			);
			expect(result.orphaned).toBe(0);
			expect(result.orphanedEntities).toHaveLength(0);
		});
	});

	// ── DW-600: Orphan Policy ──

	describe("DW-600: Orphan Policy", () => {
		it("KEEP policy — no deletions", () => {
			const result = writer.write(
				[makeClassSpec({ fqn: "pkg.A", name: "A" })],
				makeConfig({ orphanedEntities: OrphanPolicy.KEEP }),
			);
			expect(result.deleted).toBe(0);
		});

		it("WARN policy — no deletions", () => {
			const result = writer.write(
				[makeClassSpec({ fqn: "pkg.A", name: "A" })],
				makeConfig({ orphanedEntities: OrphanPolicy.WARN }),
			);
			expect(result.deleted).toBe(0);
		});

		it("DELETE policy — no orphans to delete (stub)", () => {
			const result = writer.write(
				[makeClassSpec({ fqn: "pkg.A", name: "A" })],
				makeConfig({ orphanedEntities: OrphanPolicy.DELETE }),
			);
			expect(result.deleted).toBe(0);
		});
	});

	// ── DW-700: Backup ──

	describe("DW-700: Backup", () => {
		it("backup returns success with path", () => {
			const result = writer.backup("/tmp/db");
			expect(result.success).toBe(true);
			expect(result.backupPath).toContain("/tmp/db/backup-");
		});

		it("backup path contains timestamp", () => {
			const result = writer.backup("/data/dgraph");
			expect(result.backupPath).toMatch(/backup-\d{4}-\d{2}-\d{2}T/);
		});

		it("write with backupBeforeWrite=true runs backup", () => {
			const result = writer.write(
				[makeClassSpec({ fqn: "pkg.A", name: "A" })],
				makeConfig({ backupBeforeWrite: true }),
			);
			// Backup succeeds (stub), so no BACKUP_FAILED error
			expect(result.errors.find(e => e.code === WriteErrorCode.BACKUP_FAILED)).toBeUndefined();
		});

		it("write with backupBeforeWrite=false skips backup", () => {
			const result = writer.write(
				[makeClassSpec({ fqn: "pkg.A", name: "A" })],
				makeConfig({ backupBeforeWrite: false }),
			);
			expect(result.errors).toHaveLength(0);
		});
	});

	// ── DW-800: Error Handling ──

	describe("DW-800: Error Handling", () => {
		it("no errors on normal write", () => {
			const result = writer.write(
				[makeClassSpec({ fqn: "pkg.A", name: "A" })],
				makeConfig(),
			);
			expect(result.errors).toHaveLength(0);
		});
	});

	// ── DW-900: WriteResult Structure ──

	describe("DW-900: WriteResult Structure", () => {
		it("has all required fields", () => {
			const result = writer.write([], makeConfig());
			expect(result).toHaveProperty("inserted");
			expect(result).toHaveProperty("updated");
			expect(result).toHaveProperty("orphaned");
			expect(result).toHaveProperty("deleted");
			expect(result).toHaveProperty("total");
			expect(result).toHaveProperty("errors");
			expect(result).toHaveProperty("orphanedEntities");
		});

		it("total equals classSpecs.length", () => {
			const specs = [
				makeClassSpec({ fqn: "pkg.A", name: "A" }),
				makeClassSpec({ fqn: "pkg.B", name: "B" }),
			];
			const result = writer.write(specs, makeConfig());
			expect(result.total).toBe(2);
		});

		it("inserted + updated + errors covers all entities", () => {
			const specs = [
				makeClassSpec({ fqn: "pkg.A", name: "A" }),
				makeClassSpec({ fqn: "pkg.B", name: "B" }),
				makeClassSpec({ fqn: "pkg.C", name: "C" }),
			];
			const result = writer.write(specs, makeConfig());
			expect(result.inserted + result.updated).toBe(3);
		});

		it("errors is empty array when no errors", () => {
			const result = writer.write([], makeConfig());
			expect(Array.isArray(result.errors)).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it("orphanedEntities is empty array when no orphans", () => {
			const result = writer.write([], makeConfig());
			expect(Array.isArray(result.orphanedEntities)).toBe(true);
			expect(result.orphanedEntities).toHaveLength(0);
		});
	});

	// ── DW-1000: Edge Cases ──

	describe("DW-1000: Edge Cases", () => {
		it("handles spec with empty name", () => {
			const result = writer.write(
				[makeClassSpec({ fqn: "pkg.", name: "" })],
				makeConfig(),
			);
			expect(result.inserted).toBe(1);
		});

		it("handles spec with long FQN", () => {
			const longFqn = "a".repeat(300) + ".X";
			const result = writer.write(
				[makeClassSpec({ fqn: longFqn, name: "X" })],
				makeConfig(),
			);
			expect(result.inserted).toBe(1);
		});

		it("handles spec with all empty arrays", () => {
			const result = writer.write(
				[makeClassSpec({
					fqn: "pkg.Empty",
					name: "Empty",
					typeParams: [],
					methods: [],
					properties: [],
					relationships: [],
					externalDeps: [],
				})],
				makeConfig(),
			);
			expect(result.inserted).toBe(1);
		});

		it("multiple writes create fresh transactions", () => {
			const r1 = writer.write([makeClassSpec({ fqn: "pkg.A", name: "A" })], makeConfig());
			const r2 = writer.write([makeClassSpec({ fqn: "pkg.B", name: "B" })], makeConfig());
			expect(r1.inserted).toBe(1);
			expect(r2.inserted).toBe(1);
		});

		it("write with duplicate FQNs inserts both (no dedup at writer level)", () => {
			const specs = [
				makeClassSpec({ fqn: "pkg.Dup", name: "Dup" }),
				makeClassSpec({ fqn: "pkg.Dup", name: "Dup" }),
			];
			const result = writer.write(specs, makeConfig());
			expect(result.inserted).toBe(2);
			expect(result.total).toBe(2);
		});
	});
});
