import { FileDiscovery } from "@speckey/io";
import {
    MarkdownParser,
    MermaidValidator,
    ValidationDiagramRouter,
    ErrorSeverity,
} from "@speckey/parser";
import type { ExtractionResult, RoutedDiagrams, ValidatedMermaidBlock } from "@speckey/parser";
import type { Logger, AppLogObj } from "@speckey/logger";
import {
    DEFAULT_CONFIG,
    type ParsedFile,
    type PipelineConfig,
    type PipelineError,
    type PipelineResult,
} from "./types";

// --- Phase 3a+ imports (gated) ---
// import {
//     ClassExtractor,
//     ClassDiagramValidator,
//     EntityBuilder,
//     TypeResolver,
//     IntegrationValidator,
//     DiagramType,
// } from "@speckey/parser";
// import type { IntegrationValidationReport } from "@speckey/parser";
// import { DgraphWriter } from "@speckey/database";
// import type { WriteResult, WriteConfig } from "@speckey/database";
// import { ClassSpecType } from "./package-registry/types";
// import type { ClassSpec } from "./package-registry/types";
// import { PackageRegistry } from "./package-registry";
// import { DeferredValidationQueue } from "./deferred-validation-queue";
// import type { PipelineStats } from "./types";

/**
 * Main orchestrator that runs the full parse pipeline:
 * Phase 1 (discover) → Phase 2 (extract blocks) → Phase 3a (parse + build entities)
 * → Phase 4 (integration validation) → Phase 5 (database write).
 */
export class ParsePipeline {
    private fileDiscovery: FileDiscovery;
    private markdownParser: MarkdownParser;
    private mermaidValidator: MermaidValidator;
    private diagramRouter: ValidationDiagramRouter;
    // --- Phase 3a+ fields (gated) ---
    // private classExtractor: ClassExtractor;
    // private classDiagramValidator: ClassDiagramValidator;
    // private integrationValidator: IntegrationValidator;

    constructor() {
        this.fileDiscovery = new FileDiscovery();
        this.markdownParser = new MarkdownParser();
        this.mermaidValidator = new MermaidValidator();
        this.diagramRouter = new ValidationDiagramRouter();
        // --- Phase 3a+ (gated) ---
        // this.classExtractor = new ClassExtractor();
        // this.classDiagramValidator = new ClassDiagramValidator();
        // this.integrationValidator = new IntegrationValidator();
    }

    /**
     * Run the full parsing pipeline.
     */
    async run(config: PipelineConfig, logger?: Logger<AppLogObj>): Promise<PipelineResult> {
        const errors: PipelineError[] = [];

        // Create phase-scoped child loggers
        const discoveryLog = logger?.getSubLogger({ name: "discovery" });
        const parseLog = logger?.getSubLogger({ name: "parse" });

        // --- Phase 3a+ run variables (gated) ---
        // const allClassSpecs: ClassSpec[] = [];
        // const buildLog = logger?.getSubLogger({ name: "build" });
        // const validateLog = logger?.getSubLogger({ name: "validate" });
        // const writeLog = logger?.getSubLogger({ name: "write" });
        // const registry = new PackageRegistry();
        // const deferredQueue = new DeferredValidationQueue();
        // const typeResolver = new TypeResolver();

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
            discoveryLog,
        );

        // Phase 1b: Read files
        const fileContents = await this.read(discoveredFiles, resolvedConfig.maxFileSizeMb, errors, discoveryLog);

        // Phase 2a: Extract markdown structure (code blocks + tables)
        const extractedFiles = this.extractMarkdown(fileContents, errors, parseLog);

        // Phase 2b: Validate mermaid blocks, build ParsedFiles, route by diagram type
        const { parsedFiles, routedDiagrams, blocksExtracted } = await this.validateMermaid(extractedFiles, errors, parseLog);

        // --- PHASE GATE: early return while verifying components incrementally ---
        // Move this return past each phase as it is verified.
        return {
            files: parsedFiles,
            errors,
            stats: {
                filesDiscovered: discoveredFiles.length,
                filesRead: fileContents.length,
                filesParsed: parsedFiles.length,
                blocksExtracted,
                errorsCount: errors.length,
                entitiesBuilt: 0,
                entitiesInserted: 0,
                entitiesUpdated: 0,
                validationErrors: 0,
            },
            classSpecs: [],
        };
        // --- END PHASE GATE ---

        // // Phase 3a: For each file, extract class diagrams, validate, build entities
        // for (const file of parsedFiles) {
        //     this.buildEntities(file, registry, deferredQueue, typeResolver, allClassSpecs, errors, buildLog);
        // }

        // // Phase 4: Integration validation
        // let validationReport: IntegrationValidationReport | undefined;
        // if (!config.skipValidation) {
        //     const entries = deferredQueue.drain();
        //     validationReport = this.integrationValidator.validate(entries, registry, validateLog);
        //     for (const err of validationReport.errors) {
        //         errors.push({
        //             phase: "integration_validate",
        //             path: "",
        //             message: err.message,
        //             code: err.code,
        //             userMessage: [err.message], // TODO: add proper userMessage to integration validation errors
        //         });
        //     }
        // }

        // // Phase 5: Database write (only if validation passed and writeConfig provided)
        // let writeResult: WriteResult | undefined;
        // const validationPassed = !validationReport || validationReport.errors.length === 0;
        // if (config.writeConfig && validationPassed) {
        //     const definitions = allClassSpecs.filter(s => s.specType === ClassSpecType.DEFINITION);
        //     writeResult = this.writeToDatabase(definitions, config.writeConfig, errors, writeLog);
        // }

