import { describe, expect, it, beforeEach } from "bun:test";
import { PackageRegistry, DeferredValidationQueue, ClassSpecType } from "@speckey/core";
import { EntityBuilder, BuildErrorCode, BuildWarningCode } from "../../../src/diagrams/class-diagram/entity-builder";
import { TypeResolver } from "../../../src/diagrams/class-diagram/type-resolver";
import type { BuildContext } from "../../../src/diagrams/class-diagram/entity-builder";
import type { ParsedClass, ParsedRelation } from "../../../src/diagrams/class-diagram/types";

/**
 * Helper to create a minimal ParsedClass for testing.
 */
function makeParsedClass(overrides: Partial<ParsedClass> & { name: string }): ParsedClass {
	return {
		isGeneric: false,
		typeParams: [],
		stereotype: "class",
		body: { methods: [], properties: [], enumValues: [] },
		annotations: { address: "say2.core", entityType: "definition" },
		startLine: 1,
		...overrides,
	};
}

/**
 * Helper to create a BuildContext with real dependencies.
 */
function makeContext(overrides: Partial<BuildContext> = {}): BuildContext {
	return {
		registry: new PackageRegistry(),
		deferredQueue: new DeferredValidationQueue(),
		typeResolver: new TypeResolver(),
		currentDiagramClasses: new Map(),
		specFile: "test.md",
		...overrides,
	};
}

