import { describe, expect, it, beforeEach } from "bun:test";
import { Transaction } from "../src/transaction/transaction";
import { TransactionManager } from "../src/transaction/manager";
import { TransactionStatus, OperationType } from "../src/transaction/types";
import type { Operation } from "../src/transaction/types";

function makeOperation(overrides: Partial<Operation> & { entityFqn: string }): Operation {
	return {
		type: OperationType.INSERT,
		uid: "uid-1",
		timestamp: new Date(),
		...overrides,
	};
}

describe("TransactionManager", () => {
	let manager: TransactionManager;

	beforeEach(() => {
		manager = new TransactionManager();
	});

	// ── TM-100: Begin Transaction ──

	describe("TM-100: Begin Transaction", () => {
		it("returns a transaction with ACTIVE status", () => {
			const tx = manager.begin();
			expect(tx).toBeInstanceOf(Transaction);
			expect(tx.status).toBe(TransactionStatus.ACTIVE);
		});

		it("returns transaction with empty operations", () => {
			const tx = manager.begin();
			expect(tx.operations).toEqual([]);
		});

		it("returns transaction with non-empty string id", () => {
			const tx = manager.begin();
			expect(typeof tx.id).toBe("string");
			expect(tx.id.length).toBeGreaterThan(0);
		});

		it("returns transaction with valid startTime", () => {
			const before = Date.now();
			const tx = manager.begin();
			const after = Date.now();
			expect(tx.startTime.getTime()).toBeGreaterThanOrEqual(before);
			expect(tx.startTime.getTime()).toBeLessThanOrEqual(after);
		});

		it("generates unique IDs across calls", () => {
			const tx1 = manager.begin();
			const tx2 = manager.begin();
			expect(tx1.id).not.toBe(tx2.id);
		});
	});

	// ── TM-200: Add Operations ──

	describe("TM-200: Add Operations", () => {
		it("adds a single operation", () => {
			const tx = manager.begin();
			const op = makeOperation({ entityFqn: "a.B" });
			tx.addOperation(op);
			expect(tx.operations).toHaveLength(1);
			expect(tx.operations[0].entityFqn).toBe("a.B");
		});

		it("adds multiple operations preserving order", () => {
			const tx = manager.begin();
			tx.addOperation(makeOperation({ entityFqn: "a.A" }));
			tx.addOperation(makeOperation({ entityFqn: "a.B" }));
			tx.addOperation(makeOperation({ entityFqn: "a.C" }));
			expect(tx.operations).toHaveLength(3);
			expect(tx.operations.map(o => o.entityFqn)).toEqual(["a.A", "a.B", "a.C"]);
		});

		it("preserves operation type and uid", () => {
			const tx = manager.begin();
			tx.addOperation(makeOperation({ entityFqn: "a.X", type: OperationType.UPDATE, uid: "0x99" }));
			expect(tx.operations[0].type).toBe(OperationType.UPDATE);
			expect(tx.operations[0].uid).toBe("0x99");
		});

		it("supports INSERT, UPDATE, DELETE types", () => {
			const tx = manager.begin();
			tx.addOperation(makeOperation({ entityFqn: "a.I", type: OperationType.INSERT }));
			tx.addOperation(makeOperation({ entityFqn: "a.U", type: OperationType.UPDATE }));
			tx.addOperation(makeOperation({ entityFqn: "a.D", type: OperationType.DELETE }));
			expect(tx.operations.map(o => o.type)).toEqual([
				OperationType.INSERT,
				OperationType.UPDATE,
				OperationType.DELETE,
			]);
		});

		it("records timestamp on each operation", () => {
			const tx = manager.begin();
			const before = new Date();
			tx.addOperation(makeOperation({ entityFqn: "a.T" }));
			expect(tx.operations[0].timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
		});
	});

	// ── TM-300: Commit ──

	describe("TM-300: Commit", () => {
		it("commits active transaction with operations", () => {
			const tx = manager.begin();
			tx.addOperation(makeOperation({ entityFqn: "a.A" }));
			tx.addOperation(makeOperation({ entityFqn: "a.B" }));
			tx.addOperation(makeOperation({ entityFqn: "a.C" }));
			const result = manager.commit(tx);
			expect(result.success).toBe(true);
			expect(result.operationCount).toBe(3);
			expect(tx.status).toBe(TransactionStatus.COMMITTED);
		});

		it("commits empty transaction (0 operations)", () => {
			const tx = manager.begin();
			const result = manager.commit(tx);
			expect(result.success).toBe(true);
			expect(result.operationCount).toBe(0);
			expect(tx.status).toBe(TransactionStatus.COMMITTED);
		});

		it("rejects commit on COMMITTED transaction", () => {
			const tx = manager.begin();
			manager.commit(tx);
			const result = manager.commit(tx);
			expect(result.success).toBe(false);
			expect(result.error).toBeTruthy();
			expect(tx.status).toBe(TransactionStatus.COMMITTED);
		});

		it("rejects commit on ROLLED_BACK transaction", () => {
			const tx = manager.begin();
			manager.rollback(tx);
			const result = manager.commit(tx);
			expect(result.success).toBe(false);
			expect(tx.status).toBe(TransactionStatus.ROLLED_BACK);
		});
	});

	// ── TM-400: Rollback ──

	describe("TM-400: Rollback", () => {
		it("rolls back active transaction with operations", () => {
			const tx = manager.begin();
			tx.addOperation(makeOperation({ entityFqn: "a.A" }));
			tx.addOperation(makeOperation({ entityFqn: "a.B" }));
			tx.addOperation(makeOperation({ entityFqn: "a.C" }));
			const result = manager.rollback(tx);
			expect(result.success).toBe(true);
			expect(result.rolledBackOperations).toBe(3);
			expect(tx.status).toBe(TransactionStatus.ROLLED_BACK);
		});

		it("rolls back empty transaction", () => {
			const tx = manager.begin();
			const result = manager.rollback(tx);
			expect(result.success).toBe(true);
			expect(result.rolledBackOperations).toBe(0);
			expect(tx.status).toBe(TransactionStatus.ROLLED_BACK);
		});

		it("rejects rollback on COMMITTED transaction", () => {
			const tx = manager.begin();
			manager.commit(tx);
			const result = manager.rollback(tx);
			expect(result.success).toBe(false);
			expect(result.error).toBeTruthy();
			expect(tx.status).toBe(TransactionStatus.COMMITTED);
		});

		it("rejects rollback on ROLLED_BACK transaction", () => {
			const tx = manager.begin();
			manager.rollback(tx);
			const result = manager.rollback(tx);
			expect(result.success).toBe(false);
			expect(tx.status).toBe(TransactionStatus.ROLLED_BACK);
		});
	});

	// ── TM-500: Status Transitions ──

	describe("TM-500: Status Transitions", () => {
		it("ACTIVE → COMMITTED on successful commit", () => {
			const tx = manager.begin();
			expect(tx.status).toBe(TransactionStatus.ACTIVE);
			manager.commit(tx);
			expect(tx.status).toBe(TransactionStatus.COMMITTED);
		});

		it("ACTIVE → ROLLED_BACK on successful rollback", () => {
			const tx = manager.begin();
			manager.rollback(tx);
			expect(tx.status).toBe(TransactionStatus.ROLLED_BACK);
		});

		it("terminal COMMITTED rejects commit", () => {
			const tx = manager.begin();
			manager.commit(tx);
			const r = manager.commit(tx);
			expect(r.success).toBe(false);
			expect(tx.status).toBe(TransactionStatus.COMMITTED);
		});

		it("terminal COMMITTED rejects rollback", () => {
			const tx = manager.begin();
			manager.commit(tx);
			const r = manager.rollback(tx);
			expect(r.success).toBe(false);
			expect(tx.status).toBe(TransactionStatus.COMMITTED);
		});

		it("terminal ROLLED_BACK rejects commit", () => {
			const tx = manager.begin();
			manager.rollback(tx);
			const r = manager.commit(tx);
			expect(r.success).toBe(false);
			expect(tx.status).toBe(TransactionStatus.ROLLED_BACK);
		});

		it("terminal FAILED rejects commit and rollback", () => {
			const tx = manager.begin();
			tx.status = TransactionStatus.FAILED;
			const c = manager.commit(tx);
			const r = manager.rollback(tx);
			expect(c.success).toBe(false);
			expect(r.success).toBe(false);
			expect(tx.status).toBe(TransactionStatus.FAILED);
		});
	});

	// ── TM-600: Invariants ──

	describe("TM-600: Invariants", () => {
		it("commit operationCount matches operations.length", () => {
			const tx = manager.begin();
			tx.addOperation(makeOperation({ entityFqn: "a.A" }));
			tx.addOperation(makeOperation({ entityFqn: "a.B" }));
			const result = manager.commit(tx);
			expect(result.operationCount).toBe(tx.operations.length);
		});

		it("rollback rolledBackOperations matches operations.length", () => {
			const tx = manager.begin();
			tx.addOperation(makeOperation({ entityFqn: "a.A" }));
			tx.addOperation(makeOperation({ entityFqn: "a.B" }));
			const result = manager.rollback(tx);
			expect(result.rolledBackOperations).toBe(tx.operations.length);
		});

		it("operations list preserved after commit", () => {
			const tx = manager.begin();
			tx.addOperation(makeOperation({ entityFqn: "a.A" }));
			tx.addOperation(makeOperation({ entityFqn: "a.B" }));
			manager.commit(tx);
			expect(tx.operations).toHaveLength(2);
			expect(tx.operations[0].entityFqn).toBe("a.A");
		});

		it("operations list preserved after rollback", () => {
			const tx = manager.begin();
			tx.addOperation(makeOperation({ entityFqn: "a.A" }));
			manager.rollback(tx);
			expect(tx.operations).toHaveLength(1);
		});
	});

	// ── TM-700: Edge Cases ──

	describe("TM-700: Edge Cases", () => {
		it("multiple begin calls return independent transactions", () => {
			const tx1 = manager.begin();
			const tx2 = manager.begin();
			tx1.addOperation(makeOperation({ entityFqn: "a.A" }));
			expect(tx1.operations).toHaveLength(1);
			expect(tx2.operations).toHaveLength(0);
		});

		it("commit after mixed operation types", () => {
			const tx = manager.begin();
			tx.addOperation(makeOperation({ entityFqn: "a.I1", type: OperationType.INSERT }));
			tx.addOperation(makeOperation({ entityFqn: "a.I2", type: OperationType.INSERT }));
			tx.addOperation(makeOperation({ entityFqn: "a.U1", type: OperationType.UPDATE }));
			tx.addOperation(makeOperation({ entityFqn: "a.D1", type: OperationType.DELETE }));
			const result = manager.commit(tx);
			expect(result.operationCount).toBe(4);
		});

		it("transaction preserves operation details after commit", () => {
			const tx = manager.begin();
			tx.addOperation(makeOperation({ entityFqn: "a.X", type: OperationType.INSERT, uid: "u1" }));
			tx.addOperation(makeOperation({ entityFqn: "a.Y", type: OperationType.DELETE, uid: "u2" }));
			manager.commit(tx);
			expect(tx.operations[0].entityFqn).toBe("a.X");
			expect(tx.operations[0].type).toBe(OperationType.INSERT);
			expect(tx.operations[1].uid).toBe("u2");
		});

		it("rapid sequential begin-commit cycles", () => {
			const results = [];
			for (let i = 0; i < 3; i++) {
				const tx = manager.begin();
				tx.addOperation(makeOperation({ entityFqn: `a.C${i}` }));
				results.push(manager.commit(tx));
			}
			expect(results.every(r => r.success)).toBe(true);
			expect(results.every(r => r.operationCount === 1)).toBe(true);
		});
	});
});
