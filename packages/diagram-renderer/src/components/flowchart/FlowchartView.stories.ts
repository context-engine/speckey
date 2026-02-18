import type { Meta, StoryObj } from '@storybook/svelte';
import { parseFlowchart } from '@speckey/mermaid-ast';
import FlowchartView from './FlowchartView.svelte';

// Simple decision flow — tests diamond, stadium, rect, edge labels, loop edge
const decisionFlow = `flowchart TD
    A([Start]) --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Debug]
    D --> B
    C --> E([End])
`;

// Subgraphs + mixed shapes — tests subgraph, hexagon, subroutine, LR direction
const systemArchitecture = `flowchart LR
    subgraph Frontend
        A([User Input]) --> B[Validate]
        B --> C[[Process]]
    end

    subgraph Backend
        D{{Router}} --> E[Handler]
        E --> F[Database]
    end

    C --> D
    F -.-> A
`;

// Larger realistic flow — tests scale, dotted stroke, multiple paths
const ciPipeline = `flowchart TD
    A([Push Code]) --> B[Lint]
    B --> C[Unit Tests]
    C --> D{Tests Pass?}
    D -->|Yes| E[Build Docker Image]
    D -->|No| F([Fix and Retry])
    F --> A
    E --> G{{Deploy Gate}}
    G -->|Staging| H[Deploy to Staging]
    G -->|Production| I[Deploy to Prod]
    H --> J([Run E2E Tests])
    I -.-> K([Monitor])
    J -->|Pass| I
    J -->|Fail| F
`;

const meta = {
  title: 'Diagrams/Custom/Flowchart',
  component: FlowchartView,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<FlowchartView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DecisionFlow: Story = {
  args: { ast: undefined as any },
  loaders: [
    async () => {
      const ast = parseFlowchart(decisionFlow);
      return { ast };
    },
  ],
  render: (_args, { loaded: { ast } }) => ({
    Component: FlowchartView,
    props: { ast },
  }),
};

export const SystemArchitecture: Story = {
  args: { ast: undefined as any },
  loaders: [
    async () => {
      const ast = parseFlowchart(systemArchitecture);
      return { ast };
    },
  ],
  render: (_args, { loaded: { ast } }) => ({
    Component: FlowchartView,
    props: { ast },
  }),
};

export const CIPipeline: Story = {
  args: { ast: undefined as any },
  loaders: [
    async () => {
      const ast = parseFlowchart(ciPipeline);
      return { ast };
    },
  ],
  render: (_args, { loaded: { ast } }) => ({
    Component: FlowchartView,
    props: { ast },
  }),
};
