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

        if (this.mode === "verbose") {
            const details = this.formatVerboseDetails(result);
            if (details) {
                console.log(details);
            }
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

        // Count external references from classSpecs
        let externalCount = 0;
        for (const cs of result.classSpecs ?? []) {
            externalCount += cs.externalDeps?.length ?? 0;
        }

        const lines = [`Validation complete: ${result.classSpecs?.length ?? 0} entities`];
        lines.push("");
        lines.push("References:");
        lines.push(`  ✓ ${resolved} resolved`);

        if (unresolved > 0) {
            lines.push(`  ✗ ${unresolved} unresolved`);
        }

        if (externalCount > 0) {
            lines.push(`  ◆ ${externalCount} external`);
        }

        if (unresolved > 0) {
            lines.push("");
            lines.push("Unresolved references:");

            // Group by file
            const grouped = new Map<string, typeof report.unresolved>();
            for (const entry of report.unresolved) {
                const entries = grouped.get(entry.specFile) ?? [];
                entries.push(entry);
                grouped.set(entry.specFile, entries);
            }

            for (const [file, entries] of grouped) {
                lines.push(`  ${file}:`);
                for (const entry of entries) {
                    lines.push(`    :${entry.specLine}  ${entry.entityFqn} → ${entry.targetFqn}`);
                }
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

    private formatVerboseDetails(result: PipelineResult): string | undefined {
        const classSpecs = result.classSpecs ?? [];
        if (classSpecs.length === 0) {
            return undefined;
        }

        const lines: string[] = [];

        // Per-file entity counts
        const byFile = new Map<string, number>();
        for (const cs of classSpecs) {
            byFile.set(cs.specFile, (byFile.get(cs.specFile) ?? 0) + 1);
        }
        lines.push("");
        lines.push("Per-file details:");
        for (const [file, count] of [...byFile.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
            lines.push(`  ${file} — ${count} entities`);
        }

        // Package breakdown
        const byPackage = new Map<string, number>();
        for (const cs of classSpecs) {
            if (cs.package) {
                byPackage.set(cs.package, (byPackage.get(cs.package) ?? 0) + 1);
            }
        }
        if (byPackage.size > 0) {
            lines.push("");
            lines.push("Packages:");
            for (const [pkg, count] of [...byPackage.entries()].sort((a, b) => b[1] - a[1])) {
                lines.push(`  ${pkg} — ${count} entities`);
            }
        }

        return lines.join("\n");
    }

    private formatError(error: PipelineError): string {
        if (this.mode === "quiet") {
            return `[${error.phase}] ${error.path}: ${error.message}`;
        }
        const userLines = error.userMessage.join("\n  ");
        return `[${error.phase}] ${error.path}: ${userLines}\n  ${error.message}`;
    }
}
