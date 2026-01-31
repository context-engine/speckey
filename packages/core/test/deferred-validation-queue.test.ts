import { describe, expect, it, beforeEach } from "bun:test";
import { DeferredValidationQueue, type DeferredEntry } from "../src/deferred-validation-queue";

/**
 * Helper to create a DeferredEntry.
 */
function makeEntry(overrides: Partial<DeferredEntry> = {}): DeferredEntry {
	return {
		diagramType: "class",
		entityFqn: "say2.core.Session",
		payload: { target: "say2.core.Unknown" },
		...overrides,
	};
}

describe("DeferredValidationQueue", () => {
	let queue: DeferredValidationQueue;

	beforeEach(() => {
		queue = new DeferredValidationQueue();
	});

	// ─── DVQ-100: Enqueue Entries ───

	describe("Feature: Enqueue Entries", () => {
		it("should enqueue a single entry", () => {
			queue.enqueue(makeEntry());
			expect(queue.getCount()).toBe(1);
		});

		it("should enqueue multiple entries", () => {
			for (let i = 0; i < 5; i++) {
				queue.enqueue(makeEntry({ entityFqn: `pkg.Class${i}` }));
			}
			expect(queue.getCount()).toBe(5);
		});

		it("should preserve entry order", () => {
			const a = makeEntry({ entityFqn: "a.A" });
			const b = makeEntry({ entityFqn: "b.B" });
			const c = makeEntry({ entityFqn: "c.C" });

			queue.enqueue(a);
			queue.enqueue(b);
			queue.enqueue(c);

			const drained = queue.drain();
			expect(drained[0]).toBe(a);
			expect(drained[1]).toBe(b);
			expect(drained[2]).toBe(c);
		});

		it("should enqueue entries with different diagramTypes", () => {
			queue.enqueue(makeEntry({ diagramType: "class" }));
			queue.enqueue(makeEntry({ diagramType: "sequence" }));

			expect(queue.getCount()).toBe(2);

			const drained = queue.drain();
			expect(drained[0]!.diagramType).toBe("class");
			expect(drained[1]!.diagramType).toBe("sequence");
		});
	});

	// ─── DVQ-200: Drain ───

	describe("Feature: Drain", () => {
		it("should return all entries", () => {
			queue.enqueue(makeEntry({ entityFqn: "a.A" }));
			queue.enqueue(makeEntry({ entityFqn: "b.B" }));
			queue.enqueue(makeEntry({ entityFqn: "c.C" }));

			const drained = queue.drain();
			expect(drained).toHaveLength(3);
		});

		it("should clear the queue after drain", () => {
			queue.enqueue(makeEntry());
			queue.enqueue(makeEntry());
			queue.enqueue(makeEntry());

			queue.drain();

			expect(queue.getCount()).toBe(0);
			expect(queue.drain()).toEqual([]);
		});

		it("should return empty array from empty queue", () => {
			const drained = queue.drain();
			expect(drained).toEqual([]);
			expect(queue.getCount()).toBe(0);
		});

		it("should preserve entry fields", () => {
			const entry: DeferredEntry = {
				diagramType: "class",
				entityFqn: "say2.mcp.SessionManager",
				payload: {
					rule: "MUST_EXIST_OR_EXTERNAL",
					targetFqn: "say2.core.Session",
					referenceType: "relationship",
				},
			};

			queue.enqueue(entry);
			const drained = queue.drain();

			expect(drained[0]).toEqual(entry);
		});
	});

	// ─── DVQ-300: Get Count ───

	describe("Feature: Get Count", () => {
		it("should return 0 for empty queue", () => {
			expect(queue.getCount()).toBe(0);
		});

		it("should reflect enqueued entries", () => {
			queue.enqueue(makeEntry());
			queue.enqueue(makeEntry());
			queue.enqueue(makeEntry());
			queue.enqueue(makeEntry());

			expect(queue.getCount()).toBe(4);
		});

		it("should return 0 after drain", () => {
			queue.enqueue(makeEntry());
			queue.enqueue(makeEntry());
			queue.enqueue(makeEntry());

			queue.drain();

			expect(queue.getCount()).toBe(0);
		});
	});

	// ─── DVQ-400: Clear ───

	describe("Feature: Clear", () => {
		it("should remove all entries", () => {
			queue.enqueue(makeEntry());
			queue.enqueue(makeEntry());
			queue.enqueue(makeEntry());

			queue.clear();

			expect(queue.getCount()).toBe(0);
			expect(queue.drain()).toEqual([]);
		});

		it("should be no-op on empty queue", () => {
			expect(() => queue.clear()).not.toThrow();
			expect(queue.getCount()).toBe(0);
		});

		it("should allow enqueue after clear", () => {
			queue.enqueue(makeEntry());
			queue.enqueue(makeEntry());
			queue.clear();

			queue.enqueue(makeEntry({ entityFqn: "new.Entry" }));
			expect(queue.getCount()).toBe(1);
		});
	});

	// ─── DVQ-500: Opaque Payload Handling ───

	describe("Feature: Opaque Payload Handling", () => {
		it("should store arbitrary payload without interpretation", () => {
			const entry = makeEntry({
				payload: {
					rule: "MUST_EXIST_OR_EXTERNAL",
					targetFqn: "say2.core.Session",
					referenceType: "relationship",
				},
			});

			queue.enqueue(entry);
			const drained = queue.drain();

			expect(drained[0]!.payload).toEqual({
				rule: "MUST_EXIST_OR_EXTERNAL",
				targetFqn: "say2.core.Session",
				referenceType: "relationship",
			});
		});

		it("should accept empty payload", () => {
			queue.enqueue(makeEntry({ payload: {} }));

			expect(queue.getCount()).toBe(1);

			const drained = queue.drain();
			expect(drained[0]!.payload).toEqual({});
		});

		it("should accept payload with nested objects", () => {
			const payload = {
				context: { file: "specs/manager.md", line: 15 },
				refs: ["a", "b"],
			};

			queue.enqueue(makeEntry({ payload }));
			const drained = queue.drain();

			expect(drained[0]!.payload).toEqual(payload);
		});
	});

	// ─── DVQ-600: Cross-File Accumulation ───

	describe("Feature: Cross-File Accumulation", () => {
		it("should accumulate entries across simulated file processing", () => {
			// File 1
			queue.enqueue(makeEntry({ entityFqn: "f1.A" }));
			queue.enqueue(makeEntry({ entityFqn: "f1.B" }));

			// File 2
			queue.enqueue(makeEntry({ entityFqn: "f2.C" }));
			queue.enqueue(makeEntry({ entityFqn: "f2.D" }));
			queue.enqueue(makeEntry({ entityFqn: "f2.E" }));

			expect(queue.getCount()).toBe(5);
			expect(queue.drain()).toHaveLength(5);
		});

		it("should preserve interleaved order from different files", () => {
			const f1a = makeEntry({ entityFqn: "f1.A" });
			const f2a = makeEntry({ entityFqn: "f2.A" });
			const f1b = makeEntry({ entityFqn: "f1.B" });

			queue.enqueue(f1a);
			queue.enqueue(f2a);
			queue.enqueue(f1b);

			const drained = queue.drain();
			expect(drained[0]).toBe(f1a);
			expect(drained[1]).toBe(f2a);
			expect(drained[2]).toBe(f1b);
		});

		it("should not clear between files", () => {
			// File 1
			queue.enqueue(makeEntry({ entityFqn: "f1.A" }));
			queue.enqueue(makeEntry({ entityFqn: "f1.B" }));
			expect(queue.getCount()).toBe(2);

			// File 2 — count continues
			queue.enqueue(makeEntry({ entityFqn: "f2.C" }));
			expect(queue.getCount()).toBe(3);
		});
	});

	// ─── DVQ-700: Edge Cases ───

	describe("Feature: Edge Cases", () => {
		it("should allow duplicate entries", () => {
			const entry = makeEntry();
			queue.enqueue(entry);
			queue.enqueue(entry);

			const drained = queue.drain();
			expect(drained).toHaveLength(2);
		});

		it("should allow enqueue after drain", () => {
			queue.enqueue(makeEntry({ entityFqn: "old.Entry" }));
			queue.drain();

			queue.enqueue(makeEntry({ entityFqn: "new.Entry" }));
			expect(queue.getCount()).toBe(1);

			const drained = queue.drain();
			expect(drained).toHaveLength(1);
			expect(drained[0]!.entityFqn).toBe("new.Entry");
		});
	});
});
