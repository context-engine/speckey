/**
 * Type definitions for custom flowchart rendering.
 * Decoupled from mermaid-ast — mirrors class-diagram/types.ts pattern.
 */

// === Node Shapes (PoC subset: 7 of 16) ===

export type FlowNodeShape =
  | 'rect'
  | 'round'
  | 'stadium'
  | 'diamond'
  | 'circle'
  | 'subroutine'
  | 'hexagon';

// === Link Styles ===

export type FlowLinkStroke = 'normal' | 'dotted';

export type FlowLinkArrowType = 'arrow_point' | 'arrow_open';

// === Input Types ===

export interface FlowNodeData {
  id: string;
  text: string;
  shape: FlowNodeShape;
  subgraphId?: string;
}

export interface FlowEdgeData {
  id: string;
  sourceId: string;
  targetId: string;
  stroke: FlowLinkStroke;
  arrowType: FlowLinkArrowType;
  label?: string;
}

export interface FlowSubgraphData {
  id: string;
  title: string;
  nodeIds: string[];
}

// === Layout Output Types ===

export interface Point {
  x: number;
  y: number;
}

export interface PositionedFlowNode {
  data: FlowNodeData;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedFlowEdge {
  data: FlowEdgeData;
  sourcePoint: Point;
  targetPoint: Point;
  bendPoints: Point[];
}

export interface PositionedFlowSubgraph {
  data: FlowSubgraphData;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedFlowchart {
  nodes: PositionedFlowNode[];
  edges: PositionedFlowEdge[];
  subgraphs: PositionedFlowSubgraph[];
  width: number;
  height: number;
}
