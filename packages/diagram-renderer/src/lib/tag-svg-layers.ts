/**
 * Post-processes Mermaid-rendered SVG to tag elements with layer data attributes.
 * Uses index-based positional matching: messages in SVG appear in the same order as in the AST.
 */

import type { Layer } from "./extract-layers.ts";

export interface TagResult {
    ok: boolean;
    svgMessageCount: number;
    astMessageCount: number;
    svgBlockCount: number;
    astBlockCount: number;
}

/**
 * Flatten all blocks from the layer tree in document order (pre-order traversal).
 */
function flattenBlocks(layers: Layer[]): Layer[] {
    const result: Layer[] = [];
    for (const layer of layers) {
        result.push(layer);
        result.push(...flattenBlocks(layer.children));
    }
    return result;
}

/**
 * Find innermost <g> elements that contain .loopLine — excludes ancestor
 * groups that only match because of a descendant group.
 */
function findLoopGroups(svgElement: SVGElement): Element[] {
    const loopLines = svgElement.querySelectorAll(".loopLine");
    const seen = new Set<Element>();
    const result: Element[] = [];

    for (const line of loopLines) {
        const g = line.closest("g");
        if (g && !seen.has(g)) {
            seen.add(g);
            result.push(g);
        }
    }
    return result;
}

/**
 * Tag SVG elements with data-layers attributes based on AST layer analysis.
 *
 * Tags as many elements as possible even when counts don't match perfectly.
 */
export function tagSvgWithLayers(
    svgElement: SVGElement,
    layers: Layer[],
    messageToLayers: Map<number, string[]>,
    totalMessages: number,
): TagResult {
    // Query message elements in document order
    const messageLines = svgElement.querySelectorAll(
        "line.messageLine0, line.messageLine1, path.messageLine0, path.messageLine1",
    );
    const messageTexts = svgElement.querySelectorAll(".messageText");

    // Find innermost block groups only
    const loopGroups = findLoopGroups(svgElement);

    const flatBlocks = flattenBlocks(layers);

    const messagesMatch = messageLines.length === totalMessages;
    const blocksMatch = loopGroups.length === flatBlocks.length;

    const result: TagResult = {
        ok: messagesMatch && blocksMatch,
        svgMessageCount: messageLines.length,
        astMessageCount: totalMessages,
        svgBlockCount: loopGroups.length,
        astBlockCount: flatBlocks.length,
    };

    if (!messagesMatch) {
        console.warn(
            `[tag-svg-layers] Message count mismatch: SVG has ${messageLines.length}, AST has ${totalMessages}. Tagging what we can.`,
        );
    }

    // Tag message lines with their layer memberships (tag up to the minimum count)
    const messageCount = Math.min(messageLines.length, totalMessages);
    for (let i = 0; i < messageCount; i++) {
        const layerIds = messageToLayers.get(i);
        if (layerIds && layerIds.length > 0) {
            const attr = layerIds.join(" ");
            messageLines[i]!.setAttribute("data-layers", attr);
        }
    }

    // Tag message text labels
    const textCount = Math.min(messageTexts.length, totalMessages);
    for (let i = 0; i < textCount; i++) {
        const layerIds = messageToLayers.get(i);
        if (layerIds && layerIds.length > 0) {
            messageTexts[i]!.setAttribute("data-layers", layerIds.join(" "));
        }
    }

    // Tag arrowheads / sequence numbers adjacent to message lines
    for (let i = 0; i < messageCount; i++) {
        const layerIds = messageToLayers.get(i);
        if (!layerIds || layerIds.length === 0) continue;

        const layerAttr = layerIds.join(" ");
        let sibling = messageLines[i]!.nextElementSibling;
        while (sibling) {
            if (sibling.classList.contains("sequenceNumber")) {
                sibling.setAttribute("data-layers", layerAttr);
                sibling = sibling.nextElementSibling;
            } else {
                break;
            }
        }
    }

    // Tag block groups
    if (blocksMatch) {
        loopGroups.forEach((el, i) => {
            el.setAttribute("data-layer-block", flatBlocks[i]!.id);
        });
    } else {
        console.warn(
            `[tag-svg-layers] Block count mismatch: SVG has ${loopGroups.length}, AST has ${flatBlocks.length}. Tagging what we can.`,
        );
        const blockCount = Math.min(loopGroups.length, flatBlocks.length);
        for (let i = 0; i < blockCount; i++) {
            loopGroups[i]!.setAttribute("data-layer-block", flatBlocks[i]!.id);
        }
    }

    console.log("[tag-svg-layers] Result:", result);
    return result;
}
