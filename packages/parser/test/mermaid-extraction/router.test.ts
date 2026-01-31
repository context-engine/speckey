import { describe, expect, it } from "bun:test";
import { DiagramRouter } from "../../src/mermaid-extraction/router";
import { DiagramType } from "../../src/mermaid-extraction/types";

describe("DiagramRouter", () => {
    const router = new DiagramRouter();

    describe("detectDiagramType", () => {
        it("should detect classDiagram", () => {
            const content = `classDiagram
				class Foo {
					+bar()
				}
			`;
            expect(router.detectDiagramType(content)).toBe(DiagramType.CLASS_DIAGRAM);
        });

        it("should detect sequenceDiagram", () => {
            const content = `sequenceDiagram
				Alice->>Bob: Hello
				Bob-->>Alice: Hi
			`;
            expect(router.detectDiagramType(content)).toBe(
                DiagramType.SEQUENCE_DIAGRAM,
            );
        });

        it("should detect erDiagram", () => {
            const content = `erDiagram
				USER ||--o{ ORDER : places
				ORDER ||--|{ LINE-ITEM : contains
			`;
            expect(router.detectDiagramType(content)).toBe(DiagramType.ER_DIAGRAM);
        });

        it("should detect flowchart", () => {
            const content = `flowchart LR
				A --> B --> C
			`;
            expect(router.detectDiagramType(content)).toBe(DiagramType.FLOWCHART);
        });

        it("should detect flowchart (graph alias)", () => {
            const content = `graph TD
				A --> B
			`;
            expect(router.detectDiagramType(content)).toBe(DiagramType.FLOWCHART);
        });

        it("should detect stateDiagram", () => {
            const content = `stateDiagram-v2
				[*] --> Active
				Active --> [*]
			`;
            expect(router.detectDiagramType(content)).toBe(
                DiagramType.STATE_DIAGRAM,
            );
        });

        it("should detect gantt", () => {
            const content = `gantt
				title A Gantt Diagram
				section Section
				A task: a1, 2024-01-01, 30d
			`;
            expect(router.detectDiagramType(content)).toBe(DiagramType.GANTT);
        });

        it("should detect pie chart", () => {
            const content = `pie title Pets adopted by volunteers
				"Dogs" : 386
				"Cats" : 85
			`;
            expect(router.detectDiagramType(content)).toBe(DiagramType.PIE);
        });

        it("should detect mindmap", () => {
            const content = `mindmap
  root((mindmap))
    Origins
      Long history
    Research
      On effectiveness
			`;
            expect(router.detectDiagramType(content)).toBe(DiagramType.MINDMAP);
        });

        it("should return UNKNOWN for invalid mermaid", () => {
            const content = `this is not valid mermaid
				just some random text
			`;
            expect(router.detectDiagramType(content)).toBe(DiagramType.UNKNOWN);
        });

        it("should handle diagrams with init directives", () => {
            const content = `%%{init: {'theme': 'dark'}}%%
classDiagram
	class Foo
			`;
            expect(router.detectDiagramType(content)).toBe(DiagramType.CLASS_DIAGRAM);
        });

        it("should handle diagrams with comments", () => {
            const content = `%% This is a comment
classDiagram
	%% Another comment
	class Bar
			`;
            expect(router.detectDiagramType(content)).toBe(DiagramType.CLASS_DIAGRAM);
        });
    });

    describe("routeBlocks", () => {
        it("should route blocks with correct diagram types", () => {
            const blocks = [
                {
                    language: "mermaid",
                    content: "classDiagram\n  class Foo",
                    startLine: 5,
                    endLine: 10,
                },
                {
                    language: "mermaid",
                    content: "sequenceDiagram\n  A->>B: Hi",
                    startLine: 15,
                    endLine: 20,
                },
            ];

            const routed = router.routeBlocks(blocks);

            expect(routed).toHaveLength(2);
            expect(routed[0]?.diagramType).toBe(DiagramType.CLASS_DIAGRAM);
            expect(routed[1]?.diagramType).toBe(DiagramType.SEQUENCE_DIAGRAM);
            expect(routed[0]?.isSupported).toBe(true);
            expect(routed[1]?.isSupported).toBe(true);
        });

        it("should preserve original block reference", () => {
            const blocks = [
                {
                    language: "mermaid",
                    content: "erDiagram\n  USER ||--o{ ORDER : places",
                    startLine: 1,
                    endLine: 5,
                },
            ];

            const routed = router.routeBlocks(blocks);

            expect(routed[0]?.block).toBe(blocks[0]);
            expect(routed[0]?.block.startLine).toBe(1);
            expect(routed[0]?.block.endLine).toBe(5);
        });

        it("should handle empty blocks array", () => {
            const routed = router.routeBlocks([]);
            expect(routed).toHaveLength(0);
        });

        it("should mark invalid mermaid as UNKNOWN and unsupported (skipped for parsing)", () => {
            const blocks = [
                {
                    language: "mermaid",
                    content: "not valid mermaid syntax",
                    startLine: 1,
                    endLine: 2,
                },
            ];

            const routed = router.routeBlocks(blocks);

            expect(routed).toHaveLength(1);
            expect(routed[0]?.diagramType).toBe(DiagramType.UNKNOWN);
            expect(routed[0]?.isSupported).toBe(false); // UNKNOWN blocks are skipped
        });
    });
});
