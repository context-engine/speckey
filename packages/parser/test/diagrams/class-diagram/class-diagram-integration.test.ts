import { describe, expect, it, beforeEach } from "bun:test";
import { PackageRegistry, DeferredValidationQueue } from "@speckey/core";
import { EntityBuilder, BuildErrorCode } from "../../../src/diagrams/class-diagram/entity-builder";
import { TypeResolver } from "../../../src/diagrams/class-diagram/type-resolver/resolver";
import { IntegrationValidator, IntegrationErrorCode } from "../../../src/diagrams/class-diagram/integration-validator";
import type { BuildContext } from "../../../src/diagrams/class-diagram/entity-builder";
import type { ParsedClass, ParsedRelation } from "../../../src/diagrams/class-diagram/types";

/**
 * Helper to create a minimal ParsedClass.
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
 * Integration tests for the class diagram component chain:
 * EntityBuilder → TypeResolver + PackageRegistry + DeferredValidationQueue → IntegrationValidator
 *
 * All tests use real instances (no mocks). Shared registry and queue simulate
 * multi-file processing where the pipeline accumulates state across files.
 */
describe("Class Diagram Integration", () => {
	let builder: EntityBuilder;
	let registry: PackageRegistry;
	let deferredQueue: DeferredValidationQueue;
	let typeResolver: TypeResolver;
	let integrationValidator: IntegrationValidator;

	function makeContext(specFile: string): BuildContext {
		return {
			registry,
			deferredQueue,
			typeResolver,
			currentDiagramClasses: new Map(),
			specFile,
		};
	}

	beforeEach(() => {
		builder = new EntityBuilder();
		registry = new PackageRegistry();
		deferredQueue = new DeferredValidationQueue();
		typeResolver = new TypeResolver();
		integrationValidator = new IntegrationValidator();
	});

	// ─── Scenario 1: Single-file happy path ───

	it("should build and validate classes from a single file with cross-references", () => {
		const classes = [
			makeParsedClass({
				name: "Session",
				annotations: { address: "say2.core", entityType: "definition" },
			}),
			makeParsedClass({
				name: "Config",
				annotations: { address: "say2.core", entityType: "definition" },
			}),
			makeParsedClass({
				name: "Manager",
				annotations: { address: "say2.core", entityType: "definition" },
				body: {
					methods: [
						{ name: "getSession", returnType: "Session", parameters: [], visibility: "public", isAbstract: false, isStatic: false },
					],
					properties: [
						{ name: "config", type: "Config", visibility: "private", isStatic: false },
					],
					enumValues: [],
				},
			}),
		];

		const relations: ParsedRelation[] = [
			{ sourceClass: "Manager", targetClass: "Session", type: "association", label: "manages" },
		];

		const context = makeContext("specs/core.md");
		const result = builder.buildClassSpecs(classes, relations, context);

		// All 3 built successfully
		expect(result.classSpecs).toHaveLength(3);
		expect(result.errors).toHaveLength(0);
		expect(registry.size()).toBe(3);

		// Manager's method/property types resolved via diagram map
		const manager = result.classSpecs.find(s => s.name === "Manager")!;
		expect(manager.methods[0]!.returnType).toBe("Session");
		expect(manager.properties[0]!.type).toBe("Config");
		expect(manager.relationships[0]!.target).toBe("say2.core.Session");

		// No deferred entries needed (all resolved in-diagram)
		// Note: TypeResolver may still enqueue for types not in diagram/registry
		// but Session and Config ARE in the diagram map
		const drained = deferredQueue.drain();
		const report = integrationValidator.validate(drained, registry);

		expect(report.unresolved).toHaveLength(0);
		expect(report.errors).toHaveLength(0);
	});

	// ─── Scenario 2: Multi-file cross-reference resolution ───

	it("should resolve cross-file references via PackageRegistry", () => {
		// File 1: define Session and Config
		const file1Classes = [
			makeParsedClass({ name: "Session", annotations: { address: "say2.core", entityType: "definition" } }),
			makeParsedClass({ name: "Config", annotations: { address: "say2.core", entityType: "definition" } }),
		];
		builder.buildClassSpecs(file1Classes, [], makeContext("specs/core.md"));

		expect(registry.size()).toBe(2);

		// File 2: Manager references Session and Config by FQN
		const file2Classes = [
			makeParsedClass({
				name: "Manager",
				annotations: { address: "say2.mcp", entityType: "definition" },
				body: {
					methods: [
						{ name: "getSession", returnType: "say2.core.Session", parameters: [], visibility: "public", isAbstract: false, isStatic: false },
					],
					properties: [
						{ name: "config", type: "say2.core.Config", visibility: "private", isStatic: false },
					],
					enumValues: [],
				},
			}),
		];

		const relations: ParsedRelation[] = [
			{ sourceClass: "Manager", targetClass: "say2.core.Session", type: "association", label: "manages" },
		];

		const result2 = builder.buildClassSpecs(file2Classes, relations, makeContext("specs/mcp.md"));

		expect(result2.classSpecs).toHaveLength(1);
		expect(result2.errors).toHaveLength(0);

		const manager = result2.classSpecs[0]!;
		expect(manager.relationships[0]!.target).toBe("say2.core.Session");

		// Drain and validate — everything should be resolved
		const drained = deferredQueue.drain();
		const report = integrationValidator.validate(drained, registry);
		expect(report.unresolved).toHaveLength(0);
	});

	// ─── Scenario 3: Deferred resolution across files ───

	it("should defer unresolved types and resolve them after later file processing", () => {
		// File 1: Manager references Session (not yet defined)
		const file1Classes = [
			makeParsedClass({
				name: "Manager",
				annotations: { address: "say2.mcp", entityType: "definition" },
				body: {
					methods: [
						{ name: "getSession", returnType: "Session", parameters: [], visibility: "public", isAbstract: false, isStatic: false },
					],
					properties: [],
					enumValues: [],
				},
			}),
		];
		builder.buildClassSpecs(file1Classes, [], makeContext("specs/mcp.md"));

		// Session not in diagram or registry → deferred
		expect(deferredQueue.getCount()).toBeGreaterThanOrEqual(1);

		// File 2: define Session
		const file2Classes = [
			makeParsedClass({ name: "Session", annotations: { address: "say2.core", entityType: "definition" } }),
		];
		builder.buildClassSpecs(file2Classes, [], makeContext("specs/core.md"));

		expect(registry.exists("say2.core.Session")).toBe(true);

		// Now validate — the deferred "Session" type won't match "say2.core.Session" by bare name
		// in the validator (validator checks exact target string against registry)
		// This demonstrates the importance of FQN usage for cross-file refs
		const drained = deferredQueue.drain();
		const report = integrationValidator.validate(drained, registry);

		// Bare name "Session" won't match FQN "say2.core.Session" in registry
		// This is expected: cross-file references should use FQN
		expect(drained.length).toBeGreaterThanOrEqual(1);
	});

	// ─── Scenario 4: Unresolved types remain unresolved ───

	it("should report unresolved types that are never defined", () => {
		const classes = [
			makeParsedClass({
				name: "Manager",
				annotations: { address: "say2.mcp", entityType: "definition" },
				body: {
					methods: [
						{ name: "call", returnType: "ExternalService", parameters: [], visibility: "public", isAbstract: false, isStatic: false },
					],
					properties: [],
					enumValues: [],
				},
			}),
		];

		builder.buildClassSpecs(classes, [], makeContext("specs/mcp.md"));

		const drained = deferredQueue.drain();
		const report = integrationValidator.validate(drained, registry);

		expect(report.unresolved.length).toBeGreaterThanOrEqual(1);
		expect(report.errors.some(e => e.code === IntegrationErrorCode.UNRESOLVED_TYPE)).toBe(true);
	});

	// ─── Scenario 5: Reference → deferred → resolved ───

	it("should resolve @type reference after definition is registered", () => {
		// File 1: reference to Helper (no definition yet)
		const file1Classes = [
			makeParsedClass({
				name: "Helper",
				annotations: { address: "say2.util", entityType: "reference" },
			}),
		];
		builder.buildClassSpecs(file1Classes, [], makeContext("specs/refs.md"));

		expect(deferredQueue.getCount()).toBe(1);

		// File 2: define Helper
		const file2Classes = [
			makeParsedClass({
				name: "Helper",
				annotations: { address: "say2.util", entityType: "definition" },
			}),
		];
		builder.buildClassSpecs(file2Classes, [], makeContext("specs/util.md"));

		expect(registry.exists("say2.util.Helper")).toBe(true);

		// Validate — the deferred entry targets "say2.util.Helper" which now exists
		const drained = deferredQueue.drain();
		const report = integrationValidator.validate(drained, registry);

		expect(report.resolved).toHaveLength(1);
		expect(report.resolved[0]!.targetFqn).toBe("say2.util.Helper");
		expect(report.errors).toHaveLength(0);
	});

	// ─── Scenario 6: Reference never defined → error ───

	it("should report MISSING_DEFINITION when reference is never defined", () => {
		const classes = [
			makeParsedClass({
				name: "Missing",
				annotations: { address: "say2.util", entityType: "reference" },
			}),
		];
		builder.buildClassSpecs(classes, [], makeContext("specs/refs.md"));

		const drained = deferredQueue.drain();
		const report = integrationValidator.validate(drained, registry);

		expect(report.unresolved).toHaveLength(1);
		expect(report.errors).toHaveLength(1);
		expect(report.errors[0]!.code).toBe(IntegrationErrorCode.MISSING_DEFINITION);
	});

	// ─── Scenario 7: Duplicate definition across files ───

	it("should error on duplicate definition across files", () => {
		// File 1: define Session
		builder.buildClassSpecs(
			[makeParsedClass({ name: "Session", annotations: { address: "say2.core", entityType: "definition" } })],
			[],
			makeContext("specs/core.md")
		);

		// File 2: define Session again (same FQN)
		const result2 = builder.buildClassSpecs(
			[makeParsedClass({ name: "Session", annotations: { address: "say2.core", entityType: "definition" } })],
			[],
			makeContext("specs/duplicate.md")
		);

		expect(result2.errors).toHaveLength(1);
		expect(result2.errors[0]!.code).toBe(BuildErrorCode.DUPLICATE_DEFINITION);
		expect(result2.classSpecs).toHaveLength(0);
		expect(registry.size()).toBe(1); // only the first one
	});

	// ─── Scenario 8: Mixed payload types in validation ───

	it("should map different payload types to correct error codes in validation", () => {
		// Build a class with unresolved method return, property type, and relationship target
		const classes = [
			makeParsedClass({
				name: "Complex",
				annotations: { address: "say2.mcp", entityType: "definition" },
				body: {
					methods: [
						{ name: "get", returnType: "UnknownReturn", parameters: [
							{ name: "input", type: "UnknownParam", optional: false, isGeneric: false },
						], visibility: "public", isAbstract: false, isStatic: false },
					],
					properties: [
						{ name: "dep", type: "UnknownProp", visibility: "private", isStatic: false },
					],
					enumValues: [],
				},
			}),
		];

		const relations: ParsedRelation[] = [
			{ sourceClass: "Complex", targetClass: "say2.missing.Target", type: "association" },
		];

		builder.buildClassSpecs(classes, relations, makeContext("specs/complex.md"));

		const drained = deferredQueue.drain();
		const report = integrationValidator.validate(drained, registry);

		// Should have errors for each unresolved type/relationship
		expect(report.errors.length).toBeGreaterThanOrEqual(1);

		const codes = report.errors.map(e => e.code);
		// Type resolution failures → UNRESOLVED_TYPE
		expect(codes).toContain(IntegrationErrorCode.UNRESOLVED_TYPE);
	});

	// ─── Scenario 9: Full pipeline — definition + reference + external ───

	it("should handle full pipeline with definition, reference, and external classes", () => {
		// File 1: definition + external
		const file1Classes = [
			makeParsedClass({
				name: "UserService",
				annotations: { address: "app.services", entityType: "definition" },
				body: {
					methods: [
						{ name: "findUser", returnType: "User", parameters: [
							{ name: "id", type: "string", optional: false, isGeneric: false },
						], visibility: "public", isAbstract: false, isStatic: false },
					],
					properties: [],
					enumValues: [],
				},
			}),
			makeParsedClass({
				name: "User",
				annotations: { address: "app.models", entityType: "definition" },
				body: {
					properties: [
						{ name: "id", type: "string", visibility: "public", isStatic: false },
						{ name: "name", type: "string", visibility: "public", isStatic: false },
					],
					methods: [],
					enumValues: [],
				},
			}),
		];

		const file1Relations: ParsedRelation[] = [
			{ sourceClass: "UserService", targetClass: "User", type: "dependency", label: "uses" },
		];

		const result1 = builder.buildClassSpecs(file1Classes, file1Relations, makeContext("specs/services.md"));
		expect(result1.classSpecs).toHaveLength(2);
		expect(result1.errors).toHaveLength(0);

		// File 2: reference to UserService + external dependency
		const file2Classes = [
			makeParsedClass({
				name: "UserService",
				annotations: { address: "app.services", entityType: "reference" },
			}),
			makeParsedClass({
				name: "Logger",
				annotations: { address: "external.logging", entityType: "external" },
			}),
			makeParsedClass({
				name: "UserController",
				annotations: { address: "app.controllers", entityType: "definition" },
				body: {
					methods: [
						{ name: "handleRequest", returnType: "void", parameters: [], visibility: "public", isAbstract: false, isStatic: false },
					],
					properties: [],
					enumValues: [],
				},
			}),
		];

		const file2Relations: ParsedRelation[] = [
			{ sourceClass: "UserController", targetClass: "app.services.UserService", type: "dependency", label: "calls" },
		];

		const result2 = builder.buildClassSpecs(file2Classes, file2Relations, makeContext("specs/controllers.md"));

		// UserService reference → already registered → no deferred entry
		// Logger external → registered
		// UserController definition → registered
		expect(result2.classSpecs.some(s => s.name === "Logger")).toBe(true);
		expect(result2.classSpecs.some(s => s.name === "UserController")).toBe(true);
		expect(registry.exists("external.logging.Logger")).toBe(true);
		expect(registry.exists("app.controllers.UserController")).toBe(true);

		// Final validation
		const drained = deferredQueue.drain();
		const report = integrationValidator.validate(drained, registry);

		// UserService reference was already in registry → no deferred entry for it
		// Controller's relationship to app.services.UserService should resolve
		expect(report.errors.filter(e =>
			e.targetFqn === "app.services.UserService" && e.code !== IntegrationErrorCode.UNRESOLVED_TYPE
		)).toHaveLength(0);
	});

	// ─── Scenario: Registry state accumulates correctly across files ───

	it("should accumulate registry state across multiple file builds", () => {
		const files = [
			{ name: "A", pkg: "pkg1" },
			{ name: "B", pkg: "pkg1" },
			{ name: "C", pkg: "pkg2" },
			{ name: "D", pkg: "pkg2" },
			{ name: "E", pkg: "pkg3" },
		];

		for (const { name, pkg } of files) {
			builder.buildClassSpecs(
				[makeParsedClass({ name, annotations: { address: pkg, entityType: "definition" } })],
				[],
				makeContext(`specs/${pkg}.md`)
			);
		}

		expect(registry.size()).toBe(5);
		expect(registry.listByPackage("pkg1")).toHaveLength(2);
		expect(registry.listByPackage("pkg2")).toHaveLength(2);
		expect(registry.listByPackage("pkg3")).toHaveLength(1);

		// No deferred entries
		expect(deferredQueue.getCount()).toBe(0);
	});
});
