import type { PipelineError, PipelineResult, PipelineStats } from "@speckey/core";
import type { OutputMode } from "./types";

/**
 * Reports progress during parsing.
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
     * Display completion summary.
     */
    complete(result: PipelineResult): void {
        const { stats } = result;

        if (this.mode === "json") {
            console.log(JSON.stringify({ type: "complete", stats }));
        } else if (this.mode !== "quiet") {
            console.log(this.formatSummary(stats));
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

    private formatSummary(stats: PipelineStats): string {
        return `✓ ${stats.filesParsed} files, ${stats.blocksExtracted} blocks extracted`;
    }

    private formatError(error: PipelineError): string {
        return `[${error.phase}] ${error.path}: ${error.message}`;
    }
}
