# Speckey Implementation

A high-performance Mermaid diagram parser and specification engine.

## Project Structure

This project is a Bun-powered monorepo mirroring the structure of `03-architecture`.

- `packages/io/` - File discovery and filtering
- `packages/parser/` - Mermaid and diagram-specific parsing
- `packages/entity/` - Entity construction logic
- `packages/resolver/` - Type and package resolution
- `packages/validation/` - Post-parse validation
- `packages/database/` - Dgraph persistence
- `packages/shared/` - Common types and interfaces

## Getting Started

### Prerequisites
- [Bun](https://bun.sh) installed

### Installation
```bash
bun install
```

### Development
```bash
# Run tests for all packages
bun test

# Lint and format
bun run check
```

## Quality Gate
- **Biome**: Linting and formatting
- **Bun Test**: Unit and integration testing
- **Stryker**: Mutation testing
