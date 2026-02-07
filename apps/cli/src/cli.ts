import { extname } from "node:path";
import { ParsePipeline, type PipelineConfig, type PipelineResult } from "@speckey/core";
import type { WriteConfig } from "@speckey/database";
import { CLIErrors } from "@speckey/constants";
import { createLogger, createJsonLogger, type LogMode } from "@speckey/logger";
import { createProgram, parseArgs } from "./args";
import { ConfigLoader, DEFAULT_CONFIG } from "./config-loader";
import { Command, ExitCode, type OutputMode, type ParseOptions } from "./types";

/**
 * Main CLI class.
 */
export class CLI {
    private pipeline: ParsePipeline;

    constructor() {
        this.pipeline = new ParsePipeline();
    }

    /**
     * Run CLI with given arguments.
     * @returns Exit code
     */
    async run(args: string[]): Promise<number> {
        let options: ParseOptions;

        // Parse CLI arguments (unknown flags, missing subcommand, conflicting options → CONFIG_ERROR)
        try {
            options = parseArgs(args);
        } catch (error) {
            console.error(`Error: ${error instanceof Error ? error.message : error}`);
            return ExitCode.CONFIG_ERROR;
        }

        // Handle --help: display usage and exit (parseArgs sets help=true instead of exiting directly)
        if (options.help) {
            const program = createProgram();
            console.log(program.helpInformation());
            return ExitCode.SUCCESS;
        }

        // Handle --version: display version and exit
        if (options.version) {
            const program = createProgram();
            console.log(program.version());
            return ExitCode.SUCCESS;
        }

        // Create logger based on output mode
        const mode = this.getOutputMode(options);
        const LOG_MODE_MAP: Record<OutputMode, LogMode> = {
            quiet: "error",
            normal: "info",
            verbose: "debug",
            json: "debug",
        };
        const logger = mode === "json"
            ? createJsonLogger("speckey", LOG_MODE_MAP[mode])
            : createLogger("speckey", LOG_MODE_MAP[mode]);

        // Build configuration based on command
        let config: PipelineConfig;
        try {
            config = await this.buildConfig(options.command, options);
        } catch (error) {
            logger.error(`Config error: ${error instanceof Error ? error.message : error}`);
            return ExitCode.CONFIG_ERROR;
        }

        // Run pipeline — logger passed for streaming output
        const result = await this.pipeline.run(config, logger);

        // Determine exit code
        return this.getExitCode(options.command, result);
    }

    /**
     * Build PipelineConfig based on command and options.
     * - PARSE: skipValidation=true, no writeConfig
     * - VALIDATE: skipValidation=false, no writeConfig
     * - SYNC: skipValidation=false, writeConfig from options/config
     */
    async buildConfig(command: Command, options: ParseOptions): Promise<PipelineConfig> {
        let baseConfig: Omit<PipelineConfig, "paths">;

        if (options.noConfig) {
            baseConfig = { ...DEFAULT_CONFIG };
        } else {
            const configPath = options.configPath ?? ConfigLoader.findConfigFile();
            baseConfig = await ConfigLoader.load(configPath);
        }

        const merged = ConfigLoader.mergeWithCLI(baseConfig, options.exclude, options.include);

        // Single-file .md validation: if a single path with a file extension
        // is provided and it's not .md, give a clear error instead of a confusing
        // "no markdown files found" later.
        if (options.paths.length === 1) {
            const singlePath = options.paths[0];
            const ext = singlePath ? extname(singlePath) : "";
            if (ext && ext.toLowerCase() !== ".md") {
                throw new Error(CLIErrors.NOT_MARKDOWN(singlePath!));
            }
        }

        const config: PipelineConfig = {
            ...merged,
            paths: options.paths,
        };

        // Command-specific config flags
        switch (command) {
            case Command.PARSE:
                config.skipValidation = true;
                break;
            case Command.VALIDATE:
                config.skipValidation = false;
                break;
            case Command.SYNC: {
                config.skipValidation = false;
                const dbPath = options.dbPath;
                if (!dbPath) {
                    throw new Error(CLIErrors.DB_PATH_REQUIRED);
                }
                config.writeConfig = {
                    dbPath,
                    orphanedEntities: "keep",
                    backupBeforeWrite: true,
                } as WriteConfig;
                break;
            }
        }

        return config;
    }

    private getOutputMode(options: ParseOptions): OutputMode {
        if (options.json) return "json";
        if (options.quiet) return "quiet";
        if (options.verbose) return "verbose";
        return "normal";
    }

    private getExitCode(command: Command, result: PipelineResult): number {
        if (result.errors.length > 0) {
            return ExitCode.PARSE_ERROR;
        }

        if (result.stats.filesDiscovered === 0) {
            return ExitCode.PARSE_ERROR;
        }

        // Validate/sync: check validation report
        if (command === Command.VALIDATE || command === Command.SYNC) {
            if (result.validationReport && result.validationReport.unresolved.length > 0) {
                return ExitCode.PARSE_ERROR;
            }
        }

        return ExitCode.SUCCESS;
    }
}
