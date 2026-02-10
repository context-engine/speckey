import { describe, expect, it } from "bun:test";
import { Logger } from "@speckey/logger";
import type { AppLogObj } from "@speckey/logger";
import { MermaidValidator } from "../../src/mermaid-validation/validator";
import { DiagramType, ErrorSeverity } from "../../src/mermaid-validation/types";
import type { CodeBlock } from "../../src/mermaid-validation/types";

// ── Test Helpers ──────────────────────────────────────────────────────────────

function createTestLogger() {
	const logs: Record<string, unknown>[] = [];
	const logger = new Logger<AppLogObj>({
		name: "test-validator",
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

function makeBlock(content: string, startLine = 1, endLine = 5): CodeBlock {
	return { language: "mermaid", content, startLine, endLine };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("MermaidValidator", () => {
	const validator = new MermaidValidator();

	// ── Feature: Mermaid Syntax Validation ─────────────────────────────────

	describe("Feature: Mermaid Syntax Validation", () => {
		it("should validate a valid mermaid block successfully", async () => {
			const block = makeBlock("classDiagram\n  class Foo");
			const result = await validator.validateAll([block], "test.md");

			expect(result.validatedBlocks).toHaveLength(1);
			expect(result.errors).toHaveLength(0);
			expect(result.summary.valid).toBe(1);
		});

		it("should reject an invalid mermaid block with error details", async () => {
			const block = makeBlock("classDiagram\n  class Foo {");
			const result = await validator.validateAll([block], "test.md");

			expect(result.validatedBlocks).toHaveLength(0);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]?.severity).toBe(ErrorSeverity.ERROR);
			expect(result.errors[0]?.message).toBeDefined();
		});

		it("should validate multiple blocks independently", async () => {
			const blocks = [
				makeBlock("classDiagram\n  class Foo", 1, 3),
				makeBlock("this is not valid mermaid {{{", 5, 7),
				makeBlock("erDiagram\n  USER ||--o{ ORDER : places", 9, 12),
			];
			const result = await validator.validateAll(blocks, "test.md");

			expect(result.validatedBlocks).toHaveLength(2);
			expect(result.errors).toHaveLength(1);
			expect(result.summary.valid).toBe(2);
			expect(result.summary.rejected).toBe(1);
		});

		it("should produce empty validatedBlocks when all blocks are invalid", async () => {
			const blocks = [
				makeBlock("invalid syntax here {{{", 1, 3),
				makeBlock("also not valid |||", 5, 7),
			];
			const result = await validator.validateAll(blocks, "test.md");

			expect(result.validatedBlocks).toHaveLength(0);
			expect(result.errors).toHaveLength(2);
			expect(result.summary.valid).toBe(0);
			expect(result.summary.rejected).toBe(2);
		});

		it("should preserve source location in validated block", async () => {
			const block = makeBlock("classDiagram\n  class Foo", 10, 20);
			const result = await validator.validateAll([block], "specs/session.md");

			expect(result.validatedBlocks[0]?.startLine).toBe(10);
			expect(result.validatedBlocks[0]?.endLine).toBe(20);
			expect(result.validatedBlocks[0]?.specFile).toBe("specs/session.md");
		});
	});

	// ── Feature: Diagram Type Detection ────────────────────────────────────

	describe("Feature: Diagram Type Detection", () => {
		it("should detect classDiagram type", async () => {
			const block = makeBlock("classDiagram\n  class Foo {\n    +bar()\n  }");
			const result = await validator.validateAll([block], "test.md");

			expect(result.validatedBlocks[0]?.diagramType).toBe(DiagramType.CLASS_DIAGRAM);
		});

		it("should detect sequenceDiagram type", async () => {
			const block = makeBlock("sequenceDiagram\n  Alice->>Bob: Hello");
			const result = await validator.validateAll([block], "test.md");

			expect(result.validatedBlocks[0]?.diagramType).toBe(DiagramType.SEQUENCE_DIAGRAM);
		});

		it("should detect erDiagram type", async () => {
			const block = makeBlock("erDiagram\n  USER ||--o{ ORDER : places");
			const result = await validator.validateAll([block], "test.md");

			expect(result.validatedBlocks[0]?.diagramType).toBe(DiagramType.ER_DIAGRAM);
		});

		it("should detect flowchart type", async () => {
			const block = makeBlock("flowchart LR\n  A --> B --> C");
			const result = await validator.validateAll([block], "test.md");

			expect(result.validatedBlocks[0]?.diagramType).toBe(DiagramType.FLOWCHART);
		});

		it("should detect stateDiagram type", async () => {
			const block = makeBlock("stateDiagram-v2\n  [*] --> Active\n  Active --> [*]");
			const result = await validator.validateAll([block], "test.md");

			expect(result.validatedBlocks[0]?.diagramType).toBe(DiagramType.STATE_DIAGRAM);
		});
	});

	// ── Feature: Empty / Whitespace Blocks ─────────────────────────────────

	describe("Feature: Empty / Whitespace Blocks", () => {
		it("should produce WARNING for empty mermaid block", async () => {
			const block = makeBlock("");
			const result = await validator.validateAll([block], "test.md");

			expect(result.validatedBlocks).toHaveLength(0);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]?.severity).toBe(ErrorSeverity.WARNING);
			expect(result.errors[0]?.message).toContain("Empty mermaid block");
		});

		it("should produce WARNING for whitespace-only mermaid block", async () => {
			const block = makeBlock("   \n  \n  ");
			const result = await validator.validateAll([block], "test.md");

			expect(result.validatedBlocks).toHaveLength(0);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]?.severity).toBe(ErrorSeverity.WARNING);
		});

		it("should skip empty block without affecting other valid blocks", async () => {
			const blocks = [
				makeBlock("classDiagram\n  class Foo", 1, 3),
				makeBlock("", 5, 5),
				makeBlock("erDiagram\n  USER ||--o{ ORDER : places", 7, 10),
			];
			const result = await validator.validateAll(blocks, "test.md");

			expect(result.validatedBlocks).toHaveLength(2);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]?.severity).toBe(ErrorSeverity.WARNING);
			expect(result.summary.valid).toBe(2);
			expect(result.summary.rejected).toBe(1);
		});
	});

	// ── Feature: ValidationResult Assembly ─────────────────────────────────

	describe("Feature: ValidationResult Assembly", () => {
		it("should contain all validated blocks and errors in result", async () => {
			const blocks = [
				makeBlock("classDiagram\n  class Foo", 1, 3),
				makeBlock("invalid {{{", 5, 7),
			];
			const result = await validator.validateAll(blocks, "specs/test.md");

			expect(result.validatedBlocks).toHaveLength(1);
			expect(result.errors).toHaveLength(1);
			expect(result.specFile).toBe("specs/test.md");
		});

		it("should have correct summary counts and byType breakdown", async () => {
			const blocks = [
				makeBlock("classDiagram\n  class Foo", 1, 3),
				makeBlock("classDiagram\n  class Bar", 5, 7),
				makeBlock("erDiagram\n  USER ||--o{ ORDER : places", 9, 12),
				makeBlock("invalid {{{", 14, 16),
				makeBlock("", 18, 18),
			];
			const result = await validator.validateAll(blocks, "test.md");

			expect(result.summary.total).toBe(5);
			expect(result.summary.valid).toBe(3);
			expect(result.summary.rejected).toBe(2);
			expect(result.summary.byType[DiagramType.CLASS_DIAGRAM]).toBe(2);
			expect(result.summary.byType[DiagramType.ER_DIAGRAM]).toBe(1);
		});

		it("should produce zero errors when all blocks are valid", async () => {
			const blocks = [
				makeBlock("classDiagram\n  class Foo", 1, 3),
				makeBlock("erDiagram\n  USER ||--o{ ORDER : places", 5, 8),
			];
			const result = await validator.validateAll(blocks, "test.md");

			expect(result.errors).toHaveLength(0);
			expect(result.summary.rejected).toBe(0);
		});

		it("should produce zero validatedBlocks when all blocks are invalid", async () => {
			const blocks = [
				makeBlock("broken syntax {{{", 1, 3),
				makeBlock("also broken |||", 5, 7),
			];
			const result = await validator.validateAll(blocks, "test.md");

			expect(result.validatedBlocks).toHaveLength(0);
			expect(result.summary.valid).toBe(0);
		});
	});

	// ── Feature: Error Handling ────────────────────────────────────────────

	describe("Feature: Error Handling", () => {
		it("should include mermaid.parse() error message in ValidationError", async () => {
			const block = makeBlock("classDiagram\n  class Foo {");
			const result = await validator.validateAll([block], "test.md");

			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]?.severity).toBe(ErrorSeverity.ERROR);
			expect(result.errors[0]?.message.length).toBeGreaterThan(0);
		});

		it("should calculate error line from block startLine", async () => {
			const block = makeBlock("classDiagram\n  class Foo {", 10, 15);
			const result = await validator.validateAll([block], "test.md");

			expect(result.errors[0]?.line).toBeGreaterThanOrEqual(10);
		});

		it("should catch mermaid.parse() exceptions gracefully", async () => {
			const block = makeBlock("classDiagram\n  class Foo {{{{{");
			const result = await validator.validateAll([block], "test.md");

			// Should NOT throw — returns errors in result
			expect(result.errors.length).toBeGreaterThan(0);
			expect(result.errors[0]?.severity).toBe(ErrorSeverity.ERROR);
		});

		it("should preserve per-block error detail in mixed scenarios", async () => {
			const blocks = [
				makeBlock("invalid syntax {{{", 1, 3),
				makeBlock("", 5, 5),
				makeBlock("classDiagram\n  class Foo", 7, 10),
			];
			const result = await validator.validateAll(blocks, "test.md");

			expect(result.errors).toHaveLength(2);
			// First error: syntax error (ERROR)
			expect(result.errors[0]?.severity).toBe(ErrorSeverity.ERROR);
			// Second error: empty block (WARNING)
			expect(result.errors[1]?.severity).toBe(ErrorSeverity.WARNING);
			// Valid block still present
			expect(result.validatedBlocks).toHaveLength(1);
		});
	});

	// ── Feature: Logger Integration ────────────────────────────────────────

	describe("Feature: Logger Integration", () => {
		it("should work without logger", async () => {
			const block = makeBlock("classDiagram\n  class Foo");
			const result = await validator.validateAll([block], "test.md");

			expect(result.validatedBlocks).toHaveLength(1);
			expect(result.errors).toHaveLength(0);
		});

		it("should accept optional logger and return correct result", async () => {
			const { logger } = createTestLogger();
			const block = makeBlock("classDiagram\n  class Foo");
			const result = await validator.validateAll([block], "test.md", logger);

			expect(result.validatedBlocks).toHaveLength(1);
			expect(result.errors).toHaveLength(0);
		});

		it("should log debug for successful validation", async () => {
			const { logger, logs } = createTestLogger();
			const block = makeBlock("classDiagram\n  class Foo");
			await validator.validateAll([block], "test.md", logger);

			const debugLog = logs.find((l) => {
				const msg = getMsg(l);
				return msg.toLowerCase().includes("validated") || msg.toLowerCase().includes("block");
			});
			expect(debugLog).toBeDefined();
		});

		it("should log error for syntax failure", async () => {
			const { logger, logs } = createTestLogger();
			const block = makeBlock("invalid syntax {{{");
			await validator.validateAll([block], "test.md", logger);

			const errorLog = logs.find((l) => {
				const msg = getMsg(l);
				return msg.toLowerCase().includes("syntax") || msg.toLowerCase().includes("error");
			});
			expect(errorLog).toBeDefined();
		});

		it("should log warn for empty block", async () => {
			const { logger, logs } = createTestLogger();
			const block = makeBlock("");
			await validator.validateAll([block], "test.md", logger);

			const warnLog = logs.find((l) => {
				const msg = getMsg(l);
				return msg.toLowerCase().includes("empty");
			});
			expect(warnLog).toBeDefined();
		});
	});

	// ── Feature: Mermaid Initialization ────────────────────────────────────

	describe("Feature: Mermaid Initialization", () => {
		it("should initialize mermaid before first parse", async () => {
			const freshValidator = new MermaidValidator();
			const block = makeBlock("classDiagram\n  class Foo");

			// Should not throw — mermaid should be initialized internally
			const result = await freshValidator.validateAll([block], "test.md");
			expect(result.validatedBlocks).toHaveLength(1);
		});

		it("should work correctly across multiple validateAll calls", async () => {
			const freshValidator = new MermaidValidator();
			const block1 = makeBlock("classDiagram\n  class Foo");
			const block2 = makeBlock("erDiagram\n  USER ||--o{ ORDER : places");

			const result1 = await freshValidator.validateAll([block1], "a.md");
			const result2 = await freshValidator.validateAll([block2], "b.md");

			expect(result1.validatedBlocks).toHaveLength(1);
			expect(result2.validatedBlocks).toHaveLength(1);
		});
	});
});
