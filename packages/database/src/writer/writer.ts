import type { ClassSpec } from "@speckey/core";
import type { Transaction } from "../transaction";
import { TransactionManager } from "../transaction";
import { OperationType } from "../transaction";
import type {
	WriteConfig,
	WriteResult,
	WriteError,
	EntityWriteOp,
	BackupResult,
	OrphanResult,
	EntityInDgraph,
} from "./types";
import { WriteErrorCode, WriteOperation, OrphanPolicy } from "./types";

/**
 * Writes validated ClassSpec entities to Dgraph. Maps in-memory ClassSpec fields
 * to Dgraph spec_* fields, preserves user_* fields on update, detects orphaned
 * entities, and produces a write summary.
 *
 * @address speckey.database.writer
 * @type definition
 */
export class DgraphWriter {
	private transactionManager = new TransactionManager();

	/**
	 * Write all definition ClassSpecs to Dgraph in a single transaction.
	 */
	write(classSpecs: ClassSpec[], config: WriteConfig): WriteResult {
		const errors: WriteError[] = [];
		let inserted = 0;
		let updated = 0;
		let deleted = 0;
		const orphanedFqns: string[] = [];

		// Backup if configured
		if (config.backupBeforeWrite) {
			const backupResult = this.backup(config.dbPath);
			if (!backupResult.success) {
				errors.push({
					code: WriteErrorCode.BACKUP_FAILED,
					message: backupResult.error ?? "Backup failed",
					fqn: "",
					operation: WriteOperation.INSERT,
				});
			}
		}

		// Begin transaction
		const tx = this.transactionManager.begin();

		try {
			// Upsert each entity
			for (const spec of classSpecs) {
				const result = this.upsertEntity(spec, tx);

				if (result.success) {
					if (result.operation === WriteOperation.INSERT) inserted++;
					else if (result.operation === WriteOperation.UPDATE) updated++;
				} else if (result.error) {
					errors.push(result.error);
				}
			}

			// Detect orphans
			const parsedFqns = classSpecs.map(s => s.fqn);
			const orphanResult = this.detectOrphans(parsedFqns);

			if (orphanResult.count > 0) {
				for (const orphan of orphanResult.orphanedEntities) {
					orphanedFqns.push(orphan.spec_fqn);
				}

				const orphanOps = this.applyOrphanPolicy(orphanResult.orphanedEntities, config.orphanedEntities);
				for (const op of orphanOps) {
					if (op.success && op.operation === WriteOperation.DELETE) {
						deleted++;
					} else if (op.error) {
						errors.push(op.error);
					}
				}
			}

			// Commit
			const commitResult = this.transactionManager.commit(tx);
			if (!commitResult.success) {
				errors.push({
					code: WriteErrorCode.COMMIT_FAILED,
					message: commitResult.error ?? "Commit failed",
					fqn: "",
					operation: WriteOperation.INSERT,
				});
			}

			// Rebuild indexes
			try {
				this.rebuildIndexes();
			} catch {
				errors.push({
					code: WriteErrorCode.INDEX_REBUILD_FAILED,
					message: "Index rebuild failed",
					fqn: "",
					operation: WriteOperation.INSERT,
				});
			}
		} catch (error) {
			this.transactionManager.rollback(tx);
			errors.push({
				code: WriteErrorCode.COMMIT_FAILED,
				message: error instanceof Error ? error.message : String(error),
				fqn: "",
				operation: WriteOperation.INSERT,
			});
		}

		return {
			inserted,
			updated,
			orphaned: orphanedFqns.length,
			deleted,
			total: classSpecs.length,
			errors,
			orphanedEntities: orphanedFqns,
		};
	}

	/**
	 * Create timestamped backup of database before write.
	 */
	backup(dbPath: string): BackupResult {
		// Dgraph backup integration point
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
		const backupPath = `${dbPath}/backup-${timestamp}`;

		return {
			success: true,
			backupPath,
		};
	}

