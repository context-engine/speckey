/**
 * ELK.js layout for flowcharts.
 * FlowchartAST → transformAST() → internal types → ELK → PositionedFlowchart.
 */

import ELK, {
  type ElkNode,
  type ElkExtendedEdge,
} from 'elkjs/lib/elk.bundled.js';
import type {
  FlowchartAST,
  FlowchartDirection,
  FlowchartNodeShape,
} from '@speckey/mermaid-ast';
import type {
  FlowNodeData,
  FlowEdgeData,
  FlowSubgraphData,
  FlowNodeShape,
  PositionedFlowchart,
  PositionedFlowNode,
  PositionedFlowEdge,
  PositionedFlowSubgraph,
  Point,
} from './types.ts';

const elk = new ELK();

// --- Sizing Constants ---
const CHAR_WIDTH = 8;
const NODE_PADDING_X = 24;
const BASE_HEIGHT = 40;
const MIN_WIDTH = 80;
const DIAMOND_ASPECT = 1.6;
const CIRCLE_MIN_SIZE = 60;
const DIAGRAM_PADDING = 40;
const SUBGRAPH_PADDING = 20;

// --- Shape mapping (AST → renderer) ---

const SHAPE_MAP: Record<FlowchartNodeShape, FlowNodeShape> = {
  square: 'rect',
  rect: 'rect',
  round: 'round',
  stadium: 'stadium',
  diamond: 'diamond',
  circle: 'circle',
  doublecircle: 'circle',
  subroutine: 'subroutine',
  hexagon: 'hexagon',
  ellipse: 'round',
  odd: 'rect',
  trapezoid: 'rect',
  inv_trapezoid: 'rect',
  lean_right: 'rect',
  lean_left: 'rect',
  cylinder: 'rect',
};

function mapShape(astShape: FlowchartNodeShape): FlowNodeShape {
  return SHAPE_MAP[astShape] ?? 'rect';
}

// --- Size computation ---

function computeNodeSize(data: FlowNodeData): { width: number; height: number } {
  const textWidth = data.text.length * CHAR_WIDTH;

  switch (data.shape) {
    case 'diamond': {
      const side = Math.max(textWidth * 0.9 + NODE_PADDING_X, 80);
      return { width: side * DIAMOND_ASPECT, height: side };
    }
    case 'circle': {
      const diameter = Math.max(textWidth + NODE_PADDING_X, CIRCLE_MIN_SIZE);
      return { width: diameter, height: diameter };
    }
    case 'hexagon':
      return {
        width: Math.max(textWidth + NODE_PADDING_X * 2, MIN_WIDTH + 40),
        height: BASE_HEIGHT,
      };
    default:
      return {
        width: Math.max(textWidth + NODE_PADDING_X, MIN_WIDTH),
        height: BASE_HEIGHT,
      };
  }
}

// --- Direction mapping ---

function getElkDirection(direction: FlowchartDirection): string {
  switch (direction) {
    case 'TB': case 'TD': return 'DOWN';
    case 'BT': return 'UP';
    case 'LR': return 'RIGHT';
    case 'RL': return 'LEFT';
    default: return 'DOWN';
  }
}

// --- AST Transform ---

export function transformAST(ast: FlowchartAST): {
  nodes: FlowNodeData[];
  edges: FlowEdgeData[];
  subgraphs: FlowSubgraphData[];
} {
  const nodes: FlowNodeData[] = [];
  const edges: FlowEdgeData[] = [];
  const subgraphs: FlowSubgraphData[] = [];

  // Build subgraph membership: nodeId → subgraphId
  const nodeSubgraphMap = new Map<string, string>();
  for (const sg of ast.subgraphs) {
    subgraphs.push({
      id: sg.id,
      title: sg.title?.text ?? sg.id,
      nodeIds: [...sg.nodes],
    });
    for (const nodeId of sg.nodes) {
      nodeSubgraphMap.set(nodeId, sg.id);
    }
  }

  // Transform nodes
  for (const [id, node] of ast.nodes) {
    nodes.push({
      id,
      text: node.text?.text ?? id,
      shape: mapShape(node.shape),
      subgraphId: nodeSubgraphMap.get(id),
    });
  }

  // Transform links
  for (let i = 0; i < ast.links.length; i++) {
    const link = ast.links[i]!;
    edges.push({
      id: `edge-${i}`,
      sourceId: link.source,
      targetId: link.target,
      stroke: link.stroke === 'dotted' ? 'dotted' : 'normal',
      arrowType: link.type === 'arrow_open' ? 'arrow_open' : 'arrow_point',
      label: link.text?.text,
    });
  }

  return { nodes, edges, subgraphs };
}

