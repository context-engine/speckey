import type {
	ResolutionContext,
	ResolvedType,
	ResolvedMethod,
	ResolvedParameter,
	ResolvedProperty,
	ResolvedRelationship,
	GenericParts,
	ParsedMethodInput,
	ParsedParameterInput,
	ParsedPropertyInput,
	ParsedRelationshipInput,
} from "./types";
import { TypeCategory } from "./types";

const BUILT_IN_TYPES = new Set([
	"void",
	"string",
	"number",
	"boolean",
	"any",
	"unknown",
]);

/**
 * Stateless resolver that parses type strings and resolves custom types to FQNs.
 * Handles built-in, custom, generic, array, and union types with recursive resolution.
 *
 * @address speckey.parser.class.typeResolver
 * @type definition
 */
export class TypeResolver {
	private builtInTypes: Set<string> = BUILT_IN_TYPES;

	/**
	 * Resolve return types and parameter types for all methods.
	 */
	resolveMethodTypes(methods: ParsedMethodInput[], context: ResolutionContext): ResolvedMethod[] {
		return methods.map(method => {
			const returnType = this.resolveType(method.returnType, context);
			const params = method.parameters.map(p => this.resolveParameter(p, context));

			const references = this.collectReferences(returnType, params);

			return {
				name: method.name,
				returnType,
				params,
				visibility: method.visibility,
				isAbstract: method.isAbstract,
				isStatic: method.isStatic,
				references,
			};
		});
	}

	/**
	 * Resolve property types.
	 */
	resolvePropertyTypes(properties: ParsedPropertyInput[], context: ResolutionContext): ResolvedProperty[] {
		return properties.map(prop => {
			const type = this.resolveType(prop.type, context);

			return {
				name: prop.name,
				type,
				visibility: prop.visibility,
				isStatic: prop.isStatic,
				references: [...type.references],
			};
		});
	}

	/**
	 * Resolve relationship target FQNs.
	 */
	resolveRelationshipTargets(relationships: ParsedRelationshipInput[], context: ResolutionContext): ResolvedRelationship[] {
		return relationships.map(rel => this.resolveRelationship(rel, context));
	}

	/**
	 * Resolve a single type string. Entry point for recursive resolution.
	 */
	resolveType(typeString: string, context: ResolutionContext): ResolvedType {
		const trimmed = typeString.trim();

		if (!trimmed || this.isBuiltIn(trimmed)) {
			return {
				typeString: trimmed || "void",
				category: TypeCategory.BUILT_IN,
				references: [],
				isResolved: true,
				externalDeps: [],
			};
		}

		// Array type: T[]
		if (trimmed.endsWith("[]")) {
			const elementType = this.parseArrayType(trimmed);
			const resolved = this.resolveType(elementType, context);
			return {
				typeString: trimmed,
				category: TypeCategory.ARRAY,
				references: [...resolved.references],
				isResolved: resolved.isResolved,
				externalDeps: [...resolved.externalDeps],
			};
		}

		// Union type: A | B
		if (trimmed.includes("|")) {
			const members = this.parseUnionType(trimmed);
			const resolvedMembers = members.map(m => this.resolveType(m, context));
			const references = resolvedMembers.flatMap(r => r.references);
			const externalDeps = resolvedMembers.flatMap(r => r.externalDeps);
			const isResolved = resolvedMembers.every(r => r.isResolved);

			return {
				typeString: trimmed,
				category: TypeCategory.UNION,
				references: [...new Set(references)],
				isResolved,
				externalDeps: [...new Set(externalDeps)],
			};
		}

		// Generic type: Container<T, U>
		if (trimmed.includes("<") && trimmed.includes(">")) {
			const parts = this.parseGenericType(trimmed);
			const containerResolved = this.resolveType(parts.container, context);
			const paramResolutions = parts.typeParams.map(p => this.resolveType(p, context));

			const references = [
				...containerResolved.references,
				...paramResolutions.flatMap(r => r.references),
			];
			const externalDeps = [
				...containerResolved.externalDeps,
				...paramResolutions.flatMap(r => r.externalDeps),
			];
			const isResolved = containerResolved.isResolved && paramResolutions.every(r => r.isResolved);

			return {
				typeString: trimmed,
				category: TypeCategory.GENERIC,
				references: [...new Set(references)],
				isResolved,
				externalDeps: [...new Set(externalDeps)],
			};
		}

		// Custom class type
		return this.resolveCustomType(trimmed, context);
	}

