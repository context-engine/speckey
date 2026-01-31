import type { ClassSpec, ClassSpecType, PackageRegistry } from "@speckey/core";
import type { ParsedClass, ParsedRelation } from "../types";
import type { ResolutionContext } from "../type-resolver";
import type {
	BuildContext,
	BuildResult,
	BuildError,
	BuildWarning,
	FqnValidation,
	ClassSpecValidation,
} from "./types";
import { BuildErrorCode, BuildWarningCode } from "./types";

const FQN_PATTERN = /^[a-zA-Z_][\w]*(\.[a-zA-Z_][\w]*)*$/;
const MAX_FQN_LENGTH = 255;

/**
 * Orchestrates ClassSpec construction from validated parsed classes.
 * Owns FQN construction, duplicate detection, and delegates type resolution to TypeResolver.
 *
 * @address speckey.parser.class.entityBuilder
 * @type definition
 */
export class EntityBuilder {
	/**
	 * Build class specs from all parsed classes in a file.
	 */
	buildClassSpecs(parsedClasses: ParsedClass[], relations: ParsedRelation[], context: BuildContext): BuildResult {
		const classSpecs: ClassSpec[] = [];
		const errors: BuildError[] = [];
		const warnings: BuildWarning[] = [];

		// Build currentDiagramClasses map first
		const diagramClasses = new Map<string, string>();
		for (const parsed of parsedClasses) {
			const pkg = parsed.annotations?.address;
			if (pkg) {
				const fqn = this.constructFqn(pkg, parsed.name);
				diagramClasses.set(parsed.name, fqn);
			}
		}
		context.currentDiagramClasses = diagramClasses;

		for (const parsed of parsedClasses) {
			const pkg = parsed.annotations?.address;
			if (!pkg) {
				errors.push({
					code: BuildErrorCode.INVALID_FQN,
					message: `Class "${parsed.name}" missing @address annotation`,
					fqn: parsed.name,
					specFile: context.specFile,
					specLine: parsed.startLine ?? 0,
				});
				continue;
			}

			const fqn = this.constructFqn(pkg, parsed.name);
			const validation = this.validateFqn(fqn);

			if (!validation.isValid) {
				errors.push({
					code: BuildErrorCode.INVALID_FQN,
					message: validation.error!,
					fqn,
					specFile: context.specFile,
					specLine: parsed.startLine ?? 0,
				});
				continue;
			}

			if (fqn.length > MAX_FQN_LENGTH) {
				warnings.push({
					code: BuildWarningCode.LONG_FQN,
					message: `FQN "${fqn}" exceeds ${MAX_FQN_LENGTH} characters`,
					fqn,
				});
			}

			const entityType = parsed.annotations?.entityType ?? "definition";

			// Handle reference class specs
			if (entityType === "reference") {
				this.handleReference(parsed, fqn, context);
				continue;
			}

			// Handle definition class specs
			if (this.checkDuplicate(fqn, context.registry)) {
				errors.push({
					code: BuildErrorCode.DUPLICATE_DEFINITION,
					message: `Class spec with FQN "${fqn}" is already registered`,
					fqn,
					specFile: context.specFile,
					specLine: parsed.startLine ?? 0,
				});
				continue;
			}

			// Resolve types
			const resolutionContext: ResolutionContext = {
				currentDiagramClasses: diagramClasses,
				registry: context.registry,
				deferredQueue: context.deferredQueue,
				sourceEntityFqn: fqn,
				specFile: context.specFile,
				specLine: parsed.startLine ?? 0,
			};

			const resolvedMethods = context.typeResolver.resolveMethodTypes(
				parsed.body.methods,
				resolutionContext
			);

			const resolvedProperties = context.typeResolver.resolvePropertyTypes(
				parsed.body.properties,
				resolutionContext
			);

			// Get relationships for this class from the relations array
			const classRelations = relations.filter(
				r => r.sourceClass === parsed.name || r.sourceClass === fqn
			);

			const relationshipInputs = classRelations.map(r => ({
				type: r.type,
				target: r.targetClass,
				label: r.label,
			}));

			const resolvedRelationships = context.typeResolver.resolveRelationshipTargets(
				relationshipInputs,
				resolutionContext
			);

			// Assemble ClassSpec
			const classSpec = this.assembleClassSpec(parsed, fqn, pkg, context.specFile, {
				methods: resolvedMethods,
				properties: resolvedProperties,
				relationships: resolvedRelationships,
			});

			// Validate ClassSpec
			const specValidation = this.validateClassSpec(classSpec);

			if (!specValidation.isValid) {
				for (const err of specValidation.errors) {
					errors.push({
						code: BuildErrorCode.MISSING_REQUIRED_FIELD,
						message: err,
						fqn,
						specFile: context.specFile,
						specLine: parsed.startLine ?? 0,
					});
				}
				continue;
			}

			for (const warn of specValidation.warnings) {
				warnings.push({
					code: BuildWarningCode.CIRCULAR_DEPENDENCY,
					message: warn,
					fqn,
				});
			}

			// Register in PackageRegistry
			context.registry.register(classSpec);
			classSpecs.push(classSpec);
		}

		return { classSpecs, errors, warnings };
	}

