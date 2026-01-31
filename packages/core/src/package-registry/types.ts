/**
 * Error codes for registry operations.
 *
 * @address speckey.core.registry
 * @type definition
 */
export enum RegistryErrorCode {
	DUPLICATE_FQN = "DUPLICATE_FQN",
	NOT_FOUND = "NOT_FOUND",
	INVALID_FQN = "INVALID_FQN",
}

/**
 * Error thrown by registry operations.
 *
 * @address speckey.core.registry
 * @type definition
 */
export class RegistryError extends Error {
	constructor(
		public readonly code: RegistryErrorCode,
		message: string,
		public readonly fqn: string
	) {
		super(message);
		this.name = "RegistryError";
	}
}

/**
 * Classification of class spec persistence behavior.
 *
 * @address speckey.parser.class
 * @type reference
 */
export enum ClassSpecType {
	DEFINITION = "definition",
	REFERENCE = "reference",
	EXTERNAL = "external",
}

/**
 * Type parameter on a generic class.
 *
 * @address speckey.parser.class
 * @type reference
 */
export interface TypeParam {
	name: string;
	extends?: string;
}

/**
 * A method parameter.
 *
 * @address speckey.parser.class
 * @type reference
 */
export interface Parameter {
	name: string;
	type: string;
	optional: boolean;
	defaultValue?: string;
	isGeneric: boolean;
	typeVar?: string;
	references: string[];
}

/**
 * A class method.
 *
 * @address speckey.parser.class
 * @type reference
 */
export interface Method {
	name: string;
	params: Parameter[];
	returnType: string;
	visibility: string;
	isAbstract: boolean;
	isStatic: boolean;
	references: string[];
}

/**
 * A class property.
 *
 * @address speckey.parser.class
 * @type reference
 */
export interface Property {
	name: string;
	type: string;
	visibility: string;
	isStatic: boolean;
	references: string[];
}

/**
 * A class relationship.
 *
 * @address speckey.parser.class
 * @type reference
 */
export interface Relationship {
	type: string;
	target: string;
	label?: string;
}

/**
 * Complete class specification built from a parsed class diagram entry.
 *
 * @address speckey.parser.class
 * @type reference
 */
export interface ClassSpec {
	fqn: string;
	package: string;
	name: string;
	specType: ClassSpecType;
	stereotype: string;
	isGeneric: boolean;
	typeParams: TypeParam[];
	methods: Method[];
	properties: Property[];
	relationships: Relationship[];
	specFile: string;
	specLine: number;
	unresolvedTypes: string[];
	externalDeps: string[];
}
