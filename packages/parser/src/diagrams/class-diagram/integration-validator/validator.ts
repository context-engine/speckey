import type { DeferredEntry, PackageRegistry } from "@speckey/core";
import type { Logger, AppLogObj } from "@speckey/logger";
import type {
	ClassDiagramPayload,
	IntegrationValidationReport,
	ResolvedEntry,
	UnresolvedEntry,
	IntegrationError,
} from "./types";
import { IntegrationErrorCode } from "./types";

/**
 * Stateless validator that checks cross-file references for class diagram deferred entries.
 * Receives drained DeferredEntry[] from ParsePipeline, interprets class-diagram-specific
 * payloads, and checks PackageRegistry for existence.
 *
 * @address speckey.parser.class.integrationValidator
 * @type definition
 */
export class IntegrationValidator {
	/**
	 * Validate all deferred entries for class diagram.
	 */
	validate(entries: DeferredEntry[], registry: PackageRegistry, logger?: Logger<AppLogObj>): IntegrationValidationReport {
		logger?.debug("Starting integration validation", { entryCount: entries.length });
		const resolved: ResolvedEntry[] = [];
		const unresolved: UnresolvedEntry[] = [];
		const errors: IntegrationError[] = [];

		for (const entry of entries) {
			const payload = this.interpretPayload(entry.payload);

			if (!payload) {
				errors.push({
					code: IntegrationErrorCode.INVALID_PAYLOAD,
					message: `Payload missing required 'target' field`,
					entityFqn: entry.entityFqn,
					targetFqn: "",
				});
				continue;
			}

			if (registry.exists(payload.target)) {
				resolved.push({
					entityFqn: entry.entityFqn,
					targetFqn: payload.target,
					payloadType: payload.payloadType,
				});
			} else {
				unresolved.push({
					entityFqn: entry.entityFqn,
					targetFqn: payload.target,
					payloadType: payload.payloadType,
					specFile: payload.specFile,
					specLine: payload.specLine,
				});

				errors.push({
					code: this.mapPayloadTypeToErrorCode(payload.payloadType),
					message: this.buildErrorMessage(payload.payloadType, payload.target, entry.entityFqn),
					entityFqn: entry.entityFqn,
					targetFqn: payload.target,
				});
			}
		}

		logger?.info("Integration validation complete", {
			resolved: resolved.length,
			unresolved: unresolved.length,
			errors: errors.length,
		});
		return { resolved, unresolved, errors };
	}

	private interpretPayload(payload: Record<string, unknown>): ClassDiagramPayload | null {
		const target = payload.target;
		if (typeof target !== "string" || !target) {
			return null;
		}

		return {
			target,
			payloadType: typeof payload.payloadType === "string" ? payload.payloadType : "unknown",
			specFile: typeof payload.specFile === "string" ? payload.specFile : "",
			specLine: typeof payload.specLine === "number" ? payload.specLine : 0,
		};
	}

	private mapPayloadTypeToErrorCode(payloadType: string): IntegrationErrorCode {
		switch (payloadType) {
			case "relationship":
				return IntegrationErrorCode.UNRESOLVED_RELATIONSHIP;
			case "definition_check":
				return IntegrationErrorCode.MISSING_DEFINITION;
			default:
				return IntegrationErrorCode.UNRESOLVED_TYPE;
		}
	}

	private buildErrorMessage(payloadType: string, target: string, entityFqn: string): string {
		switch (payloadType) {
			case "relationship":
				return `Relationship target "${target}" not found in registry (from ${entityFqn})`;
			case "definition_check":
				return `@type reference "${target}" has no corresponding definition`;
			default:
				return `Type "${target}" not found in registry (from ${entityFqn})`;
		}
	}
}