	private upsertEntity(spec: ClassSpec, tx: Transaction): EntityWriteOp {
		const existing = this.lookupByFqn(spec.fqn);

		if (existing) {
			return this.updateEntity(spec, existing.uid, tx);
		}
		return this.insertEntity(spec, tx);
	}

	private insertEntity(spec: ClassSpec, tx: Transaction): EntityWriteOp {
		try {
			const mutation = this.mapToMutation(spec);
			// Dgraph insert integration point
			const uid = `_:${spec.fqn}`;

			tx.addOperation({
				type: OperationType.INSERT,
				entityFqn: spec.fqn,
				uid,
				timestamp: new Date(),
			});

			return { fqn: spec.fqn, operation: WriteOperation.INSERT, success: true, uid };
		} catch (error) {
			return {
				fqn: spec.fqn,
				operation: WriteOperation.INSERT,
				success: false,
				uid: "",
				error: {
					code: WriteErrorCode.INSERT_FAILED,
					message: error instanceof Error ? error.message : String(error),
					fqn: spec.fqn,
					operation: WriteOperation.INSERT,
				},
			};
		}
	}

	private updateEntity(spec: ClassSpec, existingUid: string, tx: Transaction): EntityWriteOp {
		try {
			const existing = this.lookupByFqn(spec.fqn);
			const mutation = this.mapToMutation(spec);
			const merged = existing ? this.preserveUserFields(existing, mutation) : mutation;
			// Dgraph update integration point

			tx.addOperation({
				type: OperationType.UPDATE,
				entityFqn: spec.fqn,
				uid: existingUid,
				timestamp: new Date(),
			});

			return { fqn: spec.fqn, operation: WriteOperation.UPDATE, success: true, uid: existingUid };
		} catch (error) {
			return {
				fqn: spec.fqn,
				operation: WriteOperation.UPDATE,
				success: false,
				uid: existingUid,
				error: {
					code: WriteErrorCode.UPDATE_FAILED,
					message: error instanceof Error ? error.message : String(error),
					fqn: spec.fqn,
					operation: WriteOperation.UPDATE,
				},
			};
		}
	}

	private lookupByFqn(_fqn: string): EntityInDgraph | undefined {
		// Dgraph query integration point
		return undefined;
	}

	private mapToMutation(spec: ClassSpec): EntityInDgraph {
		return {
			uid: "",
			spec_fqn: spec.fqn,
			spec_address: spec.package,
			spec_name: spec.name,
			spec_entity_type: String(spec.specType),
			spec_stereotype: spec.stereotype,
			spec_is_generic: spec.isGeneric,
			spec_type_params: spec.typeParams,
			spec_methods: spec.methods,
			spec_properties: spec.properties,
			spec_relationships: spec.relationships,
			spec_external_deps: spec.externalDeps,
			spec_source_file: spec.specFile,
			spec_source_line: spec.specLine,
			spec_last_updated: new Date(),
			user_comments: [],
			user_rationale: "",
			user_examples: [],
			user_tags: [],
			user_metadata: {},
		};
	}

	private preserveUserFields(existing: EntityInDgraph, mutation: EntityInDgraph): EntityInDgraph {
		return {
			...mutation,
			user_comments: existing.user_comments,
			user_rationale: existing.user_rationale,
			user_examples: existing.user_examples,
			user_tags: existing.user_tags,
			user_metadata: existing.user_metadata,
		};
	}

	private detectOrphans(_parsedFqns: string[]): OrphanResult {
		// Dgraph query integration point: query all entities, compare with parsedFqns
		return { orphanedEntities: [], count: 0 };
	}

	private applyOrphanPolicy(orphans: EntityInDgraph[], policy: OrphanPolicy): EntityWriteOp[] {
		if (policy === OrphanPolicy.KEEP) {
			return [];
		}

		if (policy === OrphanPolicy.WARN) {
			return [];
		}

		// DELETE policy
		return orphans.map(orphan => ({
			fqn: orphan.spec_fqn,
			operation: WriteOperation.DELETE,
			success: true,
			uid: orphan.uid,
		}));
	}

	private rebuildIndexes(): void {
		// Dgraph index rebuild integration point
	}
}
