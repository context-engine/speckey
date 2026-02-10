/**
 * Severity level of a parse error.
 */
export enum ErrorSeverity {
	ERROR = "error",
	WARNING = "warning",
	INFO = "info",
}

/**
 * An error or warning encountered during extraction.
 */
export interface ParseError {
	/** Error/warning message */
	message: string;
	/** Line number (0 if file-level) */
	line: number;
	/** Severity level */
	severity: ErrorSeverity;
}

/**
 * A captured fenced code block from a markdown file.
 */
export interface CodeBlock {
	/** Language identifier from the fence (e.g., "mermaid", "typescript"); empty string if untagged */
	language: string;
	/** Raw content of the code block (without fence markers) */
	content: string;
	/** 1-indexed start line (opening fence line) */
	startLine: number;
	/** 1-indexed end line (closing fence line) */
	endLine: number;
}

/**
 * Code blocks indexed by language tag.
 * Each key is a language string, each value is the array of blocks with that language.
 */
export interface CodeBlocksByLanguage {
	[language: string]: CodeBlock[];
}

/**
 * A single row within a markdown table.
 */
export interface TableRow {
	/** Cell contents (inline formatting flattened to plain text) */
	cells: string[];
}

/**
 * A captured markdown table with rows and line positions.
 */
export interface TableNode {
	/** Table rows (including header row) */
	rows: TableRow[];
	/** 1-indexed start line */
	startLine: number;
	/** 1-indexed end line */
	endLine: number;
}

/**
 * Complete result from extracting structured content from a markdown file.
 */
export interface ExtractionResult {
	/** Code blocks indexed by language tag */
	codeBlocks: CodeBlocksByLanguage;
	/** Extracted tables */
	tables: TableNode[];
	/** Source file path */
	specFile: string;
	/** Extraction errors/warnings */
	errors: ParseError[];
}
