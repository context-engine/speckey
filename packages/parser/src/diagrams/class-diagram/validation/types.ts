import type { ParsedClass } from "../types";

export enum ErrorCode {
    MISSING_PACKAGE = "MISSING_PACKAGE",
    MISSING_TYPE = "MISSING_TYPE",
    INVALID_PACKAGE_FORMAT = "INVALID_PACKAGE_FORMAT",
    INVALID_TYPE_VALUE = "INVALID_TYPE_VALUE",
    DUPLICATE_PACKAGE = "DUPLICATE_PACKAGE",
    DUPLICATE_TYPE = "DUPLICATE_TYPE",
    REFERENCE_HAS_MEMBERS = "REFERENCE_HAS_MEMBERS",
    ENUM_HAS_METHODS = "ENUM_HAS_METHODS",
    DUPLICATE_CLASS = "DUPLICATE_CLASS"
}

export enum WarningCode {
    EMPTY_DEFINITION = "EMPTY_DEFINITION",
    INTERFACE_HAS_PROPERTIES = "INTERFACE_HAS_PROPERTIES",
    ABSTRACT_NO_ABSTRACT_METHODS = "ABSTRACT_NO_ABSTRACT_METHODS",
    UNKNOWN_STEREOTYPE = "UNKNOWN_STEREOTYPE",
    SELF_REFERENCE = "SELF_REFERENCE"
}

export enum Severity {
    ERROR = "error",
    WARNING = "warning",
    INFO = "info"
}

export interface ValidationError {
    code: ErrorCode;
    message: string;
    className: string;
    line?: number;
    severity: Severity.ERROR;
}

export interface ValidationWarning {
    code: WarningCode;
    message: string;
    className: string;
    line?: number;
    severity?: Severity.WARNING;
}

export interface SkippedClass {
    name: string;
    reason: string;
    errors: ValidationError[];
}

export interface ValidationReport {
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
    validClasses: ParsedClass[];
    skippedClasses: SkippedClass[];
}
