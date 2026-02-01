import { Command, type ParseOptions } from "./types";

/**
 * Valid command names.
 */
const VALID_COMMANDS = new Set(Object.values(Command));

/**
 * Default parse options.
 */
export const DEFAULT_PARSE_OPTIONS: Omit<ParseOptions, "command"> = {
    paths: ["."],
    verbose: false,
    quiet: false,
    json: false,
    serial: false,
    noConfig: false,
    exclude: [],
    help: false,
    version: false,
};

/**
 * Resolve subcommand from the first positional argument.
 *
 * @param arg - First positional argument
 * @returns Resolved Command
 * @throws Error if missing or unknown subcommand
 */
export function resolveCommand(arg: string | undefined): Command {
    if (!arg || arg.startsWith("-")) {
        throw new Error("Missing subcommand. Usage: speckey <parse|validate|sync> <path>");
    }

    if (!VALID_COMMANDS.has(arg as Command)) {
        throw new Error(`Unknown command "${arg}". Available: parse, validate, sync`);
    }

    return arg as Command;
}

/**
 * Parse CLI arguments into ParseOptions.
 *
 * Expects: speckey <command> [paths...] [options]
 * The first positional arg is the subcommand, rest are paths.
 *
 * @param args - Command-line arguments (without program name)
 * @returns Parsed options
 * @throws Error if unknown flag, missing value, or invalid subcommand
 */
export function parseArgs(args: string[]): ParseOptions {
    const options: ParseOptions = {
        ...DEFAULT_PARSE_OPTIONS,
        command: Command.PARSE,
        paths: [],
        exclude: [],
    };

    let commandResolved = false;
    let i = 0;

    while (i < args.length) {
        const arg = args[i];
        if (!arg) {
            i++;
            continue;
        }

        if (arg.startsWith("--")) {
            const flag = arg;

            switch (flag) {
                case "--help":
                    options.help = true;
                    break;
                case "--version":
                    options.version = true;
                    break;
                case "--verbose":
                    options.verbose = true;
                    break;
                case "--quiet":
                    options.quiet = true;
                    break;
                case "--json":
                    options.json = true;
                    break;
                case "--serial":
                    options.serial = true;
                    break;
                case "--no-config":
                    options.noConfig = true;
                    break;
                case "--config": {
                    const value = args[i + 1];
                    if (!value || value.startsWith("-")) {
                        throw new Error("--config requires a value");
                    }
                    options.configPath = value;
                    i++;
                    break;
                }
                case "--db-path": {
                    const value = args[i + 1];
                    if (!value || value.startsWith("-")) {
                        throw new Error("--db-path requires a value");
                    }
                    options.dbPath = value;
                    i++;
                    break;
                }
                case "--exclude": {
                    const value = args[i + 1];
                    if (!value || value.startsWith("-")) {
                        throw new Error("--exclude requires a value");
                    }
                    options.exclude.push(value);
                    i++;
                    break;
                }
                case "--workers": {
                    const value = args[i + 1];
                    if (!value || value.startsWith("-")) {
                        throw new Error("--workers requires a value");
                    }
                    const num = Number.parseInt(value, 10);
                    if (Number.isNaN(num) || num < 1 || num > 32) {
                        throw new Error("--workers must be a number between 1 and 32");
                    }
                    options.workers = num;
                    i++;
                    break;
                }
                default:
                    throw new Error(`Unknown flag: ${flag}`);
            }
        } else if (arg.startsWith("-") && arg.length === 2) {
            switch (arg) {
                case "-h":
                    options.help = true;
                    break;
                case "-v":
                    options.verbose = true;
                    break;
                case "-q":
                    options.quiet = true;
                    break;
                default:
                    throw new Error(`Unknown flag: ${arg}`);
            }
        } else if (arg.startsWith("-")) {
            throw new Error(`Unknown flag: ${arg}`);
        } else {
            if (!commandResolved) {
                options.command = resolveCommand(arg);
                commandResolved = true;
            } else {
                options.paths.push(arg);
            }
        }

        i++;
    }

    // Flag conflict check
    if (options.verbose && options.quiet) {
        throw new Error("Conflicting flags: --verbose and --quiet cannot be used together");
    }

    // --help and --version can appear without a subcommand
    if (!commandResolved && !options.help && !options.version) {
        throw new Error("Missing subcommand. Usage: speckey <parse|validate|sync> <path>");
    }

    // Default to current directory if no paths specified
    if (options.paths.length === 0) {
        options.paths = ["."];
    }

    return options;
}
