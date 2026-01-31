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
	 */
	addOperation(op: Operation): void {
		this.operations.push(op);
	}
}
