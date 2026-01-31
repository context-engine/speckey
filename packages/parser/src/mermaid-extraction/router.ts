import mermaid from "mermaid";
import { type CodeBlock, DiagramType, type RoutedBlock } from "./types";

// Initialize mermaid once at module load to register diagram detectors
mermaid.initialize({ startOnLoad: false });

/**
 * DiagramRouter detects diagram types using the official mermaid library
 * and creates RoutedBlocks for downstream processing.
 */
export class DiagramRouter {
    /**
     * Routes code blocks by detecting their diagram types.
     *
     * @param blocks - Array of mermaid code blocks
     * @returns Array of routed blocks with diagram types
     */
    routeBlocks(blocks: CodeBlock[]): RoutedBlock[] {
        return blocks.map((block) => {
            const diagramType = this.detectDiagramType(block.content);
            return {
                block,
                diagramType,
                // UNKNOWN blocks are not supported for downstream parsing
                isSupported: diagramType !== DiagramType.UNKNOWN,
            };
        });
    }

    /**
     * Detects the diagram type using the official mermaid library.
     *
     * @param content - Raw mermaid diagram content
     * @returns The detected DiagramType or UNKNOWN on failure
     */
    detectDiagramType(content: string): DiagramType {
        try {
            const mermaidType = mermaid.detectType(content);
            return this.mapDiagramType(mermaidType);
        } catch {
            return DiagramType.UNKNOWN;
        }
    }

    /**
     * Maps mermaid's internal type names to our DiagramType enum.
     */
    private mapDiagramType(mermaidType: string): DiagramType {
        const typeMap: Record<string, DiagramType> = {
            // Class diagram
            class: DiagramType.CLASS_DIAGRAM,
            classDiagram: DiagramType.CLASS_DIAGRAM,

            // Sequence diagram
            sequence: DiagramType.SEQUENCE_DIAGRAM,
            sequenceDiagram: DiagramType.SEQUENCE_DIAGRAM,

            // ER diagram
            er: DiagramType.ER_DIAGRAM,
            erDiagram: DiagramType.ER_DIAGRAM,

            // Flowchart (multiple versions)
            flowchart: DiagramType.FLOWCHART,
            "flowchart-v2": DiagramType.FLOWCHART,
            graph: DiagramType.FLOWCHART,

            // State diagram
            stateDiagram: DiagramType.STATE_DIAGRAM,
            "stateDiagram-v2": DiagramType.STATE_DIAGRAM,

            // Other diagrams
            gantt: DiagramType.GANTT,
            pie: DiagramType.PIE,
            mindmap: DiagramType.MINDMAP,
        };

        return typeMap[mermaidType] || DiagramType.UNKNOWN;
    }
}
