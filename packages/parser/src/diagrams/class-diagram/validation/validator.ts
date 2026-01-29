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

/**
 * Validates parsed class diagram entities against contract rules.
 *
 * Uses pure functions that return typed results for testability and composability.
 */
export class ClassDiagramValidator {
    /**
     * Validate all classes in a ClassDiagramResult and produce a ValidationReport.
     */
    public validate(result: ClassDiagramResult): ValidationReport {
        // 1. Validate each class individually
        const classResults = result.classes.map(cls => this.validateClass(cls));

        // 2. Check for duplicates across all classes
        const duplicateResult = this.checkDuplicates(result.classes);

        // 3. Check for self-references in relations
        const selfRefResult = this.checkSelfReferences(result.relations);

        // 4. Aggregate all results into final report
        return this.aggregateResults(classResults, duplicateResult, selfRefResult);
    }

    /**
     * Validate a single class through all validation steps.
     * Pure function - no side effects.
     */
    public validateClass(cls: ParsedClass): ClassValidationResult {
        const annotationResult = this.validateAnnotations(cls);
        const stereotypeResult = this.validateStereotype(cls);

        const allErrors = [...annotationResult.errors, ...stereotypeResult.errors];
        const allWarnings = [...stereotypeResult.warnings];

        return {
            isValid: allErrors.length === 0,
            errors: allErrors,
            warnings: allWarnings,
            cls
        };
    }

