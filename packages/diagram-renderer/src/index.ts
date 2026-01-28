// Components
export { default as ClassNode } from "./components/ClassNode.svelte";
export { default as DiagramViewer } from "./components/DiagramViewer.svelte";

// Transformers
export { transformClassDiagram } from "./transformers/class-diagram.ts";
export type { ClassNodeData } from "./transformers/class-diagram.ts";

// Re-export mermaid-ast for convenience
export { parseClassDiagram } from "mermaid-ast";
