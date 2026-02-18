import { describe, expect, it } from "bun:test";
import { PipelineEventBus } from "@speckey/event-bus";
import type { BusPayload, LogPayload } from "@speckey/event-bus";
import { LogLevel, ParserEvent, PipelinePhase } from "@speckey/constants";
import { MarkdownParser } from "../../src/markdown-extraction/parser";
import { ErrorSeverity } from "../../src/markdown-extraction/types";

// ── Feature: Code Block Extraction ───────────────────────────────────────────

describe("Feature: Code Block Extraction", () => {
	const parser = new MarkdownParser();

	it("should extract single fenced code block", () => {
		const markdown = `
# Title

\`\`\`mermaid
classDiagram
  class Foo
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.codeBlocks.mermaid).toHaveLength(1);
		expect(result.codeBlocks.mermaid[0]?.content).toContain("classDiagram");
		expect(result.codeBlocks.mermaid[0]?.content).not.toContain("```");
	});

	it("should extract multiple code blocks with different languages", () => {
		const markdown = `
\`\`\`mermaid
classDiagram
  class Foo
\`\`\`

\`\`\`typescript
const x = 1;
\`\`\`

\`\`\`python
print("hello")
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		const keys = Object.keys(result.codeBlocks);
		expect(keys).toHaveLength(3);
		expect(result.codeBlocks.mermaid).toBeDefined();
		expect(result.codeBlocks.typescript).toBeDefined();
		expect(result.codeBlocks.python).toBeDefined();
	});

	it("should extract code block with no language tag", () => {
		const markdown = `
\`\`\`
some untagged content
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.codeBlocks[""]).toHaveLength(1);
		expect(result.codeBlocks[""][0]?.content).toBe("some untagged content");
	});

	it("should handle nested code blocks via AST parsing", () => {
		const markdown = `
\`\`\`mermaid
classDiagram
  class Foo {
    +bar()
  }
  note for Foo "Contains \\\`backticks\\\` inside"
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.codeBlocks.mermaid).toHaveLength(1);
		expect(result.codeBlocks.mermaid[0]?.content).toContain("classDiagram");
	});

	it("should extract code block content without fence markers", () => {
		const markdown = `
\`\`\`mermaid
classDiagram
  class Foo
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		const block = result.codeBlocks.mermaid[0];
		expect(block?.content).toBe("classDiagram\n  class Foo");
		expect(block?.content).not.toContain("```mermaid");
		expect(block?.content).not.toContain("```");
	});
});

// ── Feature: Language Grouping ───────────────────────────────────────────────

