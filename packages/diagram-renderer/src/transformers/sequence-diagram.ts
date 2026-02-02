/**
 * Transforms mermaid-ast SequenceAST to Svelte Flow nodes and edges
 * Stripe-style layout: colored lifelines, message cards between actors, horizontal arrows
 */

import type { Node, Edge } from "@xyflow/svelte";
import type { SequenceAST, SequenceArrowType, NotePlacement } from "mermaid-ast";

// Actor colors assigned in order
const ACTOR_COLORS = [
    "#22c55e", // green
    "#f59e0b", // amber
    "#3b82f6", // blue
    "#ef4444", // red
    "#a855f7", // purple
    "#06b6d4", // cyan
    "#ec4899", // pink
    "#84cc16", // lime
];

export interface SequenceActorNodeData extends Record<string, unknown> {
    name: string;
    actorType: "participant" | "actor";
    color: string;
}

export interface SequenceLifelineNodeData extends Record<string, unknown> {
    color: string;
    height: number;
}

export interface SequenceMessageNodeData extends Record<string, unknown> {
    text: string;
    direction: "left" | "right" | "self";
    arrowType: SequenceArrowType;
}

export interface SequenceNoteNodeData extends Record<string, unknown> {
    text: string;
    placement: NotePlacement;
}

export type SequenceNodeData =
    | SequenceActorNodeData
    | SequenceLifelineNodeData
    | SequenceMessageNodeData
    | SequenceNoteNodeData;

const ACTOR_SPACING = 300;
const ACTOR_LABEL_WIDTH = 140;
const ACTOR_LABEL_HEIGHT = 30;
const LIFELINE_WIDTH = 6;
const MESSAGE_ROW_HEIGHT = 120;
const FIRST_ROW_Y = 60;
const MESSAGE_NODE_WIDTH = 200;
const MESSAGE_NODE_HEIGHT = 80;
const NOTE_WIDTH = 150;
const NOTE_HEIGHT = 50;

function isDottedArrow(arrowType: SequenceArrowType): boolean {
    return arrowType.startsWith("dotted") || arrowType === "bidirectional_dotted";
}

/**
 * Transform a SequenceAST to Svelte Flow nodes and edges (Stripe-style)
 */
