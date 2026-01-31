import type { PackageRegistry, DeferredValidationQueue, ClassSpec } from "@speckey/core";
import type { TypeResolver } from "../type-resolver";

/**
 * Build error codes.
 *
 * @address speckey.parser.class.entityBuilder
 * @type definition
 */
export enum BuildErrorCode {
	INVALID_FQN = "INVALID_FQN",
	DUPLICATE_DEFINITION = "DUPLICATE_DEFINITION",
	MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",
	UNQUALIFIED_CROSS_FILE_REF = "UNQUALIFIED_CROSS_FILE_REF",
}

/**
 * Build warning codes.
 *
 * @address speckey.parser.class.entityBuilder
 * @type definition
 */
export enum BuildWarningCode {
	LONG_FQN = "LONG_FQN",
	CIRCULAR_DEPENDENCY = "CIRCULAR_DEPENDENCY",
}

/**
 * An error encountered during entity building.
 *
 * @address speckey.parser.class.entityBuilder
 * @type definition
 */
export interface BuildError {
	code: BuildErrorCode;
	message: string;
	fqn: string;
	specFile: string;
	specLine: number;
}

/**
 * A warning generated during entity building.
 *
 * @address speckey.parser.class.entityBuilder
 * @type definition
 */
export interface BuildWarning {
	code: BuildWarningCode;
	message: string;
	fqn: string;
}

/**
 * All dependencies and context needed for building class specs from a single file.
 *
 * @address speckey.parser.class.entityBuilder
 * @type definition
 */
export interface BuildContext {
	registry: PackageRegistry;
	deferredQueue: DeferredValidationQueue;
	typeResolver: TypeResolver;
	currentDiagramClasses: Map<string, string>;
	specFile: string;
}

/**
 * Result of building class specs from a single file.
 *
 * @address speckey.parser.class.entityBuilder
 * @type definition
 */
export interface BuildResult {
	classSpecs: ClassSpec[];
	errors: BuildError[];
	warnings: BuildWarning[];
}

/**
 * Internal FQN validation result.
 *
 * @address speckey.parser.class.entityBuilder
 * @type definition
 */
export interface FqnValidation {
	isValid: boolean;
	error?: string;
}

/**
 * Internal class spec validation result.
 *
 * @address speckey.parser.class.entityBuilder
 * @type definition
 */
export interface ClassSpecValidation {
	isValid: boolean;
	errors: string[];
	warnings: string[];
}
