import type { RoutedBlock, TableNode } from "@speckey/parser";

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
    blocks: RoutedBlock[];
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
}

/**
 * Phase where an error occurred.
 */
export type PipelinePhase = "discovery" | "read" | "parse";

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
     * Error message.
     */
    message: string;
    /**
     * Error code (e.g., ENOENT, EACCES).
     */
    code: string;
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
}
