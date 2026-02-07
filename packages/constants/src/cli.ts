export const CLIErrors = {
	MISSING_SUBCOMMAND:
		"Missing subcommand. Usage: speckey <parse|validate|sync> <path>",
	CONFLICTING_FLAGS:
		"Conflicting flags: --verbose and --quiet cannot be used together",
	NOT_MARKDOWN: (path: string) =>
		`Not a markdown file: "${path}". Expected .md extension`,
	DB_PATH_REQUIRED:
		"Database path required for sync. Use --db-path or set database.path in config",
} as const;

export const CLIDescriptions = {
	PROGRAM: "Parse and validate mermaid diagrams (class, sequence) from markdown",
	PARSE: "Parse markdown files (phases 1-3)",
	VALIDATE: "Parse and validate references (phases 1-4)",
	SYNC: "Parse, validate, and write to database (phases 1-5)",
} as const;
