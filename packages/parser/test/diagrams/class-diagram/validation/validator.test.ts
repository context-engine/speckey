
import { describe, it, expect, beforeEach } from "bun:test";
import { ClassDiagramValidator } from "../../../../src/diagrams/class-diagram/validation/validator";
import { ErrorCode, WarningCode, Severity } from "../../../../src/diagrams/class-diagram/validation/types";
import type { ClassDiagramResult, ParsedClass } from "../../../../src/diagrams/class-diagram/types";

describe("ClassDiagramValidator", () => {
    let validator: ClassDiagramValidator;

    beforeEach(() => {
        validator = new ClassDiagramValidator();
    });

    const createResult = (classes: ParsedClass[] = []): ClassDiagramResult => ({
        classes,
        relations: [],
        namespaces: [],
        notes: []
    });

    const createClass = (overrides: Partial<ParsedClass> = {}): ParsedClass => ({
        name: "TestClass",
        isGeneric: false,
        typeParams: [],
        stereotype: "class",
        annotations: { package: "test.pkg", entityType: "definition" },
        body: { methods: [], properties: [], enumValues: [] },
        startLine: 1,
        endLine: 5,
        ...overrides
    });

    describe("Annotation Validation", () => {
        it("should skip class missing @package annotation", () => {
            const cls = createClass({ annotations: { entityType: "definition" } });
            const result = validator.validate(createResult([cls]));

            expect(result.isValid).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]!.code).toBe(ErrorCode.MISSING_PACKAGE);
            expect(result.skippedClasses).toHaveLength(1);
            expect(result.skippedClasses[0]!.name).toBe(cls.name);
        });

        it("should skip class missing @type annotation", () => {
            const cls = createClass({ annotations: { package: "test.pkg" } });
            const result = validator.validate(createResult([cls]));

            expect(result.isValid).toBe(false);
            expect(result.errors[0]!.code).toBe(ErrorCode.MISSING_TYPE);
            expect(result.skippedClasses).toHaveLength(1);
        });

        it("should skip class with invalid package format", () => {
            const cls = createClass({ annotations: { package: "invalid/format", entityType: "definition" } });
            const result = validator.validate(createResult([cls]));

            expect(result.isValid).toBe(false);
            expect(result.errors[0]!.code).toBe(ErrorCode.INVALID_PACKAGE_FORMAT);
            expect(result.skippedClasses).toHaveLength(1);
        });

        it("should skip class with invalid @type value", () => {
            const cls = createClass({ annotations: { package: "test.pkg", entityType: "invalid" as any } });
            const result = validator.validate(createResult([cls]));

            expect(result.isValid).toBe(false);
            expect(result.errors[0]!.code).toBe(ErrorCode.INVALID_TYPE_VALUE);
            expect(result.skippedClasses).toHaveLength(1);
        });

        it("should skip class with duplicate @package", () => {
            const cls = createClass({
                annotations: {
                    package: "test.pkg",
                    entityType: "definition",
                    errors: ["Duplicate @package found"]
                } as any
            });
            // In our AnnotationParser architecture, duplicate annotations might be captured in an 'errors' array within Annotations object.
            const result = validator.validate(createResult([cls]));

            expect(result.isValid).toBe(false);
            expect(result.errors[0]!.code).toBe(ErrorCode.DUPLICATE_PACKAGE);
        });

        it("should skip class with duplicate @type", () => {
            // Similar to duplicate package
            const cls = createClass({
                annotations: {
                    package: "test.pkg",
                    entityType: "definition",
                    errors: ["Duplicate @type found"]
                } as any
            });

            const result = validator.validate(createResult([cls]));

            expect(result.isValid).toBe(false);
            expect(result.errors[0]!.code).toBe(ErrorCode.DUPLICATE_TYPE);
        });

        it("should pass class with valid annotations", () => {
            const cls = createClass();
            const result = validator.validate(createResult([cls]));
            expect(result.isValid).toBe(true);
            expect(result.validClasses).toHaveLength(1);
            expect(result.errors).toHaveLength(0);
        });
    });

    describe("Type Constraint Validation", () => {
        it("should error on reference class with members", () => {
            const cls = createClass({
                annotations: { package: "test.pkg", entityType: "reference" },
                body: {
                    methods: [{ name: "foo", visibility: "public", parameters: [], returnType: "void", isAbstract: false, isStatic: false }],
                    properties: [],
                    enumValues: []
                }
            });
            const result = validator.validate(createResult([cls]));

            expect(result.isValid).toBe(false);
            expect(result.errors[0]!.code).toBe(ErrorCode.REFERENCE_HAS_MEMBERS);
            expect(result.skippedClasses).toHaveLength(1);
        });

        it("should pass reference class without members", () => {
            const cls = createClass({
                annotations: { package: "test.pkg", entityType: "reference" },
                body: { methods: [], properties: [], enumValues: [] }
            });
            const result = validator.validate(createResult([cls]));
            expect(result.isValid).toBe(true);
            expect(result.validClasses).toHaveLength(1);
        });

        it("should warn on definition class without members", () => {
            const cls = createClass({
                annotations: { package: "test.pkg", entityType: "definition" },
                body: { methods: [], properties: [], enumValues: [] }
            });
            const result = validator.validate(createResult([cls]));

            expect(result.warnings).toHaveLength(1);
            expect(result.warnings[0]!.code).toBe(WarningCode.EMPTY_DEFINITION);
            expect(result.validClasses).toHaveLength(1);
        });

        it("should pass external class with members", () => {
            const cls = createClass({
                annotations: { package: "test.pkg", entityType: "external" },
                body: { methods: [{ name: "foo", visibility: "public", parameters: [], returnType: "void", isAbstract: false, isStatic: false }], properties: [], enumValues: [] }
            });
            const result = validator.validate(createResult([cls]));
            expect(result.isValid).toBe(true);
            expect(result.validClasses).toHaveLength(1);
        });
    });

    describe("Stereotype Constraint Validation", () => {
        it("should warn on interface with properties", () => {
            const cls = createClass({
                stereotype: "interface",
                body: { methods: [], properties: [{ name: "prop", visibility: "public", type: "string", isStatic: false }], enumValues: [] }
            });
            const result = validator.validate(createResult([cls]));

            expect(result.warnings).toHaveLength(1);
            expect(result.warnings[0]!.code).toBe(WarningCode.INTERFACE_HAS_PROPERTIES);
            expect(result.validClasses).toHaveLength(1);
        });

        it("should error on enum with methods", () => {
            const cls = createClass({
                stereotype: "enum",
                body: { methods: [{ name: "foo", visibility: "public", parameters: [], returnType: "void", isAbstract: false, isStatic: false }], properties: [], enumValues: ["VAL"] }
            });
            const result = validator.validate(createResult([cls]));

            expect(result.errors[0]!.code).toBe(ErrorCode.ENUM_HAS_METHODS);
            expect(result.skippedClasses).toHaveLength(1);
        });

        it("should pass enum with values only", () => {
            const cls = createClass({
                stereotype: "enum",
                body: { methods: [], properties: [], enumValues: ["A", "B"] }
            });
            const result = validator.validate(createResult([cls]));
            expect(result.isValid).toBe(true);
            expect(result.validClasses).toHaveLength(1);
        });

        it("should warn on abstract without abstract methods", () => {
            const cls = createClass({
                stereotype: "abstract",
                body: { methods: [{ name: "foo", visibility: "public", parameters: [], returnType: "void", isAbstract: false, isStatic: false }], properties: [], enumValues: [] }
            });
            const result = validator.validate(createResult([cls]));

            expect(result.warnings[0]!.code).toBe(WarningCode.ABSTRACT_NO_ABSTRACT_METHODS);
            expect(result.validClasses).toHaveLength(1);
        });

        it("should pass abstract with abstract methods", () => {
            const cls = createClass({
                stereotype: "abstract",
                body: { methods: [{ name: "foo", visibility: "public", parameters: [], returnType: "void", isAbstract: true, isStatic: false }], properties: [], enumValues: [] }
            });
            const result = validator.validate(createResult([cls]));
            expect(result.isValid).toBe(true);
            expect(result.warnings).toHaveLength(0);
        });

        it("should warn on unknown stereotype", () => {
            // Add member to avoid EMPTY_DEFINITION warning
            const cls = createClass({
                stereotype: "random" as any,
                body: { methods: [], properties: [{ name: "p", visibility: "public", type: "s", isStatic: false }], enumValues: [] }
            });
            const result = validator.validate(createResult([cls]));

            expect(result.warnings[0]!.code).toBe(WarningCode.UNKNOWN_STEREOTYPE);
        });
    });

    describe("Duplicate Detection", () => {
        it("should error on duplicate class names in same file", () => {
            const cls1 = createClass({ name: "Foo" });
            const cls2 = createClass({ name: "Foo" });
            const result = validator.validate(createResult([cls1, cls2]));

            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]!.code).toBe(ErrorCode.DUPLICATE_CLASS);
            expect(result.validClasses).toHaveLength(1);
            expect(result.skippedClasses).toHaveLength(1);
        });

        it("should allow same name in different namespaces", () => {
            const cls1 = createClass({ name: "Foo", namespace: "A" });
            const cls2 = createClass({ name: "Foo", namespace: "B" });
            const result = validator.validate(createResult([cls1, cls2]));

            expect(result.isValid).toBe(true);
            expect(result.validClasses).toHaveLength(2);
        });

        it("should warn on self-reference relation", () => {
            // Add member to avoid EMPTY_DEFINITION warning
            const cls = createClass({
                name: "Foo",
                body: { methods: [], properties: [{ name: "p", visibility: "public", type: "s", isStatic: false }], enumValues: [] }
            });
            const result = createResult([cls]);
            result.relations = [{ sourceClass: "Foo", targetClass: "Foo", type: "association" }];

            const report = validator.validate(result);
            expect(report.warnings).toHaveLength(1);
            expect(report.warnings[0]!.code).toBe(WarningCode.SELF_REFERENCE);
        });
    });

    describe("ValidationReport Structure", () => {
        it("should report isValid true when no errors", () => {
            const result = validator.validate(createResult([createClass()]));
            expect(result.isValid).toBe(true);
        });

        it("should report isValid false when any error", () => {
            const result = validator.validate(createResult([
                createClass({ annotations: { entityType: "definition" } }) // Missing package
            ]));
            expect(result.isValid).toBe(false);
        });

        it("should include line numbers in errors", () => {
            const cls = createClass({ annotations: { entityType: "definition" }, startLine: 10 });
            const result = validator.validate(createResult([cls]));
            expect(result.errors[0]!.line).toBe(10);
        });

        it("should include severity in all issues", () => {
            const cls = createClass({ annotations: { entityType: "definition" } });
            const result = validator.validate(createResult([cls]));
            expect(result.errors[0]!.severity).toBe(Severity.ERROR);
        });
    });

    describe("Edge Cases", () => {
        it("should handle empty ClassDiagramResult", () => {
            const result = validator.validate(createResult([]));
            expect(result.isValid).toBe(true);
            expect(result.validClasses).toBeEmpty();
            expect(result.errors).toBeEmpty();
        });

        it("should collect multiple errors for one class", () => {
            // Missing annotations + enum with methods
            const cls = createClass({
                annotations: {},
                stereotype: "enum",
                body: { methods: [{ name: "foo", visibility: "public", parameters: [], returnType: "void", isAbstract: false, isStatic: false }], properties: [], enumValues: [] }
            });
            const result = validator.validate(createResult([cls]));

            expect(result.errors.length).toBeGreaterThanOrEqual(2);
            // Should report missing package, missing type, enum has methods...
            const codes = result.errors.map(e => e.code);
            expect(codes).toContain(ErrorCode.MISSING_PACKAGE);
            expect(codes).toContain(ErrorCode.ENUM_HAS_METHODS);
        });

        it("should collect warnings and errors separately", () => {
            const cls1 = createClass({ name: "C1", annotations: { entityType: "definition" } }); // Error: missing package
            const cls2 = createClass({ name: "C2", stereotype: "interface", body: { methods: [], properties: [{ name: "prop", visibility: "public", type: "string", isStatic: false }], enumValues: [] } }); // Warning: interface properties

            const result = validator.validate(createResult([cls1, cls2]));

            expect(result.errors.length).toBeGreaterThanOrEqual(1);
            expect(result.warnings.length).toBeGreaterThanOrEqual(1);
            expect(result.skippedClasses).toHaveLength(1); // cls1
            expect(result.validClasses).toHaveLength(1); // cls2
        });

        it("should check annotations before stereotypes", () => {
            // If a class fails annotation validation (e.g. missing package), we might skip stereotype validation logic on it?
            // Or at least, ensure we don't crash if stereotype logic runs on invalid class.
            // This test asserts that a class with missing package (annotation error) AND invalid stereotype usage (if checked)
            // reports the annotation error. It might also report stereotype error, but order implies we catch the blocker first.
            // Actually, the spec says "skippedClasses" for critical errors. 
            // If annotation fails, it's skipped. Stereotype error might also cause skip.
            // Let's passed a class with BOTH errors and ensure MISSING_PACKAGE is present.
            const cls = createClass({
                annotations: { entityType: "definition" }, // Missing Package
                stereotype: "enum",
                body: { methods: [{ name: "f", visibility: "public", parameters: [], returnType: "v", isAbstract: false, isStatic: false }], properties: [], enumValues: [] } // Enum has methods
            });

            const result = validator.validate(createResult([cls]));

            // If implementation stops at first blocker, we see MISSING_PACKAGE.
            // If it collects all, we see both.
            // The requirement is that we detect the annotation error.
            expect(result.errors.map(e => e.code)).toContain(ErrorCode.MISSING_PACKAGE);
        });
    });
});
