import type { Operation } from "./types";
import { TransactionStatus } from "./types";

/**
 * Represents an active database transaction. Tracks all operations performed within it.
 *
 * @address speckey.database.transaction
 * @type definition
 */
export class Transaction {
	readonly id: string;
	readonly startTime: Date;
	status: TransactionStatus;
	readonly operations: Operation[] = [];

	constructor(id: string) {
		this.id = id;
		this.startTime = new Date();
		this.status = TransactionStatus.ACTIVE;
	}

	/**
	 * Record an operation within this transaction.
	 * Throws if the transaction is not ACTIVE.
	 */
	addOperation(op: Operation): void {
		if (this.status !== TransactionStatus.ACTIVE) {
			throw new Error(`Cannot add operation to transaction in status: ${this.status}`);
		}
		this.operations.push(op);
	}
}