// --- ELK Layout ---

export async function layoutFlowchart(
  ast: FlowchartAST,
): Promise<PositionedFlowchart> {
  const { nodes, edges, subgraphs } = transformAST(ast);

  // Build lookup maps
  const nodeDataMap = new Map<string, FlowNodeData>();
  const nodeSizeMap = new Map<string, { width: number; height: number }>();
  for (const node of nodes) {
    nodeDataMap.set(node.id, node);
    nodeSizeMap.set(node.id, computeNodeSize(node));
  }

  // Flat layout: all nodes at root level (avoids ELK compound-layout hangs
  // when edges cross subgraph boundaries). Subgraph bounding boxes are
  // computed post-layout from their contained nodes' positions.

  const elkChildren: ElkNode[] = nodes.map((n) => {
    const size = nodeSizeMap.get(n.id)!;
    return { id: n.id, width: size.width, height: size.height };
  });

  const elkEdges: ElkExtendedEdge[] = edges.map((edge) => ({
    id: edge.id,
    sources: [edge.sourceId],
    targets: [edge.targetId],
  }));

  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': getElkDirection(ast.direction || 'TB'),
      'elk.spacing.nodeNode': '50',
      'elk.layered.spacing.nodeNodeBetweenLayers': '70',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    },
    children: elkChildren,
    edges: elkEdges,
  };

  const layoutResult = await elk.layout(elkGraph);

  // Extract positioned nodes
  const positionedNodes: PositionedFlowNode[] = [];
  const positionedNodeMap = new Map<string, PositionedFlowNode>();
  let maxX = 0;
  let maxY = 0;

  for (const child of layoutResult.children ?? []) {
    const data = nodeDataMap.get(child.id);
    if (!data) continue;
    const x = child.x ?? 0;
    const y = child.y ?? 0;
    const w = child.width ?? nodeSizeMap.get(child.id)!.width;
    const h = child.height ?? nodeSizeMap.get(child.id)!.height;
    const positioned: PositionedFlowNode = { data, x, y, width: w, height: h };
    positionedNodes.push(positioned);
    positionedNodeMap.set(child.id, positioned);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }

  // Compute subgraph bounding boxes from contained nodes
  const positionedSubgraphs: PositionedFlowSubgraph[] = [];

  for (const sg of subgraphs) {
    const memberNodes = sg.nodeIds
      .map((id) => positionedNodeMap.get(id))
      .filter((n): n is PositionedFlowNode => n !== undefined);
    if (memberNodes.length === 0) continue;

    let minX = Infinity, minY = Infinity, sgMaxX = 0, sgMaxY = 0;
    for (const n of memberNodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      sgMaxX = Math.max(sgMaxX, n.x + n.width);
      sgMaxY = Math.max(sgMaxY, n.y + n.height);
    }

    const x = minX - SUBGRAPH_PADDING;
    const y = minY - SUBGRAPH_PADDING - 20; // extra top for label
    const w = sgMaxX - minX + SUBGRAPH_PADDING * 2;
    const h = sgMaxY - minY + SUBGRAPH_PADDING * 2 + 20;
    positionedSubgraphs.push({ data: sg, x, y, width: w, height: h });
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }

  // Snap edge endpoint to polygon boundary for non-rectangular shapes.
  // Returns the snapped point and whether it exited vertically or
  // horizontally so we can insert a bridge bend to keep edges orthogonal.
  type ExitDir = 'vertical' | 'horizontal' | null;

  function snapToShape(
    point: Point,
    node: PositionedFlowNode,
  ): { point: Point; exit: ExitDir } {
    const { shape } = node.data;
    if (shape !== 'diamond' && shape !== 'hexagon') {
      return { point, exit: null };
    }

    const nx = node.x;
    const ny = node.y;
    const nw = node.width;
    const nh = node.height;
    const cx = nx + nw / 2;
    const cy = ny + nh / 2;

    const distTop = Math.abs(point.y - ny);
    const distBottom = Math.abs(point.y - (ny + nh));
    const distLeft = Math.abs(point.x - nx);
    const distRight = Math.abs(point.x - (nx + nw));
    const minDist = Math.min(distTop, distBottom, distLeft, distRight);

    if (shape === 'diamond') {
      if (minDist === distTop) return { point: { x: cx, y: ny }, exit: 'vertical' };
      if (minDist === distBottom) return { point: { x: cx, y: ny + nh }, exit: 'vertical' };
      if (minDist === distLeft) return { point: { x: nx, y: cy }, exit: 'horizontal' };
      return { point: { x: nx + nw, y: cy }, exit: 'horizontal' };
    }

    // hexagon: left/right are pointy vertices, top/bottom are flat
    if (minDist === distLeft) return { point: { x: nx, y: cy }, exit: 'horizontal' };
    if (minDist === distRight) return { point: { x: nx + nw, y: cy }, exit: 'horizontal' };
    return { point, exit: null };
  }

  // Insert a bridge bend point between a snapped endpoint and its adjacent
  // bend/target so the path stays orthogonal (no diagonal segments).
  function bridgeBend(snapped: Point, adjacent: Point, exit: ExitDir): Point | null {
    if (!exit) return null;
    // Already axis-aligned — no bridge needed
    if (snapped.x === adjacent.x || snapped.y === adjacent.y) return null;
    // Vertical exit (top/bottom): extend vertically first, then turn horizontal
    if (exit === 'vertical') return { x: snapped.x, y: adjacent.y };
    // Horizontal exit (left/right): extend horizontally first, then turn vertical
    return { x: adjacent.x, y: snapped.y };
  }

  // Extract edge bend points (same pattern as class-diagram/layout.ts)
  const edgeDataMap = new Map(edges.map((e) => [e.id, e]));
  const positionedEdges: PositionedFlowEdge[] = [];

  for (const elkEdge of layoutResult.edges ?? []) {
    const data = edgeDataMap.get(elkEdge.id);
    if (!data) continue;

    const sourceNode = positionedNodeMap.get(data.sourceId);
    const targetNode = positionedNodeMap.get(data.targetId);

    const section = (elkEdge as { sections?: Array<{
      startPoint: Point;
      endPoint: Point;
      bendPoints?: Point[];
    }> }).sections?.[0];

    if (section) {
      const srcSnap = sourceNode
        ? snapToShape(section.startPoint, sourceNode)
        : { point: section.startPoint, exit: null as ExitDir };
      const tgtSnap = targetNode
        ? snapToShape(section.endPoint, targetNode)
        : { point: section.endPoint, exit: null as ExitDir };

      const bends = (section.bendPoints ?? []).map((p) => ({ x: p.x, y: p.y }));

      // Insert bridge bends to keep orthogonal routing after snap
      const firstAdj = bends[0] ?? tgtSnap.point;
      const srcBridge = bridgeBend(srcSnap.point, firstAdj, srcSnap.exit);
      if (srcBridge) bends.unshift(srcBridge);

      const lastAdj = bends[bends.length - 1] ?? srcSnap.point;
      const tgtBridge = bridgeBend(tgtSnap.point, lastAdj, tgtSnap.exit);
      if (tgtBridge) bends.push(tgtBridge);

      positionedEdges.push({
        data,
        sourcePoint: srcSnap.point,
        targetPoint: tgtSnap.point,
        bendPoints: bends,
      });
    } else if (sourceNode && targetNode) {
      // Fallback: straight line between node centers
      positionedEdges.push({
        data,
        sourcePoint: {
          x: sourceNode.x + sourceNode.width / 2,
          y: sourceNode.y + sourceNode.height / 2,
        },
        targetPoint: {
          x: targetNode.x + targetNode.width / 2,
          y: targetNode.y + targetNode.height / 2,
        },
        bendPoints: [],
      });
    }
  }

  return {
    nodes: positionedNodes,
    edges: positionedEdges,
    subgraphs: positionedSubgraphs,
    width: maxX + DIAGRAM_PADDING,
    height: maxY + DIAGRAM_PADDING,
  };
}
