
import type { ClassDiagramResult, ParsedClass } from "../types";
import type { ValidationReport, ValidationError, ValidationWarning, SkippedClass } from "./types";
import { ErrorCode, WarningCode, Severity } from "./types";

export class ClassDiagramValidator {
    public validate(result: ClassDiagramResult): ValidationReport {
        const report: ValidationReport = {
            isValid: true,
            errors: [],
            warnings: [],
            validClasses: [],
            skippedClasses: []
        };

        const processedNames = new Map<string, string>(); // name -> namespace

        for (const cls of result.classes) {
            const classErrors: ValidationError[] = [];
            const classWarnings: ValidationWarning[] = [];

            // 1. Annotation Validation
            this.validateAnnotations(cls, classErrors);

            // 2. Type Constraint Validation
            this.validateTypeConstraints(cls, classErrors, classWarnings);

            // 3. Stereotype Constraint Validation
            this.validateStereotypes(cls, classErrors, classWarnings);

            // 4. Duplicate Validation
            this.validateDuplicates(cls, processedNames, classErrors);

            // Decision: Valid or Skipped
            if (classErrors.length > 0) {
                report.errors.push(...classErrors);
                report.warnings.push(...classWarnings); // Warnings are collected even if skipped? Spec says "Entity continues with flag" for warnings, but if errors exist, entity is skipped.
                // We typically attach warnings to the report regardless.
                report.skippedClasses.push({
                    name: cls.name,
                    reason: classErrors.map(e => e.message).join(", "),
                    errors: classErrors
                });
            } else {
                report.warnings.push(...classWarnings);
                report.validClasses.push(cls);
                // Track name for duplicate detection (only valid classes count? or all? usually all encountered)
                // Duplicate detection logic above updated processedNames
            }
        }

        // 5. Relations Validation (Self-reference)
        this.validateRelations(result, report);

        report.isValid = report.errors.length === 0;
        return report;
    }

    private validateAnnotations(cls: ParsedClass, errors: ValidationError[]): void {
        const annotations = cls.annotations || {};

        // Duplicate checks (simulated based on errors array presence if parser supports it, or raw logic if we parsed)
        // Since we receive ParsedClass, we check if 'errors' property exists in annotations (custom convention from our tests)
        if (annotations.errors && Array.isArray(annotations.errors)) {
            for (const err of annotations.errors) {
                if (err.includes("Duplicate @package")) {
                    this.addError(errors, ErrorCode.DUPLICATE_PACKAGE, "Multiple @package annotations found", cls);
                }
                if (err.includes("Duplicate @type")) {
                    this.addError(errors, ErrorCode.DUPLICATE_TYPE, "Multiple @type annotations found", cls);
                }
            }
        }

        if (!annotations.package) {
            this.addError(errors, ErrorCode.MISSING_PACKAGE, "Missing required annotation: @package", cls);
        } else if (/[^a-zA-Z0-9_.]/.test(annotations.package)) {
            this.addError(errors, ErrorCode.INVALID_PACKAGE_FORMAT, "Package contains invalid characters", cls);
        }

        if (!annotations.entityType) {
            this.addError(errors, ErrorCode.MISSING_TYPE, "Missing required annotation: @type", cls);
        } else {
            const validTypes = ["definition", "reference", "external"];
            if (!validTypes.includes(annotations.entityType)) {
                this.addError(errors, ErrorCode.INVALID_TYPE_VALUE, `Invalid @type value: ${annotations.entityType}`, cls);
            }
        }
    }

    private validateTypeConstraints(cls: ParsedClass, errors: ValidationError[], warnings: ValidationWarning[]): void {
        const type = cls.annotations?.entityType;
        const hasMembers = cls.body.methods.length > 0 || cls.body.properties.length > 0 || cls.body.enumValues.length > 0;

        if (type === "reference" && hasMembers) {
            this.addError(errors, ErrorCode.REFERENCE_HAS_MEMBERS, "Reference type cannot have members", cls);
        }

        if (type === "definition" && !hasMembers) {
            this.addWarning(warnings, WarningCode.EMPTY_DEFINITION, "Definition type has no members", cls);
        }
    }

    private validateStereotypes(cls: ParsedClass, errors: ValidationError[], warnings: ValidationWarning[]): void {
        const stereotype = cls.stereotype;
        const validStereotypes = ["class", "interface", "abstract", "enum", "service", "entity"];

        if (!validStereotypes.includes(stereotype)) {
            this.addWarning(warnings, WarningCode.UNKNOWN_STEREOTYPE, `Unknown stereotype: ${stereotype}`, cls);
            return;
        }

        if (stereotype === "interface" && cls.body.properties.length > 0) {
            this.addWarning(warnings, WarningCode.INTERFACE_HAS_PROPERTIES, "Interface should not have properties", cls);
        }

        if (stereotype === "enum") {
            if (cls.body.methods.length > 0) {
                this.addError(errors, ErrorCode.ENUM_HAS_METHODS, "Enumeration cannot have methods", cls);
            }
        }

        if (stereotype === "abstract") {
            const hasAbstractMethod = cls.body.methods.some(m => m.isAbstract);
            if (!hasAbstractMethod) {
                this.addWarning(warnings, WarningCode.ABSTRACT_NO_ABSTRACT_METHODS, "Abstract class should have at least one abstract method", cls);
            }
        }
    }

    private validateDuplicates(cls: ParsedClass, processedNames: Map<string, string>, errors: ValidationError[]): void {
        const existingNamespace = processedNames.get(cls.name);
        const currentNamespace = cls.namespace || "default";

        if (existingNamespace) {
            if (existingNamespace === currentNamespace) {
                this.addError(errors, ErrorCode.DUPLICATE_CLASS, `Duplicate class name "${cls.name}" in namespace "${currentNamespace}"`, cls);
            }
        } else {
            processedNames.set(cls.name, currentNamespace);
        }
    }

    private validateRelations(result: ClassDiagramResult, report: ValidationReport): void {
        for (const rel of result.relations) {
            if (rel.sourceClass === rel.targetClass) {
                report.warnings.push({
                    code: WarningCode.SELF_REFERENCE,
                    message: `Class "${rel.sourceClass}" references itself`,
                    className: rel.sourceClass,
                    line: undefined, // Relation doesn't track line number in current type def
                    severity: Severity.WARNING
                });
            }
        }
    }

    private addError(errors: ValidationError[], code: ErrorCode, message: string, cls: ParsedClass): void {
        errors.push({
            code,
            message,
            className: cls.name,
            line: cls.startLine,
            severity: Severity.ERROR
        });
    }

    private addWarning(warnings: ValidationWarning[], code: WarningCode, message: string, cls: ParsedClass): void {
        warnings.push({
            code,
            message,
            className: cls.name,
            line: cls.startLine,
            severity: Severity.WARNING
        });
    }
}
