import { FileDiscovery } from "@speckey/io";
import {
    MarkdownParser,
    ClassExtractor,
    ClassDiagramValidator,
    EntityBuilder,
    TypeResolver,
    IntegrationValidator,
    DiagramType,
    ErrorSeverity,
} from "@speckey/parser";
import type { IntegrationValidationReport } from "@speckey/parser";
import { DgraphWriter } from "@speckey/database";
import type { WriteResult, WriteConfig } from "@speckey/database";
import { ClassSpecType } from "./package-registry/types";
import type { ClassSpec } from "./package-registry/types";
import { PackageRegistry } from "./package-registry";
import { DeferredValidationQueue } from "./deferred-validation-queue";
import type { Logger, AppLogObj } from "@speckey/logger";
import {
    DEFAULT_CONFIG,
    type ParsedFile,
    type PipelineConfig,
    type PipelineError,
    type PipelineResult,
    type PipelineStats,
} from "./types";

/**
 * Main orchestrator that runs the full parse pipeline:
 * Phase 1 (discover) → Phase 2 (extract blocks) → Phase 3a (parse + build entities)
 * → Phase 4 (integration validation) → Phase 5 (database write).
 */
export class ParsePipeline {
    private fileDiscovery: FileDiscovery;
    private markdownParser: MarkdownParser;
    private classExtractor: ClassExtractor;
    private classDiagramValidator: ClassDiagramValidator;
    private integrationValidator: IntegrationValidator;

    constructor() {
        this.fileDiscovery = new FileDiscovery();
        this.markdownParser = new MarkdownParser();
        this.classExtractor = new ClassExtractor();
        this.classDiagramValidator = new ClassDiagramValidator();
        this.integrationValidator = new IntegrationValidator();
    }

