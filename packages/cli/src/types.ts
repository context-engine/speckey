/**
 * CLI subcommand identifying which operation to perform.
 */
export enum Command {
    PARSE = "parse",
    VALIDATE = "validate",
    SYNC = "sync",
}

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
    command: Command;
    paths: string[];
    configPath?: string;
    dbPath?: string;
    verbose: boolean;
    quiet: boolean;
    json: boolean;
    serial: boolean;
    workers?: number;
    noConfig: boolean;
    include: string[];
    exclude: string[];
    help: boolean;
    version: boolean;
}

/**
 * Output mode for formatting.
 */
export type OutputMode = "normal" | "verbose" | "quiet" | "json";
