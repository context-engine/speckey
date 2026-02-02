/**
 * Core types for mermaid-svg
 */

/**
 * Theme configuration for rendering
 */
export interface Theme {
  /** Background color of the diagram */
  background: string;

  /** Default node fill color */
  nodeFill: string;

  /** Default node stroke color */
  nodeStroke: string;

  /** Default node stroke width */
  nodeStrokeWidth: number;

  /** Default node text color */
  nodeTextColor: string;

  /** Default edge stroke color */
  edgeStroke: string;

  /** Default edge stroke width */
  edgeStrokeWidth: number;

  /** Default edge text color */
  edgeTextColor: string;

  /** Font family for text */
  fontFamily: string;

  /** Font size in pixels */
  fontSize: number;

  /** Padding inside nodes */
  nodePadding: number;

  /** Minimum node width */
  nodeMinWidth: number;

  /** Minimum node height */
  nodeMinHeight: number;

  // ---- Sequence diagram properties ----

  /** Horizontal gap between actors (default 200) */
  actorSpacing: number;

  /** Vertical gap between messages (default 50) */
  messageSpacing: number;

  /** Lifeline stroke color */
  lifelineStroke: string;

  /** Lifeline dash pattern */
  lifelineDash: string;

  /** Activation box fill color */
  activationFill: string;

  /** Block (loop/alt/opt) fill color */
  blockFill: string;

  /** Block stroke color */
  blockStroke: string;

  /** Note fill color */
  noteFill: string;

  /** Note stroke color */
  noteStroke: string;
}

/**
 * Options for rendering a flowchart to SVG
 */
export interface RenderOptions {
  /** Theme to use for rendering */
  theme?: Partial<Theme>;

  /** Width of the SVG (auto-calculated if not specified) */
  width?: number;

  /** Height of the SVG (auto-calculated if not specified) */
  height?: number;

  /** Padding around the diagram */
  padding?: number;
}

/**
 * Positioned node after layout
 */
export interface PositionedNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  shape: string;
}

/**
 * Positioned edge after layout
 */
export interface PositionedEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
  points: Array<{ x: number; y: number }>;
  startMarker?: string;
  endMarker?: string;
}

/**
 * Result of ELK layout
 */
export interface LayoutResult {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  width: number;
  height: number;
}
