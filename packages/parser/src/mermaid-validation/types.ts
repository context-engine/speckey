import { ErrorSeverity } from "../markdown-extraction/types";
import type { CodeBlock } from "../markdown-extraction/types";

export { ErrorSeverity };
export type { CodeBlock };

/**
 * Type of mermaid diagram detected by mermaid.parse().
 */
export enum DiagramType {
	CLASS_DIAGRAM = "classDiagram",
	SEQUENCE_DIAGRAM = "sequenceDiagram",
	ER_DIAGRAM = "erDiagram",
	FLOWCHART = "flowchart",
	STATE_DIAGRAM = "stateDiagram",
	UNKNOWN = "unknown",
}

/**
 * A mermaid code block that passed syntax validation via mermaid.parse(),
 * with its detected diagram type.
 */
export interface ValidatedMermaidBlock {
	/** Mermaid diagram source code (without fence markers) */
	content: string;
	/** Detected diagram type from mermaid.parse() */
	diagramType: DiagramType;
	/** 1-indexed start line in source file (from upstream CodeBlock) */
	startLine: number;
	/** 1-indexed end line in source file (from upstream CodeBlock) */
	endLine: number;
	/** Source file path for error reporting */
	specFile: string;
}

/**
 * Error details from a mermaid block that failed syntax validation.
 */
export interface ValidationError {
	/** Error details from mermaid.parse() */
	message: string;
	/** Line number in source file (block startLine + error offset) */
	line: number;
	/** ERROR for syntax failures, WARNING for empty/unknown */
	severity: ErrorSeverity;
}

/**
 * Summary counts for the validation result.
 */
export interface ValidationSummary {
	/** Total mermaid blocks processed */
	total: number;
	/** Blocks that passed validation */
	valid: number;
	/** Blocks that failed validation */
	rejected: number;
	/** Count of valid blocks per diagram type */
	byType: Record<DiagramType, number>;
}

/**
 * Complete result from validating all mermaid blocks in a file.
 */
export interface ValidationResult {
	/** Blocks that passed syntax validation */
	validatedBlocks: ValidatedMermaidBlock[];
	/** Errors from rejected blocks */
	errors: ValidationError[];
	/** Source file path */
	specFile: string;
	/** Counts: total, valid, rejected, by type */
	summary: ValidationSummary;
}

/**
 * Validated blocks grouped by diagram type for downstream routing.
 */
export interface RoutedDiagrams {
	/** CLASS_DIAGRAM blocks */
	classDiagrams: ValidatedMermaidBlock[];
	/** SEQUENCE_DIAGRAM blocks */
	sequenceDiagrams: ValidatedMermaidBlock[];
	/** ER_DIAGRAM blocks */
	erDiagrams: ValidatedMermaidBlock[];
	/** FLOWCHART blocks */
	flowcharts: ValidatedMermaidBlock[];
	/** STATE_DIAGRAM blocks */
	stateDiagrams: ValidatedMermaidBlock[];
	/** Unrecognized types */
	unknown: ValidatedMermaidBlock[];
}
