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

  // Determine which nodes belong to subgraphs
  const subgraphNodeIds = new Set<string>();

  const elkSubgraphs: ElkNode[] = subgraphs.map((sg) => {
    const children: ElkNode[] = sg.nodeIds
      .filter((id) => nodeSizeMap.has(id))
      .map((id) => {
        subgraphNodeIds.add(id);
        const size = nodeSizeMap.get(id)!;
        return { id, width: size.width, height: size.height };
      });

    return {
      id: sg.id,
      layoutOptions: {
        'elk.padding': `[top=${SUBGRAPH_PADDING + 20},left=${SUBGRAPH_PADDING},bottom=${SUBGRAPH_PADDING},right=${SUBGRAPH_PADDING}]`,
      },
      children,
    };
  });

  // Top-level nodes (not in any subgraph)
  const topLevelNodes: ElkNode[] = nodes
    .filter((n) => !subgraphNodeIds.has(n.id))
    .map((n) => {
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
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    },
    children: [...topLevelNodes, ...elkSubgraphs],
    edges: elkEdges,
  };

  const layoutResult = await elk.layout(elkGraph);

  // Extract positioned nodes (handles nested ELK results)
  const positionedNodes: PositionedFlowNode[] = [];
  let maxX = 0;
  let maxY = 0;

  function extractNodes(
    elkChildren: ElkNode[] | undefined,
    offsetX: number,
    offsetY: number,
  ): void {
    for (const child of elkChildren ?? []) {
      const data = nodeDataMap.get(child.id);
      if (data) {
        const x = (child.x ?? 0) + offsetX;
        const y = (child.y ?? 0) + offsetY;
        const w = child.width ?? nodeSizeMap.get(child.id)!.width;
        const h = child.height ?? nodeSizeMap.get(child.id)!.height;
        positionedNodes.push({ data, x, y, width: w, height: h });
        maxX = Math.max(maxX, x + w);
        maxY = Math.max(maxY, y + h);
      } else if (child.children) {
        // Subgraph compound node — recurse with offset
        const sgX = (child.x ?? 0) + offsetX;
        const sgY = (child.y ?? 0) + offsetY;
        extractNodes(child.children, sgX, sgY);
      }
    }
  }

  extractNodes(layoutResult.children, 0, 0);

  // Extract positioned subgraphs (bounding boxes)
  const positionedSubgraphs: PositionedFlowSubgraph[] = [];
  const subgraphDataMap = new Map(subgraphs.map((sg) => [sg.id, sg]));

  for (const child of layoutResult.children ?? []) {
    const sgData = subgraphDataMap.get(child.id);
    if (sgData) {
      const x = child.x ?? 0;
      const y = child.y ?? 0;
      const w = child.width ?? 200;
      const h = child.height ?? 100;
      positionedSubgraphs.push({ data: sgData, x, y, width: w, height: h });
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }
  }

  // Extract edge bend points (same pattern as class-diagram/layout.ts)
  const edgeDataMap = new Map(edges.map((e) => [e.id, e]));
  const positionedEdges: PositionedFlowEdge[] = [];

  for (const elkEdge of layoutResult.edges ?? []) {
    const data = edgeDataMap.get(elkEdge.id);
    if (!data) continue;

    const section = (elkEdge as { sections?: Array<{
      startPoint: Point;
      endPoint: Point;
      bendPoints?: Point[];
    }> }).sections?.[0];

    if (section) {
      positionedEdges.push({
        data,
        sourcePoint: { x: section.startPoint.x, y: section.startPoint.y },
        targetPoint: { x: section.endPoint.x, y: section.endPoint.y },
        bendPoints: (section.bendPoints ?? []).map((p) => ({ x: p.x, y: p.y })),
      });
    } else {
      // Fallback: straight line between node centers
      const sourceNode = positionedNodes.find((n) => n.data.id === data.sourceId);
      const targetNode = positionedNodes.find((n) => n.data.id === data.targetId);
      if (sourceNode && targetNode) {
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
  }

  return {
    nodes: positionedNodes,
    edges: positionedEdges,
    subgraphs: positionedSubgraphs,
    width: maxX + DIAGRAM_PADDING,
    height: maxY + DIAGRAM_PADDING,
  };
}
