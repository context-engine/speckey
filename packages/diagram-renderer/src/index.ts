// xyflow-based components (class diagrams + experimental sequence)
export { default as ClassNode } from "./components/xyflow/ClassNode.svelte";
export { default as DiagramViewer } from "./components/xyflow/DiagramViewer.svelte";
export { default as ActorNode } from "./components/xyflow/ActorNode.svelte";
export { default as LifelineNode } from "./components/xyflow/LifelineNode.svelte";
export { default as MessageNode } from "./components/xyflow/MessageNode.svelte";
export { default as NoteNode } from "./components/xyflow/NoteNode.svelte";
export { default as SequenceViewer } from "./components/xyflow/SequenceViewer.svelte";

// Mermaid-based components (sequence diagrams with layer toggling)
export { default as MermaidSequenceViewer } from "./components/mermaid/MermaidSequenceViewer.svelte";
export { default as LayerPanel } from "./components/mermaid/LayerPanel.svelte";

// Transformers
export { transformClassDiagram } from "./transformers/class-diagram.ts";
export type { ClassNodeData } from "./transformers/class-diagram.ts";
export { transformSequenceDiagram } from "./transformers/sequence-diagram.ts";
export type {
    SequenceActorNodeData,
    SequenceLifelineNodeData,
    SequenceMessageNodeData,
    SequenceNoteNodeData,
    SequenceNodeData,
} from "./transformers/sequence-diagram.ts";

// Layer system
export { extractLayers } from "./lib/extract-layers.ts";
export type { Layer } from "./lib/extract-layers.ts";
export { tagSvgWithLayers } from "./lib/tag-svg-layers.ts";
export type { TagResult } from "./lib/tag-svg-layers.ts";

// Custom flowchart renderer (HTML nodes + SVG edges, ELK layout)
export { default as FlowchartView } from "./components/flowchart/FlowchartView.svelte";
export { layoutFlowchart, transformAST as transformFlowchartAST } from "./components/flowchart/layout.ts";
export { createFlowchartState } from "./components/flowchart/state.svelte.ts";
export type { FlowchartState } from "./components/flowchart/state.svelte.ts";
export type {
    FlowNodeShape,
    FlowLinkStroke,
    FlowLinkArrowType,
    FlowNodeData,
    FlowEdgeData,
    FlowSubgraphData,
    Point,
    PositionedFlowNode,
    PositionedFlowEdge,
    PositionedFlowSubgraph,
    PositionedFlowchart,
} from "./components/flowchart/types.ts";

// Re-export mermaid-ast for convenience
export { parseClassDiagram, parseSequence, parseFlowchart } from "@speckey/mermaid-ast";
