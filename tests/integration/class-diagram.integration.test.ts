import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { MarkdownParser } from "../../packages/parser/src/mermaid-extraction/parser";
import { ClassExtractor } from "../../packages/parser/src/diagrams/class-diagram/class-parsing";
import type { CodeBlock } from "../../packages/parser/src/mermaid-extraction/types";
import { readFileSync } from "node:fs";

const FIXTURES_DIR = resolve(import.meta.dir, "../fixtures/class-diagrams");

describe("Class Diagram Parser Integration", () => {
    const mdParser = new MarkdownParser();
    const classExtractor = new ClassExtractor();

    // Helper to parse a fixture file
    const parseFixture = (filename: string) => {
        const path = resolve(FIXTURES_DIR, filename);
        const content = readFileSync(path, "utf-8");
        const parseResult = mdParser.parse(content, path);
        const classDiagramBlocks = parseResult.blocks.filter(
            (b) => b.language === "mermaid" && b.content.trim().startsWith("classDiagram")
        );
        return classDiagramBlocks.map((block) => classExtractor.extract(block));
    };

    // ============================================================
    // Feature: End-to-End Class Diagram Parsing
    // ============================================================

    describe("End-to-End Parsing", () => {
        it("should parse single class diagram from markdown", () => {
            const results = parseFixture("simple-class.md");

            expect(results).toHaveLength(1);
            const result = results[0]!;

            expect(result.classes).toHaveLength(1);
            expect(result.classes[0]?.name).toBe("User");
            expect(result.classes[0]?.body.properties).toHaveLength(2);
            expect(result.classes[0]?.body.methods).toHaveLength(1);
        });

        it("should parse class diagram with all features", () => {
            const results = parseFixture("complete-example.md");

            expect(results).toHaveLength(1);
            const result = results[0]!;

            // Should have classes
            expect(result.classes.length).toBeGreaterThanOrEqual(4);

            // Should have relations
            expect(result.relations.length).toBeGreaterThanOrEqual(3);

            // Should have namespaces
            expect(result.namespaces).toHaveLength(2);
            expect(result.namespaces.map((n) => n.name)).toContain("Domain");
            expect(result.namespaces.map((n) => n.name)).toContain("Infrastructure");

            // Should have notes
            expect(result.notes.length).toBeGreaterThanOrEqual(2);
        });
    });

    // ============================================================
    // Feature: Relationship Parsing Integration
    // ============================================================

    describe("Relationship Parsing", () => {
        it("should parse all relation types", () => {
            const results = parseFixture("class-relations.md");
            const result = results[0]!;

            expect(result.relations.length).toBeGreaterThanOrEqual(8);

            // Check specific relation types
            const relationTypes = result.relations.map((r) => r.type);
            expect(relationTypes).toContain("inheritance");
            expect(relationTypes).toContain("composition");
            expect(relationTypes).toContain("aggregation");
            expect(relationTypes).toContain("association");
            expect(relationTypes).toContain("dependency");
            expect(relationTypes).toContain("realization");
            expect(relationTypes).toContain("link");
            expect(relationTypes).toContain("lollipop");
        });

        it("should parse relations with cardinality and labels", () => {
            const results = parseFixture("complete-example.md");
            const result = results[0]!;

            // Find relation with cardinality
            const relationWithCardinality = result.relations.find(
                (r) => r.sourceCardinality || r.targetCardinality
            );

            expect(relationWithCardinality).toBeDefined();
            if (relationWithCardinality) {
                expect(relationWithCardinality.sourceCardinality).toBeDefined();
                expect(relationWithCardinality.targetCardinality).toBeDefined();
            }

            // Find relation with label
            const relationWithLabel = result.relations.find((r) => r.label);
            expect(relationWithLabel).toBeDefined();
        });
    });

    // ============================================================
    // Feature: Namespace Integration
    // ============================================================

    describe("Namespace Integration", () => {
        it("should parse nested namespaces", () => {
            const results = parseFixture("namespaced-classes.md");
            const result = results[0]!;

            expect(result.namespaces).toHaveLength(2);

            const domainNs = result.namespaces.find((n) => n.name === "Domain");
            expect(domainNs).toBeDefined();
            expect(domainNs?.classes).toContain("User");
            expect(domainNs?.classes).toContain("Order");

            const infraNs = result.namespaces.find(
                (n) => n.name === "Infrastructure"
            );
            expect(infraNs).toBeDefined();
            expect(infraNs?.classes).toContain("Database");
            expect(infraNs?.classes).toContain("Cache");
        });

        it("should assign namespace to classes", () => {
            const results = parseFixture("namespaced-classes.md");
            const result = results[0]!;

            const userClass = result.classes.find((c) => c.name === "User");
            expect(userClass?.namespace).toBe("Domain");

            const dbClass = result.classes.find((c) => c.name === "Database");
            expect(dbClass?.namespace).toBe("Infrastructure");
        });
    });

    // ============================================================
    // Feature: Static and Abstract Members
    // ============================================================

    describe("Static and Abstract Members", () => {
        it("should parse static methods and properties", () => {
            const results = parseFixture("static-abstract.md");
            const result = results[0]!;

            const singleton = result.classes.find((c) => c.name === "Singleton");
            expect(singleton).toBeDefined();

            // Check static property
            const staticProp = singleton?.body.properties.find(
                (p) => p.name === "instance"
            );
            expect(staticProp?.isStatic).toBe(true);

            // Check static method
            const staticMethod = singleton?.body.methods.find(
                (m) => m.name === "getInstance"
            );
            expect(staticMethod?.isStatic).toBe(true);
        });

        it("should parse abstract methods", () => {
            const results = parseFixture("static-abstract.md");
            const result = results[0]!;

            const shape = result.classes.find((c) => c.name === "Shape");
            expect(shape?.stereotype).toBe("abstract");

            const drawMethod = shape?.body.methods.find((m) => m.name === "draw");
            expect(drawMethod?.isAbstract).toBe(true);

            const getAreaMethod = shape?.body.methods.find(
                (m) => m.name === "getArea"
            );
            expect(getAreaMethod?.isAbstract).toBe(true);
        });
    });

    // ============================================================
    // Feature: Notes Integration
    // ============================================================

    describe("Notes Integration", () => {
        it("should parse class-specific notes", () => {
            const results = parseFixture("notes-example.md");
            const result = results[0]!;

            expect(result.notes.length).toBeGreaterThanOrEqual(2);

            const userNote = result.notes.find((n) => n.forClass === "User");
            expect(userNote).toBeDefined();
            expect(userNote?.text).toContain("authentication");

            const orderNote = result.notes.find((n) => n.forClass === "Order");
            expect(orderNote).toBeDefined();
        });

        it("should parse general notes", () => {
            const results = parseFixture("notes-example.md");
            const result = results[0]!;

            const generalNote = result.notes.find((n) => !n.forClass);
            expect(generalNote).toBeDefined();
            expect(generalNote?.text).toContain("domain model");
        });
    });

    // ============================================================
    // Feature: Comment Stripping
    // ============================================================

    describe("Comment Stripping", () => {
        it("should strip comments from diagram", () => {
            const results = parseFixture("complete-example.md");
            const result = results[0]!;

            // Comments should not appear in any output
            const allText = JSON.stringify(result);
            expect(allText).not.toContain("%%");
            expect(allText).not.toContain("Domain namespace");
        });
    });

    // ============================================================
    // Feature: Error Resilience
    // ============================================================

    describe("Error Resilience", () => {
        it("should skip malformed relation lines", () => {
            const results = parseFixture("error-cases/malformed-relations.md");
            const result = results[0]!;

            // Should extract classes
            expect(result.classes.length).toBeGreaterThanOrEqual(3);
            expect(result.classes.map((c) => c.name)).toContain("Foo");
            expect(result.classes.map((c) => c.name)).toContain("Bar");
            expect(result.classes.map((c) => c.name)).toContain("Baz");

            // Should only extract valid relations (skip malformed ones)
            expect(result.relations.length).toBe(2); // Foo->Bar and Bar->Baz
        });
    });

    // ============================================================
    // Feature: Line Number Tracking
    // ============================================================

    describe("Line Number Tracking", () => {
        it("should track class line numbers accurately", () => {
            const path = resolve(FIXTURES_DIR, "simple-class.md");
            const content = readFileSync(path, "utf-8");
            const parseResult = mdParser.parse(content, path);
            const block = parseResult.blocks[0]!;

            const result = classExtractor.extract(block);

            // Class should have start line
            expect(result.classes[0]?.startLine).toBeDefined();
            expect(result.classes[0]?.startLine).toBeGreaterThan(0);
        });
    });

    // ============================================================
    // Feature: Integration Stats
    // ============================================================

    describe("Integration Stats", () => {
        it("should extract expected counts from simple-class", () => {
            const results = parseFixture("simple-class.md");
            const result = results[0]!;

            expect(result.classes).toHaveLength(1);
            expect(result.relations).toHaveLength(0);
            expect(result.namespaces).toHaveLength(0);
            expect(result.notes).toHaveLength(0);
        });

        it("should extract expected counts from class-relations", () => {
            const results = parseFixture("class-relations.md");
            const result = results[0]!;

            expect(result.classes.length).toBeGreaterThanOrEqual(5);
            expect(result.relations.length).toBeGreaterThanOrEqual(8);
            expect(result.namespaces).toHaveLength(0);
            expect(result.notes).toHaveLength(0);
        });

        it("should extract expected counts from namespaced-classes", () => {
            const results = parseFixture("namespaced-classes.md");
            const result = results[0]!;

            expect(result.classes.length).toBeGreaterThanOrEqual(4);
            expect(result.relations.length).toBeGreaterThanOrEqual(1);
            expect(result.namespaces).toHaveLength(2);
        });

        it("should extract expected counts from complete-example", () => {
            const results = parseFixture("complete-example.md");
            const result = results[0]!;

            expect(result.classes.length).toBeGreaterThanOrEqual(4);
            expect(result.relations.length).toBeGreaterThanOrEqual(3);
            expect(result.namespaces).toHaveLength(2);
            expect(result.notes.length).toBeGreaterThanOrEqual(2);
        });
    });
});
