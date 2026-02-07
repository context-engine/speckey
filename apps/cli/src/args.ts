import {
    Command as CommanderProgram,
    CommanderError,
} from "commander";
import { CLIDescriptions, CLIErrors } from "@speckey/constants";
import { Command, type ParseOptions } from "./types";

const VERSION = "0.1.0";

/**
 * Collect repeatable option values into an array.
 */
function collect(value: string, previous: string[]): string[] {
    return [...previous, value];
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
        .option("--db-path <path>", "database path (sync command)")
        .option("-v, --verbose", "show detailed output", false)
        .option("-q, --quiet", "show errors only", false)
        .option("--json", "output as JSON lines", false);
}

/**
 * Create the commander program with all subcommands.
 */
export function createProgram(): CommanderProgram {
    const program = new CommanderProgram();
    program
        .name("speckey")
        .description(CLIDescriptions.PROGRAM)
        .version(VERSION)
        .exitOverride()
        .configureOutput({
            writeOut: () => {},
            writeErr: () => {},
        });

    addSharedOptions(
        program
            .command("parse")
            .description(CLIDescriptions.PARSE)
            .argument("[paths...]", "paths to process"),
    );

    addSharedOptions(
        program
            .command("validate")
            .description(CLIDescriptions.VALIDATE)
            .argument("[paths...]", "paths to process"),
    );

    addSharedOptions(
        program
            .command("sync")
            .description(CLIDescriptions.SYNC)
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
        throw new Error(CLIErrors.CONFLICTING_FLAGS);
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

    // Register action handlers; they execute later when program.parse() is called.
    for (const cmd of program.commands) {
        const command = commandMap[cmd.name()];
        // Skip commander-internal commands (e.g. help) that aren't in our map.
        // Unknown user commands are caught later by the !result check (line 200).
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
        throw new Error(CLIErrors.MISSING_SUBCOMMAND);
    }

    return result;
}
