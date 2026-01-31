/**
 * A single deferred entry. The queue stores these as-is without interpreting the payload.
 *
 * @address speckey.core.deferredValidation
 * @type definition
 */
export interface DeferredEntry {
	/** Which diagram type produced this entry (e.g., "class"). Used by pipeline to route to the correct validator. */
	diagramType: string;
	/** FQN of the class spec that contains the unresolved reference. */
	entityFqn: string;
	/** Opaque payload — interpreted by diagram-specific validators, not the queue. */
	payload: Record<string, unknown>;
}
