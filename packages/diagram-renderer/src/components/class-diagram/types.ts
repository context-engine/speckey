/**
 * Type definitions for custom diagram rendering (ADR-007).
 * Decoupled from SvelteFlow and mermaid-ast.
 */

// === Input Types ===

export type Visibility = '+' | '-' | '#' | '~';

export interface MemberData {
  name: string;
  visibility?: Visibility;
  memberType: 'method' | 'attribute';
}

export interface ClassNodeData {
  id: string;
  name: string;
  stereotype?: string;
  attributes: MemberData[];
  methods: MemberData[];
}

export type RelationType =
  | 'aggregation'
  | 'extension'
  | 'composition'
  | 'dependency'
  | 'lollipop'
  | 'none';

export type LineType = 'solid' | 'dotted';

export interface RelationshipEdgeData {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: RelationType;
  lineType: LineType;
  label?: string;
}

// === Layout Output Types ===

export interface Point {
  x: number;
  y: number;
}

export interface PositionedNode {
  data: ClassNodeData;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedEdge {
  data: RelationshipEdgeData;
  sourcePoint: Point;
  targetPoint: Point;
  bendPoints: Point[];
}

export interface PositionedDiagram {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  width: number;
  height: number;
}

// === State Types ===

export type ExpansionLevel = 0 | 1 | 2;
