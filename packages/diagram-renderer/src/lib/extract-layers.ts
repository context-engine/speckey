/**
 * Extracts layer metadata from a SequenceAST.
 * Each control block (loop, alt, opt, par, critical, break) becomes a layer
 * with references to which message indices it contains.
 */

import type { SequenceAST, SequenceStatement } from "@speckey/mermaid-ast";

export interface Layer {
    id: string;
    type: "loop" | "alt" | "opt" | "par" | "critical" | "break" | "rect";
    label: string;
    children: Layer[];
    messageIndices: number[];
}

interface ExtractionContext {
    messageIndex: number;
    blockIndex: number;
}

function walkStatements(
    statements: SequenceStatement[],
    ctx: ExtractionContext,
    parentLayers: string[],
): { layers: Layer[]; messageToLayers: Map<number, string[]> } {
    const layers: Layer[] = [];
    const messageToLayers = new Map<number, string[]>();

    for (const stmt of statements) {
        switch (stmt.type) {
            case "message":
            case "note": {
                const idx = ctx.messageIndex++;
                // Tag this message with all ancestor layers
                if (parentLayers.length > 0) {
                    messageToLayers.set(idx, [...parentLayers]);
                }
                break;
            }
            case "loop":
            case "opt":
            case "break": {
                const layerId = `${stmt.type}-${ctx.blockIndex++}`;
                const layer: Layer = {
                    id: layerId,
                    type: stmt.type,
                    label: stmt.text,
                    children: [],
                    messageIndices: [],
                };

                const childLayers = [...parentLayers, layerId];
                const result = walkStatements(stmt.statements, ctx, childLayers);
                layer.children = result.layers;

                // Collect message indices for this layer
                for (const [idx, layerIds] of result.messageToLayers) {
                    if (layerIds.includes(layerId)) {
                        layer.messageIndices.push(idx);
                    }
                    // Merge into parent map
                    const existing = messageToLayers.get(idx) || [];
                    messageToLayers.set(idx, [...new Set([...existing, ...layerIds])]);
                }

                layers.push(layer);
                break;
            }
            case "alt":
            case "par": {
                const layerId = `${stmt.type}-${ctx.blockIndex++}`;
                const layer: Layer = {
                    id: layerId,
                    type: stmt.type,
                    label: (() => {
                        const s = stmt.sections[0];
                        if (!s) return "";
                        return "condition" in s ? s.condition : s.text;
                    })(),
                    children: [],
                    messageIndices: [],
                };

                const childLayers = [...parentLayers, layerId];

                for (let i = 0; i < stmt.sections.length; i++) {
                    const section = stmt.sections[i]!;
                    const sectionId = `${layerId}-section-${i}`;
                    const sectionLabel =
                        "condition" in section ? section.condition : section.text;
                    const sectionLayer: Layer = {
                        id: sectionId,
                        type: stmt.type,
                        label: i === 0 ? sectionLabel : `else: ${sectionLabel}`,
                        children: [],
                        messageIndices: [],
                    };

                    const sectionLayers = [...childLayers, sectionId];
                    const result = walkStatements(
                        section.statements,
                        ctx,
                        sectionLayers,
                    );
                    sectionLayer.children = result.layers;

                    for (const [idx, layerIds] of result.messageToLayers) {
                        if (layerIds.includes(sectionId)) {
                            sectionLayer.messageIndices.push(idx);
                        }
                        if (layerIds.includes(layerId)) {
                            layer.messageIndices.push(idx);
                        }
                        const existing = messageToLayers.get(idx) || [];
                        messageToLayers.set(idx, [
                            ...new Set([...existing, ...layerIds]),
                        ]);
                    }

                    layer.children.push(sectionLayer);
                }

                layers.push(layer);
                break;
            }
            case "critical": {
                const layerId = `critical-${ctx.blockIndex++}`;
                const layer: Layer = {
                    id: layerId,
                    type: "critical",
                    label: stmt.text,
                    children: [],
                    messageIndices: [],
                };

                const childLayers = [...parentLayers, layerId];
                const mainResult = walkStatements(
                    stmt.statements,
                    ctx,
                    childLayers,
                );
                layer.children = mainResult.layers;

                for (const [idx, layerIds] of mainResult.messageToLayers) {
                    if (layerIds.includes(layerId)) {
                        layer.messageIndices.push(idx);
                    }
                    const existing = messageToLayers.get(idx) || [];
                    messageToLayers.set(idx, [
                        ...new Set([...existing, ...layerIds]),
                    ]);
                }

                // Process options (like alt sections)
                for (let i = 0; i < stmt.options.length; i++) {
                    const option = stmt.options[i]!;
                    const optionId = `${layerId}-option-${i}`;
                    const optionLayer: Layer = {
                        id: optionId,
                        type: "critical",
                        label: `option: ${option.text}`,
                        children: [],
                        messageIndices: [],
                    };

                    const optionLayers = [...childLayers, optionId];
                    const optResult = walkStatements(
                        option.statements,
                        ctx,
                        optionLayers,
                    );
                    optionLayer.children = optResult.layers;

                    for (const [idx, layerIds] of optResult.messageToLayers) {
                        if (layerIds.includes(optionId)) {
                            optionLayer.messageIndices.push(idx);
                        }
                        if (layerIds.includes(layerId)) {
                            layer.messageIndices.push(idx);
                        }
                        const existing = messageToLayers.get(idx) || [];
                        messageToLayers.set(idx, [
                            ...new Set([...existing, ...layerIds]),
                        ]);
                    }

                    layer.children.push(optionLayer);
                }

                layers.push(layer);
                break;
            }
            case "rect": {
                const layerId = `rect-${ctx.blockIndex++}`;
                const layer: Layer = {
                    id: layerId,
                    type: "rect",
                    label: stmt.color || "highlight",
                    children: [],
                    messageIndices: [],
                };

                const childLayers = [...parentLayers, layerId];
                const result = walkStatements(stmt.statements, ctx, childLayers);
                layer.children = result.layers;

                for (const [idx, layerIds] of result.messageToLayers) {
                    if (layerIds.includes(layerId)) {
                        layer.messageIndices.push(idx);
                    }
                    const existing = messageToLayers.get(idx) || [];
                    messageToLayers.set(idx, [
                        ...new Set([...existing, ...layerIds]),
                    ]);
                }

                layers.push(layer);
                break;
            }
            // Skip activate/deactivate, autonumber, link, links, properties, details
            default:
                break;
        }
    }

    return { layers, messageToLayers };
}

/**
 * Extract layers and message-to-layer mapping from a SequenceAST.
 */
export function extractLayers(ast: SequenceAST): {
    layers: Layer[];
    messageToLayers: Map<number, string[]>;
    totalMessages: number;
} {
    const ctx: ExtractionContext = { messageIndex: 0, blockIndex: 0 };
    const { layers, messageToLayers } = walkStatements(
        ast.statements,
        ctx,
        [],
    );
    return { layers, messageToLayers, totalMessages: ctx.messageIndex };
}
