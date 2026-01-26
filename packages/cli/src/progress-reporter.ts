import type { PipelineError, PipelineResult } from "@speckey/core";
import type { OutputMode } from "./types";

/**
 * Reports progress during parsing.
 */
export class ProgressReporter {
    constructor(_mode?: OutputMode) { }

    start(_total: number): void {
        throw new Error("Not implemented");
    }

    update(_current: number, _file: string): void {
        throw new Error("Not implemented");
    }

    complete(_result: PipelineResult): void {
        throw new Error("Not implemented");
    }

    error(_error: PipelineError): void {
        throw new Error("Not implemented");
    }
}
