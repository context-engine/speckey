import type { ClassDiagramResult, ParsedClass, ParsedRelation } from "../types";
import type {
    ValidationReport,
    ValidationError,
    ValidationWarning,
    SkippedClass,
    ClassValidationResult,
    AnnotationValidationResult,
    StereotypeValidationResult,
    DuplicateCheckResult,
    SelfReferenceResult
} from "./types";
import { ErrorCode, WarningCode, Severity } from "./types";

const VALID_TYPES = ["definition", "reference", "external"];
const VALID_STEREOTYPES = ["class", "interface", "abstract", "enum", "service", "entity"];
const ADDRESS_PATTERN = /^[a-zA-Z0-9_.]+$/;

/**
 * Validates parsed class diagram entities against contract rules.
 *
 * @address speckey.parser.class.unitValidator
 * @type definition
 */
export class ClassDiagramValidator {
    /**
     * Validate all classes in a ClassDiagramResult and produce a ValidationReport.
     */
    validate(result: ClassDiagramResult): ValidationReport {
        const classResults = result.classes.map(cls => this.validateClass(cls));
        const duplicateResult = this.checkDuplicates(result.classes);
        const selfRefResult = this.checkSelfReferences(result.relations);

        return this.aggregateResults(classResults, duplicateResult, selfRefResult);
    }

    /**
     * Validate a single class through annotation and stereotype checks.
     */
    private validateClass(cls: ParsedClass): ClassValidationResult {
        const annotationResult = this.validateAnnotations(cls);
        const stereotypeResult = this.validateStereotype(cls);

        return {
            isValid: annotationResult.errors.length === 0 && stereotypeResult.errors.length === 0,
            errors: [...annotationResult.errors, ...stereotypeResult.errors],
            warnings: [...stereotypeResult.warnings],
            cls
        };
    }

    /**
     * Check @address and @type annotation presence, format, and uniqueness.
     */
    private validateAnnotations(cls: ParsedClass): AnnotationValidationResult {
        const errors: ValidationError[] = [];
        const annotations = cls.annotations || {};

        // Duplicate annotation detection (from upstream AnnotationParser errors)
        if (annotations.errors && Array.isArray(annotations.errors)) {
            for (const err of annotations.errors) {
                if (err.includes("Duplicate @address")) {
                    errors.push(this.createError(ErrorCode.DUPLICATE_ADDRESS, "Multiple @address annotations found", cls));
                }
                if (err.includes("Duplicate @type")) {
                    errors.push(this.createError(ErrorCode.DUPLICATE_TYPE, "Multiple @type annotations found", cls));
                }
            }
        }

        // @address presence and format
        if (!annotations.address) {
            errors.push(this.createError(ErrorCode.MISSING_ADDRESS, "Missing required annotation: @address", cls));
        } else if (!ADDRESS_PATTERN.test(annotations.address)) {
            errors.push(this.createError(ErrorCode.INVALID_ADDRESS_FORMAT, "Address contains invalid characters", cls));
        }

        // @type presence and value
        if (!annotations.entityType) {
            errors.push(this.createError(ErrorCode.MISSING_TYPE, "Missing required annotation: @type", cls));
        } else if (!VALID_TYPES.includes(annotations.entityType)) {
            errors.push(this.createError(
                ErrorCode.INVALID_TYPE_VALUE,
                `Invalid @type value: ${annotations.entityType}. Valid values: ${VALID_TYPES.join(", ")}`,
                cls
            ));
        }

        return { isValid: errors.length === 0, errors };
    }

    /**
     * Validate type constraints and stereotype constraints.
     *
     * Type constraints: reference cannot have members, definition without members is a warning.
     * Stereotype constraints: interface methods-only, enum values-only, abstract needs abstract methods.
     */
    private validateStereotype(cls: ParsedClass): StereotypeValidationResult {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        const entityType = cls.annotations?.entityType;
        const stereotype = cls.stereotype;
        const hasMembers = cls.body.methods.length > 0 || cls.body.properties.length > 0 || cls.body.enumValues.length > 0;

        // Type constraint: reference cannot have members
        if (entityType === "reference" && hasMembers) {
            errors.push(this.createError(ErrorCode.REFERENCE_HAS_MEMBERS, "Reference type cannot have members", cls));
        }

        // Type constraint: definition without members
        if (entityType === "definition" && !hasMembers) {
            warnings.push(this.createWarning(WarningCode.EMPTY_DEFINITION, "Definition type has no members", cls));
        }

        // Unknown stereotype — warn and return early (treat as class)
        if (!VALID_STEREOTYPES.includes(stereotype)) {
            warnings.push(this.createWarning(WarningCode.UNKNOWN_STEREOTYPE, `Unknown stereotype: ${stereotype}`, cls));
            return { isValid: errors.length === 0, errors, warnings };
        }

        // Interface should not have properties
        if (stereotype === "interface" && cls.body.properties.length > 0) {
            warnings.push(this.createWarning(WarningCode.INTERFACE_HAS_PROPERTIES, "Interface should not have properties", cls));
        }

        // Enum cannot have methods
        if (stereotype === "enum" && cls.body.methods.length > 0) {
            errors.push(this.createError(ErrorCode.ENUM_HAS_METHODS, "Enumeration cannot have methods", cls));
        }

        // Abstract should have at least one abstract method
        if (stereotype === "abstract" && !cls.body.methods.some(m => m.isAbstract)) {
            warnings.push(this.createWarning(WarningCode.ABSTRACT_NO_ABSTRACT_METHODS, "Abstract class should have at least one abstract method", cls));
        }

        return { isValid: errors.length === 0, errors, warnings };
    }

