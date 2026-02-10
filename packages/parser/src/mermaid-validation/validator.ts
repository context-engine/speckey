import { JSDOM } from "jsdom";
import type { Logger, AppLogObj } from "@speckey/logger";
import type { CodeBlock } from "../markdown-extraction/types";
import { ErrorSeverity } from "../markdown-extraction/types";
import { DiagramType } from "./types";
import type {
	ValidatedMermaidBlock,
	ValidationError,
	ValidationResult,
	ValidationSummary,
} from "./types";

let mermaidInitialized = false;

async function ensureMermaidInitialized(): Promise<typeof import("mermaid").default> {
	if (!mermaidInitialized) {
		const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
		globalThis.window = dom.window as unknown as Window & typeof globalThis;
		globalThis.document = dom.window.document;
		globalThis.DOMParser = dom.window.DOMParser;
		globalThis.HTMLElement = dom.window.HTMLElement as unknown as typeof HTMLElement;
		globalThis.SVGElement = dom.window.SVGElement as unknown as typeof SVGElement;
		globalThis.navigator = dom.window.navigator as unknown as Navigator;
		mermaidInitialized = true;
	}
	const mermaid = (await import("mermaid")).default;
	mermaid.initialize({ startOnLoad: false });
	return mermaid;
}

const TYPE_MAP: Record<string, DiagramType> = {
	class: DiagramType.CLASS_DIAGRAM,
	classDiagram: DiagramType.CLASS_DIAGRAM,
	sequence: DiagramType.SEQUENCE_DIAGRAM,
	sequenceDiagram: DiagramType.SEQUENCE_DIAGRAM,
	er: DiagramType.ER_DIAGRAM,
	erDiagram: DiagramType.ER_DIAGRAM,
	flowchart: DiagramType.FLOWCHART,
	"flowchart-v2": DiagramType.FLOWCHART,
	graph: DiagramType.FLOWCHART,
	stateDiagram: DiagramType.STATE_DIAGRAM,
	"stateDiagram-v2": DiagramType.STATE_DIAGRAM,
};

function mapDiagramType(mermaidType: string): DiagramType {
	return TYPE_MAP[mermaidType] || DiagramType.UNKNOWN;
}

function buildSummary(
	total: number,
	validatedBlocks: ValidatedMermaidBlock[],
	rejected: number,
): ValidationSummary {
	const byType = Object.fromEntries(
		Object.values(DiagramType).map((t) => [t, 0]),
	) as Record<DiagramType, number>;

	for (const block of validatedBlocks) {
		byType[block.diagramType]++;
	}

	return { total, valid: validatedBlocks.length, rejected, byType };
}

/**
 * Validates mermaid syntax using mermaid.parse() and detects diagram type for each block.
 */
export class MermaidValidator {
	/**
	 * Validate all mermaid blocks, return validated + errors.
	 */
	async validateAll(
		blocks: CodeBlock[],
		specFile: string,
		logger?: Logger<AppLogObj>,
	): Promise<ValidationResult> {
		const mermaid = await ensureMermaidInitialized();

		const validatedBlocks: ValidatedMermaidBlock[] = [];
		const errors: ValidationError[] = [];

		for (const block of blocks) {
			// Empty / whitespace check before calling mermaid.parse()
			if (block.content.trim().length === 0) {
				const message = `Empty mermaid block at line ${block.startLine}`;
				logger?.warn(message, { file: specFile, line: block.startLine });
				errors.push({
					message,
					line: block.startLine,
					severity: ErrorSeverity.WARNING,
				});
				continue;
			}

			try {
				const result = await mermaid.parse(block.content);
				if (result && typeof result === "object" && "diagramType" in result) {
					const diagramType = mapDiagramType(result.diagramType as string);
					logger?.debug("Block validated", {
						type: diagramType,
						line: block.startLine,
						file: specFile,
					});
					validatedBlocks.push({
						content: block.content,
						diagramType,
						startLine: block.startLine,
						endLine: block.endLine,
						specFile,
					});
				}
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Mermaid syntax error";
				logger?.error("Mermaid syntax error", {
					file: specFile,
					line: block.startLine,
					error: message,
				});
				errors.push({
					message,
					line: block.startLine,
					severity: ErrorSeverity.ERROR,
				});
			}
		}

		const summary = buildSummary(blocks.length, validatedBlocks, errors.length);

		return { validatedBlocks, errors, specFile, summary };
	}
}
