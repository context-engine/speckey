import { DiagramType } from "./types";
import type { ValidatedMermaidBlock, RoutedDiagrams } from "./types";

/**
 * Routes validated mermaid blocks to diagram-specific parsers by detected diagram type.
 */
export class DiagramRouter {
	/**
	 * Group validated blocks by diagram type for downstream routing.
	 */
	routeByDiagramType(blocks: ValidatedMermaidBlock[]): RoutedDiagrams {
		const routed: RoutedDiagrams = {
			classDiagrams: [],
			sequenceDiagrams: [],
			erDiagrams: [],
			flowcharts: [],
			stateDiagrams: [],
			unknown: [],
		};

		for (const block of blocks) {
			switch (block.diagramType) {
				case DiagramType.CLASS_DIAGRAM:
					routed.classDiagrams.push(block);
					break;
				case DiagramType.SEQUENCE_DIAGRAM:
					routed.sequenceDiagrams.push(block);
					break;
				case DiagramType.ER_DIAGRAM:
					routed.erDiagrams.push(block);
					break;
				case DiagramType.FLOWCHART:
					routed.flowcharts.push(block);
					break;
				case DiagramType.STATE_DIAGRAM:
					routed.stateDiagrams.push(block);
					break;
				default:
					routed.unknown.push(block);
					break;
			}
		}

		return routed;
	}
}