describe("Feature: Language Grouping", () => {
	const parser = new MarkdownParser();

	it("should group code blocks by language into keyed index", () => {
		const markdown = `
\`\`\`mermaid
classDiagram
  class Foo
\`\`\`

\`\`\`typescript
const x = 1;
\`\`\`

\`\`\`mermaid
erDiagram
  USER ||--o{ ORDER : places
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.codeBlocks.mermaid).toHaveLength(2);
		expect(result.codeBlocks.typescript).toHaveLength(1);
	});

	it("should group multiple blocks with same language together", () => {
		const markdown = `
\`\`\`mermaid
classDiagram
  class Foo
\`\`\`

\`\`\`mermaid
sequenceDiagram
  A->>B: Hi
\`\`\`

\`\`\`mermaid
erDiagram
  USER ||--o{ ORDER : places
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.codeBlocks.mermaid).toHaveLength(3);
		// Blocks should be ordered by appearance
		expect(result.codeBlocks.mermaid[0]?.content).toContain("classDiagram");
		expect(result.codeBlocks.mermaid[1]?.content).toContain("sequenceDiagram");
		expect(result.codeBlocks.mermaid[2]?.content).toContain("erDiagram");
	});

	it("should create single-key index for single language", () => {
		const markdown = `
\`\`\`typescript
const x = 1;
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		const keys = Object.keys(result.codeBlocks);
		expect(keys).toHaveLength(1);
		expect(keys[0]).toBe("typescript");
	});

	it("should group untagged blocks under empty key", () => {
		const markdown = `
\`\`\`
first block
\`\`\`

\`\`\`
second block
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.codeBlocks[""]).toHaveLength(2);
	});

	it("should produce correct grouping for mixed languages", () => {
		const markdown = `
\`\`\`mermaid
classDiagram
\`\`\`

\`\`\`typescript
const x = 1;
\`\`\`

\`\`\`go
func main() {}
\`\`\`

\`\`\`mermaid
erDiagram
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.codeBlocks.mermaid).toHaveLength(2);
		expect(result.codeBlocks.typescript).toHaveLength(1);
		expect(result.codeBlocks.go).toHaveLength(1);
	});
});

// ── Feature: Table Extraction ────────────────────────────────────────────────

describe("Feature: Table Extraction", () => {
	const parser = new MarkdownParser();

	it("should extract single GFM table", () => {
		const markdown = `
| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
| Cell 3   | Cell 4   |
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.tables).toHaveLength(1);
		expect(result.tables[0]?.rows).toHaveLength(3); // header + 2 data rows
		expect(result.tables[0]?.rows[0]?.cells).toEqual(["Header 1", "Header 2"]);
		expect(result.tables[0]?.rows[1]?.cells).toEqual(["Cell 1", "Cell 2"]);
		expect(result.tables[0]?.rows[2]?.cells).toEqual(["Cell 3", "Cell 4"]);
	});

	it("should extract multiple tables", () => {
		const markdown = `
| A | B |
|---|---|
| 1 | 2 |

Some text between tables.

| C | D |
|---|---|
| 3 | 4 |

| E | F |
|---|---|
| 5 | 6 |
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.tables).toHaveLength(3);
		expect(result.tables[0]?.rows[1]?.cells).toEqual(["1", "2"]);
		expect(result.tables[1]?.rows[1]?.cells).toEqual(["3", "4"]);
		expect(result.tables[2]?.rows[1]?.cells).toEqual(["5", "6"]);
	});

	it("should flatten bold and italic formatting to plain text", () => {
		const markdown = `
| Name | Type |
|------|------|
| **bold** | *italic* |
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.tables[0]?.rows[1]?.cells).toEqual(["bold", "italic"]);
	});

	it("should flatten code spans to plain text", () => {
		const markdown = `
| Name | Type |
|------|------|
| \`codeSpan\` | \`number\` |
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.tables[0]?.rows[1]?.cells).toEqual(["codeSpan", "number"]);
	});

	it("should handle empty table cells as empty strings", () => {
		const markdown = `
| A | B | C |
|---|---|---|
|   | x |   |
| y |   | z |
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.tables[0]?.rows[1]?.cells).toEqual(["", "x", ""]);
		expect(result.tables[0]?.rows[2]?.cells).toEqual(["y", "", "z"]);
	});

	it("should extract table with mixed inline formatting", () => {
		const markdown = `
| Name | Type | Description |
|------|------|-------------|
| \`foo\` | **string** | *A description* |
| _bar_ | number | **Bold** and *italic* |
`;
		const result = parser.parse(markdown, "test.md");

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
});

// ── Feature: Line Number Tracking ────────────────────────────────────────────

