import { describe, expect, it, beforeEach } from "bun:test";
import {
	PackageRegistry,
	RegistryError,
	RegistryErrorCode,
	type ClassSpec,
	ClassSpecType,
} from "../src/package-registry";

/**
 * Helper to create a minimal ClassSpec for testing.
 */
function makeClassSpec(overrides: Partial<ClassSpec> & { fqn: string }): ClassSpec {
	return {
		package: overrides.fqn.split(".").slice(0, -1).join(".") || overrides.fqn,
		name: overrides.fqn.split(".").pop() || overrides.fqn,
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
		...overrides,
	};
}

describe("PackageRegistry", () => {
	let registry: PackageRegistry;

	beforeEach(() => {
		registry = new PackageRegistry();
	});

	// ─── PR-100: Register Class Specs ───

	describe("Feature: Register Class Specs", () => {
		it("should register a valid class spec", () => {
			const spec = makeClassSpec({ fqn: "say2.core.Session" });
			registry.register(spec);

			expect(registry.size()).toBe(1);
			expect(registry.exists("say2.core.Session")).toBe(true);
		});

		it("should register multiple class specs", () => {
			registry.register(makeClassSpec({ fqn: "say2.core.Session" }));
			registry.register(makeClassSpec({ fqn: "say2.core.Config" }));
			registry.register(makeClassSpec({ fqn: "say2.mcp.Handler" }));

			expect(registry.size()).toBe(3);
			expect(registry.exists("say2.core.Session")).toBe(true);
			expect(registry.exists("say2.core.Config")).toBe(true);
			expect(registry.exists("say2.mcp.Handler")).toBe(true);
		});

		it("should throw DUPLICATE_FQN on duplicate register", () => {
			const spec = makeClassSpec({ fqn: "say2.core.Session" });
			registry.register(spec);

			try {
				registry.register(makeClassSpec({ fqn: "say2.core.Session" }));
				expect(true).toBe(false); // should not reach
			} catch (e) {
				expect(e).toBeInstanceOf(RegistryError);
				const err = e as RegistryError;
				expect(err.code).toBe(RegistryErrorCode.DUPLICATE_FQN);
				expect(err.fqn).toBe("say2.core.Session");
			}

			expect(registry.size()).toBe(1);
		});

		it("should throw INVALID_FQN on empty FQN", () => {
			try {
				registry.register(makeClassSpec({ fqn: "" }));
				expect(true).toBe(false);
			} catch (e) {
				expect(e).toBeInstanceOf(RegistryError);
				expect((e as RegistryError).code).toBe(RegistryErrorCode.INVALID_FQN);
			}
		});

		it("should throw INVALID_FQN on malformed FQN (double dots)", () => {
			try {
				registry.register(makeClassSpec({ fqn: "say2..core" }));
				expect(true).toBe(false);
			} catch (e) {
				expect(e).toBeInstanceOf(RegistryError);
				expect((e as RegistryError).code).toBe(RegistryErrorCode.INVALID_FQN);
			}
		});
	});

	// ─── PR-200: FQN Validation ───

	describe("Feature: FQN Validation", () => {
		it("should accept valid FQN formats", () => {
			const validFqns = [
				"say2.core.Session",
				"app.models.User",
				"single",
				"a.b.c.d.e",
				"my_pkg.my_class",
			];

			for (const fqn of validFqns) {
				expect(() => registry.validateFQN(fqn)).not.toThrow();
			}
		});

		it("should reject empty string", () => {
			try {
				registry.validateFQN("");
				expect(true).toBe(false);
			} catch (e) {
				expect(e).toBeInstanceOf(RegistryError);
				expect((e as RegistryError).code).toBe(RegistryErrorCode.INVALID_FQN);
			}
		});

		it("should reject double dots", () => {
			try {
				registry.validateFQN("say2..core");
				expect(true).toBe(false);
			} catch (e) {
				expect(e).toBeInstanceOf(RegistryError);
				expect((e as RegistryError).code).toBe(RegistryErrorCode.INVALID_FQN);
			}
		});

		it("should reject leading dot", () => {
			try {
				registry.validateFQN(".say2.core");
				expect(true).toBe(false);
			} catch (e) {
				expect(e).toBeInstanceOf(RegistryError);
				expect((e as RegistryError).code).toBe(RegistryErrorCode.INVALID_FQN);
			}
		});

		it("should reject trailing dot", () => {
			try {
				registry.validateFQN("say2.core.");
				expect(true).toBe(false);
			} catch (e) {
				expect(e).toBeInstanceOf(RegistryError);
				expect((e as RegistryError).code).toBe(RegistryErrorCode.INVALID_FQN);
			}
		});

		it("should reject invalid characters (slash)", () => {
			try {
				registry.validateFQN("say2/core");
				expect(true).toBe(false);
			} catch (e) {
				expect(e).toBeInstanceOf(RegistryError);
				expect((e as RegistryError).code).toBe(RegistryErrorCode.INVALID_FQN);
			}
		});

		it("should reject whitespace in FQN", () => {
			try {
				registry.validateFQN("say2. core");
				expect(true).toBe(false);
			} catch (e) {
				expect(e).toBeInstanceOf(RegistryError);
				expect((e as RegistryError).code).toBe(RegistryErrorCode.INVALID_FQN);
			}
		});
	});

	// ─── PR-300: Lookup ───

	describe("Feature: Lookup", () => {
		it("should return class spec for existing FQN", () => {
			const spec = makeClassSpec({ fqn: "say2.core.Session" });
			registry.register(spec);

			const result = registry.lookup("say2.core.Session");
			expect(result).toBeDefined();
			expect(result!.fqn).toBe("say2.core.Session");
		});

		it("should return undefined for non-existent FQN", () => {
			registry.register(makeClassSpec({ fqn: "say2.core.Session" }));

			expect(registry.lookup("say2.core.Unknown")).toBeUndefined();
		});

		it("should return undefined from empty registry", () => {
			expect(registry.lookup("say2.core.Session")).toBeUndefined();
		});
	});

	// ─── PR-400: Exists ───

	describe("Feature: Exists", () => {
		it("should return true for registered FQN", () => {
			registry.register(makeClassSpec({ fqn: "say2.core.Session" }));

			expect(registry.exists("say2.core.Session")).toBe(true);
		});

		it("should return false for unregistered FQN", () => {
			registry.register(makeClassSpec({ fqn: "say2.core.Session" }));

			expect(registry.exists("say2.core.Unknown")).toBe(false);
		});

		it("should be consistent with lookup", () => {
			const fqns = ["say2.core.Session", "say2.core.Config"];
			for (const fqn of fqns) {
				registry.register(makeClassSpec({ fqn }));
			}

			for (const fqn of fqns) {
				expect(registry.exists(fqn)).toBe(true);
				expect(registry.lookup(fqn)).toBeDefined();
			}

			expect(registry.exists("say2.core.Missing")).toBe(false);
			expect(registry.lookup("say2.core.Missing")).toBeUndefined();
		});
	});

	// ─── PR-500: List By Package ───

	describe("Feature: List By Package", () => {
		it("should list class specs in a package", () => {
			registry.register(makeClassSpec({ fqn: "say2.core.Session", package: "say2.core" }));
			registry.register(makeClassSpec({ fqn: "say2.core.Config", package: "say2.core" }));
			registry.register(makeClassSpec({ fqn: "say2.mcp.Handler", package: "say2.mcp" }));

			const results = registry.listByPackage("say2.core");
			expect(results).toHaveLength(2);

			const fqns = results.map((s) => s.fqn).sort();
			expect(fqns).toEqual(["say2.core.Config", "say2.core.Session"]);
		});

		it("should return empty for unknown package", () => {
			registry.register(makeClassSpec({ fqn: "say2.core.Session" }));

			expect(registry.listByPackage("unknown.pkg")).toEqual([]);
		});

		it("should return empty from empty registry", () => {
			expect(registry.listByPackage("say2.core")).toEqual([]);
		});
	});

	// ─── PR-600: Get All and Size ───

	describe("Feature: Get All and Size", () => {
		it("should get all class specs", () => {
			registry.register(makeClassSpec({ fqn: "a.A" }));
			registry.register(makeClassSpec({ fqn: "b.B" }));
			registry.register(makeClassSpec({ fqn: "c.C" }));

			const all = registry.getAll();
			expect(all).toHaveLength(3);
		});

		it("should return empty array from empty registry", () => {
			expect(registry.getAll()).toEqual([]);
		});

		it("should reflect registered count in size", () => {
			registry.register(makeClassSpec({ fqn: "a.A" }));
			registry.register(makeClassSpec({ fqn: "b.B" }));

			expect(registry.size()).toBe(2);
		});

		it("should return 0 for empty registry", () => {
			expect(registry.size()).toBe(0);
		});
	});

	// ─── PR-700: Clear ───

	describe("Feature: Clear", () => {
		it("should remove all class specs", () => {
			registry.register(makeClassSpec({ fqn: "a.A" }));
			registry.register(makeClassSpec({ fqn: "b.B" }));
			registry.register(makeClassSpec({ fqn: "c.C" }));

			registry.clear();

			expect(registry.size()).toBe(0);
			expect(registry.getAll()).toEqual([]);
		});

		it("should be no-op on empty registry", () => {
			expect(() => registry.clear()).not.toThrow();
			expect(registry.size()).toBe(0);
		});

		it("should allow register after clear without DUPLICATE_FQN", () => {
			registry.register(makeClassSpec({ fqn: "say2.core.Session" }));
			registry.clear();

			expect(() =>
				registry.register(makeClassSpec({ fqn: "say2.core.Session" }))
			).not.toThrow();

			expect(registry.size()).toBe(1);
		});
	});

	// ─── PR-800: Edge Cases ───

	describe("Feature: Edge Cases", () => {
		it("should preserve all ClassSpec fields on register and lookup", () => {
			const spec = makeClassSpec({
				fqn: "say2.core.Session",
				package: "say2.core",
				name: "Session",
				specType: ClassSpecType.DEFINITION,
				stereotype: "interface",
				isGeneric: true,
				typeParams: [{ name: "T", extends: "Entity" }],
				methods: [
					{
						name: "getId",
						params: [],
						returnType: "string",
						visibility: "public",
						isAbstract: false,
						isStatic: false,
						references: [],
					},
				],
				properties: [
					{
						name: "id",
						type: "string",
						visibility: "private",
						isStatic: false,
						references: [],
					},
				],
				relationships: [{ type: "inheritance", target: "say2.core.Base", label: "extends" }],
				specFile: "specs/session.md",
				specLine: 42,
				unresolvedTypes: ["CustomType"],
				externalDeps: ["lodash.Map"],
			});

			registry.register(spec);
			const result = registry.lookup("say2.core.Session");

			expect(result).toEqual(spec);
		});

		it("should be case-sensitive for FQN matching", () => {
			registry.register(makeClassSpec({ fqn: "Say2.Core.Session" }));

			expect(registry.lookup("say2.core.session")).toBeUndefined();
			expect(registry.exists("say2.core.session")).toBe(false);
		});

		it("should accumulate across simulated file processing", () => {
			// File 1
			registry.register(makeClassSpec({ fqn: "a.A" }));
			registry.register(makeClassSpec({ fqn: "a.B" }));

			// File 2
			registry.register(makeClassSpec({ fqn: "b.C" }));
			registry.register(makeClassSpec({ fqn: "b.D" }));
			registry.register(makeClassSpec({ fqn: "b.E" }));

			expect(registry.size()).toBe(5);
			expect(registry.getAll()).toHaveLength(5);
		});
	});
});
