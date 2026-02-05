import {
    Command as CommanderProgram,
    CommanderError,
    InvalidArgumentError,
} from "commander";
import { Command, type ParseOptions } from "./types";

const VERSION = "0.1.0";

/**
 * Collect repeatable option values into an array.
 */
function collect(value: string, previous: string[]): string[] {
    return [...previous, value];
}

/**
 * Parse and validate --workers value.
 */
function parseWorkers(value: string): number {
    const n = Number.parseInt(value, 10);
    if (Number.isNaN(n) || n < 1 || n > 32) {
        throw new InvalidArgumentError("must be between 1 and 32");
    }
    return n;
}

/**
 * Add shared options to a subcommand.
 */
function addSharedOptions(cmd: CommanderProgram): CommanderProgram {
    return cmd
        .option("--config <path>", "use specific config file")
        .option("--no-config", "skip config file loading")
        .option(
            "--include <pattern>",
            "inclusion patterns (replaces defaults, repeatable)",
            collect,
            [],
        )
        .option(
            "--exclude <pattern>",
            "additional exclusion patterns (repeatable)",
            collect,
            [],
        )
        .option(
            "--workers <n>",
            "worker count (1-32, default: auto)",
            parseWorkers,
        )
        .option("--db-path <path>", "database path (sync command)")
        .option("-v, --verbose", "show detailed output", false)
        .option("-q, --quiet", "show errors only", false)
        .option("--json", "output as JSON lines", false)
        .option("--serial", "process files sequentially", false);
}

/**
 * Create the commander program with all subcommands.
 */
export function createProgram(): CommanderProgram {
    const program = new CommanderProgram();
    program
        .name("speckey")
        .description("Parse and validate mermaid class diagrams from markdown")
        .version(VERSION)
        .exitOverride()
        .configureOutput({
            writeOut: () => {},
            writeErr: () => {},
        });

    addSharedOptions(
        program
            .command("parse")
            .description("Parse markdown files (phases 1-3)")
            .argument("[paths...]", "paths to process"),
    );

    addSharedOptions(
        program
            .command("validate")
            .description("Parse and validate references (phases 1-4)")
            .argument("[paths...]", "paths to process"),
    );

    addSharedOptions(
        program
            .command("sync")
            .description("Parse, validate, and write to database (phases 1-5)")
            .argument("[paths...]", "paths to process"),
    );

    return program;
}

/**
 * Map commander-parsed options to our ParseOptions type.
 */
function buildParseOptions(
    command: Command,
    paths: string[],
    opts: Record<string, unknown>,
): ParseOptions {
    // Post-parse validation: conflicting flags
    if (opts.verbose && opts.quiet) {
        throw new Error(
            "Conflicting flags: --verbose and --quiet cannot be used together",
        );
    }

    const configValue = opts.config;

    return {
        command,
        paths: paths.length > 0 ? paths : ["."],
        configPath: typeof configValue === "string" ? configValue : undefined,
        dbPath: opts.dbPath as string | undefined,
        verbose: (opts.verbose as boolean) || false,
        quiet: (opts.quiet as boolean) || false,
        json: (opts.json as boolean) || false,
        serial: (opts.serial as boolean) || false,
        workers: opts.workers as number | undefined,
        noConfig: configValue === false,
        include: (opts.include as string[]) || [],
        exclude: (opts.exclude as string[]) || [],
        help: false,
        version: false,
    };
}

/**
 * Parse CLI arguments into ParseOptions using commander.
 *
 * @param args - Command-line arguments (without program name)
 * @returns Parsed options
 * @throws Error if unknown flag, missing value, or invalid subcommand
 */
export function parseArgs(args: string[]): ParseOptions {
    const program = createProgram();

    let result: ParseOptions | undefined;

    const commandMap: Record<string, Command> = {
        parse: Command.PARSE,
        validate: Command.VALIDATE,
        sync: Command.SYNC,
    };

    for (const cmd of program.commands) {
        const command = commandMap[cmd.name()];
        if (!command) continue;

        cmd.action((paths: string[], opts: Record<string, unknown>) => {
            result = buildParseOptions(command, paths, opts);
        });
    }

    try {
        program.parse(args, { from: "user" });
    } catch (err) {
        if (err instanceof CommanderError) {
            if (err.code === "commander.helpDisplayed") {
                return {
                    command: Command.PARSE,
                    paths: ["."],
                    verbose: false,
                    quiet: false,
                    json: false,
                    serial: false,
                    noConfig: false,
                    include: [],
                    exclude: [],
                    help: true,
                    version: false,
                };
            }
            if (err.code === "commander.version") {
                return {
                    command: Command.PARSE,
                    paths: ["."],
                    verbose: false,
                    quiet: false,
                    json: false,
                    serial: false,
                    noConfig: false,
                    include: [],
                    exclude: [],
                    help: false,
                    version: true,
                };
            }
            // Map commander error messages to our format
            throw new Error(err.message.replace(/^error: /, ""));
        }
        throw err;
    }

    if (!result) {
        throw new Error(
            "Missing subcommand. Usage: speckey <parse|validate|sync> <path>",
        );
    }

    return result;
}
