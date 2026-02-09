import { describe, expect, it } from "bun:test";
import { Logger } from "@speckey/logger";
import type { AppLogObj } from "@speckey/logger";
import { MarkdownParser } from "../../src/mermaid-extraction/parser";
import { DiagramType, ErrorSeverity } from "../../src/mermaid-extraction/types";

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
		expect(result.errors).toHaveLength(1); // Warning for no mermaid diagrams
		expect(result.errors[0]?.severity).toBe(ErrorSeverity.WARNING);
	});

	it("should handle markdown with no mermaid blocks and emit warning", () => {
		const markdown = "# Just text\nNo code here.";
		const result = parser.parse(markdown, "test.md");
		expect(result.blocks).toHaveLength(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.severity).toBe(ErrorSeverity.WARNING);
		expect(result.errors[0]?.message).toContain("No mermaid diagrams");
	});

	it("should emit distinct warning when file has no code blocks at all", () => {
		const markdown = "# Just text\nNo code here.";
		const result = parser.parse(markdown, "test.md");

		expect(result.blocks).toHaveLength(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.severity).toBe(ErrorSeverity.WARNING);
		expect(result.errors[0]?.message).toBe("No mermaid diagrams found in file");
	});

	it("should emit distinct warning when file has code blocks but none are mermaid", () => {
		const markdown = `
\`\`\`typescript
const x = 1;
\`\`\`

\`\`\`javascript
console.log("hello");
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.blocks).toHaveLength(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.severity).toBe(ErrorSeverity.WARNING);
		expect(result.errors[0]?.message).toBe("File has code blocks but none are mermaid");
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

	it("should emit warning for empty mermaid block", () => {
		const markdown = `
# Title

\`\`\`mermaid
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.blocks).toHaveLength(1);
		expect(result.blocks[0]?.content).toBe("");
		expect(result.routedBlocks).toHaveLength(1);
		expect(result.routedBlocks[0]?.diagramType).toBe(DiagramType.UNKNOWN);
		expect(result.routedBlocks[0]?.isSupported).toBe(false);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.severity).toBe(ErrorSeverity.WARNING);
		expect(result.errors[0]?.message).toContain("Empty mermaid block");
	});

	it("should emit warning for whitespace-only mermaid block", () => {
		const markdown = `
\`\`\`mermaid

\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.blocks).toHaveLength(1);
		expect(result.routedBlocks).toHaveLength(1);
		expect(result.routedBlocks[0]?.diagramType).toBe(DiagramType.UNKNOWN);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.severity).toBe(ErrorSeverity.WARNING);
		expect(result.errors[0]?.message).toContain("Empty mermaid block");
	});

	it("should handle parse errors gracefully", () => {
		// Pass a number to force remark to throw during AST building
		const result = parser.parse(42 as unknown as string, "bad.md");

		expect(result.blocks).toHaveLength(0);
		expect(result.routedBlocks).toHaveLength(0);
		expect(result.tables).toHaveLength(0);
		expect(result.specFile).toBe("bad.md");
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.severity).toBe(ErrorSeverity.ERROR);
		expect(result.errors[0]?.line).toBe(1);
	});
});

// Contract-derived integration tests (02-mermaid-block-extraction.md)
describe("ParseResult.routedBlocks (Contract: Diagram Type Detection)", () => {
	const parser = new MarkdownParser();

	it("should return routedBlocks with correct CLASS_DIAGRAM type", () => {
		const markdown = `
\`\`\`mermaid
classDiagram
  class Foo {
    +bar()
  }
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.routedBlocks).toHaveLength(1);
		expect(result.routedBlocks[0]?.diagramType).toBe(DiagramType.CLASS_DIAGRAM);
		expect(result.routedBlocks[0]?.isSupported).toBe(true);
		expect(result.routedBlocks[0]?.block).toBe(result.blocks[0]);
	});

	it("should return routedBlocks with correct SEQUENCE_DIAGRAM type", () => {
		const markdown = `
\`\`\`mermaid
sequenceDiagram
  Alice->>Bob: Hello
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.routedBlocks).toHaveLength(1);
		expect(result.routedBlocks[0]?.diagramType).toBe(
			DiagramType.SEQUENCE_DIAGRAM,
		);
	});

	it("should return routedBlocks with correct ER_DIAGRAM type", () => {
		const markdown = `
\`\`\`mermaid
erDiagram
  USER ||--o{ ORDER : places
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.routedBlocks).toHaveLength(1);
		expect(result.routedBlocks[0]?.diagramType).toBe(DiagramType.ER_DIAGRAM);
	});

	it("should return routedBlocks with correct FLOWCHART type", () => {
		const markdown = `
\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.routedBlocks).toHaveLength(1);
		expect(result.routedBlocks[0]?.diagramType).toBe(DiagramType.FLOWCHART);
	});

	it("should return UNKNOWN for invalid mermaid content", () => {
		const markdown = `
\`\`\`mermaid
this is not valid mermaid
just random text
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.routedBlocks).toHaveLength(1);
		expect(result.routedBlocks[0]?.diagramType).toBe(DiagramType.UNKNOWN);
	});

	it("should route multiple blocks with different diagram types", () => {
		const markdown = `
# Architecture

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

		expect(result.routedBlocks).toHaveLength(3);
		expect(result.routedBlocks[0]?.diagramType).toBe(DiagramType.CLASS_DIAGRAM);
		expect(result.routedBlocks[1]?.diagramType).toBe(
			DiagramType.SEQUENCE_DIAGRAM,
		);
		expect(result.routedBlocks[2]?.diagramType).toBe(DiagramType.ER_DIAGRAM);
	});

	it("should track line numbers in routedBlocks (Contract: Line Number Tracking)", () => {
		const markdown = `# Session Manager

Some description.

\`\`\`mermaid
classDiagram
  class Parser
\`\`\`
`;
		const result = parser.parse(markdown, "session.md");

		expect(result.specFile).toBe("session.md");
		expect(result.routedBlocks[0]?.block.startLine).toBe(5);
		expect(result.routedBlocks[0]?.block.endLine).toBe(8);
	});

	it("should handle no mermaid blocks (Contract: Empty blocks scenario)", () => {
		const markdown = `# No diagrams here

Just text.
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.blocks).toHaveLength(0);
		expect(result.routedBlocks).toHaveLength(0);
		expect(result.errors).toHaveLength(1); // Warning for no mermaid diagrams
		expect(result.errors[0]?.severity).toBe(ErrorSeverity.WARNING);
		expect(result.errors[0]?.message).toContain("No mermaid diagrams");
	});

	it("should return routedBlocks with correct MINDMAP type", () => {
		const markdown = `
\`\`\`mermaid
mindmap
  root((Central))
    Topic1
    Topic2
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.routedBlocks).toHaveLength(1);
		expect(result.routedBlocks[0]?.diagramType).toBe(DiagramType.MINDMAP);
	});

	it("should mark UNKNOWN blocks as unsupported (skipped for downstream parsing)", () => {
		const markdown = `
\`\`\`mermaid
this is invalid mermaid content
not a valid diagram
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.routedBlocks).toHaveLength(1);
		expect(result.routedBlocks[0]?.diagramType).toBe(DiagramType.UNKNOWN);
		expect(result.routedBlocks[0]?.isSupported).toBe(false); // Should be skipped
	});

	it("should preserve source file and line numbers for downstream parsers", () => {
		const markdown = `# Architecture Document

Some introduction text here.

\`\`\`mermaid
classDiagram
  class Parser {
    +parse()
  }
\`\`\`

More content here.
`;
		const result = parser.parse(markdown, "architecture.md");

		expect(result.specFile).toBe("architecture.md");
		expect(result.routedBlocks).toHaveLength(1);

		const routedBlock = result.routedBlocks[0];
		expect(routedBlock?.block.startLine).toBe(5);
		expect(routedBlock?.block.endLine).toBe(10);
		expect(routedBlock?.diagramType).toBe(DiagramType.CLASS_DIAGRAM);
	});

	it("should return routedBlocks with correct STATE_DIAGRAM type", () => {
		const markdown = `
\`\`\`mermaid
stateDiagram-v2
  [*] --> Active
  Active --> [*]
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.routedBlocks).toHaveLength(1);
		expect(result.routedBlocks[0]?.diagramType).toBe(
			DiagramType.STATE_DIAGRAM,
		);
	});

	it("should return routedBlocks with correct GANTT type", () => {
		const markdown = `
\`\`\`mermaid
gantt
  title A Gantt Diagram
  section Section
  A task: a1, 2024-01-01, 30d
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.routedBlocks).toHaveLength(1);
		expect(result.routedBlocks[0]?.diagramType).toBe(DiagramType.GANTT);
	});

	it("should return routedBlocks with correct PIE type", () => {
		const markdown = `
\`\`\`mermaid
pie title Distribution
  "A" : 40
  "B" : 60
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.routedBlocks).toHaveLength(1);
		expect(result.routedBlocks[0]?.diagramType).toBe(DiagramType.PIE);
	});
});

// Logger integration tests (01-scenarios.md: Feature: Logger Integration)
describe("MarkdownParser Logger Integration", () => {
	const parser = new MarkdownParser();

	function createTestLogger() {
		const logs: Record<string, unknown>[] = [];
		const logger = new Logger<AppLogObj>({
			name: "test-parser",
			type: "hidden",
			minLevel: 0,
		});
		logger.attachTransport((logObj: Record<string, unknown>) => {
			logs.push(logObj);
		});
		return { logger, logs };
	}

	function getMsg(logEntry: Record<string, unknown>): string {
		return typeof logEntry["0"] === "string" ? (logEntry["0"] as string) : "";
	}

	function getData(logEntry: Record<string, unknown>): Record<string, unknown> | undefined {
		return logEntry["1"] as Record<string, unknown> | undefined;
	}

	it("should work without logger (backwards compatible)", () => {
		const markdown = `
\`\`\`mermaid
classDiagram
  class Foo
\`\`\`
`;
		const result = parser.parse(markdown, "test.md");

		expect(result.blocks).toHaveLength(1);
		expect(result.routedBlocks).toHaveLength(1);
		expect(result.errors).toHaveLength(0);
	});

	it("should accept optional logger and still return correct ParseResult", () => {
		const { logger } = createTestLogger();
		const markdown = `
\`\`\`mermaid
classDiagram
  class Foo
\`\`\`
`;
		const result = parser.parse(markdown, "test.md", logger);

		expect(result.blocks).toHaveLength(1);
		expect(result.routedBlocks).toHaveLength(1);
		expect(result.errors).toHaveLength(0);
	});

	it("should emit debug message for code block extraction", () => {
		const { logger, logs } = createTestLogger();
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
		parser.parse(markdown, "test.md", logger);

		const codeBlockLog = logs.find((l) => getMsg(l) === "Extracted code blocks");
		expect(codeBlockLog).toBeDefined();

		const data = getData(codeBlockLog!);
		expect(data?.mermaid).toBe(2);
		expect(data?.total).toBe(3);
	});

	it("should emit debug message for table extraction", () => {
		const { logger, logs } = createTestLogger();
		const markdown = `
| A | B |
|---|---|
| 1 | 2 |

\`\`\`mermaid
classDiagram
  class Foo
\`\`\`

| C | D |
|---|---|
| 3 | 4 |
`;
		parser.parse(markdown, "test.md", logger);

		const tableLog = logs.find((l) => getMsg(l) === "Extracted tables");
		expect(tableLog).toBeDefined();

		const data = getData(tableLog!);
		expect(data?.count).toBe(2);
	});

	it("should emit warn message when no mermaid blocks found", () => {
		const { logger, logs } = createTestLogger();
		const markdown = "# Just text\nNo code here.";

		const result = parser.parse(markdown, "test.md", logger);

		// Logger should receive the warning
		const warnLog = logs.find((l) => getMsg(l) === "No mermaid diagrams found in file");
		expect(warnLog).toBeDefined();

		// Structured errors should also contain the warning
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.severity).toBe(ErrorSeverity.WARNING);
	});

	it("should emit distinct warn when file has non-mermaid code blocks only", () => {
		const { logger, logs } = createTestLogger();
		const markdown = `
\`\`\`typescript
const x = 1;
\`\`\`

\`\`\`javascript
console.log("hello");
\`\`\`
`;
		const result = parser.parse(markdown, "test.md", logger);

		// Logger should receive the distinct warning
		const warnLog = logs.find((l) => getMsg(l) === "File has code blocks but none are mermaid");
		expect(warnLog).toBeDefined();

		// Structured errors should contain the distinct warning
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.severity).toBe(ErrorSeverity.WARNING);
		expect(result.errors[0]?.message).toBe("File has code blocks but none are mermaid");
	});
});

