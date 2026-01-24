/**
 * Severity level of a parse error.
 */
export enum ErrorSeverity {
	ERROR = "error",
	WARNING = "warning",
	INFO = "info",
}

/**
 * Represents a single error encountered during parsing.
 */
export interface ParseError {
	message: string;
	line: number;
	severity: ErrorSeverity;
}

/**
 * A captured code block from a markdown file.
 */
export interface CodeBlock {
	/** Language identifier (e.g., "mermaid") */
	language: string;
	/** Raw content of the code block */
	content: string;
	/** 1-indexed start line of the block (including fence) */
	startLine: number;
	/** 1-indexed end line of the block (including fence) */
	endLine: number;
}

/**
 * A captured table from a markdown file.
 */
export interface TableNode {
	/** Rows extracted from the table */
	rows: TableRow[];
	/** 1-indexed start line of the table */
	startLine: number;
	/** 1-indexed end line of the table */
	endLine: number;
}

/**
 * A single row within a markdown table.
 */
export interface TableRow {
	/** Cells within the row, as text strings */
	cells: string[];
}

/**
 * Result of the markdown parsing operation.
 */
export interface ParseResult {
	/** Extracted mermaid code blocks */
	blocks: CodeBlock[];
	/** Extracted markdown tables */
	tables: TableNode[];
	/** Original source file path */
	sourceFile: string;
	/** Errors encountered during parsing */
	errors: ParseError[];
}
