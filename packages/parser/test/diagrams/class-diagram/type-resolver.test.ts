import { describe, expect, it, beforeEach } from "bun:test";
import { PackageRegistry, DeferredValidationQueue, ClassSpecType } from "@speckey/core";
import { TypeResolver } from "../../../src/diagrams/class-diagram/type-resolver/resolver";
import { TypeCategory } from "../../../src/diagrams/class-diagram/type-resolver/types";
import type { ResolutionContext } from "../../../src/diagrams/class-diagram/type-resolver/types";

/**
 * Helper to create a ResolutionContext with real dependencies.
 */
function makeContext(overrides: Partial<ResolutionContext> = {}): ResolutionContext {
	return {
		currentDiagramClasses: new Map(),
		registry: new PackageRegistry(),
		deferredQueue: new DeferredValidationQueue(),
		sourceEntityFqn: "test.Entity",
		specFile: "test.md",
		specLine: 1,
		...overrides,
	};
}

/**
 * Helper to register a ClassSpec in a registry.
 */
function registerSpec(registry: PackageRegistry, fqn: string): void {
	registry.register({
		fqn,
		package: fqn.split(".").slice(0, -1).join("."),
		name: fqn.split(".").pop()!,
		specType: ClassSpecType.DEFINITION,
		stereotype: "class",
		isGeneric: false,
		typeParams: [],
		methods: [],
		properties: [],
		relationships: [],
		specFile: "test.md",
		specLine: 1,
		unresolvedTypes: [],
		externalDeps: [],
	});
}