	private constructFqn(packageName: string, className: string): string {
		return `${packageName}.${className}`;
	}

	private validateFqn(fqn: string): FqnValidation {
		if (!fqn) {
			return { isValid: false, error: "FQN is empty" };
		}
		if (fqn.includes("..")) {
			return { isValid: false, error: `Double dots in FQN: "${fqn}"` };
		}
		if (!FQN_PATTERN.test(fqn)) {
			return { isValid: false, error: `Invalid FQN format: "${fqn}"` };
		}
		return { isValid: true };
	}

	private checkDuplicate(fqn: string, registry: PackageRegistry): boolean {
		return registry.exists(fqn);
	}

	private handleReference(parsedClass: ParsedClass, fqn: string, context: BuildContext): void {
		if (context.registry.exists(fqn)) {
			return;
		}

		context.deferredQueue.enqueue({
			diagramType: "class",
			entityFqn: fqn,
			payload: {
				target: fqn,
				payloadType: "definition_check",
				specFile: context.specFile,
				specLine: parsedClass.startLine ?? 0,
			},
		});
	}

	private assembleClassSpec(
		parsed: ParsedClass,
		fqn: string,
		pkg: string,
		specFile: string,
		resolved: {
			methods: { name: string; returnType: any; params: any[]; visibility: string; isAbstract: boolean; isStatic: boolean; references: string[] }[];
			properties: { name: string; type: any; visibility: string; isStatic: boolean; references: string[] }[];
			relationships: { type: string; targetFqn: string; label?: string; isResolved: boolean }[];
		}
	): ClassSpec {
		const allReferences = new Set<string>();
		const unresolvedTypes: string[] = [];
		const externalDeps: string[] = [];

		for (const m of resolved.methods) {
			for (const ref of m.references) allReferences.add(ref);
			if (!m.returnType.isResolved) unresolvedTypes.push(m.returnType.typeString);
			for (const p of m.params) {
				if (!p.type.isResolved) unresolvedTypes.push(p.type.typeString);
			}
		}

		for (const p of resolved.properties) {
			for (const ref of p.references) allReferences.add(ref);
			if (!p.type.isResolved) unresolvedTypes.push(p.type.typeString);
		}

		for (const r of resolved.relationships) {
			if (!r.isResolved) unresolvedTypes.push(r.targetFqn);
		}

		const specType: ClassSpecType = (parsed.annotations?.entityType as ClassSpecType) ?? "definition";

		return {
			fqn,
			package: pkg,
			name: parsed.name,
			specType,
			stereotype: parsed.stereotype,
			isGeneric: parsed.isGeneric,
			typeParams: parsed.typeParams.map(tp => ({ name: tp.name, extends: tp.extends })),
			methods: resolved.methods.map(m => ({
				name: m.name,
				params: m.params.map(p => ({
					name: p.name,
					type: p.type.typeString,
					optional: p.optional,
					defaultValue: p.defaultValue ?? "",
					isGeneric: p.isGeneric,
					typeVar: p.typeVar ?? "",
					references: p.references,
				})),
				returnType: m.returnType.typeString,
				visibility: m.visibility,
				isAbstract: m.isAbstract,
				isStatic: m.isStatic,
				references: m.references,
			})),
			properties: resolved.properties.map(p => ({
				name: p.name,
				type: p.type.typeString,
				visibility: p.visibility,
				isStatic: p.isStatic,
				references: p.references,
			})),
			relationships: resolved.relationships.map(r => ({
				type: r.type,
				target: r.targetFqn,
				label: r.label,
			})),
			specFile,
			specLine: parsed.startLine ?? 0,
			unresolvedTypes,
			externalDeps,
		};
	}

	private validateClassSpec(spec: ClassSpec): ClassSpecValidation {
		const errors: string[] = [];
		const warnings: string[] = [];

		if (!spec.fqn) errors.push("ClassSpec missing fqn");
		if (!spec.name) errors.push("ClassSpec missing name");
		if (!spec.package) errors.push("ClassSpec missing package");

		// Check for circular dependencies (self-referencing relationships)
		for (const rel of spec.relationships) {
			if (rel.target === spec.fqn) {
				warnings.push(`Circular dependency: "${spec.fqn}" references itself`);
			}
		}

		return {
			isValid: errors.length === 0,
			errors,
			warnings,
		};
	}
}
