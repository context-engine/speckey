import type { Code, TableRow as MdTableRow, Root, Table } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import {
	type CodeBlock,
	ErrorSeverity,
	type ParseResult,
	type TableNode,
	type TableRow,
} from "./types";

/**
 * MarkdownParser extracts Mermaid code blocks and tables from markdown content.
 */
export class MarkdownParser {
	/**
	 * Parses markdown content and extracts structured data.
	 *
	 * @param content - The markdown raw text.
	 * @param sourceFile - Path to the file being parsed.
	 * @returns A ParseResult containing extracted blocks and tables.
	 */
	parse(content: string, sourceFile: string): ParseResult {
		try {
			const ast = this.buildAST(content);
			const blocks = this.extractCodeBlocks(ast);
			const tables = this.extractTables(ast);

			return {
				blocks,
				tables,
				sourceFile,
				errors: [],
			};
		} catch (error) {
			return {
				blocks: [],
				tables: [],
				sourceFile,
				errors: [
					{
						message:
							error instanceof Error ? error.message : "Unknown parsing error",
						line: 1,
						severity: ErrorSeverity.ERROR,
					},
				],
			};
		}
	}

	/**
	 * Builds a MDAST (Markdown Abstract Syntax Tree) from content.
	 */
	private buildAST(content: string): Root {
		return unified().use(remarkParse).use(remarkGfm).parse(content) as Root;
	}

	/**
	 * Traverses the AST to find mermaid code blocks.
	 */
	private extractCodeBlocks(ast: Root): CodeBlock[] {
		const blocks: CodeBlock[] = [];

		visit(ast, "code", (node: Code) => {
			if (node.lang === "mermaid") {
				blocks.push({
					language: "mermaid",
					content: node.value,
					startLine: node.position?.start.line ?? 0,
					endLine: node.position?.end.line ?? 0,
				});
			}
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
				cells: row.children.map((cell) => {
					// Recursively extract text from children of the cell (bold, etc)
					return this.extractTextFromNode(cell);
				}),
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
	 * Helper to extract plain text from markdown nodes recursively.
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
