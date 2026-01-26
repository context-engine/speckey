import type { ParseOptions } from "./types";

/**
 * Default parse options.
 */
export const DEFAULT_PARSE_OPTIONS: ParseOptions = {
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
 * Parse CLI arguments into ParseOptions.
 *
 * @param args - Command-line arguments (without program name)
 * @returns Parsed options
 * @throws Error if unknown flag or missing value
 */
export function parseArgs(args: string[]): ParseOptions {
    const options: ParseOptions = { ...DEFAULT_PARSE_OPTIONS, paths: [], exclude: [] };

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
                case "--exclude": {
                    const value = args[i + 1];
                    if (!value || value.startsWith("-")) {
                        throw new Error("--exclude requires a value");
                    }
                    options.exclude.push(value);
                    i++;
                    break;
                }
                default:
                    throw new Error(`Unknown flag: ${flag}`);
            }
        } else if (arg.startsWith("-")) {
            throw new Error(`Unknown flag: ${arg}`);
        } else {
            options.paths.push(arg);
        }

        i++;
    }

    // Default to current directory if no paths specified
    if (options.paths.length === 0) {
        options.paths = ["."];
    }

    return options;
}
