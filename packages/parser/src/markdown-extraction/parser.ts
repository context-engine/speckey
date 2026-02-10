import type { AppLogObj, Logger } from "@speckey/logger";
import type { Code, TableRow as MdTableRow, Root, Table } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import {
	type CodeBlock,
	type CodeBlocksByLanguage,
	ErrorSeverity,
	type ExtractionResult,
	type ParseError,
	type TableNode,
	type TableRow,
} from "./types";

/**
 * MarkdownParser extracts code blocks and tables from markdown content.
 * Language-agnostic — extracts ALL fenced code blocks regardless of language tag,
 * groups them by language, and extracts GFM tables.
 */
export class MarkdownParser {
	/**
	 * Parses markdown content and extracts structured data.
	 *
	 * @param content - The markdown raw text.
	 * @param specFile - Path to the file being parsed.
	 * @param logger - Optional logger (passed from pipeline).
	 * @returns An ExtractionResult containing code blocks grouped by language and tables.
	 */
	parse(
		content: string,
		specFile: string,
		logger?: Logger<AppLogObj>,
	): ExtractionResult {
		const ast = this.buildAST(content);
		const blocks = this.extractCodeBlocks(ast);
		const tables = this.extractTables(ast);
		const codeBlocks = this.groupByLanguage(blocks);

		const errors: ParseError[] = [];

		if (blocks.length === 0) {
			const message = "No fenced code blocks found in file";
			logger?.warn(message, { file: specFile });
			errors.push({ message, line: 0, severity: ErrorSeverity.WARNING });
		} else {
			logger?.debug("Extracted code blocks", {
				count: blocks.length,
				file: specFile,
			});
		}

		if (tables.length > 0) {
			logger?.debug("Extracted tables", {
				count: tables.length,
				file: specFile,
			});
		}

		return { codeBlocks, tables, specFile, errors };
	}

	/**
	 * Builds a MDAST (Markdown Abstract Syntax Tree) from content.
	 */
	private buildAST(content: string): Root {
		return unified().use(remarkParse).use(remarkGfm).parse(content) as Root;
	}

	/**
	 * Traverses the AST to find ALL fenced code blocks regardless of language.
	 */
	private extractCodeBlocks(ast: Root): CodeBlock[] {
		const blocks: CodeBlock[] = [];

		visit(ast, "code", (node: Code) => {
			blocks.push({
				language: node.lang ?? "",
				content: node.value,
				startLine: node.position?.start.line ?? 0,
				endLine: node.position?.end.line ?? 0,
			});
		});

		return blocks;
	}

	/**
	 * Traverses the AST to find markdown tables.
	 */
	private extractTables(ast: Root): TableNode[] {
		const tables: TableNode[] = [];

		visit(ast, "table", (node: Table) => {
			const rows: TableRow[] = node.children.map((row: MdTableRow) => ({
				cells: row.children.map((cell) => this.extractTextFromNode(cell)),
			}));

			tables.push({
				rows,
				startLine: node.position?.start.line ?? 0,
				endLine: node.position?.end.line ?? 0,
			});
		});

		return tables;
	}

	/**
	 * Groups code blocks into a language-keyed index.
	 */
	private groupByLanguage(blocks: CodeBlock[]): CodeBlocksByLanguage {
		const grouped: CodeBlocksByLanguage = {};
		for (const block of blocks) {
			if (!grouped[block.language]) {
				grouped[block.language] = [];
			}
			grouped[block?.language]?.push(block);
		}
		return grouped;
	}

	/**
	 * Recursively extracts plain text from markdown AST nodes,
	 * stripping inline formatting (bold, italic, code spans).
	 */
	private extractTextFromNode(node: {
		value?: string;
		children?: unknown[];
	}): string {
		if (typeof node.value === "string") return node.value;
		if (Array.isArray(node.children)) {
			return node.children
				.map((child) =>
					this.extractTextFromNode(
						child as { value?: string; children?: unknown[] },
					),
				)
				.join("");
		}
		return "";
	}
}
