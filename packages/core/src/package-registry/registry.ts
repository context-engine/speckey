import type { ClassSpec } from "./types";
import { RegistryError, RegistryErrorCode } from "./types";

/**
 * FQN format: non-empty, alphanumeric segments separated by single dots, underscores allowed.
 */
const FQN_PATTERN = /^[a-zA-Z_][\w]*(\.[a-zA-Z_][\w]*)*$/;

/**
 * In-memory registry that stores built class specs by FQN.
 * Created once per parse session by ParsePipeline and shared across all diagram processors.
 *
 * @address speckey.core.registry
 * @type definition
 */
export class PackageRegistry {
	private specs: Map<string, ClassSpec> = new Map();

	/**
	 * Validates FQN format, then stores class spec.
	 * Throws INVALID_FQN if malformed, DUPLICATE_FQN if already exists.
	 */
	register(spec: ClassSpec): void {
		this.validateFQN(spec.fqn);

		if (this.specs.has(spec.fqn)) {
			throw new RegistryError(
				RegistryErrorCode.DUPLICATE_FQN,
				`Class spec with FQN "${spec.fqn}" is already registered`,
				spec.fqn
			);
		}

		this.specs.set(spec.fqn, spec);
	}

	/**
	 * Get class spec by FQN. Returns undefined if not found.
	 */
	lookup(fqn: string): ClassSpec | undefined {
		return this.specs.get(fqn);
	}

	/**
	 * Check if FQN is registered.
	 */
	exists(fqn: string): boolean {
		return this.specs.has(fqn);
	}

	/**
	 * Validates FQN format: non-empty, alphanumeric + dots + underscores, no double dots.
	 * Throws INVALID_FQN if malformed.
	 */
	validateFQN(fqn: string): void {
		if (!fqn || !FQN_PATTERN.test(fqn)) {
			throw new RegistryError(
				RegistryErrorCode.INVALID_FQN,
				`Invalid FQN format: "${fqn}"`,
				fqn
			);
		}
	}

	/**
	 * Get all class specs in a package.
	 */
	listByPackage(packageName: string): ClassSpec[] {
		const results: ClassSpec[] = [];
		for (const spec of this.specs.values()) {
			if (spec.package === packageName) {
				results.push(spec);
			}
		}
		return results;
	}

	/**
	 * Get all registered class specs.
	 */
	getAll(): ClassSpec[] {
		return Array.from(this.specs.values());
	}

	/**
	 * Count of registered class specs.
	 */
	size(): number {
		return this.specs.size;
	}

	/**
	 * Remove all class specs.
	 */
	clear(): void {
		this.specs.clear();
	}
}
