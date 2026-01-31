import { describe, expect, it, beforeEach } from "bun:test";
import { PackageRegistry, ClassSpecType } from "@speckey/core";
import type { DeferredEntry } from "@speckey/core";
import { IntegrationValidator, IntegrationErrorCode } from "../../../src/diagrams/class-diagram/integration-validator";

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

/**
 * Helper to create a DeferredEntry.
 */
function makeEntry(overrides: Partial<DeferredEntry> & { payload: Record<string, unknown> }): DeferredEntry {
	return {
		diagramType: "class",
		entityFqn: "test.Entity",
		...overrides,
	};
}

describe("IntegrationValidator", () => {
	let validator: IntegrationValidator;
	let registry: PackageRegistry;

	beforeEach(() => {
		validator = new IntegrationValidator();
		registry = new PackageRegistry();
	});

	// ─── IV-100: Resolved Entries ───

	describe("Feature: Resolved Entries", () => {
		it("should resolve entry where target exists in registry", () => {
			registerSpec(registry, "say2.core.Session");
			const entries: DeferredEntry[] = [
				makeEntry({
					entityFqn: "say2.mcp.Manager",
					payload: { target: "say2.core.Session", payloadType: "relationship" },
				}),
			];

			const report = validator.validate(entries, registry);

			expect(report.resolved).toHaveLength(1);
			expect(report.resolved[0]!.entityFqn).toBe("say2.mcp.Manager");
			expect(report.resolved[0]!.targetFqn).toBe("say2.core.Session");
			expect(report.resolved[0]!.payloadType).toBe("relationship");
			expect(report.errors).toHaveLength(0);
		});

		it("should resolve multiple entries all found", () => {
			registerSpec(registry, "a.A");
			registerSpec(registry, "b.B");
			registerSpec(registry, "c.C");
			const entries = [
				makeEntry({ payload: { target: "a.A", payloadType: "relationship" } }),
				makeEntry({ payload: { target: "b.B", payloadType: "method_return" } }),
				makeEntry({ payload: { target: "c.C", payloadType: "definition_check" } }),
			];

			const report = validator.validate(entries, registry);

			expect(report.resolved).toHaveLength(3);
			expect(report.unresolved).toHaveLength(0);
			expect(report.errors).toHaveLength(0);
		});

		it("should resolve entry with payloadType method_return", () => {
			registerSpec(registry, "say2.core.Config");
			const entries = [
				makeEntry({ payload: { target: "say2.core.Config", payloadType: "method_return" } }),
			];

			const report = validator.validate(entries, registry);

			expect(report.resolved).toHaveLength(1);
			expect(report.resolved[0]!.payloadType).toBe("method_return");
		});

		it("should resolve entry with payloadType definition_check", () => {
			registerSpec(registry, "say2.util.Helper");
			const entries = [
				makeEntry({ payload: { target: "say2.util.Helper", payloadType: "definition_check" } }),
			];

			const report = validator.validate(entries, registry);

			expect(report.resolved).toHaveLength(1);
		});
	});

	// ─── IV-200: Unresolved Entries ───

	describe("Feature: Unresolved Entries", () => {
		it("should report unresolved type — target not in registry", () => {
			const entries = [
				makeEntry({
					payload: { target: "say2.core.Unknown", payloadType: "method_return", specFile: "specs/manager.md", specLine: 15 },
				}),
			];

			const report = validator.validate(entries, registry);

			expect(report.unresolved).toHaveLength(1);
			expect(report.unresolved[0]!.targetFqn).toBe("say2.core.Unknown");
			expect(report.unresolved[0]!.specFile).toBe("specs/manager.md");
			expect(report.unresolved[0]!.specLine).toBe(15);
			expect(report.errors).toHaveLength(1);
			expect(report.errors[0]!.code).toBe(IntegrationErrorCode.UNRESOLVED_TYPE);
		});

		it("should report unresolved relationship", () => {
			const entries = [
				makeEntry({ payload: { target: "say2.core.Missing", payloadType: "relationship" } }),
			];

			const report = validator.validate(entries, registry);

			expect(report.unresolved).toHaveLength(1);
			expect(report.errors[0]!.code).toBe(IntegrationErrorCode.UNRESOLVED_RELATIONSHIP);
		});

		it("should report missing definition", () => {
			const entries = [
				makeEntry({ payload: { target: "say2.util.Helper", payloadType: "definition_check" } }),
			];

			const report = validator.validate(entries, registry);

			expect(report.unresolved).toHaveLength(1);
			expect(report.errors[0]!.code).toBe(IntegrationErrorCode.MISSING_DEFINITION);
		});

		it("should report multiple unresolved entries", () => {
			registerSpec(registry, "a.A");
			const entries = [
				makeEntry({ payload: { target: "a.A", payloadType: "relationship" } }),
				makeEntry({ payload: { target: "b.B", payloadType: "method_return" } }),
				makeEntry({ payload: { target: "c.C", payloadType: "property_type" } }),
			];

			const report = validator.validate(entries, registry);

			expect(report.resolved).toHaveLength(1);
			expect(report.unresolved).toHaveLength(2);
			expect(report.errors).toHaveLength(2);
		});
	});

	// ─── IV-300: Error Code Mapping ───

	describe("Feature: Error Code Mapping", () => {
		it("should map method_return to UNRESOLVED_TYPE", () => {
			const entries = [makeEntry({ payload: { target: "x.X", payloadType: "method_return" } })];
			const report = validator.validate(entries, registry);
			expect(report.errors[0]!.code).toBe(IntegrationErrorCode.UNRESOLVED_TYPE);
		});

		it("should map method_param to UNRESOLVED_TYPE", () => {
			const entries = [makeEntry({ payload: { target: "x.X", payloadType: "method_param" } })];
			const report = validator.validate(entries, registry);
			expect(report.errors[0]!.code).toBe(IntegrationErrorCode.UNRESOLVED_TYPE);
		});

		it("should map property_type to UNRESOLVED_TYPE", () => {
			const entries = [makeEntry({ payload: { target: "x.X", payloadType: "property_type" } })];
			const report = validator.validate(entries, registry);
			expect(report.errors[0]!.code).toBe(IntegrationErrorCode.UNRESOLVED_TYPE);
		});

		it("should map relationship to UNRESOLVED_RELATIONSHIP", () => {
			const entries = [makeEntry({ payload: { target: "x.X", payloadType: "relationship" } })];
			const report = validator.validate(entries, registry);
			expect(report.errors[0]!.code).toBe(IntegrationErrorCode.UNRESOLVED_RELATIONSHIP);
		});

		it("should map definition_check to MISSING_DEFINITION", () => {
			const entries = [makeEntry({ payload: { target: "x.X", payloadType: "definition_check" } })];
			const report = validator.validate(entries, registry);
			expect(report.errors[0]!.code).toBe(IntegrationErrorCode.MISSING_DEFINITION);
		});
	});

	// ─── IV-400: Payload Interpretation ───

	describe("Feature: Payload Interpretation", () => {
		it("should interpret valid payload", () => {
			registerSpec(registry, "say2.core.Session");
			const entries = [
				makeEntry({
					payload: { target: "say2.core.Session", payloadType: "relationship", specFile: "specs/a.md", specLine: 10 },
				}),
			];

			const report = validator.validate(entries, registry);

			expect(report.resolved).toHaveLength(1);
			expect(report.errors).toHaveLength(0);
		});

		it("should error on payload missing target field", () => {
			const entries = [makeEntry({ payload: { payloadType: "relationship" } })];

			const report = validator.validate(entries, registry);

			expect(report.errors).toHaveLength(1);
			expect(report.errors[0]!.code).toBe(IntegrationErrorCode.INVALID_PAYLOAD);
			expect(report.resolved).toHaveLength(0);
			expect(report.unresolved).toHaveLength(0);
		});

		it("should handle payload missing payloadType gracefully", () => {
			// Missing payloadType — implementation defaults to "unknown"
			// Target exists so it should resolve
			registerSpec(registry, "say2.core.Session");
			const entries = [makeEntry({ payload: { target: "say2.core.Session" } })];

			const report = validator.validate(entries, registry);

			expect(report.resolved).toHaveLength(1);
		});

		it("should error on empty payload", () => {
			const entries = [makeEntry({ payload: {} })];

			const report = validator.validate(entries, registry);

			expect(report.errors).toHaveLength(1);
			expect(report.errors[0]!.code).toBe(IntegrationErrorCode.INVALID_PAYLOAD);
		});
	});

	// ─── IV-500: Error Details ───

	describe("Feature: Error Details", () => {
		it("should include entityFqn and targetFqn in error", () => {
			const entries = [
				makeEntry({
					entityFqn: "say2.mcp.Manager",
					payload: { target: "say2.core.Missing", payloadType: "relationship" },
				}),
			];

			const report = validator.validate(entries, registry);

			expect(report.errors[0]!.entityFqn).toBe("say2.mcp.Manager");
			expect(report.errors[0]!.targetFqn).toBe("say2.core.Missing");
		});

		it("should include human-readable message", () => {
			const entries = [
				makeEntry({ payload: { target: "say2.core.Missing", payloadType: "relationship" } }),
			];

			const report = validator.validate(entries, registry);

			expect(report.errors[0]!.message).toBeTruthy();
			expect(report.errors[0]!.message).toContain("say2.core.Missing");
		});

		it("should include source location in UnresolvedEntry", () => {
			const entries = [
				makeEntry({
					payload: { target: "say2.core.Missing", payloadType: "relationship", specFile: "specs/transport.md", specLine: 42 },
				}),
			];

			const report = validator.validate(entries, registry);

			expect(report.unresolved[0]!.specFile).toBe("specs/transport.md");
			expect(report.unresolved[0]!.specLine).toBe(42);
		});
	});

	// ─── IV-600: Report Structure ───

	describe("Feature: Report Structure", () => {
		it("should have resolved + unresolved equal valid entries count", () => {
			registerSpec(registry, "a.A");
			registerSpec(registry, "b.B");
			registerSpec(registry, "c.C");
			const entries = [
				makeEntry({ payload: { target: "a.A", payloadType: "relationship" } }),
				makeEntry({ payload: { target: "b.B", payloadType: "method_return" } }),
				makeEntry({ payload: { target: "c.C", payloadType: "property_type" } }),
				makeEntry({ payload: { target: "d.D", payloadType: "relationship" } }),
				makeEntry({ payload: { target: "e.E", payloadType: "method_return" } }),
			];

			const report = validator.validate(entries, registry);

			expect(report.resolved).toHaveLength(3);
			expect(report.unresolved).toHaveLength(2);
			expect(report.resolved.length + report.unresolved.length).toBe(5);
		});

		it("should exclude invalid payloads from resolved/unresolved counts", () => {
			registerSpec(registry, "a.A");
			const entries = [
				makeEntry({ payload: { target: "a.A", payloadType: "relationship" } }),
				makeEntry({ payload: { target: "b.B", payloadType: "method_return" } }),
				makeEntry({ payload: {} }), // invalid
				makeEntry({ payload: { payloadType: "relationship" } }), // invalid — no target
			];

			const report = validator.validate(entries, registry);

			expect(report.resolved).toHaveLength(1);
			expect(report.unresolved).toHaveLength(1);
			expect(report.errors).toHaveLength(3); // 1 unresolved + 2 invalid
		});

		it("should return empty report for empty entries", () => {
			const report = validator.validate([], registry);

			expect(report.resolved).toHaveLength(0);
			expect(report.unresolved).toHaveLength(0);
			expect(report.errors).toHaveLength(0);
		});
	});

	// ─── IV-700: Edge Cases ───

	describe("Feature: Edge Cases", () => {
		it("should resolve same target in multiple entries", () => {
			registerSpec(registry, "say2.core.Session");
			const entries = [
				makeEntry({ entityFqn: "a.A", payload: { target: "say2.core.Session", payloadType: "relationship" } }),
				makeEntry({ entityFqn: "b.B", payload: { target: "say2.core.Session", payloadType: "method_return" } }),
				makeEntry({ entityFqn: "c.C", payload: { target: "say2.core.Session", payloadType: "property_type" } }),
			];

			const report = validator.validate(entries, registry);

			expect(report.resolved).toHaveLength(3);
			expect(report.errors).toHaveLength(0);
		});

		it("should leave same target unresolved in multiple entries", () => {
			const entries = [
				makeEntry({ entityFqn: "a.A", payload: { target: "say2.core.Session", payloadType: "relationship" } }),
				makeEntry({ entityFqn: "b.B", payload: { target: "say2.core.Session", payloadType: "method_return" } }),
				makeEntry({ entityFqn: "c.C", payload: { target: "say2.core.Session", payloadType: "property_type" } }),
			];

			const report = validator.validate(entries, registry);

			expect(report.unresolved).toHaveLength(3);
			expect(report.errors).toHaveLength(3);
		});

		it("should handle mix of payload types in one batch", () => {
			const entries = [
				makeEntry({ payload: { target: "a.A", payloadType: "method_return" } }),
				makeEntry({ payload: { target: "b.B", payloadType: "property_type" } }),
				makeEntry({ payload: { target: "c.C", payloadType: "relationship" } }),
				makeEntry({ payload: { target: "d.D", payloadType: "definition_check" } }),
			];

			const report = validator.validate(entries, registry);

			const codes = report.errors.map(e => e.code);
			expect(codes).toContain(IntegrationErrorCode.UNRESOLVED_TYPE);
			expect(codes).toContain(IntegrationErrorCode.UNRESOLVED_RELATIONSHIP);
			expect(codes).toContain(IntegrationErrorCode.MISSING_DEFINITION);
		});

		it("should ignore extra payload fields gracefully", () => {
			registerSpec(registry, "say2.core.Session");
			const entries = [
				makeEntry({
					payload: { target: "say2.core.Session", payloadType: "relationship", extra: "ignored", nested: { a: 1 } },
				}),
			];

			const report = validator.validate(entries, registry);

			expect(report.resolved).toHaveLength(1);
			expect(report.errors).toHaveLength(0);
		});
	});
});
