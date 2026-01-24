import { describe, expect, it } from "bun:test";
import { MarkdownParser } from "../../src/mermaid-extraction/parser";

describe("MarkdownParser", () => {
	const parser = new MarkdownParser();

	it("should extract a single mermaid block with correct line numbers", () => {
		const markdown = `
# Title

\`\`\`mermaid
classDiagram
  class Foo
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.blocks).toHaveLength(1);
		expect(result.blocks[0]?.language).toBe("mermaid");
		expect(result.blocks[0]?.content).toContain("classDiagram");
		expect(result.blocks[0]?.startLine).toBe(4);
		expect(result.blocks[0]?.endLine).toBe(7);
	});

	it("should extract multiple mermaid blocks", () => {
		const markdown = `
\`\`\`mermaid
graph TD;
    A-->B;
\`\`\`

Some middle text.

\`\`\`mermaid
classDiagram
    Foo <|-- Bar
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.blocks).toHaveLength(2);
		expect(result.blocks[0]?.content).toContain("A-->B");
		expect(result.blocks[1]?.content).toContain("Bar");
		expect(result.blocks[0]?.startLine).toBe(2);
		expect(result.blocks[1]?.startLine).toBe(9);
	});

	it("should skip non-mermaid code blocks", () => {
		const markdown = `
\`\`\`typescript
const x = 1;
\`\`\`

\`\`\`mermaid
classDiagram
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.blocks).toHaveLength(1);
		expect(result.blocks[0]?.content).toContain("classDiagram");
	});

	it("should extract tables from markdown", () => {
		const markdown = `
| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
| **Cell 3** | Cell 4 |
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.tables).toHaveLength(1);
		expect(result.tables[0]?.rows).toHaveLength(3); // Header row + 2 data rows

		expect(result.tables[0]?.rows[0]?.cells).toEqual(["Header 1", "Header 2"]);
		expect(result.tables[0]?.rows[1]?.cells).toEqual(["Cell 1", "Cell 2"]);
		expect(result.tables[0]?.rows[2]?.cells).toEqual(["Cell 3", "Cell 4"]); // Bold should be flattened to text
	});

	it("should handle empty markdown", () => {
		const result = parser.parse("", "empty.md");
		expect(result.blocks).toHaveLength(0);
		expect(result.tables).toHaveLength(0);
		expect(result.errors).toHaveLength(0);
	});

	it("should handle markdown with no mermaid blocks", () => {
		const markdown = "# Just text\nNo code here.";
		const result = parser.parse(markdown, "test.md");
		expect(result.blocks).toHaveLength(0);
	});

	it("should handle tables with inline formatting (bold, italic, code)", () => {
		const markdown = `
| Name | Type | Description |
|------|------|-------------|
| \`foo\` | **string** | *A description* |
| _bar_ | number | **Bold** and *italic* |
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.tables).toHaveLength(1);
		expect(result.tables[0]?.rows[1]?.cells).toEqual([
			"foo",
			"string",
			"A description",
		]);
		expect(result.tables[0]?.rows[2]?.cells).toEqual([
			"bar",
			"number",
			"Bold and italic",
		]);
	});

	it("should handle mixed content with tables and mermaid blocks", () => {
		const markdown = `
# Architecture

| Component | Purpose |
|-----------|---------|
| Parser    | Parse markdown |

\`\`\`mermaid
classDiagram
  class Parser
\`\`\`

| Method | Return |
|--------|--------|
| parse  | Result |
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.blocks).toHaveLength(1);
		expect(result.tables).toHaveLength(2);
	});

	it("should handle table with empty cells", () => {
		const markdown = `
| A | B | C |
|---|---|---|
|   | x |   |
| y |   | z |
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.tables).toHaveLength(1);
		expect(result.tables[0]?.rows[1]?.cells).toEqual(["", "x", ""]);
		expect(result.tables[0]?.rows[2]?.cells).toEqual(["y", "", "z"]);
	});
});
