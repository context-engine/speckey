import { ParsePipeline, type PipelineConfig, type PipelineResult } from "@speckey/core";
import { parseArgs } from "./args";
import { ConfigLoader, DEFAULT_CONFIG } from "./config-loader";
import { ProgressReporter } from "./progress-reporter";
import { ExitCode, type OutputMode, type ParseOptions } from "./types";

const VERSION = "0.1.0";

const HELP_TEXT = `
speckey - Parse markdown files for mermaid diagrams

Usage:
  speckey parse [paths...] [options]

Options:
  --config <path>   Use specific config file
  --exclude <glob>  Additional exclusion patterns (can be repeated)
  --verbose         Show detailed output
  --quiet           Show errors only
  --json            Output as JSON lines
  --serial          Process files sequentially
  --no-config       Skip config file loading
  --help            Show this help
  --version         Show version

Examples:
  speckey parse .
  speckey parse ./docs ./specs
  speckey parse . --exclude "*.test.md"
`.trim();

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

        try {
            options = parseArgs(args);
        } catch (error) {
            console.error(`Error: ${error instanceof Error ? error.message : error}`);
            return ExitCode.CONFIG_ERROR;
        }

        if (options.help) {
            console.log(HELP_TEXT);
            return ExitCode.SUCCESS;
        }

        if (options.version) {
            console.log(VERSION);
            return ExitCode.SUCCESS;
        }

        // Load configuration
        let config: PipelineConfig;
        try {
            config = await this.loadConfig(options);
        } catch (error) {
            console.error(`Config error: ${error instanceof Error ? error.message : error}`);
            return ExitCode.CONFIG_ERROR;
        }

        // Determine output mode
        const mode = this.getOutputMode(options);
        const reporter = new ProgressReporter(mode);

        // Run pipeline
        const result = await this.pipeline.run(config);

        // Display result
        this.displayResult(result, reporter, mode);

        // Determine exit code
        if (result.errors.length > 0) {
            return ExitCode.PARSE_ERROR;
        }

        if (result.stats.filesDiscovered === 0) {
            if (mode !== "quiet" && mode !== "json") {
                console.error("No files found");
            }
            return ExitCode.PARSE_ERROR;
        }

        return ExitCode.SUCCESS;
    }

    private async loadConfig(options: ParseOptions): Promise<PipelineConfig> {
        let baseConfig: Omit<PipelineConfig, "paths">;

        if (options.noConfig) {
            baseConfig = { ...DEFAULT_CONFIG };
        } else {
            const configPath = options.configPath ?? ConfigLoader.findConfigFile();
            baseConfig = await ConfigLoader.load(configPath);
        }

        const merged = ConfigLoader.mergeWithCLI(baseConfig, options.exclude);

        return {
            ...merged,
            paths: options.paths,
        };
    }

    private getOutputMode(options: ParseOptions): OutputMode {
        if (options.json) return "json";
        if (options.quiet) return "quiet";
        if (options.verbose) return "verbose";
        return "normal";
    }

    private displayResult(result: PipelineResult, reporter: ProgressReporter, mode: OutputMode): void {
        for (const error of result.errors) {
            reporter.error(error);
        }
        reporter.complete(result);
    }
}
