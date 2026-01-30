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
        annotations: { address: "test.pkg", entityType: "definition" },
        body: { methods: [], properties: [], enumValues: [] },
        startLine: 1,
        endLine: 5,
        ...overrides
    });

    describe("Annotation Validation", () => {
        it("should skip class missing @address annotation", () => {
            const cls = createClass({ annotations: { entityType: "definition" } });
            const result = validator.validate(createResult([cls]));

            expect(result.isValid).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]!.code).toBe(ErrorCode.MISSING_ADDRESS);
            expect(result.skippedClasses).toHaveLength(1);
            expect(result.skippedClasses[0]!.name).toBe(cls.name);
        });

        it("should skip class missing @type annotation", () => {
            const cls = createClass({ annotations: { address: "test.pkg" } });
            const result = validator.validate(createResult([cls]));

            expect(result.isValid).toBe(false);
            expect(result.errors[0]!.code).toBe(ErrorCode.MISSING_TYPE);
            expect(result.skippedClasses).toHaveLength(1);
        });

        it("should skip class with invalid address format", () => {
            const cls = createClass({ annotations: { address: "invalid/format", entityType: "definition" } });
            const result = validator.validate(createResult([cls]));

            expect(result.isValid).toBe(false);
            expect(result.errors[0]!.code).toBe(ErrorCode.INVALID_ADDRESS_FORMAT);
            expect(result.errors[0]!.message).toMatch(/invalid/i);
            expect(result.skippedClasses).toHaveLength(1);
        });

        it("should skip class with invalid @type value", () => {
            const cls = createClass({ annotations: { address: "test.pkg", entityType: "invalid" as any } });
            const result = validator.validate(createResult([cls]));

            expect(result.isValid).toBe(false);
            expect(result.errors[0]!.code).toBe(ErrorCode.INVALID_TYPE_VALUE);
            expect(result.errors[0]!.message).toMatch(/definition.*reference.*external/i);
            expect(result.skippedClasses).toHaveLength(1);
        });

        it("should skip class with duplicate @address", () => {
            const cls = createClass({
                annotations: {
                    address: "test.pkg",
                    entityType: "definition",
                    errors: ["Duplicate @address found"]
                } as any
            });
            const result = validator.validate(createResult([cls]));

            expect(result.isValid).toBe(false);
            expect(result.errors[0]!.code).toBe(ErrorCode.DUPLICATE_ADDRESS);
        });

        it("should skip class with duplicate @type", () => {
            const cls = createClass({
                annotations: {
                    address: "test.pkg",
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
                annotations: { address: "test.pkg", entityType: "reference" },
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
                annotations: { address: "test.pkg", entityType: "reference" },
                body: { methods: [], properties: [], enumValues: [] }
            });
            const result = validator.validate(createResult([cls]));
            expect(result.isValid).toBe(true);
            expect(result.validClasses).toHaveLength(1);
        });

        it("should warn on definition class without members", () => {
            const cls = createClass({
                annotations: { address: "test.pkg", entityType: "definition" },
                body: { methods: [], properties: [], enumValues: [] }
            });
            const result = validator.validate(createResult([cls]));

            expect(result.warnings).toHaveLength(1);
            expect(result.warnings[0]!.code).toBe(WarningCode.EMPTY_DEFINITION);
            expect(result.validClasses).toHaveLength(1);
        });

        it("should pass external class with members", () => {
            const cls = createClass({
                annotations: { address: "test.pkg", entityType: "external" },
                body: { methods: [{ name: "foo", visibility: "public", parameters: [], returnType: "void", isAbstract: false, isStatic: false }], properties: [], enumValues: [] }
            });
            const result = validator.validate(createResult([cls]));
            expect(result.isValid).toBe(true);
            expect(result.validClasses).toHaveLength(1);
        });

        it("should pass external class without members", () => {
            const cls = createClass({
                annotations: { address: "test.pkg", entityType: "external" },
                body: { methods: [], properties: [], enumValues: [] }
            });
            const result = validator.validate(createResult([cls]));
            expect(result.isValid).toBe(true);
            expect(result.validClasses).toHaveLength(1);
            expect(result.errors).toHaveLength(0);
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

        it("should warn on unknown stereotype and treat as class", () => {
            const cls = createClass({
                stereotype: "random" as any,
                body: { methods: [], properties: [{ name: "p", visibility: "public", type: "s", isStatic: false }], enumValues: [] }
            });
            const result = validator.validate(createResult([cls]));

            expect(result.warnings[0]!.code).toBe(WarningCode.UNKNOWN_STEREOTYPE);
            // Class should still be valid (treated as "class" stereotype)
            expect(result.isValid).toBe(true);
            expect(result.validClasses).toHaveLength(1);
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
                createClass({ annotations: { entityType: "definition" } }) // Missing address
            ]));
            expect(result.isValid).toBe(false);
        });

        it("should include line numbers in errors", () => {
            const cls = createClass({ annotations: { entityType: "definition" }, startLine: 10 });
            const result = validator.validate(createResult([cls]));
            expect(result.errors[0]!.line).toBe(10);
        });

        it("should include severity in errors", () => {
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
            const cls = createClass({
                annotations: {},
                stereotype: "enum",
                body: { methods: [{ name: "foo", visibility: "public", parameters: [], returnType: "void", isAbstract: false, isStatic: false }], properties: [], enumValues: [] }
            });
            const result = validator.validate(createResult([cls]));

            expect(result.errors.length).toBeGreaterThanOrEqual(2);
            const codes = result.errors.map(e => e.code);
            expect(codes).toContain(ErrorCode.MISSING_ADDRESS);
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
            const cls = createClass({
                annotations: { entityType: "definition" }, // Missing address
                stereotype: "enum",
                body: { methods: [{ name: "f", visibility: "public", parameters: [], returnType: "v", isAbstract: false, isStatic: false }], properties: [], enumValues: [] } // Enum has methods
            });

            const result = validator.validate(createResult([cls]));
            expect(result.errors.map(e => e.code)).toContain(ErrorCode.MISSING_ADDRESS);
        });
    });

    // --- New tests for pure function methods ---

    describe("validateClass (pure function)", () => {
        it("should return ClassValidationResult with isValid true for valid class", () => {
            const cls = createClass();
            const result = validator.validateClass(cls);

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
            expect(result.cls).toBe(cls);
        });

        it("should return ClassValidationResult with isValid false for invalid class", () => {
            const cls = createClass({ annotations: {} });
            const result = validator.validateClass(cls);

            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.cls).toBe(cls);
        });

        it("should aggregate errors from annotation and stereotype validation", () => {
            const cls = createClass({
                annotations: { entityType: "definition" }, // Missing address
                stereotype: "enum",
                body: { methods: [{ name: "f", visibility: "public", parameters: [], returnType: "v", isAbstract: false, isStatic: false }], properties: [], enumValues: [] }
            });
            const result = validator.validateClass(cls);

            const codes = result.errors.map(e => e.code);
            expect(codes).toContain(ErrorCode.MISSING_ADDRESS);
            expect(codes).toContain(ErrorCode.ENUM_HAS_METHODS);
        });
    });

    describe("validateAnnotations (pure function)", () => {
        it("should return AnnotationValidationResult for valid annotations", () => {
            const cls = createClass();
            const result = validator.validateAnnotations(cls);

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it("should detect missing @address", () => {
            const cls = createClass({ annotations: { entityType: "definition" } });
            const result = validator.validateAnnotations(cls);

            expect(result.isValid).toBe(false);
            expect(result.errors[0]!.code).toBe(ErrorCode.MISSING_ADDRESS);
        });

        it("should detect missing @type", () => {
            const cls = createClass({ annotations: { address: "test.pkg" } });
            const result = validator.validateAnnotations(cls);

            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.code === ErrorCode.MISSING_TYPE)).toBe(true);
        });

        it("should detect invalid address format", () => {
            const cls = createClass({ annotations: { address: "a/b", entityType: "definition" } });
            const result = validator.validateAnnotations(cls);

            expect(result.isValid).toBe(false);
            expect(result.errors[0]!.code).toBe(ErrorCode.INVALID_ADDRESS_FORMAT);
        });
    });

    describe("validateStereotype (pure function)", () => {
        it("should return StereotypeValidationResult for valid stereotype", () => {
            const cls = createClass({ body: { methods: [], properties: [{ name: "p", visibility: "public", type: "s", isStatic: false }], enumValues: [] } });
            const result = validator.validateStereotype(cls);

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
            expect(result.warnings).toHaveLength(0);
        });

        it("should detect reference with members", () => {
            const cls = createClass({
                annotations: { address: "test", entityType: "reference" },
                body: { methods: [{ name: "f", visibility: "public", parameters: [], returnType: "v", isAbstract: false, isStatic: false }], properties: [], enumValues: [] }
            });
            const result = validator.validateStereotype(cls);

            expect(result.isValid).toBe(false);
            expect(result.errors[0]!.code).toBe(ErrorCode.REFERENCE_HAS_MEMBERS);
        });

        it("should warn on empty definition", () => {
            const cls = createClass({
                annotations: { address: "test", entityType: "definition" },
                body: { methods: [], properties: [], enumValues: [] }
            });
            const result = validator.validateStereotype(cls);

            expect(result.isValid).toBe(true);
            expect(result.warnings[0]!.code).toBe(WarningCode.EMPTY_DEFINITION);
        });
    });

    describe("checkDuplicates (pure function)", () => {
        it("should return empty result for no duplicates", () => {
            const classes = [createClass({ name: "A" }), createClass({ name: "B" })];
            const result = validator.checkDuplicates(classes);

            expect(result.duplicates).toHaveLength(0);
            expect(result.errors).toHaveLength(0);
        });

        it("should detect duplicates in same namespace", () => {
            const classes = [createClass({ name: "Foo" }), createClass({ name: "Foo" })];
            const result = validator.checkDuplicates(classes);

            expect(result.duplicates).toHaveLength(1);
            expect(result.duplicates[0]!.name).toBe("Foo");
            expect(result.duplicates[0]!.indices).toEqual([0, 1]);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]!.code).toBe(ErrorCode.DUPLICATE_CLASS);
        });

        it("should allow same name in different namespaces", () => {
            const classes = [createClass({ name: "Foo", namespace: "A" }), createClass({ name: "Foo", namespace: "B" })];
            const result = validator.checkDuplicates(classes);

            expect(result.duplicates).toHaveLength(0);
            expect(result.errors).toHaveLength(0);
        });

        it("should handle multiple duplicates", () => {
            const classes = [
                createClass({ name: "Foo" }),
                createClass({ name: "Foo" }),
                createClass({ name: "Foo" })
            ];
            const result = validator.checkDuplicates(classes);

            expect(result.duplicates).toHaveLength(1);
            expect(result.duplicates[0]!.indices).toEqual([0, 1, 2]);
            expect(result.errors).toHaveLength(2); // Skip first, error on 2nd and 3rd
        });
    });

    describe("checkSelfReferences (pure function)", () => {
        it("should return empty for no self-references", () => {
            const relations = [{ sourceClass: "A", targetClass: "B", type: "association" as const }];
            const result = validator.checkSelfReferences(relations);

            expect(result.warnings).toHaveLength(0);
        });

        it("should detect self-references", () => {
            const relations = [{ sourceClass: "Foo", targetClass: "Foo", type: "association" as const }];
            const result = validator.checkSelfReferences(relations);

            expect(result.warnings).toHaveLength(1);
            expect(result.warnings[0]!.code).toBe(WarningCode.SELF_REFERENCE);
            expect(result.warnings[0]!.className).toBe("Foo");
        });

        it("should detect multiple self-references", () => {
            const relations = [
                { sourceClass: "A", targetClass: "A", type: "association" as const },
                { sourceClass: "B", targetClass: "B", type: "dependency" as const }
            ];
            const result = validator.checkSelfReferences(relations);

            expect(result.warnings).toHaveLength(2);
        });
    });
});