    /**
     * Run the full parsing pipeline.
     */
    async run(config: PipelineConfig, logger?: Logger<AppLogObj>): Promise<PipelineResult> {
        const errors: PipelineError[] = [];
        const parsedFiles: ParsedFile[] = [];
        const allClassSpecs: ClassSpec[] = [];

        // Create phase-scoped child loggers
        const discoveryLog = logger?.getSubLogger({ name: "discovery" });
        const parseLog = logger?.getSubLogger({ name: "parse" });
        const buildLog = logger?.getSubLogger({ name: "build" });
        const validateLog = logger?.getSubLogger({ name: "validate" });
        const writeLog = logger?.getSubLogger({ name: "write" });

        // Shared instances for entity building (one per run)
        const registry = new PackageRegistry();
        const deferredQueue = new DeferredValidationQueue();
        const typeResolver = new TypeResolver();

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

        // --- PHASE GATE: early return while verifying components incrementally ---
        // Move this return past each phase as it is verified.
        return {
            files: [],
            errors,
            stats: {
                filesDiscovered: discoveredFiles.length,
                filesRead: fileContents.length,
                filesParsed: 0,
                blocksExtracted: 0,
                errorsCount: errors.length,
                entitiesBuilt: 0,
                entitiesInserted: 0,
                entitiesUpdated: 0,
                validationErrors: 0,
            },
            classSpecs: [],
        };
        // --- END PHASE GATE ---

        // // Phase 2: Parse each file (extract mermaid blocks)
        // const parseStats = this.parse(fileContents, parsedFiles, errors, parseLog);

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

    /**
     * Phase 3a: Extract class diagrams, unit-validate, and build entities for a single file.
     */
    private buildEntities(
        file: ParsedFile,
        registry: PackageRegistry,
        deferredQueue: DeferredValidationQueue,
        typeResolver: TypeResolver,
        allClassSpecs: ClassSpec[],
        errors: PipelineError[],
        log?: Logger<AppLogObj>,
    ): void {
        for (const routedBlock of file.blocks) {
            if (routedBlock.diagramType !== DiagramType.CLASS_DIAGRAM) continue;

            try {
                // Phase 3a.0: Extract parsed classes from mermaid block
                log?.debug("Extracting class diagram", { file: file.path });
                const diagramResult = this.classExtractor.extract(routedBlock.block);

                if (diagramResult.parseError) {
                    log?.warn("Extract parse error", { file: file.path, error: diagramResult.parseError });
                    errors.push({
                        phase: "extract",
                        path: file.path,
                        message: diagramResult.parseError,
                        code: "PARSE_FAILURE",
                        userMessage: [diagramResult.parseError], // TODO: add proper userMessage to extract errors
                    });
                }

                if (diagramResult.classes.length === 0) continue;

                // Phase 3a.1: Unit validation
                log?.debug("Validating classes", { count: diagramResult.classes.length });
                const validationReport = this.classDiagramValidator.validate(diagramResult);

                if (validationReport.validClasses.length === 0) continue;

                // Build currentDiagramClasses map from valid classes
                const currentDiagramClasses = new Map<string, string>();
                for (const cls of validationReport.validClasses) {
                    const address = cls.annotations?.address;
                    if (address) {
                        currentDiagramClasses.set(cls.name, `${address}.${cls.name}`);
                    }
                }

                // Phase 3a.2: Build entities
                log?.debug("Building entities", { validClasses: validationReport.validClasses.length });
                const entityBuilder = new EntityBuilder();
                const buildResult = entityBuilder.buildClassSpecs(
                    validationReport.validClasses,
                    diagramResult.relations,
                    {
                        registry,
                        deferredQueue,
                        typeResolver,
                        currentDiagramClasses,
                        specFile: file.path,
                    },
                );

                for (const err of buildResult.errors) {
                    log?.warn("Build error", { file: file.path, code: err.code });
                    errors.push({
                        phase: "build",
                        path: file.path,
                        message: err.message,
                        code: err.code,
                        userMessage: [err.message], // TODO: add proper userMessage to build errors
                    });
                }

                allClassSpecs.push(...buildResult.classSpecs);
                log?.debug("Built classSpecs", { count: buildResult.classSpecs.length });
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                log?.error("Extract failed", { file: file.path, error: msg });
                errors.push({
                    phase: "extract",
                    path: file.path,
                    message: msg,
                    code: "PARSE_FAILURE",
                    userMessage: [msg], // TODO: add proper userMessage to extract catch errors
                });
            }
        }
    }

    /**
     * Phase 5: Write definition entities to database.
     */
    private writeToDatabase(
        definitions: ClassSpec[],
        writeConfig: WriteConfig,
        errors: PipelineError[],
        log?: Logger<AppLogObj>,
    ): WriteResult {
        const writer = new DgraphWriter();
        const result = writer.write(definitions, writeConfig, log);

        for (const err of result.errors) {
            errors.push({
                phase: "write",
                path: "",
                message: err.message,
                code: err.code,
                userMessage: [err.message], // TODO: add proper userMessage to write errors
            });
        }

        return result;
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
     * Parse file contents (extract mermaid blocks).
     */
    private parse(
        contents: { path: string; content: string }[],
        parsedFiles: ParsedFile[],
        errors: PipelineError[],
        log?: Logger<AppLogObj>,
    ): { blocksExtracted: number } {
        let blocksExtracted = 0;

        for (const file of contents) {
            log?.debug("Parsing file", { file: file.path });
            const parseResult = this.markdownParser.parse(file.content, file.path);

            // Collect parse errors
            const realErrors = parseResult.errors.filter(e => e.severity === ErrorSeverity.ERROR);
            if (realErrors.length > 0) {
                for (const err of realErrors) {
                    log?.warn("Parse error", { file: file.path, line: err.line });
                    errors.push({
                        phase: "parse",
                        path: file.path,
                        message: err.message,
                        code: `LINE_${err.line}`,
                        userMessage: [err.message], // TODO: add proper userMessage to parse errors
                    });
                }
                // Skip files with actual errors
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

        log?.info("Parse complete", { filesParsed: parsedFiles.length, blocksExtracted });
        return { blocksExtracted };
    }
}
