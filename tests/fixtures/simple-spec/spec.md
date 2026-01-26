# Simple Spec

A basic spec file with mermaid diagrams.

```mermaid
classDiagram
    class User {
        +id: string
        +name: string
    }
```

## Table Data

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier |
| name | string | User display name |

```mermaid
sequenceDiagram
    Client->>Server: Request
    Server-->>Client: Response
```
