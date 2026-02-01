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
     * Find config file using priority order:
     * 1. SPECKEY_CONFIG env var
     * 2. Search up from startDir to git root
     * 3. User config (~/.config/speckey/config.json)
     */
    static findConfigFile(startDir: string = process.cwd()): string | undefined {
        // Priority 1: SPECKEY_CONFIG env var
        const envConfig = process.env.SPECKEY_CONFIG;
        if (envConfig && existsSync(envConfig)) {
            return envConfig;
        }

        // Priority 2: Walk up from startDir to git root
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

        // Priority 3: User config
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
     * Supports nested config structure (discovery.*, database.*) mapped to flat PipelineConfig.
     */
    private static mergeWithDefaults(
        userConfig: Record<string, unknown>,
    ): Omit<PipelineConfig, "paths"> {
        // Support nested config structure
        const discovery = (userConfig.discovery ?? {}) as Record<string, unknown>;

        return {
            include: (discovery.include ?? userConfig.include ?? DEFAULT_CONFIG.include) as string[],
            exclude: (discovery.exclude ?? userConfig.exclude ?? DEFAULT_CONFIG.exclude) as string[],
            maxFiles: (discovery.max_file_count ?? userConfig.maxFiles ?? DEFAULT_CONFIG.maxFiles) as number,
            maxFileSizeMb: (discovery.max_file_size_mb ?? userConfig.maxFileSizeMb ?? DEFAULT_CONFIG.maxFileSizeMb) as number,
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
            exclude: [...(base.exclude || []), ...(cliExclude || [])],
        };
    }
}