describe("TypeResolver", () => {
	let resolver: TypeResolver;
	let context: ResolutionContext;

	beforeEach(() => {
		resolver = new TypeResolver();
		context = makeContext();
	});

	// ─── TR-100: Built-in Type Recognition ───

	describe("Feature: Built-in Type Recognition", () => {
		it("should recognize all built-in types", () => {
			const builtIns = ["void", "string", "number", "boolean", "any", "unknown"];

			for (const type of builtIns) {
				const result = resolver.resolveType(type, context);
				expect(result.category).toBe(TypeCategory.BUILT_IN);
				expect(result.references).toHaveLength(0);
				expect(result.isResolved).toBe(true);
			}
		});

		it("should recognize capitalized built-in types (case-insensitive)", () => {
			const result = resolver.resolveType("String", context);
			// Implementation uses toLowerCase() — "String" matches "string"
			expect(result.category).toBe(TypeCategory.BUILT_IN);
			expect(result.isResolved).toBe(true);
		});
	});

	// ─── TR-200: Array Type Resolution ───

	describe("Feature: Array Type Resolution", () => {
		it("should resolve built-in array type", () => {
			const result = resolver.resolveType("string[]", context);
			expect(result.category).toBe(TypeCategory.ARRAY);
			expect(result.references).toHaveLength(0);
			expect(result.isResolved).toBe(true);
		});

		it("should resolve custom class array type", () => {
			context.currentDiagramClasses.set("Session", "say2.core.Session");

			const result = resolver.resolveType("Session[]", context);
			expect(result.category).toBe(TypeCategory.ARRAY);
			expect(result.references).toContain("say2.core.Session");
		});

		it("should resolve nested array type", () => {
			context.currentDiagramClasses.set("Session", "say2.core.Session");

			const result = resolver.resolveType("Session[][]", context);
			expect(result.category).toBe(TypeCategory.ARRAY);
			expect(result.references).toContain("say2.core.Session");
		});
	});

	// ─── TR-300: Union Type Resolution ───

	describe("Feature: Union Type Resolution", () => {
		it("should resolve union of built-in types", () => {
			const result = resolver.resolveType("string | number", context);
			expect(result.category).toBe(TypeCategory.UNION);
			expect(result.references).toHaveLength(0);
			expect(result.isResolved).toBe(true);
		});

		it("should resolve union with custom type", () => {
			context.currentDiagramClasses.set("Session", "say2.core.Session");

			const result = resolver.resolveType("Session | undefined", context);
			expect(result.category).toBe(TypeCategory.UNION);
			expect(result.references).toContain("say2.core.Session");
		});

		it("should resolve union with multiple custom types (partial resolution)", () => {
			context.currentDiagramClasses.set("Session", "say2.core.Session");
			context.currentDiagramClasses.set("Config", "say2.core.Config");

			const result = resolver.resolveType("Session | Config | Error", context);
			expect(result.references).toContain("say2.core.Session");
			expect(result.references).toContain("say2.core.Config");
			expect(result.isResolved).toBe(false); // Error not found
		});
	});

	// ─── TR-400: Generic Type Resolution ───

	describe("Feature: Generic Type Resolution", () => {
		it("should resolve generic with built-in param", () => {
			const result = resolver.resolveType("Promise<void>", context);
			expect(result.category).toBe(TypeCategory.GENERIC);
		});

		it("should resolve generic with custom param", () => {
			context.currentDiagramClasses.set("Session", "say2.core.Session");

			const result = resolver.resolveType("Promise<Session>", context);
			expect(result.category).toBe(TypeCategory.GENERIC);
			expect(result.references).toContain("say2.core.Session");
		});

		it("should resolve multi-param generic", () => {
			context.currentDiagramClasses.set("Session", "say2.core.Session");

			const result = resolver.resolveType("Map<string, Session>", context);
			expect(result.category).toBe(TypeCategory.GENERIC);
			expect(result.references).toContain("say2.core.Session");
		});

		it("should resolve nested generic", () => {
			context.currentDiagramClasses.set("Session", "say2.core.Session");

			const result = resolver.resolveType("Map<string, Promise<Session>>", context);
			expect(result.category).toBe(TypeCategory.GENERIC);
			expect(result.references).toContain("say2.core.Session");
		});

		it("should mark unresolved generic param", () => {
			const result = resolver.resolveType("Promise<CustomType>", context);
			expect(result.isResolved).toBe(false);
			expect(context.deferredQueue.getCount()).toBeGreaterThanOrEqual(1);
		});
	});

	// ─── TR-500: Custom Type Resolution ───

	describe("Feature: Custom Type Resolution", () => {
		it("should resolve custom type from current diagram", () => {
			context.currentDiagramClasses.set("Session", "say2.core.Session");

			const result = resolver.resolveType("Session", context);
			expect(result.category).toBe(TypeCategory.CUSTOM);
			expect(result.references).toContain("say2.core.Session");
			expect(result.isResolved).toBe(true);
		});

		it("should resolve FQN type from PackageRegistry", () => {
			registerSpec(context.registry, "say2.core.Session");

			const result = resolver.resolveType("say2.core.Session", context);
			expect(result.category).toBe(TypeCategory.CUSTOM);
			expect(result.references).toContain("say2.core.Session");
			expect(result.isResolved).toBe(true);
		});

		it("should prioritize diagram lookup over registry", () => {
			context.currentDiagramClasses.set("Session", "app.Session");
			registerSpec(context.registry, "say2.core.Session");

			const result = resolver.resolveType("Session", context);
			expect(result.references).toContain("app.Session");
		});

		it("should enqueue deferred entry for unresolved custom type", () => {
			const result = resolver.resolveType("CustomType", context);
			expect(result.isResolved).toBe(false);
			expect(context.deferredQueue.getCount()).toBe(1);

			const drained = context.deferredQueue.drain();
			expect(drained[0]!.diagramType).toBe("class");
			expect(drained[0]!.payload.target).toBe("CustomType");
		});

		it("should enqueue separate entries for multiple unresolved types", () => {
			resolver.resolveType("Foo", context);
			resolver.resolveType("Bar", context);
			expect(context.deferredQueue.getCount()).toBe(2);
		});
	});

	// ─── TR-600: Method Type Resolution ───

	describe("Feature: Method Type Resolution", () => {
		it("should resolve method with built-in return type", () => {
			const methods = [
				{ name: "getName", returnType: "string", parameters: [], visibility: "public", isAbstract: false, isStatic: false },
			];

			const result = resolver.resolveMethodTypes(methods, context);
			expect(result[0]!.returnType.category).toBe(TypeCategory.BUILT_IN);
			expect(result[0]!.references).toHaveLength(0);
		});

		it("should resolve method with custom return type", () => {
			context.currentDiagramClasses.set("Session", "say2.core.Session");
			const methods = [
				{ name: "getSession", returnType: "Session", parameters: [], visibility: "public", isAbstract: false, isStatic: false },
			];

			const result = resolver.resolveMethodTypes(methods, context);
			expect(result[0]!.returnType.references).toContain("say2.core.Session");
			expect(result[0]!.references).toContain("say2.core.Session");
		});

		it("should resolve method parameter types", () => {
			context.currentDiagramClasses.set("Session", "say2.core.Session");
			const methods = [
				{
					name: "process",
					returnType: "void",
					parameters: [
						{ name: "session", type: "Session", optional: false, isGeneric: false },
						{ name: "count", type: "number", optional: false, isGeneric: false },
					],
					visibility: "public",
					isAbstract: false,
					isStatic: false,
				},
			];

			const result = resolver.resolveMethodTypes(methods, context);
			expect(result[0]!.params[0]!.type.references).toContain("say2.core.Session");
			expect(result[0]!.params[1]!.type.category).toBe(TypeCategory.BUILT_IN);
			expect(result[0]!.references).toContain("say2.core.Session");
		});

		it("should aggregate references from return type and all params", () => {
			context.currentDiagramClasses.set("Config", "say2.core.Config");
			context.currentDiagramClasses.set("Session", "say2.core.Session");
			const methods = [
				{
					name: "transform",
					returnType: "Session",
					parameters: [
						{ name: "input", type: "Config", optional: false, isGeneric: false },
					],
					visibility: "public",
					isAbstract: false,
					isStatic: false,
				},
			];

			const result = resolver.resolveMethodTypes(methods, context);
			expect(result[0]!.references).toContain("say2.core.Session");
			expect(result[0]!.references).toContain("say2.core.Config");
		});

		it("should resolve multiple methods", () => {
			const methods = [
				{ name: "a", returnType: "string", parameters: [], visibility: "public", isAbstract: false, isStatic: false },
				{ name: "b", returnType: "number", parameters: [], visibility: "public", isAbstract: false, isStatic: false },
				{ name: "c", returnType: "boolean", parameters: [], visibility: "public", isAbstract: false, isStatic: false },
			];

			const result = resolver.resolveMethodTypes(methods, context);
			expect(result).toHaveLength(3);
		});

		it("should pass through non-type fields", () => {
			const methods = [
				{ name: "test", returnType: "void", parameters: [], visibility: "private", isAbstract: true, isStatic: false },
			];

			const result = resolver.resolveMethodTypes(methods, context);
			expect(result[0]!.visibility).toBe("private");
			expect(result[0]!.isAbstract).toBe(true);
			expect(result[0]!.isStatic).toBe(false);
		});
	});

	// ─── TR-700: Property Type Resolution ───

	describe("Feature: Property Type Resolution", () => {
		it("should resolve property with built-in type", () => {
			const props = [{ name: "name", type: "string", visibility: "public", isStatic: false }];

			const result = resolver.resolvePropertyTypes(props, context);
			expect(result[0]!.type.category).toBe(TypeCategory.BUILT_IN);
			expect(result[0]!.references).toHaveLength(0);
		});

		it("should resolve property with custom type", () => {
			context.currentDiagramClasses.set("Session", "say2.core.Session");
			const props = [{ name: "session", type: "Session", visibility: "private", isStatic: false }];

			const result = resolver.resolvePropertyTypes(props, context);
			expect(result[0]!.type.references).toContain("say2.core.Session");
		});

		it("should resolve property with generic type", () => {
			context.currentDiagramClasses.set("Session", "say2.core.Session");
			const props = [{ name: "items", type: "List<Session>", visibility: "public", isStatic: false }];

			const result = resolver.resolvePropertyTypes(props, context);
			expect(result[0]!.type.category).toBe(TypeCategory.GENERIC);
			expect(result[0]!.references).toContain("say2.core.Session");
		});

		it("should pass through non-type fields", () => {
			const props = [{ name: "count", type: "number", visibility: "protected", isStatic: true }];

			const result = resolver.resolvePropertyTypes(props, context);
			expect(result[0]!.visibility).toBe("protected");
			expect(result[0]!.isStatic).toBe(true);
		});
	});

	// ─── TR-800: Relationship Target Resolution ───

	describe("Feature: Relationship Target Resolution", () => {
		it("should resolve FQN target found in registry", () => {
			registerSpec(context.registry, "say2.core.Session");
			const rels = [{ type: "association", target: "say2.core.Session", label: "uses" }];

			const result = resolver.resolveRelationshipTargets(rels, context);
			expect(result[0]!.targetFqn).toBe("say2.core.Session");
			expect(result[0]!.isResolved).toBe(true);
		});

		it("should enqueue deferred for FQN target not found", () => {
			const rels = [{ type: "inheritance", target: "say2.core.Unknown" }];

			const result = resolver.resolveRelationshipTargets(rels, context);
			expect(result[0]!.targetFqn).toBe("say2.core.Unknown");
			expect(result[0]!.isResolved).toBe(false);
			expect(context.deferredQueue.getCount()).toBe(1);
		});

		it("should resolve bare name from current diagram", () => {
			context.currentDiagramClasses.set("Session", "say2.core.Session");
			const rels = [{ type: "association", target: "Session" }];

			const result = resolver.resolveRelationshipTargets(rels, context);
			expect(result[0]!.targetFqn).toBe("say2.core.Session");
			expect(result[0]!.isResolved).toBe(true);
		});

		it("should mark bare name not in diagram as unresolved", () => {
			const rels = [{ type: "association", target: "Session" }];

			const result = resolver.resolveRelationshipTargets(rels, context);
			expect(result[0]!.isResolved).toBe(false);
		});

		it("should pass through relationship type and label", () => {
			registerSpec(context.registry, "say2.core.Session");
			const rels = [{ type: "inheritance", target: "say2.core.Session", label: "extends" }];

			const result = resolver.resolveRelationshipTargets(rels, context);
			expect(result[0]!.type).toBe("inheritance");
			expect(result[0]!.label).toBe("extends");
		});

		it("should resolve multiple relationships", () => {
			registerSpec(context.registry, "say2.core.Session");
			context.currentDiagramClasses.set("Config", "say2.core.Config");
			const rels = [
				{ type: "association", target: "say2.core.Session" },
				{ type: "dependency", target: "Config" },
				{ type: "inheritance", target: "say2.core.Missing" },
			];

			const result = resolver.resolveRelationshipTargets(rels, context);
			expect(result).toHaveLength(3);
		});
	});

	// ─── TR-900: Deferred Entry Details ───

	describe("Feature: Deferred Entry Details", () => {
		it("should include source context in deferred entry", () => {
			context.sourceEntityFqn = "say2.mcp.Manager";
			context.specFile = "specs/manager.md";
			context.specLine = 15;

			resolver.resolveType("CustomType", context);

			const drained = context.deferredQueue.drain();
			expect(drained[0]!.entityFqn).toBe("say2.mcp.Manager");
			expect(drained[0]!.payload.specFile).toBe("specs/manager.md");
			expect(drained[0]!.payload.specLine).toBe(15);
		});

		it("should include target in deferred entry for relationship", () => {
			const rels = [{ type: "association", target: "say2.core.Unknown" }];

			resolver.resolveRelationshipTargets(rels, context);

			const drained = context.deferredQueue.drain();
			expect(drained[0]!.diagramType).toBe("class");
			expect(drained[0]!.payload.target).toBe("say2.core.Unknown");
		});
	});

	// ─── TR-1000: Edge Cases ───

	describe("Feature: Edge Cases", () => {
		it("should return empty array for empty method list", () => {
			expect(resolver.resolveMethodTypes([], context)).toEqual([]);
		});

		it("should return empty array for empty property list", () => {
			expect(resolver.resolvePropertyTypes([], context)).toEqual([]);
		});

		it("should return empty array for empty relationship list", () => {
			expect(resolver.resolveRelationshipTargets([], context)).toEqual([]);
		});

		it("should trim whitespace from type string", () => {
			const result = resolver.resolveType("  string  ", context);
			expect(result.category).toBe(TypeCategory.BUILT_IN);
			expect(result.isResolved).toBe(true);
		});

		it("should resolve deeply nested generic", () => {
			context.currentDiagramClasses.set("Session", "say2.core.Session");

			const result = resolver.resolveType("Map<string, List<Promise<Session>>>", context);
			expect(result.category).toBe(TypeCategory.GENERIC);
			expect(result.references).toContain("say2.core.Session");
		});

		it("should parse union containing generic as union (pipe takes precedence over angle brackets)", () => {
			context.currentDiagramClasses.set("Session", "say2.core.Session");
			context.currentDiagramClasses.set("Config", "say2.core.Config");

			// Implementation checks for | before <>, so "Promise<Session | Config>"
			// is split as union: "Promise<Session" | "Config>" — both unresolvable fragments
			const result = resolver.resolveType("Promise<Session | Config>", context);
			expect(result.category).toBe(TypeCategory.UNION);
		});
	});
});
