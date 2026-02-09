import type { Code, TableRow as MdTableRow, Root, Table } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import type { Logger, AppLogObj } from "@speckey/logger";
import { DiagramRouter } from "./router";
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
	private router = new DiagramRouter();

	/**
	 * Parses markdown content and extracts structured data.
	 *
	 * @param content - The markdown raw text.
	 * @param specFile - Path to the file being parsed.
	 * @param logger - Optional logger (passed from pipeline).
	 * @returns A ParseResult containing extracted blocks and tables.
	 */
	parse(content: string, specFile: string, logger?: Logger<AppLogObj>): ParseResult {
		try {
			const ast = this.buildAST(content);
			const blocks = this.extractCodeBlocks(ast);
			const totalCodeBlocks = this.countCodeBlocks(ast);
			const routedBlocks = this.router.routeBlocks(blocks);
			const tables = this.extractTables(ast);

			logger?.debug("Extracted code blocks", { mermaid: blocks.length, total: totalCodeBlocks, file: specFile });
			logger?.debug("Extracted tables", { count: tables.length, file: specFile });

			const errors = [];

			// Emit distinct warnings when no mermaid blocks found
			if (blocks.length === 0) {
				const message = totalCodeBlocks > 0
					? "File has code blocks but none are mermaid"
					: "No mermaid diagrams found in file";
				logger?.warn(message, { total: totalCodeBlocks, file: specFile });
				errors.push({
					message,
					line: 1,
					severity: ErrorSeverity.WARNING,
				});
			}

			// Emit warnings for empty mermaid blocks
			for (const routed of routedBlocks) {
				if (routed.block.content.trim().length === 0) {
					const message = `Empty mermaid block at line ${routed.block.startLine}`;
					logger?.warn(message, { line: routed.block.startLine, file: specFile });
					errors.push({
						message,
						line: routed.block.startLine,
						severity: ErrorSeverity.WARNING,
					});
				}
			}

			return {
				blocks,
				routedBlocks,
				tables,
				specFile,
				errors,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown parsing error";
			logger?.error("Parse failed", { file: specFile, error: message });
			return {
				blocks: [],
				routedBlocks: [],
				tables: [],
				specFile,
				errors: [
					{
						message,
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
	 * Counts all code blocks in the AST (mermaid and non-mermaid).
	 */
	private countCodeBlocks(ast: Root): number {
		let count = 0;
		visit(ast, "code", () => { count++; });
		return count;
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
