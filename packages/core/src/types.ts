import type { Logger, AppLogObj } from "@speckey/logger";
import type { ValidatedMermaidBlock, TableNode, IntegrationValidationReport } from "@speckey/parser";
import type { UserErrorMessage } from "@speckey/constants";
import type { ClassSpec } from "./package-registry/types";
import type { WriteConfig, WriteResult } from "@speckey/database";

/**
 * Configuration for pipeline execution.
 */
export interface PipelineConfig {
    /**
     * Paths to parse (files or directories).
     */
    paths: string[];
    /**
     * Glob patterns to include.
     * Defaults to ["**\/*.md"]
     */
    include?: string[];
    /**
     * Glob patterns to exclude.
     * Defaults to ["**\/node_modules\/**"]
     */
    exclude?: string[];
    /**
     * File count warning threshold.
     * Defaults to 10000
     */
    maxFiles?: number;
    /**
     * Max file size in MB.
     * Defaults to 10
     */
    maxFileSizeMb?: number;
    /**
     * Database write configuration. If omitted, Phase 5 (write) is skipped.
     */
    writeConfig?: WriteConfig;
    /**
     * Skip Phase 4 integration validation (for incremental mode).
     */
    skipValidation?: boolean;
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG = {
    include: ["**/*.md"],
    exclude: ["**/node_modules/**"],
    maxFiles: 10000,
    maxFileSizeMb: 10,
} as const;

/**
 * Result for a single parsed file.
 */
export interface ParsedFile {
    /**
     * Absolute file path.
     */
    path: string;
    /**
     * Extracted mermaid blocks with routing info.
     */
    blocks: ValidatedMermaidBlock[];
    /**
     * Extracted markdown tables.
     */
    tables: TableNode[];
}

/**
 * Aggregated statistics for pipeline run.
 */
export interface PipelineStats {
    /**
     * Total files found.
     */
    filesDiscovered: number;
    /**
     * Files successfully read.
     */
    filesRead: number;
    /**
     * Files successfully parsed.
     */
    filesParsed: number;
    /**
     * Total mermaid blocks extracted.
     */
    blocksExtracted: number;
    /**
     * Total errors encountered.
     */
    errorsCount: number;
    /**
     * Total ClassSpec entities built across all files.
     */
    entitiesBuilt: number;
    /**
     * Entities inserted into database.
     */
    entitiesInserted: number;
    /**
     * Entities updated in database.
     */
    entitiesUpdated: number;
    /**
     * Integration validation errors.
     */
    validationErrors: number;
}

/**
 * Phase where an error occurred.
 */
export type PipelinePhase = "discovery" | "read" | "parse" | "extract" | "unit_validate" | "build" | "integration_validate" | "write";

/**
 * Error that occurred during pipeline execution.
 */
export interface PipelineError {
    /**
     * Phase where error occurred.
     */
    phase: PipelinePhase;
    /**
     * File path where error occurred.
     */
    path: string;
    /**
     * Raw system error message.
     */
    message: string;
    /**
     * System error code (e.g., ENOENT, EACCES).
     */
    code: string;
    /**
     * Human-friendly error description.
     */
    userMessage: UserErrorMessage;
}

/**
 * Aggregate result from pipeline.
 */
export interface PipelineResult {
    /**
     * Successfully parsed files.
     */
    files: ParsedFile[];
    /**
     * Errors by phase.
     */
    errors: PipelineError[];
    /**
     * Aggregated statistics.
     */
    stats: PipelineStats;
    /**
     * Built ClassSpec entities from Phase 3a.2.
     */
    classSpecs: ClassSpec[];
    /**
     * Integration validation report from Phase 4.
     */
    validationReport?: IntegrationValidationReport;
    /**
     * Database write result from Phase 5.
     */
    writeResult?: WriteResult;
}

/**
 * Pipeline contract for injectable pipeline implementations.
 */
export interface Pipeline {
    run(config: PipelineConfig, logger: Logger<AppLogObj>): Promise<PipelineResult>;
}
