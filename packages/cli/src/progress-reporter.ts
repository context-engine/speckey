import type { PipelineError, PipelineResult } from "@speckey/core";
import { Command, type OutputMode } from "./types";

/**
 * Reports progress and formats output based on command and mode.
 */
export class ProgressReporter {
    private mode: OutputMode;
    private total: number = 0;

    constructor(mode: OutputMode = "normal") {
        this.mode = mode;
    }

    /**
     * Initialize progress with total file count.
     */
    start(total: number): void {
        this.total = total;

        if (this.mode === "normal" || this.mode === "verbose") {
            console.log(`Processing ${total} file(s)...`);
        }
    }

    /**
     * Update progress for current file.
     */
    update(current: number, file: string): void {
        if (this.mode === "verbose") {
            console.log(`[${current}/${this.total}] ${file}`);
        } else if (this.mode === "json") {
            console.log(JSON.stringify({ type: "progress", current, total: this.total, file }));
        }
    }

    /**
     * Display command-specific completion summary.
     */
    complete(command: Command, result: PipelineResult): void {
        if (this.mode === "json") {
            this.completeJson(command, result);
        } else if (this.mode !== "quiet") {
            this.completeHuman(command, result);
        }
    }

    /**
     * Display an error.
     */
    error(error: PipelineError): void {
        if (this.mode === "json") {
            console.log(JSON.stringify({ type: "error", error }));
        } else {
            console.error(this.formatError(error));
        }
    }

    private completeHuman(command: Command, result: PipelineResult): void {
        switch (command) {
            case Command.PARSE:
                console.log(this.formatParseResult(result));
                break;
            case Command.VALIDATE:
                console.log(this.formatValidationReport(result));
                break;
            case Command.SYNC:
                console.log(this.formatSyncResult(result));
                break;
        }
    }

    private completeJson(command: Command, result: PipelineResult): void {
        const output: Record<string, unknown> = {
            type: "complete",
            command,
            stats: result.stats,
        };

        if (result.classSpecs) {
            output.entities = result.classSpecs.length;
        }

        if (result.validationReport) {
            output.validationReport = result.validationReport;
        }

        if (result.writeResult) {
            output.writeResult = result.writeResult;
        }

        console.log(JSON.stringify(output));
    }

    formatParseResult(result: PipelineResult): string {
        const { stats } = result;
        const entities = result.classSpecs?.length ?? 0;
        const warnings = stats.errorsCount;
        return `Parse complete: ${stats.filesParsed} files, ${entities} entities, ${warnings} warnings`;
    }

    formatValidationReport(result: PipelineResult): string {
        const report = result.validationReport;
        if (!report) {
            return this.formatParseResult(result);
        }

        const resolved = report.resolved.length;
        const unresolved = report.unresolved.length;
        const lines = [`Validation complete: ${result.classSpecs?.length ?? 0} entities`];
        lines.push("");
        lines.push("References:");
        lines.push(`  ✓ ${resolved} resolved`);

        if (unresolved > 0) {
            lines.push(`  ✗ ${unresolved} unresolved`);
            lines.push("");
            lines.push("Unresolved references:");
            for (const entry of report.unresolved) {
                lines.push(`  ${entry.specFile}:${entry.specLine}  ${entry.entityFqn} → ${entry.targetFqn} (not found)`);
            }
        }

        return lines.join("\n");
    }

    formatSyncResult(result: PipelineResult): string {
        const lines: string[] = [];

        // Validation summary
        if (result.validationReport) {
            const errors = result.validationReport.errors.length;
            if (errors > 0) {
                lines.push(`Validation failed: ${errors} errors`);
                lines.push("Database write aborted");
                return lines.join("\n");
            }
            lines.push(`Validation complete: ${result.classSpecs?.length ?? 0} entities, 0 errors`);
        }

        // Write summary
        if (result.writeResult) {
            lines.push("Sync complete:");
            lines.push(`  Inserted: ${result.writeResult.inserted}`);
            lines.push(`  Updated: ${result.writeResult.updated}`);
            lines.push(`  Orphaned: ${result.writeResult.orphaned} (policy: keep)`);
        }

        return lines.join("\n");
    }

    private formatError(error: PipelineError): string {
        return `[${error.phase}] ${error.path}: ${error.message}`;
    }
}
