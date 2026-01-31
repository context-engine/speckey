import type { PackageRegistry, DeferredValidationQueue } from "@speckey/core";

/**
 * Type category for resolved types.
 *
 * @address speckey.parser.class.typeResolver
 * @type definition
 */
export enum TypeCategory {
	BUILT_IN = "built_in",
	CUSTOM = "custom",
	GENERIC = "generic",
	ARRAY = "array",
	UNION = "union",
	EXTERNAL = "external",
}

/**
 * Result of resolving a type string.
 *
 * @address speckey.parser.class.typeResolver
 * @type definition
 */
export interface ResolvedType {
	typeString: string;
	category: TypeCategory;
	references: string[];
	isResolved: boolean;
	externalDeps: string[];
}

/**
 * Parsed generic type parts.
 *
 * @address speckey.parser.class.typeResolver
 * @type definition
 */
export interface GenericParts {
	container: string;
	typeParams: string[];
}

/**
 * Context passed to resolver for type resolution.
 *
 * @address speckey.parser.class.typeResolver
 * @type definition
 */
export interface ResolutionContext {
	currentDiagramClasses: Map<string, string>;
	registry: PackageRegistry;
	deferredQueue: DeferredValidationQueue;
	sourceEntityFqn: string;
	specFile: string;
	specLine: number;
}

/**
 * A resolved method with typed references.
 *
 * @address speckey.parser.class.typeResolver
 * @type definition
 */
export interface ResolvedMethod {
	name: string;
	returnType: ResolvedType;
	params: ResolvedParameter[];
	visibility: string;
	isAbstract: boolean;
	isStatic: boolean;
	references: string[];
}

/**
 * A resolved parameter with typed references.
 *
 * @address speckey.parser.class.typeResolver
 * @type definition
 */
export interface ResolvedParameter {
	name: string;
	type: ResolvedType;
	optional: boolean;
	defaultValue?: string;
	isGeneric: boolean;
	typeVar?: string;
	references: string[];
}

/**
 * A resolved property with typed references.
 *
 * @address speckey.parser.class.typeResolver
 * @type definition
 */
export interface ResolvedProperty {
	name: string;
	type: ResolvedType;
	visibility: string;
	isStatic: boolean;
	references: string[];
}

/**
 * A resolved relationship with target FQN.
 *
 * @address speckey.parser.class.typeResolver
 * @type definition
 */
export interface ResolvedRelationship {
	type: string;
	targetFqn: string;
	label?: string;
	isResolved: boolean;
}

/**
 * Input parsed method shape (from ClassExtractor output).
 */
export interface ParsedMethodInput {
	name: string;
	returnType: string;
	parameters: ParsedParameterInput[];
	visibility: string;
	isAbstract: boolean;
	isStatic: boolean;
}

/**
 * Input parsed parameter shape.
 */
export interface ParsedParameterInput {
	name: string;
	type: string;
	optional: boolean;
	defaultValue?: string;
	isGeneric: boolean;
	typeVar?: string;
}

/**
 * Input parsed property shape.
 */
export interface ParsedPropertyInput {
	name: string;
	type: string;
	visibility: string;
	isStatic: boolean;
}

/**
 * Input parsed relationship shape.
 */
export interface ParsedRelationshipInput {
	type: string;
	target: string;
	label?: string;
}
