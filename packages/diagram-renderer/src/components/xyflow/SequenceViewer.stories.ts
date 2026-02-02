import type { Meta, StoryObj } from "@storybook/svelte";
import { parseSequence } from "mermaid-ast";
import { transformSequenceDiagram } from "../../transformers/sequence-diagram.ts";
import SequenceViewer from "./SequenceViewer.svelte";

const simpleSequence = `sequenceDiagram
    Alice->>Bob: Hello Bob, how are you?
    Bob-->>Alice: I am good thanks!
    Alice->>Bob: Great to hear!
`;

const multiParticipantSequence = `sequenceDiagram
    participant Client
    participant Server
    participant Database
    Client->>Server: HTTP Request
    Note right of Server: Validate request
    Server->>Database: Query
    Database-->>Server: Results
    Note over Server,Database: Data processing
    Server-->>Client: HTTP Response
`;

const meta = {
    title: "Diagrams/SequenceDiagram",
    component: SequenceViewer,
    tags: ["autodocs"],
    parameters: {
        layout: "fullscreen",
    },
} satisfies Meta<SequenceViewer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SimpleConversation: Story = {
    args: { nodes: [], edges: [] },
    loaders: [
        async () => {
            const ast = parseSequence(simpleSequence);
            const result = await transformSequenceDiagram(ast);
            return { diagramData: result };
        },
    ],
    render: (args, { loaded: { diagramData } }) => ({
        Component: SequenceViewer,
        props: {
            nodes: diagramData.nodes,
            edges: diagramData.edges,
        },
    }),
};

export const MultiParticipant: Story = {
    args: { nodes: [], edges: [] },
    loaders: [
        async () => {
            const ast = parseSequence(multiParticipantSequence);
            const result = await transformSequenceDiagram(ast);
            return { diagramData: result };
        },
    ],
    render: (args, { loaded: { diagramData } }) => ({
        Component: SequenceViewer,
        props: {
            nodes: diagramData.nodes,
            edges: diagramData.edges,
        },
    }),
};
