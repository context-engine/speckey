import { Transaction } from "./transaction";
import type { CommitResult, RollbackResult } from "./types";
import { TransactionStatus } from "./types";

let txCounter = 0;

/**
 * Creates and manages Dgraph transactions. Provides begin/commit/rollback lifecycle.
 * Actual Dgraph integration to be wired in when the database layer is connected.
 *
 * @address speckey.database.transaction
 * @type definition
 */
export class TransactionManager {
	/**
	 * Start a new transaction.
	 */
	begin(): Transaction {
		txCounter++;
		return new Transaction(`tx-${txCounter}-${Date.now()}`);
	}

	/**
	 * Commit all operations in the transaction.
	 */
	commit(tx: Transaction): CommitResult {
		if (tx.status !== TransactionStatus.ACTIVE) {
			return {
				success: false,
				operationCount: 0,
				error: `Cannot commit transaction in status: ${tx.status}`,
			};
		}

		try {
			// Dgraph commit integration point
			tx.status = TransactionStatus.COMMITTED;
			return {
				success: true,
				operationCount: tx.operations.length,
			};
		} catch (error) {
			tx.status = TransactionStatus.FAILED;
			return {
				success: false,
				operationCount: 0,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Roll back all operations, restore previous state.
	 */
	rollback(tx: Transaction): RollbackResult {
		if (tx.status !== TransactionStatus.ACTIVE) {
			return {
				success: false,
				rolledBackOperations: 0,
				error: `Cannot rollback transaction in status: ${tx.status}`,
			};
		}

		try {
			// Dgraph rollback integration point
			const opCount = tx.operations.length;
			tx.status = TransactionStatus.ROLLED_BACK;
			return {
				success: true,
				rolledBackOperations: opCount,
			};
		} catch (error) {
			tx.status = TransactionStatus.FAILED;
			return {
				success: false,
				rolledBackOperations: 0,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}
}