describe("EntityBuilder", () => {
	let builder: EntityBuilder;
	let context: BuildContext;

	beforeEach(() => {
		builder = new EntityBuilder();
		context = makeContext();
	});

	// ─── EB-100: FQN Construction ───

	describe("Feature: FQN Construction", () => {
		it("should construct FQN from package and class name", () => {
			const parsed = makeParsedClass({
				name: "SessionManager",
				annotations: { address: "say2.mcp", entityType: "definition" },
			});

			const result = builder.buildClassSpecs([parsed], [], context);

			expect(result.classSpecs).toHaveLength(1);
			expect(result.classSpecs[0]!.fqn).toBe("say2.mcp.SessionManager");
		});

		it("should construct FQN for single-segment package", () => {
			const parsed = makeParsedClass({
				name: "Session",
				annotations: { address: "core", entityType: "definition" },
			});

			const result = builder.buildClassSpecs([parsed], [], context);

			expect(result.classSpecs).toHaveLength(1);
			expect(result.classSpecs[0]!.fqn).toBe("core.Session");
		});

		it("should error on empty/missing package (@address)", () => {
			const parsed = makeParsedClass({
				name: "Foo",
				annotations: { address: "", entityType: "definition" },
			});

			const result = builder.buildClassSpecs([parsed], [], context);

			expect(result.errors.length).toBeGreaterThanOrEqual(1);
			expect(result.errors.some(e => e.code === BuildErrorCode.INVALID_FQN)).toBe(true);
			expect(result.classSpecs).toHaveLength(0);
		});

		it("should error on missing @address annotation", () => {
			const parsed = makeParsedClass({
				name: "Foo",
				annotations: { entityType: "definition" },
			});

			const result = builder.buildClassSpecs([parsed], [], context);

			expect(result.errors.some(e => e.code === BuildErrorCode.INVALID_FQN)).toBe(true);
			expect(result.classSpecs).toHaveLength(0);
		});

		it("should error on double dots in package", () => {
			const parsed = makeParsedClass({
				name: "Foo",
				annotations: { address: "say2..mcp", entityType: "definition" },
			});

			const result = builder.buildClassSpecs([parsed], [], context);

			expect(result.errors.some(e => e.code === BuildErrorCode.INVALID_FQN)).toBe(true);
			expect(result.classSpecs).toHaveLength(0);
		});

		it("should warn on very long FQN", () => {
			const longPkg = "a".repeat(260);
			const parsed = makeParsedClass({
				name: "X",
				annotations: { address: longPkg, entityType: "definition" },
			});

			const result = builder.buildClassSpecs([parsed], [], context);

			expect(result.warnings.some(w => w.code === BuildWarningCode.LONG_FQN)).toBe(true);
			// Class should still be built
			expect(result.classSpecs).toHaveLength(1);
		});
	});

	// ─── EB-200: Duplicate Detection ───

	describe("Feature: Duplicate Detection", () => {
		it("should register first definition", () => {
			const parsed = makeParsedClass({ name: "Session" });

			const result = builder.buildClassSpecs([parsed], [], context);

			expect(result.classSpecs).toHaveLength(1);
			expect(context.registry.exists("say2.core.Session")).toBe(true);
		});

		it("should error on duplicate definition", () => {
			// Pre-register
			const first = makeParsedClass({ name: "Session" });
			builder.buildClassSpecs([first], [], context);

			// Attempt duplicate
			const second = makeParsedClass({ name: "Session" });
			const result = builder.buildClassSpecs([second], [], context);

			expect(result.errors.some(e => e.code === BuildErrorCode.DUPLICATE_DEFINITION)).toBe(true);
			expect(result.errors.find(e => e.code === BuildErrorCode.DUPLICATE_DEFINITION)!.fqn).toBe(
				"say2.core.Session"
			);
			expect(result.classSpecs).toHaveLength(0);
		});

		it("should allow same FQN as reference after definition", () => {
			// Register definition first
			const def = makeParsedClass({ name: "Session" });
			builder.buildClassSpecs([def], [], context);

			// Reference with same FQN
			const ref = makeParsedClass({
				name: "Session",
				annotations: { address: "say2.core", entityType: "reference" },
			});
			const result = builder.buildClassSpecs([ref], [], context);

			expect(result.errors).toHaveLength(0);
			expect(context.deferredQueue.getCount()).toBe(0);
		});
	});

	// ─── EB-300: Reference Handling ───

	describe("Feature: Reference Handling", () => {
		it("should not enqueue deferred entry for reference with existing definition", () => {
			// Pre-register definition
			const def = makeParsedClass({ name: "Session" });
			builder.buildClassSpecs([def], [], context);

			const ref = makeParsedClass({
				name: "Session",
				annotations: { address: "say2.core", entityType: "reference" },
			});
			const result = builder.buildClassSpecs([ref], [], context);

			expect(context.deferredQueue.getCount()).toBe(0);
			expect(result.classSpecs).toHaveLength(0); // references not persisted as classSpecs
		});

		it("should enqueue deferred entry for reference without definition", () => {
			const ref = makeParsedClass({
				name: "Session",
				annotations: { address: "say2.core", entityType: "reference" },
			});

			const result = builder.buildClassSpecs([ref], [], context);

			expect(context.deferredQueue.getCount()).toBe(1);
			const drained = context.deferredQueue.drain();
			expect(drained[0]!.diagramType).toBe("class");
			expect(drained[0]!.entityFqn).toBe("say2.core.Session");
			expect(result.classSpecs).toHaveLength(0);
		});

		it("should enqueue multiple references without definitions", () => {
			const refs = ["A", "B", "C"].map(name =>
				makeParsedClass({
					name,
					annotations: { address: "say2.core", entityType: "reference" },
				})
			);

			builder.buildClassSpecs(refs, [], context);

			expect(context.deferredQueue.getCount()).toBe(3);
		});
	});

	// ─── EB-400: Type Resolution Delegation ───

	describe("Feature: Type Resolution Delegation", () => {
		it("should resolve method types via TypeResolver", () => {
			const parsed = makeParsedClass({
				name: "Manager",
				body: {
					methods: [
						{
							name: "getSession",
							visibility: "public",
							parameters: [],
							returnType: "string",
							isAbstract: false,
							isStatic: false,
						},
					],
					properties: [],
					enumValues: [],
				},
			});

			const result = builder.buildClassSpecs([parsed], [], context);

			expect(result.classSpecs).toHaveLength(1);
			expect(result.classSpecs[0]!.methods).toHaveLength(1);
			expect(result.classSpecs[0]!.methods[0]!.name).toBe("getSession");
		});

		it("should resolve property types via TypeResolver", () => {
			const parsed = makeParsedClass({
				name: "Manager",
				body: {
					methods: [],
					properties: [
						{ name: "id", visibility: "private", type: "string", isStatic: false },
					],
					enumValues: [],
				},
			});

			const result = builder.buildClassSpecs([parsed], [], context);

			expect(result.classSpecs).toHaveLength(1);
			expect(result.classSpecs[0]!.properties).toHaveLength(1);
			expect(result.classSpecs[0]!.properties[0]!.name).toBe("id");
		});

		it("should resolve relationship targets via TypeResolver", () => {
			const parsed = makeParsedClass({
				name: "Manager",
				annotations: { address: "say2.mcp", entityType: "definition" },
			});

			const relations: ParsedRelation[] = [
				{
					sourceClass: "Manager",
					targetClass: "Session",
					type: "association",
					label: "manages",
				},
			];

			// Add Session to the same diagram so it resolves
			const session = makeParsedClass({
				name: "Session",
				annotations: { address: "say2.mcp", entityType: "definition" },
			});

			const result = builder.buildClassSpecs([session, parsed], relations, context);

			const managerSpec = result.classSpecs.find(s => s.name === "Manager");
			expect(managerSpec).toBeDefined();
			expect(managerSpec!.relationships).toHaveLength(1);
			expect(managerSpec!.relationships[0]!.target).toBe("say2.mcp.Session");
		});

		it("should collect unresolved types from TypeResolver", () => {
			const parsed = makeParsedClass({
				name: "Manager",
				body: {
					methods: [
						{
							name: "getCustom",
							visibility: "public",
							parameters: [],
							returnType: "CustomType",
							isAbstract: false,
							isStatic: false,
						},
					],
					properties: [],
					enumValues: [],
				},
			});

			const result = builder.buildClassSpecs([parsed], [], context);

			expect(result.classSpecs).toHaveLength(1);
			expect(result.classSpecs[0]!.unresolvedTypes).toContain("CustomType");
		});
	});

	// ─── EB-500: ClassSpec Assembly ───

	describe("Feature: ClassSpec Assembly", () => {
		it("should assemble ClassSpec with all fields", () => {
			const parsed = makeParsedClass({
				name: "SessionManager",
				annotations: { address: "say2.mcp", entityType: "definition" },
				stereotype: "class",
				startLine: 42,
			});

			context.specFile = "specs/manager.md";
			const result = builder.buildClassSpecs([parsed], [], context);

			const spec = result.classSpecs[0]!;
			expect(spec.fqn).toBe("say2.mcp.SessionManager");
			expect(spec.package).toBe("say2.mcp");
			expect(spec.name).toBe("SessionManager");
			expect(spec.specType).toBe("definition");
			expect(spec.specFile).toBe("specs/manager.md");
			expect(spec.specLine).toBe(42);
		});

		it("should derive isGeneric from typeParams", () => {
			const parsed = makeParsedClass({
				name: "Container",
				isGeneric: true,
				typeParams: [{ name: "T" }],
			});

			const result = builder.buildClassSpecs([parsed], [], context);

			expect(result.classSpecs[0]!.isGeneric).toBe(true);
		});

		it("should set isGeneric false for non-generic class", () => {
			const parsed = makeParsedClass({ name: "Plain" });

			const result = builder.buildClassSpecs([parsed], [], context);

			expect(result.classSpecs[0]!.isGeneric).toBe(false);
		});

		it("should pass through stereotype", () => {
			const parsed = makeParsedClass({
				name: "IService",
				stereotype: "interface",
			});

			const result = builder.buildClassSpecs([parsed], [], context);

			expect(result.classSpecs[0]!.stereotype).toBe("interface");
		});

		it("should pass through specFile from BuildContext", () => {
			context.specFile = "specs/manager.md";
			const parsed = makeParsedClass({ name: "Foo" });

			const result = builder.buildClassSpecs([parsed], [], context);

			expect(result.classSpecs[0]!.specFile).toBe("specs/manager.md");
		});

		it("should pass through specLine from ParsedClass", () => {
			const parsed = makeParsedClass({ name: "Foo", startLine: 42 });

			const result = builder.buildClassSpecs([parsed], [], context);

			expect(result.classSpecs[0]!.specLine).toBe(42);
		});
	});

	// ─── EB-600: ClassSpec Validation ───

	describe("Feature: ClassSpec Validation", () => {
		it("should warn on circular dependency (self-reference)", () => {
			const parsed = makeParsedClass({
				name: "A",
				annotations: { address: "pkg", entityType: "definition" },
			});

			// Self-referencing relation
			const relations: ParsedRelation[] = [
				{
					sourceClass: "A",
					targetClass: "pkg.A",
					type: "association",
					label: "self",
				},
			];

			// Pre-register pkg.A so the relationship resolves
			const preSpec = makeParsedClass({
				name: "A",
				annotations: { address: "pkg", entityType: "definition" },
			});
			builder.buildClassSpecs([preSpec], [], context);

			// Now build again with self-referencing relation — but it's a duplicate
			// Instead, use fresh context and include self-reference in the same build
			const freshContext = makeContext();
			const result = builder.buildClassSpecs([parsed], relations, freshContext);

			expect(result.warnings.some(w => w.code === BuildWarningCode.CIRCULAR_DEPENDENCY)).toBe(true);
			// Should still be registered
			expect(result.classSpecs).toHaveLength(1);
		});

		it("should pass valid ClassSpec without errors", () => {
			const parsed = makeParsedClass({ name: "Valid" });

			const result = builder.buildClassSpecs([parsed], [], context);

			expect(result.classSpecs).toHaveLength(1);
			expect(result.errors.filter(e => e.code === BuildErrorCode.MISSING_REQUIRED_FIELD)).toHaveLength(0);
		});
	});

	// ─── EB-700: Current Diagram Classes Map ───

	describe("Feature: Current Diagram Classes Map", () => {
		it("should build diagram map before processing", () => {
			const classes = ["Session", "Config", "Manager"].map(name =>
				makeParsedClass({ name })
			);

			builder.buildClassSpecs(classes, [], context);

			// All 3 should be in currentDiagramClasses
			expect(context.currentDiagramClasses.size).toBe(3);
			expect(context.currentDiagramClasses.get("Session")).toBe("say2.core.Session");
			expect(context.currentDiagramClasses.get("Config")).toBe("say2.core.Config");
			expect(context.currentDiagramClasses.get("Manager")).toBe("say2.core.Manager");
		});

		it("should enable same-diagram resolution via diagram map", () => {
			const session = makeParsedClass({ name: "Session" });
			const manager = makeParsedClass({ name: "Manager" });

			const relations: ParsedRelation[] = [
				{
					sourceClass: "Manager",
					targetClass: "Session",
					type: "association",
					label: "manages",
				},
			];

			const result = builder.buildClassSpecs([session, manager], relations, context);

			const managerSpec = result.classSpecs.find(s => s.name === "Manager");
			expect(managerSpec!.relationships[0]!.target).toBe("say2.core.Session");
		});
	});

	// ─── EB-800: BuildResult Structure ───

	describe("Feature: BuildResult Structure", () => {
		it("should return BuildResult with all successes", () => {
			const classes = ["A", "B", "C"].map(name => makeParsedClass({ name }));

			const result = builder.buildClassSpecs(classes, [], context);

			expect(result.classSpecs).toHaveLength(3);
			expect(result.errors).toHaveLength(0);
			expect(result.warnings).toHaveLength(0);
		});

		it("should return BuildResult with mixed results", () => {
			const valid = makeParsedClass({ name: "Valid" });
			const invalid = makeParsedClass({
				name: "Bad",
				annotations: { address: "say2..core", entityType: "definition" },
			});
			const longPkg = "a".repeat(260);
			const longFqn = makeParsedClass({
				name: "X",
				annotations: { address: longPkg, entityType: "definition" },
			});

			const result = builder.buildClassSpecs([valid, invalid, longFqn], [], context);

			expect(result.classSpecs).toHaveLength(2); // valid + long-fqn
			expect(result.errors.some(e => e.code === BuildErrorCode.INVALID_FQN)).toBe(true);
			expect(result.warnings.some(w => w.code === BuildWarningCode.LONG_FQN)).toBe(true);
		});

		it("should return BuildResult with no valid classes", () => {
			const bad1 = makeParsedClass({
				name: "A",
				annotations: { address: "a..b", entityType: "definition" },
			});
			const bad2 = makeParsedClass({
				name: "B",
				annotations: { entityType: "definition" }, // missing address
			});

			const result = builder.buildClassSpecs([bad1, bad2], [], context);

			expect(result.classSpecs).toHaveLength(0);
			expect(result.errors.length).toBe(2);
		});

		it("should include source location in errors", () => {
			context.specFile = "specs/manager.md";
			const parsed = makeParsedClass({
				name: "Bad",
				annotations: { address: "a..b", entityType: "definition" },
				startLine: 15,
			});

			const result = builder.buildClassSpecs([parsed], [], context);

			const err = result.errors[0]!;
			expect(err.specFile).toBe("specs/manager.md");
			expect(err.specLine).toBe(15);
		});

		it("should return empty BuildResult for empty input", () => {
			const result = builder.buildClassSpecs([], [], context);

			expect(result.classSpecs).toHaveLength(0);
			expect(result.errors).toHaveLength(0);
			expect(result.warnings).toHaveLength(0);
		});
	});

	// ─── EB-900: External Type Handling ───

	describe("Feature: External Type Handling", () => {
		it("should build external class spec", () => {
			const parsed = makeParsedClass({
				name: "ExternalLib",
				annotations: { address: "ext.lib", entityType: "external" },
			});

			const result = builder.buildClassSpecs([parsed], [], context);

			// External types go through normal definition flow in current implementation
			// They should be registered
			expect(context.registry.exists("ext.lib.ExternalLib")).toBe(true);
		});
	});

	// ─── EB-1000: Edge Cases ───

	describe("Feature: Edge Cases", () => {
		it("should process file with mix of definition, reference, and external", () => {
			const def = makeParsedClass({
				name: "ClassA",
				annotations: { address: "pkg", entityType: "definition" },
			});
			const ref = makeParsedClass({
				name: "ClassB",
				annotations: { address: "pkg", entityType: "reference" },
			});
			const ext = makeParsedClass({
				name: "ClassC",
				annotations: { address: "pkg", entityType: "external" },
			});

			const result = builder.buildClassSpecs([def, ref, ext], [], context);

			// ClassA (definition) and ClassC (external) should be in classSpecs
			// ClassB (reference) should not
			expect(result.classSpecs.some(s => s.name === "ClassA")).toBe(true);
			expect(result.classSpecs.some(s => s.name === "ClassC")).toBe(true);
			expect(result.classSpecs.some(s => s.name === "ClassB")).toBe(false);

			// ClassB reference without definition -> deferred
			expect(context.deferredQueue.getCount()).toBe(1);
		});

		it("should handle definition class with no members", () => {
			const parsed = makeParsedClass({
				name: "Empty",
				body: { methods: [], properties: [], enumValues: [] },
			});

			const result = builder.buildClassSpecs([parsed], [], context);

			expect(result.classSpecs).toHaveLength(1);
			expect(result.classSpecs[0]!.methods).toHaveLength(0);
			expect(result.classSpecs[0]!.properties).toHaveLength(0);
		});
	});
});
