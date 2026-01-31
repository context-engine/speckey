/**
 * Status of a database transaction.
 *
 * @address speckey.database.transaction
 * @type definition
 */
export enum TransactionStatus {
	ACTIVE = "active",
	COMMITTED = "committed",
	ROLLED_BACK = "rolled_back",
	FAILED = "failed",
}

/**
 * Type of database operation.
 *
 * @address speckey.database.transaction
 * @type definition
 */
export enum OperationType {
	INSERT = "insert",
	UPDATE = "update",
	DELETE = "delete",
}

/**
 * A single database operation within a transaction.
 *
 * @address speckey.database.transaction
 * @type definition
 */
export interface Operation {
	type: OperationType;
	entityFqn: string;
	uid: string;
	timestamp: Date;
}

/**
 * Result of committing a transaction.
 *
 * @address speckey.database.transaction
 * @type definition
 */
export interface CommitResult {
	success: boolean;
	operationCount: number;
	error?: string;
}

/**
 * Result of rolling back a transaction.
 *
 * @address speckey.database.transaction
 * @type definition
 */
export interface RollbackResult {
	success: boolean;
	rolledBackOperations: number;
	error?: string;
}