describe("Feature: Line Number Tracking", () => {
	const parser = new MarkdownParser();

	it("should track startLine and endLine for code blocks", () => {
		const markdown = `# Title

Some text.

\`\`\`mermaid
classDiagram
  class Foo {
    +bar()
  }
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		const block = result.codeBlocks.mermaid[0];
		expect(block?.startLine).toBe(5);
		expect(block?.endLine).toBe(10);
	});

	it("should track startLine and endLine for tables", () => {
		const markdown = `# Title

Some text.

More text.

| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.tables[0]?.startLine).toBe(7);
		expect(result.tables[0]?.endLine).toBe(9);
	});

	it("should assign distinct line positions to multiple blocks", () => {
		const markdown = `\`\`\`mermaid
classDiagram
  class Foo
\`\`\`

Some middle text.

\`\`\`typescript
const x = 1;
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		const mermaidBlock = result.codeBlocks.mermaid[0];
		const tsBlock = result.codeBlocks.typescript[0];

		expect(mermaidBlock?.startLine).toBe(1);
		expect(mermaidBlock?.endLine).toBe(4);
		expect(tsBlock?.startLine).toBe(8);
		expect(tsBlock?.endLine).toBe(10);
		// Distinct positions
		expect(tsBlock?.startLine).toBeGreaterThan(mermaidBlock?.endLine ?? 0);
	});

	it("should use 1-indexed line numbers", () => {
		const markdown = `\`\`\`mermaid
classDiagram
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.codeBlocks.mermaid[0]?.startLine).toBe(1);
	});
});

// ── Feature: Mixed Content ───────────────────────────────────────────────────

describe("Feature: Mixed Content", () => {
	const parser = new MarkdownParser();

	it("should extract both code blocks and tables from same file", () => {
		const markdown = `
# Architecture

| Component | Purpose |
|-----------|---------|
| Parser    | Parse markdown |

\`\`\`mermaid
classDiagram
  class Parser
\`\`\`

\`\`\`mermaid
sequenceDiagram
  A->>B: Hi
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.codeBlocks.mermaid).toHaveLength(2);
		expect(result.tables).toHaveLength(1);
	});

	it("should have empty tables array when file has only code blocks", () => {
		const markdown = `
\`\`\`mermaid
classDiagram
  class Foo
\`\`\`

\`\`\`typescript
const x = 1;
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		expect(Object.keys(result.codeBlocks).length).toBeGreaterThan(0);
		expect(result.tables).toHaveLength(0);
		// No table-related warnings
		const tableWarnings = result.errors.filter((e) =>
			e.message.toLowerCase().includes("table"),
		);
		expect(tableWarnings).toHaveLength(0);
	});

	it("should have empty codeBlocks when file has only tables", () => {
		const markdown = `
# Data

| Name | Value |
|------|-------|
| foo  | 42    |

| A | B |
|---|---|
| 1 | 2 |
`;
		const result = parser.parse(markdown, "test.md");

		expect(Object.keys(result.codeBlocks)).toHaveLength(0);
		expect(result.tables).toHaveLength(2);
		// Should have warning about no code blocks
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.severity).toBe(ErrorSeverity.WARNING);
		expect(result.errors[0]?.message).toContain("No fenced code blocks");
	});
});

// ── Feature: Error Handling ──────────────────────────────────────────────────

describe("Feature: Error Handling", () => {
	const parser = new MarkdownParser();

	it("should produce WARNING when no code blocks in file", () => {
		const markdown = "# Just text\n\nNo code blocks here.";
		const result = parser.parse(markdown, "test.md");

		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.severity).toBe(ErrorSeverity.WARNING);
		expect(result.errors[0]?.message).toContain("No fenced code blocks");
		expect(result.errors[0]?.line).toBe(0); // file-level warning
	});

	it("should produce WARNING for empty file", () => {
		const result = parser.parse("", "empty.md");

		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.severity).toBe(ErrorSeverity.WARNING);
		expect(Object.keys(result.codeBlocks)).toHaveLength(0);
		expect(result.tables).toHaveLength(0);
	});

	it("should handle unclosed code fence gracefully", () => {
		const markdown = `
# Title

\`\`\`mermaid
classDiagram
  class Foo
`;
		// Should not throw
		const result = parser.parse(markdown, "test.md");
		expect(result).toBeDefined();
		expect(result.specFile).toBe("test.md");
		// Remark implicitly closes unclosed fences at EOF — content is still extracted
		expect(result.codeBlocks.mermaid).toHaveLength(1);
		expect(result.codeBlocks.mermaid![0]?.content).toContain("classDiagram");
	});

	it("should preserve specFile in ExtractionResult", () => {
		const result = parser.parse("# Title", "specs/session.md");

		expect(result.specFile).toBe("specs/session.md");
	});

	it("should not produce error when no tables in file", () => {
		const markdown = `
\`\`\`mermaid
classDiagram
  class Foo
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.tables).toHaveLength(0);
		// No table-related errors or warnings
		const tableErrors = result.errors.filter((e) =>
			e.message.toLowerCase().includes("table"),
		);
		expect(tableErrors).toHaveLength(0);
	});
});

// ── Feature: Event Bus Integration ───────────────────────────────────────────

describe("Feature: Event Bus Integration", () => {
	const parser = new MarkdownParser();

	it("should work without bus (backwards compatible)", () => {
		const markdown = `
\`\`\`mermaid
classDiagram
  class Foo
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.codeBlocks.mermaid).toHaveLength(1);
		expect(result.errors).toHaveLength(0);
	});

	it("should accept optional bus and emit debug events", () => {
		const bus = new PipelineEventBus();
		const received: BusPayload[] = [];
		bus.onAll((event) => received.push(event));

		const markdown = `
\`\`\`mermaid
classDiagram
  class Foo
\`\`\`
`;
		const result = parser.parse(markdown, "test.md", bus);

		expect(result.codeBlocks.mermaid).toHaveLength(1);
		expect(received.length).toBeGreaterThan(0);
		expect(
			received.some((e) => e.event === ParserEvent.MARKDOWN_EXTRACTION),
		).toBe(true);
	});

	it("should emit debug for code block extraction with count", () => {
		const bus = new PipelineEventBus();
		const received: BusPayload[] = [];
		bus.onAll((event) => received.push(event));

		const markdown = `
\`\`\`mermaid
classDiagram
  class Foo
\`\`\`

\`\`\`typescript
const x = 1;
\`\`\`

\`\`\`mermaid
erDiagram
  USER ||--o{ ORDER : places
\`\`\`
`;
		parser.parse(markdown, "test.md", bus);

		const codeBlockEvent = received.find(
			(e) =>
				e.event === ParserEvent.MARKDOWN_EXTRACTION &&
				e.level === LogLevel.DEBUG &&
				(e as LogPayload).message === "Extracted code blocks",
		) as LogPayload;

		expect(codeBlockEvent).toBeDefined();
		expect(codeBlockEvent.phase).toBe(PipelinePhase.PARSE);
		expect(codeBlockEvent.context?.count).toBe(3);
		expect(codeBlockEvent.context?.file).toBe("test.md");
	});

	it("should emit debug for table extraction with count", () => {
		const bus = new PipelineEventBus();
		const received: BusPayload[] = [];
		bus.onAll((event) => received.push(event));

		const markdown = `
\`\`\`mermaid
classDiagram
  class Foo
\`\`\`

| A | B |
|---|---|
| 1 | 2 |

| C | D |
|---|---|
| 3 | 4 |

| E | F |
|---|---|
| 5 | 6 |
`;
		parser.parse(markdown, "test.md", bus);

		const tableEvent = received.find(
			(e) =>
				e.event === ParserEvent.MARKDOWN_EXTRACTION &&
				e.level === LogLevel.DEBUG &&
				(e as LogPayload).message === "Extracted tables",
		) as LogPayload;

		expect(tableEvent).toBeDefined();
		expect(tableEvent.phase).toBe(PipelinePhase.PARSE);
		expect(tableEvent.context?.count).toBe(3);
		expect(tableEvent.context?.file).toBe("test.md");
	});

	it("should emit warn for no code blocks", () => {
		const bus = new PipelineEventBus();
		const received: BusPayload[] = [];
		bus.onAll((event) => received.push(event));

		const markdown = "# Just text\nNo code here.";
		const result = parser.parse(markdown, "test.md", bus);

		const warnEvent = received.find(
			(e) =>
				e.event === ParserEvent.MARKDOWN_EXTRACTION &&
				e.level === LogLevel.WARN,
		) as LogPayload;

		expect(warnEvent).toBeDefined();
		expect(warnEvent.phase).toBe(PipelinePhase.PARSE);
		expect(warnEvent.message).toContain("No fenced code blocks");

		// Structured errors should also contain the WARNING
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.severity).toBe(ErrorSeverity.WARNING);
	});
});
