# @speckey/cli

Command-line interface for parsing and validating Mermaid diagrams (class, sequence) from markdown spec files.

## Usage

```bash
# From the cli app directory
bun run speckey <command> [paths...] [options]

# Commands
bun run speckey parse ./specs          # Parse markdown files (phases 1-3)
bun run speckey validate ./specs       # Parse and validate references (phases 1-4)
bun run speckey sync ./specs --db-path ./data.db  # Parse, validate, and write to database (phases 1-5)
```

## Commands

| Command    | Phases | Description |
|------------|--------|-------------|
| `parse`    | 1-3    | Discover files, extract mermaid blocks, parse class diagrams. `skipValidation=true`. |
| `validate` | 1-4    | Parse + validate cross-references between entities. |
| `sync`     | 1-5    | Validate + write entities to SQLite database. Requires `--db-path`. |

## Options

| Flag | Short | Description |
|------|-------|-------------|
| `--verbose` | `-v` | Show detailed output (per-file details, package breakdown) |
| `--quiet` | `-q` | Show errors only |
| `--json` | | Output as JSON lines |
| `--config <path>` | | Use specific config file |
| `--no-config` | | Skip config file loading |
| `--include <pattern>` | | Inclusion glob patterns (replaces defaults, repeatable) |
| `--exclude <pattern>` | | Additional exclusion glob patterns (repeatable) |
| `--db-path <path>` | | SQLite database path (required for `sync`) |
| `--help` | `-h` | Display help |
| `--version` | | Display version |

`--verbose` and `--quiet` are mutually exclusive.

## Config Resolution

Config is loaded with a 3-priority lookup:

1. `SPECKEY_CONFIG` environment variable
2. Walk up from current directory to git root, looking for `speckey.config.json` or `.speckey.json`
3. User config at `~/.config/speckey/config.json`

Use `--no-config` to skip config file loading entirely. Use `--config <path>` to point to a specific file.

**Merge behavior:**
- `--include` patterns **replace** config file includes when provided
- `--exclude` patterns **append** to config file excludes

## Architecture

```
bin.ts          Entry point — instantiates CLI, passes argv, exits with code
  └── cli.ts    Orchestrator — parseArgs → config → pipeline → display
        ├── args.ts           Argument parsing (commander.js)
        ├── config-loader.ts  Config file discovery and merging
        ├── progress-reporter.ts  Output formatting (human/json/quiet/verbose)
        └── types.ts          Command enum, ExitCode enum, ParseOptions, OutputMode
```

### Exit Codes

| Code | Constant | Meaning |
|------|----------|---------|
| 0 | `SUCCESS` | All operations completed without errors |
| 1 | `PARSE_ERROR` | Parse/validation errors, no files found, or unresolved references |
| 2 | `CONFIG_ERROR` | Invalid arguments, unknown flags, bad config file |

## Dependencies

| Package | Role |
|---------|------|
| `@speckey/core` | `ParsePipeline` — the 5-phase processing pipeline |
| `@speckey/database` | `WriteConfig` type for sync command |
| `@speckey/constants` | Centralized error messages and CLI descriptions |
| `commander` | Argument parsing |

## Tests

```bash
# Run from the cli app directory
bun test
```

Test files mirror source files 1:1:
- `args.test.ts` — subcommand dispatch, flags, value options, error handling, combined arguments
- `cli.test.ts` — end-to-end CLI orchestration
- `config-loader.test.ts` — config file discovery, loading, merging
- `progress-reporter.test.ts` — output formatting across modes
