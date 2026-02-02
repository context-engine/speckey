import type { Meta, StoryObj } from "@storybook/svelte";
import { parseSequence } from "@speckey/mermaid-ast";
import MermaidSequenceViewer from "./MermaidSequenceViewer.svelte";

// Simple: no control blocks
const simpleDiagram = `sequenceDiagram
    participant Alice
    participant Bob
    Alice->>Bob: Hello Bob, how are you?
    Bob-->>Alice: I am good thanks!
    Alice->>Bob: Great to hear!
`;

// Loop + alt blocks
const loopAltDiagram = `sequenceDiagram
    participant Client
    participant Server
    participant DB
    Client->>Server: Login request
    Server->>DB: Query user
    DB-->>Server: User data
    loop Retry on failure
        Server->>DB: Validate token
        DB-->>Server: Token status
    end
    alt Valid token
        Server-->>Client: Success 200
    else Invalid token
        Server-->>Client: Error 401
    end
`;

// Nested blocks
const nestedDiagram = `sequenceDiagram
    participant User
    participant API
    participant Cache
    participant DB
    User->>API: Request data
    alt Cache available
        API->>Cache: Check cache
        Cache-->>API: Cache hit
        loop Refresh in background
            API->>DB: Fetch fresh data
            DB-->>API: Fresh data
            API->>Cache: Update cache
        end
        API-->>User: Cached response
    else Cache miss
        API->>DB: Query database
        DB-->>API: Query result
        opt Cache result
            API->>Cache: Store in cache
        end
        API-->>User: Fresh response
    end
`;

const meta = {
    title: "Diagrams/MermaidSequenceDiagram",
    component: MermaidSequenceViewer,
    tags: ["autodocs"],
    parameters: {
        layout: "fullscreen",
    },
} satisfies Meta<MermaidSequenceViewer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Simple: Story = {
    args: {
        syntax: simpleDiagram,
        ast: parseSequence(simpleDiagram),
    },
};

export const LoopAndAlt: Story = {
    args: {
        syntax: loopAltDiagram,
        ast: parseSequence(loopAltDiagram),
    },
};

export const NestedBlocks: Story = {
    args: {
        syntax: nestedDiagram,
        ast: parseSequence(nestedDiagram),
    },
};
