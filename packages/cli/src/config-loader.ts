import type { PipelineConfig } from "@speckey/core";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/**
 * Default built-in configuration.
 */
export const DEFAULT_CONFIG: Omit<PipelineConfig, "paths"> = {
    include: ["**/*.md"],
    exclude: ["**/node_modules/**"],
    maxFiles: 10000,
    maxFileSizeMb: 10,
};

/**
 * Config file search locations.
 */
const CONFIG_FILENAMES = ["speckey.config.json", ".speckey.json"];

/**
 * Loads and merges configuration from files and CLI options.
 */
export class ConfigLoader {
    /**
     * Find config file searching up from startDir to git root.
     */
    static findConfigFile(startDir: string = process.cwd()): string | undefined {
        let currentDir = resolve(startDir);

        while (true) {
            for (const filename of CONFIG_FILENAMES) {
                const configPath = join(currentDir, filename);
                if (existsSync(configPath)) {
                    return configPath;
                }
            }

            // Check for git root
            const gitDir = join(currentDir, ".git");
            if (existsSync(gitDir)) {
                break;
            }

            const parentDir = dirname(currentDir);
            if (parentDir === currentDir) {
                break;
            }
            currentDir = parentDir;
        }

        // Check user config
        const homeDir = process.env.HOME;
        if (homeDir) {
            const userConfig = join(homeDir, ".config", "speckey", "config.json");
            if (existsSync(userConfig)) {
                return userConfig;
            }
        }

        return undefined;
    }

    /**
     * Load configuration from file.
     * @throws Error if config file is invalid JSON
     */
    static async load(path?: string): Promise<Omit<PipelineConfig, "paths">> {
        if (!path) {
            return { ...DEFAULT_CONFIG };
        }

        try {
            const content = await readFile(path, "utf-8");
            const parsed = JSON.parse(content);
            return this.mergeWithDefaults(parsed);
        } catch (error) {
            if (error instanceof SyntaxError) {
                throw new Error(`Invalid config file: parse error at ${path}`);
            }
            throw error;
        }
    }

    /**
     * Merge user config with defaults.
     */
    private static mergeWithDefaults(
        userConfig: Partial<PipelineConfig>,
    ): Omit<PipelineConfig, "paths"> {
        return {
            include: userConfig.include ?? DEFAULT_CONFIG.include,
            exclude: userConfig.exclude ?? DEFAULT_CONFIG.exclude,
            maxFiles: userConfig.maxFiles ?? DEFAULT_CONFIG.maxFiles,
            maxFileSizeMb: userConfig.maxFileSizeMb ?? DEFAULT_CONFIG.maxFileSizeMb,
        };
    }

    /**
     * Merge base config with CLI options (CLI wins).
     */
    static mergeWithCLI(
        base: Omit<PipelineConfig, "paths">,
        cliExclude: string[],
    ): Omit<PipelineConfig, "paths"> {
        return {
            ...base,
            exclude: [...base.exclude, ...cliExclude],
        };
    }
}
