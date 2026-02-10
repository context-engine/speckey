import { describe, expect, it } from "bun:test";
import { DiagramRouter } from "../../src/mermaid-validation/router";
import { DiagramType } from "../../src/mermaid-validation/types";
import type { ValidatedMermaidBlock } from "../../src/mermaid-validation/types";

// ── Test Helpers ──────────────────────────────────────────────────────────────

function makeValidatedBlock(
	diagramType: DiagramType,
	content = "classDiagram\n  class Foo",
	startLine = 1,
	endLine = 5,
): ValidatedMermaidBlock {
	return { content, diagramType, startLine, endLine, specFile: "test.md" };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DiagramRouter", () => {
	const router = new DiagramRouter();

	describe("routeByDiagramType", () => {
		it("should route blocks by diagram type", () => {
			const blocks = [
				makeValidatedBlock(DiagramType.CLASS_DIAGRAM, "classDiagram\n  class Foo", 1, 3),
				makeValidatedBlock(DiagramType.CLASS_DIAGRAM, "classDiagram\n  class Bar", 5, 7),
				makeValidatedBlock(DiagramType.ER_DIAGRAM, "erDiagram\n  USER ||--o{ ORDER : places", 9, 12),
			];
			const routed = router.routeByDiagramType(blocks);

			expect(routed.classDiagrams).toHaveLength(2);
			expect(routed.erDiagrams).toHaveLength(1);
			expect(routed.sequenceDiagrams).toHaveLength(0);
			expect(routed.flowcharts).toHaveLength(0);
			expect(routed.stateDiagrams).toHaveLength(0);
			expect(routed.unknown).toHaveLength(0);
		});

		it("should route single diagram type to single array", () => {
			const blocks = [
				makeValidatedBlock(DiagramType.CLASS_DIAGRAM, "classDiagram\n  class A", 1, 3),
				makeValidatedBlock(DiagramType.CLASS_DIAGRAM, "classDiagram\n  class B", 5, 7),
				makeValidatedBlock(DiagramType.CLASS_DIAGRAM, "classDiagram\n  class C", 9, 11),
			];
			const routed = router.routeByDiagramType(blocks);

			expect(routed.classDiagrams).toHaveLength(3);
			expect(routed.sequenceDiagrams).toHaveLength(0);
			expect(routed.erDiagrams).toHaveLength(0);
			expect(routed.flowcharts).toHaveLength(0);
			expect(routed.stateDiagrams).toHaveLength(0);
			expect(routed.unknown).toHaveLength(0);
		});

		it("should route all known diagram types to correct arrays", () => {
			const blocks = [
				makeValidatedBlock(DiagramType.CLASS_DIAGRAM),
				makeValidatedBlock(DiagramType.SEQUENCE_DIAGRAM),
				makeValidatedBlock(DiagramType.ER_DIAGRAM),
				makeValidatedBlock(DiagramType.FLOWCHART),
				makeValidatedBlock(DiagramType.STATE_DIAGRAM),
			];
			const routed = router.routeByDiagramType(blocks);

			expect(routed.classDiagrams).toHaveLength(1);
			expect(routed.sequenceDiagrams).toHaveLength(1);
			expect(routed.erDiagrams).toHaveLength(1);
			expect(routed.flowcharts).toHaveLength(1);
			expect(routed.stateDiagrams).toHaveLength(1);
			expect(routed.unknown).toHaveLength(0);
		});

		it("should route UNKNOWN diagram type to unknown array", () => {
			const blocks = [
				makeValidatedBlock(DiagramType.UNKNOWN, "some unrecognized content"),
			];
			const routed = router.routeByDiagramType(blocks);

			expect(routed.unknown).toHaveLength(1);
			expect(routed.classDiagrams).toHaveLength(0);
			expect(routed.sequenceDiagrams).toHaveLength(0);
			expect(routed.erDiagrams).toHaveLength(0);
			expect(routed.flowcharts).toHaveLength(0);
			expect(routed.stateDiagrams).toHaveLength(0);
		});

		it("should produce empty RoutedDiagrams for empty input", () => {
			const routed = router.routeByDiagramType([]);

			expect(routed.classDiagrams).toHaveLength(0);
			expect(routed.sequenceDiagrams).toHaveLength(0);
			expect(routed.erDiagrams).toHaveLength(0);
			expect(routed.flowcharts).toHaveLength(0);
			expect(routed.stateDiagrams).toHaveLength(0);
			expect(routed.unknown).toHaveLength(0);
		});
	});
});
