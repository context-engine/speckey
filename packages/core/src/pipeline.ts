import { FileDiscovery } from "@speckey/io";
import { MarkdownParser } from "@speckey/parser";
import {
    DEFAULT_CONFIG,
    type ParsedFile,
    type PipelineConfig,
    type PipelineError,
    type PipelineResult,
    type PipelineStats,
} from "./types";

/**
 * Main orchestrator that runs the discover → read → parse pipeline.
 */
export class ParsePipeline {
    private fileDiscovery: FileDiscovery;
    private markdownParser: MarkdownParser;

    constructor() {
        this.fileDiscovery = new FileDiscovery();
        this.markdownParser = new MarkdownParser();
    }

    /**
     * Run the full parsing pipeline.
     *
     * @param config - Pipeline configuration
     * @returns Aggregated result with parsed files, errors, and stats
     */
    async run(config: PipelineConfig): Promise<PipelineResult> {
        const errors: PipelineError[] = [];
        const parsedFiles: ParsedFile[] = [];

        // Apply defaults
        const resolvedConfig = {
            include: config.include ?? [...DEFAULT_CONFIG.include],
            exclude: config.exclude ?? [...DEFAULT_CONFIG.exclude],
            maxFiles: config.maxFiles ?? DEFAULT_CONFIG.maxFiles,
            maxFileSizeMb: config.maxFileSizeMb ?? DEFAULT_CONFIG.maxFileSizeMb,
        };

        // Phase 1: Discover files for each path
        const discoveredFiles = await this.discover(
            config.paths,
            resolvedConfig,
            errors,
        );

        // Phase 1b: Read files
        const fileContents = await this.read(discoveredFiles, errors);

        // Phase 2: Parse each file
        const parseStats = this.parse(fileContents, parsedFiles, errors);

        // Aggregate stats
        const stats: PipelineStats = {
            filesDiscovered: discoveredFiles.length,
            filesRead: fileContents.length,
            filesParsed: parsedFiles.length,
            blocksExtracted: parseStats.blocksExtracted,
            errorsCount: errors.length,
        };

        return { files: parsedFiles, errors, stats };
    }

    /**
     * Discover files from all paths.
     */
    private async discover(
        paths: string[],
        config: {
            include: string[];
            exclude: string[];
            maxFiles: number;
            maxFileSizeMb: number;
        },
        errors: PipelineError[],
    ): Promise<string[]> {
        const allFiles: string[] = [];

        for (const rootDir of paths) {
            const result = await this.fileDiscovery.discover({
                rootDir,
                include: config.include,
                exclude: config.exclude,
                maxFiles: config.maxFiles,
                maxFileSizeMb: config.maxFileSizeMb,
            });

            // Collect discovery errors
            for (const err of result.errors) {
                errors.push({
                    phase: "discovery",
                    path: err.path,
                    message: err.message,
                    code: err.code,
                });
            }

            allFiles.push(...result.files);
        }

        return allFiles;
    }

    /**
     * Read file contents.
     */
    private async read(
        files: string[],
        errors: PipelineError[],
    ): Promise<{ path: string; content: string }[]> {
        const result = await this.fileDiscovery.readFiles(files);

        // Collect read errors
        for (const err of result.errors) {
            errors.push({
                phase: "read",
                path: err.path,
                message: err.message,
                code: err.code,
            });
        }

        return result.contents;
    }

    /**
     * Parse file contents.
     */
    private parse(
        contents: { path: string; content: string }[],
        parsedFiles: ParsedFile[],
        errors: PipelineError[],
    ): { blocksExtracted: number } {
        let blocksExtracted = 0;

        for (const file of contents) {
            const parseResult = this.markdownParser.parse(file.content, file.path);

            // Collect parse errors
            if (parseResult.errors.length > 0) {
                for (const err of parseResult.errors) {
                    errors.push({
                        phase: "parse",
                        path: file.path,
                        message: err.message,
                        code: `LINE_${err.line}`,
                    });
                }
                // Skip files with errors
                continue;
            }

            // Build ParsedFile
            parsedFiles.push({
                path: file.path,
                blocks: parseResult.routedBlocks,
                tables: parseResult.tables,
            });

            blocksExtracted += parseResult.routedBlocks.length;
        }

        return { blocksExtracted };
    }
}