    /**
     * Validate @package and @type annotations.
     * Pure function - returns AnnotationValidationResult.
     */
    public validateAnnotations(cls: ParsedClass): AnnotationValidationResult {
        const errors: ValidationError[] = [];
        const annotations = cls.annotations || {};

        // Check for duplicate annotations (from AnnotationParser errors array)
        if (annotations.errors && Array.isArray(annotations.errors)) {
            for (const err of annotations.errors) {
                if (err.includes("Duplicate @package")) {
                    errors.push(this.createError(ErrorCode.DUPLICATE_PACKAGE, "Multiple @package annotations found", cls));
                }
                if (err.includes("Duplicate @type")) {
                    errors.push(this.createError(ErrorCode.DUPLICATE_TYPE, "Multiple @type annotations found", cls));
                }
            }
        }

        // Check @package presence and format
        if (!annotations.package) {
            errors.push(this.createError(ErrorCode.MISSING_PACKAGE, "Missing required annotation: @package", cls));
        } else if (/[^a-zA-Z0-9_.]/.test(annotations.package)) {
            errors.push(this.createError(ErrorCode.INVALID_PACKAGE_FORMAT, "Package contains invalid characters", cls));
        }

        // Check @type presence and value
        if (!annotations.entityType) {
            errors.push(this.createError(ErrorCode.MISSING_TYPE, "Missing required annotation: @type", cls));
        } else {
            const validTypes = ["definition", "reference", "external"];
            if (!validTypes.includes(annotations.entityType)) {
                errors.push(this.createError(
                    ErrorCode.INVALID_TYPE_VALUE,
                    `Invalid @type value: ${annotations.entityType}. Valid values: ${validTypes.join(", ")}`,
                    cls
                ));
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate stereotype constraints and type constraints.
     * Pure function - returns StereotypeValidationResult.
     */
    public validateStereotype(cls: ParsedClass): StereotypeValidationResult {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        const stereotype = cls.stereotype;
        const entityType = cls.annotations?.entityType;
        const hasMembers = cls.body.methods.length > 0 || cls.body.properties.length > 0 || cls.body.enumValues.length > 0;

        // Type constraint: reference cannot have members
        if (entityType === "reference" && hasMembers) {
            errors.push(this.createError(ErrorCode.REFERENCE_HAS_MEMBERS, "Reference type cannot have members", cls));
        }

        // Type constraint: definition without members is a warning
        if (entityType === "definition" && !hasMembers) {
            warnings.push(this.createWarning(WarningCode.EMPTY_DEFINITION, "Definition type has no members", cls));
        }

        // Stereotype validation
        const validStereotypes = ["class", "interface", "abstract", "enum", "service", "entity"];

        if (!validStereotypes.includes(stereotype)) {
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
        if (stereotype === "abstract") {
            const hasAbstractMethod = cls.body.methods.some(m => m.isAbstract);
            if (!hasAbstractMethod) {
                warnings.push(this.createWarning(WarningCode.ABSTRACT_NO_ABSTRACT_METHODS, "Abstract class should have at least one abstract method", cls));
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Check for duplicate class names within the same namespace.
     * Pure function - takes all classes and returns duplicates found.
     */
    public checkDuplicates(classes: ParsedClass[]): DuplicateCheckResult {
        const errors: ValidationError[] = [];
        const duplicates: Array<{ name: string; indices: number[] }> = [];

        // Group classes by namespace+name
        const nameMap = new Map<string, number[]>();

        for (let i = 0; i < classes.length; i++) {
            const cls = classes[i];
            if (!cls) continue;

            const namespace = cls.namespace || "default";
            const key = `${namespace}::${cls.name}`;

            const existing = nameMap.get(key);
            if (existing) {
                existing.push(i);
            } else {
                nameMap.set(key, [i]);
            }
        }

        // Find duplicates (more than one class with same key)
        for (const [key, indices] of nameMap) {
            if (indices.length > 1) {
                const [namespace, name] = key.split("::");
                duplicates.push({ name: name || key, indices });

                // Create error for each duplicate (skip the first one)
                for (let i = 1; i < indices.length; i++) {
                    const idx = indices[i];
                    if (idx === undefined) continue;

                    const cls = classes[idx];
                    if (!cls) continue;

                    errors.push(this.createError(
                        ErrorCode.DUPLICATE_CLASS,
                        `Duplicate class name "${cls.name}" in namespace "${namespace}"`,
                        cls
                    ));
                }
            }
        }

        return { duplicates, errors };
    }

    /**
     * Check for self-referencing relations.
     * Pure function - returns warnings for self-references.
     */
    public checkSelfReferences(relations: ParsedRelation[]): SelfReferenceResult {
        const warnings: ValidationWarning[] = [];

        for (const rel of relations) {
            if (rel.sourceClass === rel.targetClass) {
                warnings.push({
                    code: WarningCode.SELF_REFERENCE,
                    message: `Class "${rel.sourceClass}" references itself`,
                    className: rel.sourceClass,
                    line: 0 // Relations don't track line numbers
                });
            }
        }

        return { warnings };
    }

    /**
     * Aggregate results from all validation steps into a final ValidationReport.
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

        // Track which indices are duplicates (to skip them)
        const duplicateIndices = new Set<number>();
        for (const dup of duplicateResult.duplicates) {
            // Skip all but the first occurrence
            for (let i = 1; i < dup.indices.length; i++) {
                const idx = dup.indices[i];
                if (idx !== undefined) {
                    duplicateIndices.add(idx);
                }
            }
        }

        // Process each class result
        for (let i = 0; i < classResults.length; i++) {
            const result = classResults[i];
            if (!result) continue;

            const isDuplicate = duplicateIndices.has(i);

            if (isDuplicate) {
                // Find the duplicate error for this class
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

        // Add duplicate errors not already included
        for (const err of duplicateResult.errors) {
            if (!errors.some(e => e.code === err.code && e.className === err.className && e.line === err.line)) {
                errors.push(err);
            }
        }

        // Add self-reference warnings
        warnings.push(...selfRefResult.warnings);

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            validClasses,
            skippedClasses
        };
    }

    /**
     * Create a ValidationError with consistent structure.
     */
    private createError(code: ErrorCode, message: string, cls: ParsedClass): ValidationError {
        return {
            code,
            message,
            className: cls.name,
            line: cls.startLine ?? 0,
            severity: Severity.ERROR
        };
    }

    /**
     * Create a ValidationWarning with consistent structure.
     */
    private createWarning(code: WarningCode, message: string, cls: ParsedClass): ValidationWarning {
        return {
            code,
            message,
            className: cls.name,
            line: cls.startLine ?? 0
        };
    }
}
