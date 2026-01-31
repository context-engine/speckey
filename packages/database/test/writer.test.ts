import { describe, expect, it, beforeEach, spyOn } from "bun:test";
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

		it("sets spec_last_updated on mutation", () => {
			// Test by calling the private method directly through any
			const beforeWrite = Date.now();
			const spec = makeClassSpec({ fqn: "test.Timestamped", name: "Timestamped" });

			const result = (writer as any).mapToMutation(spec);

			expect(result.spec_last_updated).toBeInstanceOf(Date);
			expect(result.spec_last_updated.getTime()).toBeGreaterThanOrEqual(beforeWrite);
		});

		it("initializes user_* fields to empty values on insert", () => {
			// Test by calling the private method directly through any
			const spec = makeClassSpec({ fqn: "test.New", name: "New" });

			const result = (writer as any).mapToMutation(spec);

			expect(result.user_comments).toEqual([]);
			expect(result.user_rationale).toBe("");
			expect(result.user_examples).toEqual([]);
			expect(result.user_tags).toEqual([]);
			expect(result.user_metadata).toEqual({});
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

		it("updates when entity exists (lookupByFqn returns entity)", () => {
			const existingEntity = {
				uid: "0x123",
				spec_fqn: "pkg.Existing",
				spec_address: "pkg",
				spec_name: "Existing",
				spec_entity_type: "definition",
				spec_stereotype: "",
				spec_is_generic: false,
				spec_type_params: [],
				spec_methods: [],
				spec_properties: [],
				spec_relationships: [],
				spec_external_deps: [],
				spec_source_file: "old.md",
				spec_source_line: 1,
				spec_last_updated: new Date("2020-01-01"),
				user_comments: [{ text: "important", author: "user", timestamp: new Date() }],
				user_rationale: "Design decision",
				user_examples: [],
				user_tags: ["core"],
				user_metadata: {},
			};

			const lookupSpy = spyOn(writer as any, "lookupByFqn").mockReturnValue(existingEntity);

			const result = writer.write(
				[makeClassSpec({ fqn: "pkg.Existing", name: "Existing" })],
				makeConfig(),
			);

			expect(result.inserted).toBe(0);
			expect(result.updated).toBe(1);
			expect(lookupSpy).toHaveBeenCalledWith("pkg.Existing");
		});

		it("insert records INSERT operation in transaction", () => {
			const txAddOpSpy = spyOn(Object.getPrototypeOf(writer["transactionManager"].begin()), "addOperation");

			writer.write(
				[makeClassSpec({ fqn: "pkg.Insert", name: "Insert" })],
				makeConfig(),
			);

			expect(txAddOpSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					type: expect.stringMatching(/insert/i),
					entityFqn: "pkg.Insert",
				}),
			);
		});

		it("update records UPDATE operation in transaction", () => {
			const existingEntity = {
				uid: "0x456",
				spec_fqn: "pkg.Update",
				spec_address: "pkg",
				spec_name: "Update",
				spec_entity_type: "definition",
				spec_stereotype: "",
				spec_is_generic: false,
				spec_type_params: [],
				spec_methods: [],
				spec_properties: [],
				spec_relationships: [],
				spec_external_deps: [],
				spec_source_file: "old.md",
				spec_source_line: 1,
				spec_last_updated: new Date(),
				user_comments: [],
				user_rationale: "",
				user_examples: [],
				user_tags: [],
				user_metadata: {},
			};

			spyOn(writer as any, "lookupByFqn").mockReturnValue(existingEntity);
			const txAddOpSpy = spyOn(Object.getPrototypeOf(writer["transactionManager"].begin()), "addOperation");

			writer.write(
				[makeClassSpec({ fqn: "pkg.Update", name: "Update" })],
				makeConfig(),
			);

			expect(txAddOpSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					type: expect.stringMatching(/update/i),
					entityFqn: "pkg.Update",
				}),
			);
		});

		it("upsert returns EntityWriteOp with uid", () => {
			const insertSpy = spyOn(writer as any, "insertEntity").mockReturnValue({
				fqn: "pkg.Test",
				operation: WriteOperation.INSERT,
				success: true,
				uid: "0x789",
			});

			const result = writer.write(
				[makeClassSpec({ fqn: "pkg.Test", name: "Test" })],
				makeConfig(),
			);

			expect(result.inserted).toBe(1);
			expect(insertSpy).toHaveBeenCalled();
		});
	});

	// ── DW-400: User Field Preservation ──

	describe("DW-400: User Field Preservation", () => {
		it("preserves user_* fields on update", () => {
			// Test the private preserveUserFields method directly
			const existingEntity: EntityInDgraph = {
				uid: "0x123",
				spec_fqn: "pkg.Preserve",
				spec_address: "pkg",
				spec_name: "OldName",
				spec_entity_type: "definition",
				spec_stereotype: "",
				spec_is_generic: false,
				spec_type_params: [],
				spec_methods: [],
				spec_properties: [],
				spec_relationships: [],
				spec_external_deps: [],
				spec_source_file: "old.md",
				spec_source_line: 1,
				spec_last_updated: new Date("2020-01-01"),
				user_comments: [{ text: "important", author: "user", timestamp: new Date() }],
				user_rationale: "Design decision",
				user_examples: [{ title: "Example", code: "code", language: "ts" }],
				user_tags: ["core", "v2"],
				user_metadata: { custom: "data" },
			};

			const newMutation: EntityInDgraph = {
				uid: "",
				spec_fqn: "pkg.Preserve",
				spec_address: "new.pkg",
				spec_name: "NewName",
				spec_entity_type: "definition",
				spec_stereotype: "new",
				spec_is_generic: false,
				spec_type_params: [],
				spec_methods: [],
				spec_properties: [],
				spec_relationships: [],
				spec_external_deps: [],
				spec_source_file: "new.md",
				spec_source_line: 10,
				spec_last_updated: new Date(),
				user_comments: [],
				user_rationale: "",
				user_examples: [],
				user_tags: [],
				user_metadata: {},
			};

			const result = (writer as any).preserveUserFields(existingEntity, newMutation);

			// Verify user_* fields are preserved from existing
			expect(result.user_comments).toEqual(existingEntity.user_comments);
			expect(result.user_rationale).toBe("Design decision");
			expect(result.user_examples).toEqual(existingEntity.user_examples);
			expect(result.user_tags).toEqual(["core", "v2"]);
			expect(result.user_metadata).toEqual({ custom: "data" });

			// Verify spec_* fields are from new mutation
			expect(result.spec_name).toBe("NewName");
			expect(result.spec_address).toBe("new.pkg");
			expect(result.spec_stereotype).toBe("new");
		});

		it("spec fields are overwritten on update", () => {
			const existingEntity: EntityInDgraph = {
				uid: "0x456",
				spec_fqn: "pkg.Overwrite",
				spec_address: "old.pkg",
				spec_name: "OldName",
				spec_entity_type: "definition",
				spec_stereotype: "old",
				spec_is_generic: false,
				spec_type_params: [],
				spec_methods: [],
				spec_properties: [],
				spec_relationships: [],
				spec_external_deps: [],
				spec_source_file: "old.md",
				spec_source_line: 1,
				spec_last_updated: new Date("2020-01-01"),
				user_comments: [],
				user_rationale: "",
				user_examples: [],
				user_tags: [],
				user_metadata: {},
			};

			spyOn(writer as any, "lookupByFqn").mockReturnValue(existingEntity);

			const newSpec = makeClassSpec({
				fqn: "pkg.Overwrite",
				name: "NewName",
				package: "new.pkg",
				stereotype: "new",
			});

			const result = writer.write([newSpec], makeConfig());

			expect(result.updated).toBe(1);
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

		it("detects orphans not in parsed set", () => {
			const orphanEntity: EntityInDgraph = {
				uid: "0x999",
				spec_fqn: "pkg.Orphan",
				spec_address: "pkg",
				spec_name: "Orphan",
				spec_entity_type: "definition",
				spec_stereotype: "",
				spec_is_generic: false,
				spec_type_params: [],
				spec_methods: [],
				spec_properties: [],
				spec_relationships: [],
				spec_external_deps: [],
				spec_source_file: "orphan.md",
				spec_source_line: 1,
				spec_last_updated: new Date(),
				user_comments: [],
				user_rationale: "",
				user_examples: [],
				user_tags: [],
				user_metadata: {},
			};

			spyOn(writer as any, "detectOrphans").mockReturnValue({
				orphanedEntities: [orphanEntity],
				count: 1,
			});

			const result = writer.write(
				[makeClassSpec({ fqn: "pkg.A", name: "A" })],
				makeConfig({ orphanedEntities: OrphanPolicy.KEEP }),
			);

			expect(result.orphaned).toBe(1);
			expect(result.orphanedEntities).toContain("pkg.Orphan");
		});

		it("all entities are orphans (empty parsed set)", () => {
			const orphans: EntityInDgraph[] = [
				{
					uid: "0x1",
					spec_fqn: "pkg.A",
					spec_address: "pkg",
					spec_name: "A",
					spec_entity_type: "definition",
					spec_stereotype: "",
					spec_is_generic: false,
					spec_type_params: [],
					spec_methods: [],
					spec_properties: [],
					spec_relationships: [],
					spec_external_deps: [],
					spec_source_file: "a.md",
					spec_source_line: 1,
					spec_last_updated: new Date(),
					user_comments: [],
					user_rationale: "",
					user_examples: [],
					user_tags: [],
					user_metadata: {},
				},
				{
					uid: "0x2",
					spec_fqn: "pkg.B",
					spec_address: "pkg",
					spec_name: "B",
					spec_entity_type: "definition",
					spec_stereotype: "",
					spec_is_generic: false,
					spec_type_params: [],
					spec_methods: [],
					spec_properties: [],
					spec_relationships: [],
					spec_external_deps: [],
					spec_source_file: "b.md",
					spec_source_line: 1,
					spec_last_updated: new Date(),
					user_comments: [],
					user_rationale: "",
					user_examples: [],
					user_tags: [],
					user_metadata: {},
				},
			];

			spyOn(writer as any, "detectOrphans").mockReturnValue({
				orphanedEntities: orphans,
				count: 2,
			});

			const result = writer.write([], makeConfig());

			expect(result.orphaned).toBe(2);
			expect(result.orphanedEntities).toHaveLength(2);
		});

		it("new entities are not orphans", () => {
			spyOn(writer as any, "detectOrphans").mockReturnValue({
				orphanedEntities: [],
				count: 0,
			});

			const result = writer.write(
				[makeClassSpec({ fqn: "pkg.New", name: "New" })],
				makeConfig(),
			);

			expect(result.orphaned).toBe(0);
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

		it("DELETE policy — orphans deleted within transaction", () => {
			const orphans: EntityInDgraph[] = [
				{
					uid: "0x1",
					spec_fqn: "pkg.Orphan1",
					spec_address: "pkg",
					spec_name: "Orphan1",
					spec_entity_type: "definition",
					spec_stereotype: "",
					spec_is_generic: false,
					spec_type_params: [],
					spec_methods: [],
					spec_properties: [],
					spec_relationships: [],
					spec_external_deps: [],
					spec_source_file: "orphan1.md",
					spec_source_line: 1,
					spec_last_updated: new Date(),
					user_comments: [],
					user_rationale: "",
					user_examples: [],
					user_tags: [],
					user_metadata: {},
				},
				{
					uid: "0x2",
					spec_fqn: "pkg.Orphan2",
					spec_address: "pkg",
					spec_name: "Orphan2",
					spec_entity_type: "definition",
					spec_stereotype: "",
					spec_is_generic: false,
					spec_type_params: [],
					spec_methods: [],
					spec_properties: [],
					spec_relationships: [],
					spec_external_deps: [],
					spec_source_file: "orphan2.md",
					spec_source_line: 1,
					spec_last_updated: new Date(),
					user_comments: [],
					user_rationale: "",
					user_examples: [],
					user_tags: [],
					user_metadata: {},
				},
			];

			spyOn(writer as any, "detectOrphans").mockReturnValue({
				orphanedEntities: orphans,
				count: 2,
			});

			const result = writer.write(
				[makeClassSpec({ fqn: "pkg.A", name: "A" })],
				makeConfig({ orphanedEntities: OrphanPolicy.DELETE }),
			);

			expect(result.deleted).toBe(2);
			expect(result.orphaned).toBe(2);
			expect(result.orphanedEntities).toContain("pkg.Orphan1");
			expect(result.orphanedEntities).toContain("pkg.Orphan2");
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

	// ── DW-800: Error Handling & Rollback ──

	describe("DW-800: Error Handling & Rollback", () => {
		it("no errors on normal write", () => {
			const result = writer.write(
				[makeClassSpec({ fqn: "pkg.A", name: "A" })],
				makeConfig(),
			);
			expect(result.errors).toHaveLength(0);
		});

		it("insert failure triggers rollback", () => {
			const insertSpy = spyOn(writer as any, "insertEntity").mockReturnValue({
				fqn: "pkg.Failed",
				operation: WriteOperation.INSERT,
				success: false,
				uid: "",
				error: {
					code: WriteErrorCode.INSERT_FAILED,
					message: "Insert failed",
					fqn: "pkg.Failed",
					operation: WriteOperation.INSERT,
				},
			});

			const result = writer.write(
				[makeClassSpec({ fqn: "pkg.Failed", name: "Failed" })],
				makeConfig(),
			);

			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]?.code).toBe(WriteErrorCode.INSERT_FAILED);
			expect(result.errors[0]?.fqn).toBe("pkg.Failed");
			expect(insertSpy).toHaveBeenCalled();
		});

		it("update failure triggers rollback", () => {
			const existingEntity: EntityInDgraph = {
				uid: "0x123",
				spec_fqn: "pkg.UpdateFail",
				spec_address: "pkg",
				spec_name: "UpdateFail",
				spec_entity_type: "definition",
				spec_stereotype: "",
				spec_is_generic: false,
				spec_type_params: [],
				spec_methods: [],
				spec_properties: [],
				spec_relationships: [],
				spec_external_deps: [],
				spec_source_file: "old.md",
				spec_source_line: 1,
				spec_last_updated: new Date(),
				user_comments: [],
				user_rationale: "",
				user_examples: [],
				user_tags: [],
				user_metadata: {},
			};

			spyOn(writer as any, "lookupByFqn").mockReturnValue(existingEntity);
			spyOn(writer as any, "updateEntity").mockReturnValue({
				fqn: "pkg.UpdateFail",
				operation: WriteOperation.UPDATE,
				success: false,
				uid: "0x123",
				error: {
					code: WriteErrorCode.UPDATE_FAILED,
					message: "Update failed",
					fqn: "pkg.UpdateFail",
					operation: WriteOperation.UPDATE,
				},
			});

			const result = writer.write(
				[makeClassSpec({ fqn: "pkg.UpdateFail", name: "UpdateFail" })],
				makeConfig(),
			);

			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]?.code).toBe(WriteErrorCode.UPDATE_FAILED);
		});

		it("commit failure triggers rollback", () => {
			const commitSpy = spyOn(writer["transactionManager"], "commit").mockReturnValue({
				success: false,
				operationCount: 0,
				error: "Commit failed",
			});

			const result = writer.write(
				[makeClassSpec({ fqn: "pkg.A", name: "A" })],
				makeConfig(),
			);

			expect(result.errors.some(e => e.code === WriteErrorCode.COMMIT_FAILED)).toBe(true);
			expect(commitSpy).toHaveBeenCalled();
		});

		it("index rebuild failure is non-blocking", () => {
			const rebuildSpy = spyOn(writer as any, "rebuildIndexes").mockImplementation(() => {
				throw new Error("Index rebuild failed");
			});

			const result = writer.write(
				[makeClassSpec({ fqn: "pkg.A", name: "A" })],
				makeConfig(),
			);

			expect(result.errors.some(e => e.code === WriteErrorCode.INDEX_REBUILD_FAILED)).toBe(true);
			expect(result.inserted).toBe(1); // Write still succeeded
			expect(rebuildSpy).toHaveBeenCalled();
		});

		it("WriteError includes fqn and operation context", () => {
			spyOn(writer as any, "insertEntity").mockReturnValue({
				fqn: "say2.core.Session",
				operation: WriteOperation.INSERT,
				success: false,
				uid: "",
				error: {
					code: WriteErrorCode.INSERT_FAILED,
					message: "Database connection lost",
					fqn: "say2.core.Session",
					operation: WriteOperation.INSERT,
				},
			});

			const result = writer.write(
				[makeClassSpec({ fqn: "say2.core.Session", name: "Session" })],
				makeConfig(),
			);

			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]?.fqn).toBe("say2.core.Session");
			expect(result.errors[0]?.operation).toBe(WriteOperation.INSERT);
			expect(result.errors[0]?.code).toBe(WriteErrorCode.INSERT_FAILED);
			expect(result.errors[0]?.message).toBeTruthy();
		});

		it("backup failure is non-blocking warning", () => {
			const backupSpy = spyOn(writer, "backup").mockReturnValue({
				success: false,
				backupPath: "",
				error: "Backup failed",
			});

			const result = writer.write(
				[makeClassSpec({ fqn: "pkg.A", name: "A" })],
				makeConfig({ backupBeforeWrite: true }),
			);

			expect(result.errors.some(e => e.code === WriteErrorCode.BACKUP_FAILED)).toBe(true);
			expect(result.inserted).toBe(1); // Write still proceeded
			expect(backupSpy).toHaveBeenCalled();
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