    /**
     * Detect duplicate class names within the same namespace.
     * Keeps the first occurrence, skips subsequent duplicates.
     */
    private checkDuplicates(classes: ParsedClass[]): DuplicateCheckResult {
        const errors: ValidationError[] = [];
        const duplicates: Array<{ name: string; indices: number[] }> = [];
        const nameMap = new Map<string, number[]>();

        for (let i = 0; i < classes.length; i++) {
            const cls = classes[i];
            if (!cls) continue;

            const key = `${cls.namespace || "default"}::${cls.name}`;
            const existing = nameMap.get(key);
            if (existing) {
                existing.push(i);
            } else {
                nameMap.set(key, [i]);
            }
        }

        for (const [key, indices] of nameMap) {
            if (indices.length <= 1) continue;

            const name = key.split("::")[1] || key;
            const namespace = key.split("::")[0];
            duplicates.push({ name, indices });

            // Error on each duplicate beyond the first
            for (let i = 1; i < indices.length; i++) {
                const cls = classes[indices[i]!];
                if (!cls) continue;
                errors.push(this.createError(
                    ErrorCode.DUPLICATE_CLASS,
                    `Duplicate class name "${cls.name}" in namespace "${namespace}"`,
                    cls
                ));
            }
        }

        return { duplicates, errors };
    }

    /**
     * Detect self-referencing relations (source === target).
     */
    private checkSelfReferences(relations: ParsedRelation[]): SelfReferenceResult {
        const warnings: ValidationWarning[] = [];

        for (const rel of relations) {
            if (rel.sourceClass === rel.targetClass) {
                warnings.push({
                    code: WarningCode.SELF_REFERENCE,
                    message: `Class "${rel.sourceClass}" references itself`,
                    className: rel.sourceClass,
                    line: 0
                });
            }
        }

        return { warnings };
    }

    /**
     * Aggregate per-class results, duplicate results, and self-reference results
     * into the final ValidationReport.
     */
    private aggregateResults(
        classResults: ClassValidationResult[],
        duplicateResult: DuplicateCheckResult,
        selfRefResult: SelfReferenceResult
    ): ValidationReport {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];
        const validClasses: ParsedClass[] = [];
        const skippedClasses: SkippedClass[] = [];

        // Indices that are duplicates (beyond the first occurrence)
        const duplicateIndices = new Set<number>();
        for (const dup of duplicateResult.duplicates) {
            for (let i = 1; i < dup.indices.length; i++) {
                const idx = dup.indices[i];
                if (idx !== undefined) duplicateIndices.add(idx);
            }
        }

        for (let i = 0; i < classResults.length; i++) {
            const result = classResults[i];
            if (!result) continue;

            const isDuplicate = duplicateIndices.has(i);

            if (isDuplicate) {
                const dupError = duplicateResult.errors.find(e => e.className === result.cls.name);
                const classErrors = dupError ? [...result.errors, dupError] : result.errors;

                errors.push(...classErrors);
                warnings.push(...result.warnings);
                skippedClasses.push({
                    name: result.cls.name,
                    reason: classErrors.map(e => e.message).join(", "),
                    errors: classErrors
                });
            } else if (!result.isValid) {
                errors.push(...result.errors);
                warnings.push(...result.warnings);
                skippedClasses.push({
                    name: result.cls.name,
                    reason: result.errors.map(e => e.message).join(", "),
                    errors: result.errors
                });
            } else {
                warnings.push(...result.warnings);
                validClasses.push(result.cls);
            }
        }

        // Add any duplicate errors not already captured
        for (const err of duplicateResult.errors) {
            if (!errors.some(e => e.code === err.code && e.className === err.className && e.line === err.line)) {
                errors.push(err);
            }
        }

        warnings.push(...selfRefResult.warnings);

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            validClasses,
            skippedClasses
        };
    }

    private createError(code: ErrorCode, message: string, cls: ParsedClass): ValidationError {
        return { code, message, className: cls.name, line: cls.startLine ?? 0, severity: Severity.ERROR };
    }

    private createWarning(code: WarningCode, message: string, cls: ParsedClass): ValidationWarning {
        return { code, message, className: cls.name, line: cls.startLine ?? 0 };
    }
}
