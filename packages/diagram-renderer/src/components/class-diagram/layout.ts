/**
 * ELK.js layout wrapper for class diagrams.
 * Converts ClassDiagramAST → PositionedDiagram with node positions and edge bend points.
 */

import ELK, {
  type ElkNode,
  type ElkExtendedEdge,
} from 'elkjs/lib/elk.bundled.js';
import type { ClassDiagramAST, ClassDirection } from '@speckey/mermaid-ast';
import type {
  ClassNodeData,
  MemberData,
  RelationshipEdgeData,
  PositionedDiagram,
  PositionedNode,
  PositionedEdge,
  ExpansionLevel,
  Point,
  RelationType,
  LineType,
} from './types.ts';

const elk = new ELK();

const NODE_WIDTH = 180;
const BASE_HEIGHT = 40;
const MEMBER_ROW_HEIGHT = 20;
const DIVIDER_PADDING = 8;
const DIAGRAM_PADDING = 40;

function getElkDirection(direction: ClassDirection): string {
  switch (direction) {
    case 'TB': return 'DOWN';
    case 'BT': return 'UP';
    case 'LR': return 'RIGHT';
    case 'RL': return 'LEFT';
    default: return 'DOWN';
  }
}

function computeNodeHeight(data: ClassNodeData, level: ExpansionLevel): number {
  if (level === 0) return BASE_HEIGHT;
  if (level === 1) {
    const methodRows = data.methods.length;
    return BASE_HEIGHT + (methodRows > 0 ? methodRows * MEMBER_ROW_HEIGHT + DIVIDER_PADDING : 0);
  }
  // level 2
  const attrRows = data.attributes.length;
  const methodRows = data.methods.length;
  return BASE_HEIGHT
    + (attrRows > 0 ? attrRows * MEMBER_ROW_HEIGHT + DIVIDER_PADDING : 0)
    + (methodRows > 0 ? methodRows * MEMBER_ROW_HEIGHT + DIVIDER_PADDING : 0);
}

function mapRelationType(type1: string, type2: string): RelationType {
  // mermaid-ast uses type1 for source-side and type2 for target-side markers
  // The meaningful type is whichever is not 'none'
  if (type2 !== 'none') return type2 as RelationType;
  if (type1 !== 'none') return type1 as RelationType;
  return 'none';
}

/**
 * Transform ClassDiagramAST into our own types.
 */
function transformAST(ast: ClassDiagramAST): {
  nodes: ClassNodeData[];
  edges: RelationshipEdgeData[];
} {
  const nodes: ClassNodeData[] = [];
  const edges: RelationshipEdgeData[] = [];

  for (const [id, cls] of ast.classes) {
    const attributes: MemberData[] = cls.members
      .filter((m) => m.type === 'attribute')
      .map((m) => ({
        name: m.text,
        visibility: m.visibility,
        memberType: 'attribute' as const,
      }));

    const methods: MemberData[] = cls.members
      .filter((m) => m.type === 'method')
      .map((m) => ({
        name: m.text,
        visibility: m.visibility,
        memberType: 'method' as const,
      }));

    nodes.push({
      id,
      name: cls.label || id,
      stereotype: cls.annotations[0],
      attributes,
      methods,
    });
  }

  for (let i = 0; i < ast.relations.length; i++) {
    const rel = ast.relations[i]!;
    edges.push({
      id: `edge-${i}`,
      sourceId: rel.id1,
      targetId: rel.id2,
      relationType: mapRelationType(rel.relation.type1, rel.relation.type2),
      lineType: rel.relation.lineType as LineType,
      label: rel.title,
    });
  }

  return { nodes, edges };
}

/**
 * Compute ELK layout and return a PositionedDiagram.
 */
export async function layoutClassDiagram(
  ast: ClassDiagramAST,
  expansionLevels?: Map<string, ExpansionLevel>,
): Promise<PositionedDiagram> {
  const { nodes, edges } = transformAST(ast);
  const levels = expansionLevels ?? new Map<string, ExpansionLevel>();

  // Build ELK graph with dynamic node sizing
  const elkNodes: ElkNode[] = nodes.map((node) => {
    const level = levels.get(node.id) ?? 1;
    return {
      id: node.id,
      width: NODE_WIDTH,
      height: computeNodeHeight(node, level),
    };
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
      'elk.spacing.nodeNode': '60',
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    },
    children: elkNodes,
    edges: elkEdges,
  };

  const layoutResult = await elk.layout(elkGraph);

  // Build node position map
  const nodeMap = new Map<string, ClassNodeData>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  const positionedNodes: PositionedNode[] = [];
  let maxX = 0;
  let maxY = 0;

  for (const child of layoutResult.children ?? []) {
    const data = nodeMap.get(child.id);
    if (!data) continue;
    const level = levels.get(child.id) ?? 1;
    const w = child.width ?? NODE_WIDTH;
    const h = child.height ?? computeNodeHeight(data, level);
    const x = child.x ?? 0;
    const y = child.y ?? 0;

    positionedNodes.push({ data, x, y, width: w, height: h });
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }

  // Extract edge bend points from ELK sections
  const edgeMap = new Map<string, RelationshipEdgeData>();
  for (const edge of edges) {
    edgeMap.set(edge.id, edge);
  }

  const positionedEdges: PositionedEdge[] = [];
  for (const elkEdge of layoutResult.edges ?? []) {
    const data = edgeMap.get(elkEdge.id);
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
    width: maxX + DIAGRAM_PADDING,
    height: maxY + DIAGRAM_PADDING,
  };
}

export { transformAST };