	private isBuiltIn(typeName: string): boolean {
		return this.builtInTypes.has(typeName.toLowerCase());
	}

	private resolveCustomType(typeName: string, context: ResolutionContext): ResolvedType {
		// 1. Check current diagram classes
		const diagramFqn = context.currentDiagramClasses.get(typeName);
		if (diagramFqn) {
			return {
				typeString: typeName,
				category: TypeCategory.CUSTOM,
				references: [diagramFqn],
				isResolved: true,
				externalDeps: [],
			};
		}

		// 2. Check PackageRegistry by FQN (if typeName contains a dot, it's already an FQN)
		if (typeName.includes(".")) {
			const spec = context.registry.lookup(typeName);
			if (spec) {
				return {
					typeString: typeName,
					category: TypeCategory.CUSTOM,
					references: [typeName],
					isResolved: true,
					externalDeps: [],
				};
			}
		}

		// 3. Not found — enqueue to DeferredValidationQueue
		context.deferredQueue.enqueue({
			diagramType: "class",
			entityFqn: context.sourceEntityFqn,
			payload: {
				target: typeName,
				payloadType: "type_resolution",
				specFile: context.specFile,
				specLine: context.specLine,
			},
		});

		return {
			typeString: typeName,
			category: TypeCategory.CUSTOM,
			references: [],
			isResolved: false,
			externalDeps: [],
		};
	}

	private parseGenericType(typeString: string): GenericParts {
		const openIdx = typeString.indexOf("<");
		const container = typeString.slice(0, openIdx).trim();
		const inner = typeString.slice(openIdx + 1, typeString.lastIndexOf(">")).trim();

		// Split by comma, respecting nested generics
		const typeParams: string[] = [];
		let depth = 0;
		let current = "";

		for (const ch of inner) {
			if (ch === "<") depth++;
			else if (ch === ">") depth--;

			if (ch === "," && depth === 0) {
				typeParams.push(current.trim());
				current = "";
			} else {
				current += ch;
			}
		}
		if (current.trim()) {
			typeParams.push(current.trim());
		}

		return { container, typeParams };
	}

	private parseArrayType(typeString: string): string {
		return typeString.slice(0, -2).trim();
	}

	private parseUnionType(typeString: string): string[] {
		return typeString.split("|").map(s => s.trim()).filter(Boolean);
	}

	private resolveParameter(param: ParsedParameterInput, context: ResolutionContext): ResolvedParameter {
		const type = this.resolveType(param.type, context);

		return {
			name: param.name,
			type,
			optional: param.optional,
			defaultValue: param.defaultValue,
			isGeneric: param.isGeneric,
			typeVar: param.typeVar,
			references: [...type.references],
		};
	}

	private resolveRelationship(rel: ParsedRelationshipInput, context: ResolutionContext): ResolvedRelationship {
		const target = rel.target.trim();

		// FQN (contains dot) — lookup directly
		if (target.includes(".")) {
			const spec = context.registry.lookup(target);
			if (spec) {
				return { type: rel.type, targetFqn: target, label: rel.label, isResolved: true };
			}

			// Not found — enqueue
			context.deferredQueue.enqueue({
				diagramType: "class",
				entityFqn: context.sourceEntityFqn,
				payload: {
					target,
					payloadType: "relationship",
					specFile: context.specFile,
					specLine: context.specLine,
				},
			});

			return { type: rel.type, targetFqn: target, label: rel.label, isResolved: false };
		}

		// Bare class name — check current diagram
		const diagramFqn = context.currentDiagramClasses.get(target);
		if (diagramFqn) {
			return { type: rel.type, targetFqn: diagramFqn, label: rel.label, isResolved: true };
		}

		// Bare name not in current diagram — error (cross-file refs must use FQN)
		return { type: rel.type, targetFqn: target, label: rel.label, isResolved: false };
	}

	private collectReferences(returnType: ResolvedType, params: ResolvedParameter[]): string[] {
		const refs = new Set<string>(returnType.references);
		for (const p of params) {
			for (const r of p.references) {
				refs.add(r);
			}
		}
		return Array.from(refs);
	}
}