        // // Aggregate stats
        // const stats: PipelineStats = {
        //     filesDiscovered: discoveredFiles.length,
        //     filesRead: fileContents.length,
        //     filesParsed: parsedFiles.length,
        //     blocksExtracted: parseStats.blocksExtracted,
        //     errorsCount: errors.length,
        //     entitiesBuilt: allClassSpecs.length,
        //     entitiesInserted: writeResult?.inserted ?? 0,
        //     entitiesUpdated: writeResult?.updated ?? 0,
        //     validationErrors: validationReport?.errors.length ?? 0,
        // };

        // return { files: parsedFiles, errors, stats, classSpecs: allClassSpecs, validationReport, writeResult };
    }

    // TODO: Phase 3a — buildEntities (extract class diagrams, unit-validate, build entities)
    // TODO: Phase 5 — writeToDatabase (write definition entities to database)

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
        log?: Logger<AppLogObj>,
    ): Promise<string[]> {
        const allFiles: string[] = [];

        for (const rootDir of paths) {
            log?.debug("Discovering files", { rootDir });
            const result = await this.fileDiscovery.discover({
                rootDir,
                include: config.include,
                exclude: config.exclude,
                maxFiles: config.maxFiles,
                maxFileSizeMb: config.maxFileSizeMb,
            }, log);

            // Collect discovery errors
            for (const err of result.errors) {
                log?.warn("Discovery error", { path: err.path, code: err.code });
                errors.push({
                    phase: "discovery",
                    path: err.path,
                    message: err.message,
                    code: err.code,
                    userMessage: err.userMessage,
                });
            }

            allFiles.push(...result.files);
        }

        log?.info("Discovery complete", { filesFound: allFiles.length });
        return allFiles;
    }

    /**
     * Read file contents.
     */
    private async read(
        files: string[],
        maxFileSizeMb: number,
        errors: PipelineError[],
        log?: Logger<AppLogObj>,
    ): Promise<{ path: string; content: string }[]> {
        log?.debug("Reading files", { count: files.length });
        const result = await this.fileDiscovery.readFiles(files, maxFileSizeMb, log);

        // Collect read errors
        for (const err of result.errors) {
            log?.warn("Read error", { path: err.path, code: err.code });
            errors.push({
                phase: "read",
                path: err.path,
                message: err.message,
                code: err.code,
                userMessage: err.userMessage,
            });
        }

        log?.info("Read complete", { filesRead: result.contents.length });
        return result.contents;
    }

    /**
     * Phase 2a: Extract markdown structure (code blocks grouped by language + tables).
     * Files with ERROR-severity extraction errors are skipped.
     */
    private extractMarkdown(
        contents: { path: string; content: string }[],
        errors: PipelineError[],
        log?: Logger<AppLogObj>,
    ): ExtractionResult[] {
        const results: ExtractionResult[] = [];

        for (const file of contents) {
            log?.debug("Parsing file", { file: file.path });

            const extractionResult = this.markdownParser.parse(file.content, file.path, log);

            const extractionErrors = extractionResult.errors.filter(e => e.severity === ErrorSeverity.ERROR);
            if (extractionErrors.length > 0) {
                for (const err of extractionErrors) {
                    log?.warn("Parse error", { file: file.path, line: err.line });
                    errors.push({
                        phase: "parse",
                        path: file.path,
                        message: err.message,
                        code: `LINE_${err.line}`,
                        userMessage: [err.message],
                    });
                }
                continue;
            }

            results.push(extractionResult);
        }

        log?.info("Extraction complete", { filesExtracted: results.length });
        return results;
    }

    /**
     * Phase 2b: Validate mermaid blocks via mermaid.parse() and build ParsedFiles.
     */
    private async validateMermaid(
        extractedFiles: ExtractionResult[],
        errors: PipelineError[],
        log?: Logger<AppLogObj>,
    ): Promise<{ parsedFiles: ParsedFile[]; routedDiagrams: RoutedDiagrams; blocksExtracted: number }> {
        const parsedFiles: ParsedFile[] = [];
        const allValidatedBlocks: ValidatedMermaidBlock[] = [];
        let blocksExtracted = 0;

        for (const extraction of extractedFiles) {
            const mermaidBlocks = extraction.codeBlocks["mermaid"] ?? [];

            // Pipeline-level mermaid presence warnings
            const allBlockCount = Object.values(extraction.codeBlocks).reduce(
                (sum, blocks) => sum + blocks.length, 0,
            );
            if (mermaidBlocks.length === 0 && allBlockCount > 0) {
                log?.warn("File has code blocks but none are mermaid", { file: extraction.specFile });
            } else if (mermaidBlocks.length === 0) {
                log?.warn("No mermaid diagrams found in file", { file: extraction.specFile });
            }

            const validationResult = await this.mermaidValidator.validateAll(mermaidBlocks, extraction.specFile, log);

            for (const err of validationResult.errors.filter(e => e.severity === ErrorSeverity.ERROR)) {
                errors.push({
                    phase: "parse",
                    path: extraction.specFile,
                    message: err.message,
                    code: `LINE_${err.line}`,
                    userMessage: [err.message],
                });
            }

            parsedFiles.push({
                path: extraction.specFile,
                blocks: validationResult.validatedBlocks,
                tables: extraction.tables,
            });

            allValidatedBlocks.push(...validationResult.validatedBlocks);
            blocksExtracted += validationResult.validatedBlocks.length;
        }

        const routedDiagrams = this.diagramRouter.routeByDiagramType(allValidatedBlocks);

        log?.info("Parse complete", { filesParsed: parsedFiles.length, blocksExtracted });
        return { parsedFiles, routedDiagrams, blocksExtracted };
    }
}
