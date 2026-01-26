/**
 * Exit codes for CLI process.
 */
export enum ExitCode {
    SUCCESS = 0,
    PARSE_ERROR = 1,
    CONFIG_ERROR = 2,
}

/**
 * Parsed CLI arguments.
 */
export interface ParseOptions {
    paths: string[];
    configPath?: string;
    verbose: boolean;
    quiet: boolean;
    json: boolean;
    serial: boolean;
    noConfig: boolean;
    exclude: string[];
    help: boolean;
    version: boolean;
}

/**
 * Output mode for formatting.
 */
export type OutputMode = "normal" | "verbose" | "quiet" | "json";
