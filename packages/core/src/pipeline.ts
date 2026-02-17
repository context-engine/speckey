import { FileDiscovery } from "@speckey/io";
import {
    MarkdownParser,
    MermaidValidator,
    ValidationDiagramRouter,
    ErrorSeverity,
} from "@speckey/parser";
import type { ExtractionResult, RoutedDiagrams, ValidatedMermaidBlock } from "@speckey/parser";
import type { Logger, AppLogObj } from "@speckey/logger";
import { PipelineEventBus, PipelineEvent } from "@speckey/event-bus";
import type { ErrorEventPayload, LogEventPayload, PhaseEventPayload } from "@speckey/event-bus";
import { PipelinePhase } from "@speckey/constants";
import { LogSubscriber } from "./log-subscriber";
import { ErrorSubscriber } from "./error-subscriber";
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
        // Per-run event bus and subscribers
        const bus = new PipelineEventBus();
        const errSub = new ErrorSubscriber();
        bus.on(PipelineEvent.ERROR, errSub.handle.bind(errSub));

        if (logger) {
            const logSub = new LogSubscriber(logger);
            const boundHandle = logSub.handle.bind(logSub);
            for (const type of Object.values(PipelineEvent)) {
                bus.on(type, boundHandle);
            }
        }

        // --- Phase 3a+ run variables (gated) ---
        // const allClassSpecs: ClassSpec[] = [];
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

        // Phase 1: Discover + Read
        bus.emit({ type: PipelineEvent.PHASE_START, phase: PipelinePhase.DISCOVERY, timestamp: Date.now() } as PhaseEventPayload);

        const discoveredFiles = await this.discover(config.paths, resolvedConfig, bus);
        const fileContents = await this.read(discoveredFiles, resolvedConfig.maxFileSizeMb, bus);

        bus.emit({ type: PipelineEvent.PHASE_END, phase: PipelinePhase.DISCOVERY, timestamp: Date.now(),
            stats: { filesFound: discoveredFiles.length, filesRead: fileContents.length } } as PhaseEventPayload);

        // Phase 2: Extract + Validate
        bus.emit({ type: PipelineEvent.PHASE_START, phase: PipelinePhase.PARSE, timestamp: Date.now() } as PhaseEventPayload);

        const extractedFiles = this.extractMarkdown(fileContents, bus);
        const { parsedFiles, routedDiagrams, blocksExtracted } = await this.validateMermaid(extractedFiles, bus);

        bus.emit({ type: PipelineEvent.PHASE_END, phase: PipelinePhase.PARSE, timestamp: Date.now(),
            stats: { filesParsed: parsedFiles.length, blocksExtracted } } as PhaseEventPayload);

        // --- PHASE GATE: early return while verifying components incrementally ---
        // Move this return past each phase as it is verified.
        return {
            files: parsedFiles,
            errors: errSub.errors,
            stats: {
                filesDiscovered: discoveredFiles.length,
                filesRead: fileContents.length,
                filesParsed: parsedFiles.length,
                blocksExtracted,
                errorsCount: errSub.count,
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
        bus: PipelineEventBus,
    ): Promise<string[]> {
        const allFiles: string[] = [];

        for (const rootDir of paths) {
            bus.emit({
                type: PipelineEvent.DEBUG, phase: PipelinePhase.DISCOVERY, timestamp: Date.now(),
                message: "Discovering files", context: { rootDir },
            } as LogEventPayload);

            const result = await this.fileDiscovery.discover({
                rootDir,
                include: config.include,
                exclude: config.exclude,
                maxFiles: config.maxFiles,
                maxFileSizeMb: config.maxFileSizeMb,
            });

            for (const err of result.errors) {
                bus.emit({
                    type: PipelineEvent.ERROR, phase: PipelinePhase.DISCOVERY, timestamp: Date.now(),
                    path: err.path, message: err.message, code: err.code, userMessage: err.userMessage,
                } as ErrorEventPayload);
            }

            allFiles.push(...result.files);
        }

        bus.emit({
            type: PipelineEvent.INFO, phase: PipelinePhase.DISCOVERY, timestamp: Date.now(),
            message: "Discovery complete", context: { filesFound: allFiles.length },
        } as LogEventPayload);
        return allFiles;
    }

    /**
     * Read file contents.
     */
    private async read(
        files: string[],
        maxFileSizeMb: number,
        bus: PipelineEventBus,
    ): Promise<{ path: string; content: string }[]> {
        bus.emit({
            type: PipelineEvent.DEBUG, phase: PipelinePhase.READ, timestamp: Date.now(),
            message: "Reading files", context: { count: files.length },
        } as LogEventPayload);

        const result = await this.fileDiscovery.readFiles(files, maxFileSizeMb);

        for (const err of result.errors) {
            bus.emit({
                type: PipelineEvent.ERROR, phase: PipelinePhase.READ, timestamp: Date.now(),
                path: err.path, message: err.message, code: err.code, userMessage: err.userMessage,
            } as ErrorEventPayload);
        }

        bus.emit({
            type: PipelineEvent.INFO, phase: PipelinePhase.READ, timestamp: Date.now(),
            message: "Read complete", context: { filesRead: result.contents.length },
        } as LogEventPayload);
        return result.contents;
    }

    /**
     * Phase 2a: Extract markdown structure (code blocks grouped by language + tables).
     * Files with ERROR-severity extraction errors are skipped.
     */
    private extractMarkdown(
        contents: { path: string; content: string }[],
        bus: PipelineEventBus,
    ): ExtractionResult[] {
        const results: ExtractionResult[] = [];

        for (const file of contents) {
            bus.emit({
                type: PipelineEvent.DEBUG, phase: PipelinePhase.PARSE, timestamp: Date.now(),
                message: "Parsing file", context: { file: file.path },
            } as LogEventPayload);

            const extractionResult = this.markdownParser.parse(file.content, file.path);

            const extractionErrors = extractionResult.errors.filter(e => e.severity === ErrorSeverity.ERROR);
            if (extractionErrors.length > 0) {
                for (const err of extractionErrors) {
                    bus.emit({
                        type: PipelineEvent.ERROR, phase: PipelinePhase.PARSE, timestamp: Date.now(),
                        path: file.path, message: err.message, code: `LINE_${err.line}`, userMessage: [err.message],
                    } as ErrorEventPayload);
                }
                continue;
            }

            results.push(extractionResult);
        }

        bus.emit({
            type: PipelineEvent.INFO, phase: PipelinePhase.PARSE, timestamp: Date.now(),
            message: "Extraction complete", context: { filesExtracted: results.length },
        } as LogEventPayload);
        return results;
    }

    /**
     * Phase 2b: Validate mermaid blocks via mermaid.parse() and build ParsedFiles.
     */
    private async validateMermaid(
        extractedFiles: ExtractionResult[],
        bus: PipelineEventBus,
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
                bus.emit({
                    type: PipelineEvent.WARN, phase: PipelinePhase.PARSE, timestamp: Date.now(),
                    message: "File has code blocks but none are mermaid", context: { file: extraction.specFile },
                } as LogEventPayload);
            } else if (mermaidBlocks.length === 0) {
                bus.emit({
                    type: PipelineEvent.WARN, phase: PipelinePhase.PARSE, timestamp: Date.now(),
                    message: "No mermaid diagrams found in file", context: { file: extraction.specFile },
                } as LogEventPayload);
            }

            const validationResult = await this.mermaidValidator.validateAll(mermaidBlocks, extraction.specFile);

            for (const err of validationResult.errors.filter(e => e.severity === ErrorSeverity.ERROR)) {
                bus.emit({
                    type: PipelineEvent.ERROR, phase: PipelinePhase.PARSE, timestamp: Date.now(),
                    path: extraction.specFile, message: err.message, code: `LINE_${err.line}`, userMessage: [err.message],
                } as ErrorEventPayload);
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

        bus.emit({
            type: PipelineEvent.INFO, phase: PipelinePhase.PARSE, timestamp: Date.now(),
            message: "Parse complete", context: { filesParsed: parsedFiles.length, blocksExtracted },
        } as LogEventPayload);
        return { parsedFiles, routedDiagrams, blocksExtracted };
    }
}
