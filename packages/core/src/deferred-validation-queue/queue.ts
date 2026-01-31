import type { DeferredEntry } from "./types";

/**
 * Generic, diagram-agnostic queue that accumulates deferred entries during entity construction
 * for validation after all files are parsed. Stores opaque payloads — has no knowledge of
 * validation rules or diagram-specific types.
 *
 * @address speckey.core.deferredValidation
 * @type definition
 */
export class DeferredValidationQueue {
	private entries: DeferredEntry[] = [];

	/**
	 * Append a deferred entry to the queue.
	 */
	enqueue(entry: DeferredEntry): void {
		this.entries.push(entry);
	}

	/**
	 * Return all entries and clear the queue. Called once by pipeline in Phase 4.
	 */
	drain(): DeferredEntry[] {
		const result = this.entries;
		this.entries = [];
		return result;
	}

	/**
	 * Count of entries currently in queue.
	 */
	getCount(): number {
		return this.entries.length;
	}

	/**
	 * Remove all entries.
	 */
	clear(): void {
		this.entries = [];
	}
}
