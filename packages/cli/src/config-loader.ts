import type { PipelineConfig } from "@speckey/core";

/**
 * Loads and merges configuration from files and CLI options.
 */
export class ConfigLoader {
    /**
     * Find config file searching up from cwd to git root.
     */
    static findConfigFile(_startDir?: string): string | undefined {
        throw new Error("Not implemented");
    }

    /**
     * Load configuration from file.
     * @throws Error if config file is invalid JSON
     */
    static async load(_path?: string): Promise<Omit<PipelineConfig, "paths">> {
        throw new Error("Not implemented");
    }

    /**
     * Merge base config with CLI options (CLI wins).
     */
    static mergeWithCLI(
        _base: Omit<PipelineConfig, "paths">,
        _cliExclude: string[],
    ): Omit<PipelineConfig, "paths"> {
        throw new Error("Not implemented");
    }
}
