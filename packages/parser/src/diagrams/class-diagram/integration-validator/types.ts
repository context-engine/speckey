/**
 * Error codes for integration validation.
 *
 * @address speckey.parser.class.integrationValidator
 * @type definition
 */
export enum IntegrationErrorCode {
	UNRESOLVED_TYPE = "UNRESOLVED_TYPE",
	UNRESOLVED_RELATIONSHIP = "UNRESOLVED_RELATIONSHIP",
	MISSING_DEFINITION = "MISSING_DEFINITION",
	INVALID_PAYLOAD = "INVALID_PAYLOAD",
}

/**
 * Interpreted shape of the opaque DeferredEntry.payload for class diagram entries.
 *
 * @address speckey.parser.class.integrationValidator
 * @type definition
 */
export interface ClassDiagramPayload {
	target: string;
	payloadType: string;
	specFile: string;
	specLine: number;
}

/**
 * A resolved deferred entry — target was found in the registry.
 *
 * @address speckey.parser.class.integrationValidator
 * @type definition
 */
export interface ResolvedEntry {
	entityFqn: string;
	targetFqn: string;
	payloadType: string;
}

/**
 * An unresolved deferred entry — target was not found.
 *
 * @address speckey.parser.class.integrationValidator
 * @type definition
 */
export interface UnresolvedEntry {
	entityFqn: string;
	targetFqn: string;
	payloadType: string;
	specFile: string;
	specLine: number;
}

/**
 * An error encountered during integration validation.
 *
 * @address speckey.parser.class.integrationValidator
 * @type definition
 */
export interface IntegrationError {
	code: IntegrationErrorCode;
	message: string;
	entityFqn: string;
	targetFqn: string;
}

/**
 * Result of validating all deferred entries for class diagrams.
 *
 * @address speckey.parser.class.integrationValidator
 * @type definition
 */
export interface IntegrationValidationReport {
	resolved: ResolvedEntry[];
	unresolved: UnresolvedEntry[];
	errors: IntegrationError[];
}
