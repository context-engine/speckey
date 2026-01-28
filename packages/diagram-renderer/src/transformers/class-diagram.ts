/**
 * Transforms mermaid-ast ClassDiagramAST to Svelte Flow nodes and edges
 * Uses ELK (Eclipse Layout Kernel) for powerful hierarchical layout
 */

import type { Node, Edge } from "@xyflow/svelte";
import type { ClassDiagramAST } from "mermaid-ast";
import ELK, { type ElkNode, type ElkExtendedEdge } from "elkjs/lib/elk.bundled.js";

export interface ClassNodeData extends Record<string, unknown> {
    name: string;
    stereotype?: string;
    attributes: string[];
    methods: string[];
}

const NODE_WIDTH = 180;
const NODE_HEIGHT = 120;

// ELK instance (reusable)
const elk = new ELK();

/**
 * Map relation type to edge style marker
 */
function getEdgeMarker(
    relationType: string
): { markerEnd?: string; markerStart?: string } {
    switch (relationType) {
        case "extension":
            return { markerEnd: "arrowclosed" };
        case "composition":
            return { markerStart: "diamond" };
        case "aggregation":
            return { markerStart: "diamond-open" };
        case "dependency":
            return { markerEnd: "arrow" };
        case "lollipop":
            return { markerEnd: "circle" };
        default:
            return { markerEnd: "arrow" };
    }
}

/**
 * Get edge style based on line type
 */
function getEdgeStyle(lineType: string): string {
    return lineType === "dotted" ? "stroke-dasharray: 5,5" : "";
}

/**
 * Map mermaid direction to ELK direction
 */
function getElkDirection(direction: string): string {
    switch (direction) {
        case "TB":
            return "DOWN";
        case "BT":
            return "UP";
        case "LR":
            return "RIGHT";
        case "RL":
            return "LEFT";
        default:
            return "DOWN";
    }
}

/**
 * Apply ELK layout to nodes and edges
 */
async function applyElkLayout(
    nodes: Node<ClassNodeData>[],
    edges: Edge[],
    direction: string = "TB"
): Promise<Node<ClassNodeData>[]> {
    // Build ELK graph structure
    const elkNodes: ElkNode[] = nodes.map((node) => ({
        id: node.id,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
    }));

    const elkEdges: ElkExtendedEdge[] = edges.map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
    }));

    const elkGraph: ElkNode = {
        id: "root",
        layoutOptions: {
            "elk.algorithm": "layered",
            "elk.direction": getElkDirection(direction),
            "elk.spacing.nodeNode": "80",
            "elk.layered.spacing.nodeNodeBetweenLayers": "100",
            "elk.edgeRouting": "ORTHOGONAL",
            "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
        },
        children: elkNodes,
        edges: elkEdges,
    };

    // Run ELK layout
    const layoutedGraph = await elk.layout(elkGraph);

    // Apply calculated positions to nodes
    const positionMap = new Map<string, { x: number; y: number }>();
    for (const child of layoutedGraph.children || []) {
        positionMap.set(child.id, { x: child.x || 0, y: child.y || 0 });
    }

    return nodes.map((node) => {
        const pos = positionMap.get(node.id) || { x: 0, y: 0 };
        return {
            ...node,
            position: pos,
        };
    });
}

/**
 * Transform a ClassDiagramAST to Svelte Flow nodes and edges (async)
 */
export async function transformClassDiagram(ast: ClassDiagramAST): Promise<{
    nodes: Node<ClassNodeData>[];
    edges: Edge[];
}> {
    const nodes: Node<ClassNodeData>[] = [];
    const edges: Edge[] = [];

    // Transform classes to nodes (without positions initially)
    for (const [id, cls] of ast.classes) {
        const attributes = cls.members
            .filter((m) => m.type === "attribute")
            .map((m) => `${m.visibility || ""}${m.text}`);

        const methods = cls.members
            .filter((m) => m.type === "method")
            .map((m) => `${m.visibility || ""}${m.text}`);

        nodes.push({
            id,
            type: "classNode",
            position: { x: 0, y: 0 }, // Will be set by ELK
            data: {
                name: cls.label || id,
                stereotype: cls.annotations[0],
                attributes,
                methods,
            },
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
        });
    }

    // Transform relations to edges
    let edgeIndex = 0;
    for (const rel of ast.relations) {
        const markers = getEdgeMarker(rel.relation.type2 || rel.relation.type1);

        edges.push({
            id: `edge-${edgeIndex++}`,
            source: rel.id1,
            target: rel.id2,
            type: "smoothstep",
            label: rel.title || "",
            style: getEdgeStyle(rel.relation.lineType),
            ...markers,
        });
    }

    // Apply ELK layout
    const direction = ast.direction || "TB";
    const layoutedNodes = await applyElkLayout(nodes, edges, direction);

    return { nodes: layoutedNodes, edges };
}