export async function transformSequenceDiagram(ast: SequenceAST): Promise<{
    nodes: Node<SequenceNodeData>[];
    edges: Edge[];
}> {
    const nodes: Node<SequenceNodeData>[] = [];
    const edges: Edge[] = [];

    const actorIds = Array.from(ast.actors.keys());
    const actorCenterX = new Map<string, number>();

    // Count message rows to determine lifeline height
    let totalRows = 0;
    for (const stmt of ast.statements) {
        if (stmt.type === "message" || stmt.type === "note") {
            totalRows++;
        }
    }
    const lifelineHeight = FIRST_ROW_Y + totalRows * MESSAGE_ROW_HEIGHT + 40;

    // Create actor label nodes + lifeline nodes
    for (let i = 0; i < actorIds.length; i++) {
        const actorId = actorIds[i]!;
        const actor = ast.actors.get(actorId)!;
        const color = ACTOR_COLORS[i % ACTOR_COLORS.length]!;
        const centerX = i * ACTOR_SPACING;
        actorCenterX.set(actorId, centerX);

        // Actor label at top
        const actorData: SequenceActorNodeData = {
            name: actor.name || actorId,
            actorType: actor.type,
            color,
        };
        nodes.push({
            id: `actor-${actorId}`,
            type: "actorNode",
            position: { x: centerX - ACTOR_LABEL_WIDTH / 2, y: 0 },
            data: actorData,
            width: ACTOR_LABEL_WIDTH,
            height: ACTOR_LABEL_HEIGHT,
        });

        // Lifeline (tall vertical bar)
        const lifelineData: SequenceLifelineNodeData = {
            color,
            height: lifelineHeight,
        };
        nodes.push({
            id: `lifeline-${actorId}`,
            type: "lifelineNode",
            position: { x: centerX - LIFELINE_WIDTH / 2, y: FIRST_ROW_Y },
            data: lifelineData,
            width: LIFELINE_WIDTH,
            height: lifelineHeight,
        });
    }

    // Process messages and notes
    let rowIndex = 0;
    let edgeIndex = 0;
    let noteIndex = 0;

    for (const stmt of ast.statements) {
        if (stmt.type === "message") {
            const fromX = actorCenterX.get(stmt.from) || 0;
            const toX = actorCenterX.get(stmt.to) || 0;
            const y = FIRST_ROW_Y + rowIndex * MESSAGE_ROW_HEIGHT + 20;
            const isSelf = stmt.from === stmt.to;

            // Determine direction and message node position
            const direction: "left" | "right" | "self" = isSelf
                ? "self"
                : toX > fromX
                    ? "right"
                    : "left";

            // Position message node between the two actors
            const msgCenterX = isSelf
                ? fromX + ACTOR_SPACING / 4
                : (fromX + toX) / 2;

            const msgId = `msg-${rowIndex}`;
            const msgData: SequenceMessageNodeData = {
                text: stmt.text,
                direction,
                arrowType: stmt.arrowType,
            };
            nodes.push({
                id: msgId,
                type: "messageNode",
                position: {
                    x: msgCenterX - MESSAGE_NODE_WIDTH / 2,
                    y,
                },
                data: msgData,
                width: MESSAGE_NODE_WIDTH,
                height: MESSAGE_NODE_HEIGHT,
            });

            // Edges: source lifeline → message node → target lifeline
            const isDotted = isDottedArrow(stmt.arrowType);
            const edgeStyle = isDotted ? "stroke-dasharray: 5,5; stroke: #9ca3af" : "stroke: #9ca3af";

            if (!isSelf) {
                // Incoming arrow: source lifeline → message box
                edges.push({
                    id: `edge-${edgeIndex++}`,
                    source: `lifeline-${stmt.from}`,
                    target: msgId,
                    type: "smoothstep",
                    style: edgeStyle,
                    markerEnd: "arrow",
                });

                // Outgoing arrow: message box → target lifeline
                edges.push({
                    id: `edge-${edgeIndex++}`,
                    source: msgId,
                    target: `lifeline-${stmt.to}`,
                    type: "smoothstep",
                    style: edgeStyle,
                    markerEnd: "arrow",
                });
            } else {
                // Self-message: single edge from lifeline to message
                edges.push({
                    id: `edge-${edgeIndex++}`,
                    source: `lifeline-${stmt.from}`,
                    target: msgId,
                    type: "smoothstep",
                    style: edgeStyle,
                    markerEnd: "arrow",
                });
            }

            rowIndex++;
        } else if (stmt.type === "note") {
            const noteId = `note-${noteIndex++}`;
            const y = FIRST_ROW_Y + rowIndex * MESSAGE_ROW_HEIGHT + 20;
            let x = 0;

            if (stmt.actors.length > 0) {
                const firstActorX = actorCenterX.get(stmt.actors[0]!) || 0;

                if (stmt.placement === "left_of") {
                    x = firstActorX - ACTOR_SPACING / 2;
                } else if (stmt.placement === "right_of") {
                    x = firstActorX + ACTOR_SPACING / 4;
                } else {
                    // "over"
                    if (stmt.actors.length > 1) {
                        const lastActorX = actorCenterX.get(stmt.actors[stmt.actors.length - 1]!) || 0;
                        x = (firstActorX + lastActorX) / 2 - NOTE_WIDTH / 2;
                    } else {
                        x = firstActorX - NOTE_WIDTH / 2;
                    }
                }
            }

            const noteData: SequenceNoteNodeData = {
                text: stmt.text,
                placement: stmt.placement,
            };
            nodes.push({
                id: noteId,
                type: "noteNode",
                position: { x, y },
                data: noteData,
                width: NOTE_WIDTH,
                height: NOTE_HEIGHT,
            });

            rowIndex++;
        }
    }

    return { nodes, edges };
}
