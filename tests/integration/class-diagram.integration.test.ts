import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { MarkdownParser } from "../../packages/parser/src/mermaid-extraction/parser";
import { ClassExtractor } from "../../packages/parser/src/diagrams/class-diagram/class-parsing";

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
        it("should parse plain links and directed relations", () => {
            const results = parseFixture("error-cases/malformed-relations.md");
            const result = results[0]!;

            // Should extract classes
            expect(result.classes.length).toBeGreaterThanOrEqual(3);
            expect(result.classes.map((c) => c.name)).toContain("Foo");
            expect(result.classes.map((c) => c.name)).toContain("Bar");
            expect(result.classes.map((c) => c.name)).toContain("Baz");

            // Should extract all relations including plain link
            expect(result.relations.length).toBe(3); // Foo-->Bar, Bar-->Baz, Foo--Baz
        });

        it("should handle empty class bodies", () => {
            const results = parseFixture("error-cases/empty-class-body.md");
            const result = results[0]!;

            expect(result.classes.length).toBeGreaterThanOrEqual(2);

            const empty = result.classes.find((c) => c.name === "Empty");
            expect(empty).toBeDefined();
            expect(empty?.body.properties).toHaveLength(0);
            expect(empty?.body.methods).toHaveLength(0);

            const hasMembers = result.classes.find((c) => c.name === "HasMembers");
            expect(hasMembers).toBeDefined();
            expect(hasMembers?.body.properties).toHaveLength(1);
        });

        it("should handle missing closing braces gracefully", () => {
            const results = parseFixture("error-cases/unclosed-braces.md");

            // Parser handles the error internally and returns empty result
            expect(results).toHaveLength(1);
            expect(results[0]!.classes).toHaveLength(0);
        });
    });

    // ============================================================
    // Feature: Multiple Diagrams Per File
    // ============================================================

    describe("Multiple Diagrams Per File", () => {
        it("should parse multiple class diagrams from one file", () => {
            const results = parseFixture("multiple-diagrams.md");

            expect(results).toHaveLength(3);

            // First diagram: Alpha
            expect(results[0]!.classes).toHaveLength(1);
            expect(results[0]!.classes[0]?.name).toBe("Alpha");

            // Second diagram: Beta, Gamma with relation
            expect(results[1]!.classes).toHaveLength(2);
            expect(results[1]!.classes.map((c) => c.name)).toContain("Beta");
            expect(results[1]!.classes.map((c) => c.name)).toContain("Gamma");
            expect(results[1]!.relations).toHaveLength(1);

            // Third diagram: Delta
            expect(results[2]!.classes).toHaveLength(1);
            expect(results[2]!.classes[0]?.name).toBe("Delta");
        });

        it("should process each diagram independently", () => {
            const results = parseFixture("multiple-diagrams.md");

            // Each diagram should have its own isolated results
            const allClassNames = results.flatMap((r) => r.classes.map((c) => c.name));
            expect(allClassNames).toEqual(["Alpha", "Beta", "Gamma", "Delta"]);

            // Relations from second diagram should not bleed into others
            expect(results[0]!.relations).toHaveLength(0);
            expect(results[2]!.relations).toHaveLength(0);
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

        it("should track separate line numbers for multiple diagrams", () => {
            const path = resolve(FIXTURES_DIR, "multiple-diagrams.md");
            const content = readFileSync(path, "utf-8");
            const parseResult = mdParser.parse(content, path);
            const classDiagramBlocks = parseResult.blocks.filter(
                (b) => b.language === "mermaid" && b.content.trim().startsWith("classDiagram")
            );

            expect(classDiagramBlocks.length).toBe(3);

            // First block starts earlier in file than second
            expect(classDiagramBlocks[0]!.startLine).toBeLessThan(classDiagramBlocks[1]!.startLine);
            // Second block starts earlier than third
            expect(classDiagramBlocks[1]!.startLine).toBeLessThan(classDiagramBlocks[2]!.startLine);

            // Extract and verify class line numbers are relative to their blocks
            const results = classDiagramBlocks.map((block) => classExtractor.extract(block));
            expect(results[0]!.classes[0]?.startLine).toBeDefined();
            expect(results[1]!.classes[0]?.startLine).toBeDefined();
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
