import type { ClassSpec, TypeParam, Method, Property, Relationship } from "@speckey/core";

/**
 * Orphan handling policy.
 *
 * @address speckey.database.writer
 * @type definition
 */
export enum OrphanPolicy {
	KEEP = "keep",
	WARN = "warn",
	DELETE = "delete",
}

/**
 * Write error codes.
 *
 * @address speckey.database.writer
 * @type definition
 */
export enum WriteErrorCode {
	CONNECTION_FAILED = "CONNECTION_FAILED",
	BACKUP_FAILED = "BACKUP_FAILED",
	INSERT_FAILED = "INSERT_FAILED",
	UPDATE_FAILED = "UPDATE_FAILED",
	DELETE_FAILED = "DELETE_FAILED",
	COMMIT_FAILED = "COMMIT_FAILED",
	INDEX_REBUILD_FAILED = "INDEX_REBUILD_FAILED",
}

/**
 * Write operation type.
 *
 * @address speckey.database.writer
 * @type definition
 */
export enum WriteOperation {
	INSERT = "insert",
	UPDATE = "update",
	DELETE = "delete",
}

/**
 * Configuration for a write operation.
 *
 * @address speckey.database.writer
 * @type definition
 */
export interface WriteConfig {
	dbPath: string;
	orphanedEntities: OrphanPolicy;
	backupBeforeWrite: boolean;
}

/**
 * Error encountered during a write operation.
 *
 * @address speckey.database.writer
 * @type definition
 */
export interface WriteError {
	code: WriteErrorCode;
	message: string;
	fqn: string;
	operation: WriteOperation;
}

/**
 * Result of a write operation.
 *
 * @address speckey.database.writer
 * @type definition
 */
export interface WriteResult {
	inserted: number;
	updated: number;
	orphaned: number;
	deleted: number;
	total: number;
	errors: WriteError[];
	orphanedEntities: string[];
}

/**
 * Result of a single entity write operation.
 *
 * @address speckey.database.writer
 * @type definition
 */
export interface EntityWriteOp {
	fqn: string;
	operation: WriteOperation;
	success: boolean;
	uid: string;
	error?: WriteError;
}

/**
 * Result of a backup operation.
 *
 * @address speckey.database.writer
 * @type definition
 */
export interface BackupResult {
	success: boolean;
	backupPath: string;
	error?: string;
}

/**
 * Result of orphan detection.
 *
 * @address speckey.database.writer
 * @type definition
 */
export interface OrphanResult {
	orphanedEntities: EntityInDgraph[];
	count: number;
}

/**
 * Comment added by user via UI/API.
 */
export interface Comment {
	text: string;
	author: string;
	timestamp: Date;
}

/**
 * Usage example added by user via UI/API.
 */
export interface Example {
	title: string;
	code: string;
	language: string;
}

/**
 * Dgraph representation of an entity. Maps from ClassSpec with spec_* prefix
 * for parser-managed fields and user_* prefix for UI/API-managed fields.
 *
 * @address speckey.database.writer
 * @type definition
 */
export interface EntityInDgraph {
	uid: string;
	spec_fqn: string;
	spec_address: string;
	spec_name: string;
	spec_entity_type: string;
	spec_stereotype: string;
	spec_is_generic: boolean;
	spec_type_params: TypeParam[];
	spec_methods: Method[];
	spec_properties: Property[];
	spec_relationships: Relationship[];
	spec_external_deps: string[];
	spec_source_file: string;
	spec_source_line: number;
	spec_last_updated: Date;
	user_comments: Comment[];
	user_rationale: string;
	user_examples: Example[];
	user_tags: string[];
	user_metadata: Record<string, unknown>;
}
