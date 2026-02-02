/**
 * Sequence Diagram SVG Renderer
 *
 * Renders a SequenceAST to SVG with semantic data attributes baked in
 * for layer toggling support.
 *
 * Pipeline: SequenceAST → layoutSequence() → SVG elements → SVG string
 */

import type { SequenceAST } from '@speckey/mermaid-ast';
import { createMarkers, getMarkerUrl } from './edges/markers.js';
import {
  layoutSequence,
  type ActorLayout,
  type ActivationLayout,
  type BlockLayout,
  type LifelineLayout,
  type MessageLayout,
  type NoteLayout,
  type SequenceLayout,
} from './layout/sequence-layout.js';
import { createSvgContext } from './svg-context.js';
import { mergeTheme } from './themes/default.js';
import type { RenderOptions, Theme } from './types.js';
import type { G, Svg } from '@svgdotjs/svg.js';

/**
 * Render a SequenceAST to an SVG string.
 */
export function renderSequenceToSVG(
  ast: SequenceAST,
  options: RenderOptions = {},
): string {
  const theme = mergeTheme(options.theme);
  const padding = options.padding ?? 40;
  const layout = layoutSequence(ast, theme, padding);

  const width = options.width ?? layout.width;
  const height = options.height ?? layout.height;

  const ctx = createSvgContext(width, height);
  const { canvas } = ctx;

  // Background
  canvas.rect(width, height).fill(theme.background);

  // Marker defs
  const markers = createMarkers(canvas, theme);

  // Render in z-order: blocks → lifelines → activations → messages → notes → actors
  renderBlocks(canvas, layout.blocks, theme);
  renderLifelines(canvas, layout.lifelines, theme);
  renderActivations(canvas, layout.activations, theme);
  renderMessages(canvas, layout.messages, markers, theme);
  renderNotes(canvas, layout.notes, theme);
  renderActors(canvas, layout.actors, theme);

  // Mirrored actors at bottom
  if (layout.mirrorActors) {
    renderActors(canvas, layout.actors, theme, layout.height - padding - layout.actors[0]?.height);
  }

  const svg = ctx.toSvg();
  ctx.dispose();
  return svg;
}

// ---- Render functions ----

function renderActors(canvas: Svg, actors: ActorLayout[], theme: Theme, overrideY?: number): void {
  for (const actor of actors) {
    const y = overrideY ?? actor.y;
    const g = canvas.group();

    if (actor.type === 'actor') {
      // Stick figure
      renderStickFigure(g, actor.centerX, y, actor.width, actor.height, theme);
    } else {
      // Participant box
      g.rect(actor.width, actor.height)
        .move(actor.x, y)
        .fill(theme.nodeFill)
        .stroke({ color: theme.nodeStroke, width: theme.nodeStrokeWidth });
    }

    // Label
    g.text(actor.label)
      .font({ family: theme.fontFamily, size: theme.fontSize })
      .fill(theme.nodeTextColor)
      .center(actor.centerX, y + actor.height / 2);

    g.attr('data-actor', actor.id);
  }
}

function renderStickFigure(
  g: G,
  cx: number,
  y: number,
  _width: number,
  height: number,
  theme: Theme,
): void {
  const headR = 10;
  const bodyTop = y + headR * 2 + 2;
  const bodyBottom = y + height - 10;

  // Head
  g.circle(headR * 2).center(cx, y + headR).fill('none').stroke({ color: theme.nodeStroke, width: 1.5 });
  // Body
  g.line(cx, bodyTop, cx, bodyBottom).stroke({ color: theme.nodeStroke, width: 1.5 });
  // Arms
  g.line(cx - 15, bodyTop + 10, cx + 15, bodyTop + 10).stroke({ color: theme.nodeStroke, width: 1.5 });
  // Legs
  g.line(cx, bodyBottom, cx - 12, y + height).stroke({ color: theme.nodeStroke, width: 1.5 });
  g.line(cx, bodyBottom, cx + 12, y + height).stroke({ color: theme.nodeStroke, width: 1.5 });
}

function renderLifelines(canvas: Svg, lifelines: LifelineLayout[], theme: Theme): void {
  for (const ll of lifelines) {
    canvas
      .line(ll.x, ll.topY, ll.x, ll.bottomY)
      .stroke({ color: theme.lifelineStroke, width: 1, dasharray: theme.lifelineDash })
      .attr('data-lifeline', ll.actorId);
  }
}

function renderMessages(
  canvas: Svg,
  messages: MessageLayout[],
  markers: Map<string, string>,
  theme: Theme,
): void {
  for (const msg of messages) {
    const g = canvas.group();

    const isDotted = msg.arrowType.startsWith('dotted');
    const isCross = msg.arrowType.includes('cross');
    const isOpen = msg.arrowType.includes('open') || msg.arrowType.includes('point');
    const strokeAttrs: Record<string, unknown> = {
      color: theme.edgeStroke,
      width: theme.edgeStrokeWidth,
    };
    if (isDotted) {
      strokeAttrs.dasharray = '6,4';
    }

    if (msg.isSelf) {
      // Self-message: down-right-down path
      const x = msg.fromX;
      const w = msg.toX - msg.fromX;
      const path = `M ${x} ${msg.y} L ${x + w} ${msg.y} L ${x + w} ${msg.y + 20} L ${x} ${msg.y + 20}`;
      const line = g.path(path).fill('none').stroke(strokeAttrs);
      if (!isCross && !isOpen) {
        line.attr('marker-end', getMarkerUrl(markers.get('point')!));
      } else if (isCross) {
        line.attr('marker-end', getMarkerUrl(markers.get('cross')!));
      }
    } else {
      const line = g.line(msg.fromX, msg.y, msg.toX, msg.y).stroke(strokeAttrs);
      if (!isCross && !isOpen) {
        line.attr('marker-end', getMarkerUrl(markers.get('point')!));
      } else if (isCross) {
        line.attr('marker-end', getMarkerUrl(markers.get('cross')!));
      }
    }

    // Label
    if (msg.label) {
      const midX = msg.isSelf ? msg.fromX + (msg.toX - msg.fromX) / 2 : (msg.fromX + msg.toX) / 2;
      const labelY = msg.isSelf ? msg.y - 5 : msg.y - 8;
      g.text(msg.label)
        .font({ family: theme.fontFamily, size: theme.fontSize - 2 })
        .fill(theme.edgeTextColor)
        .center(midX, labelY);
    }

    // Semantic attributes
    g.attr('data-message-index', String(msg.index));
    if (msg.layerIds.length > 0) {
      g.attr('data-layers', msg.layerIds.join(' '));
    }
  }
}

function renderBlocks(canvas: Svg, blocks: BlockLayout[], theme: Theme): void {
  for (const block of blocks) {
    const g = canvas.group();

    // Background rect
    g.rect(block.width, block.height)
      .move(block.x, block.y)
      .fill(theme.blockFill)
      .stroke({ color: theme.blockStroke, width: 1 })
      .radius(4);

    // Type label tab (top-left corner)
    const tabText = block.type.toUpperCase();
    const tabWidth = tabText.length * 8 + 16;
    const tabHeight = 20;
    g.rect(tabWidth, tabHeight)
      .move(block.x, block.y)
      .fill(theme.blockStroke)
      .radius(4);
    // Square off bottom-right corner of tab
    g.rect(8, 8).move(block.x + tabWidth - 8, block.y + tabHeight - 8).fill(theme.blockStroke);

    g.text(tabText)
      .font({ family: theme.fontFamily, size: 10, weight: 'bold' })
      .fill('#ffffff')
      .move(block.x + 4, block.y + 2);

    // Block condition/label text
    if (block.label) {
      g.text(`[${block.label}]`)
        .font({ family: theme.fontFamily, size: theme.fontSize - 2 })
        .fill(theme.edgeTextColor)
        .move(block.x + tabWidth + 8, block.y + 2);
    }

    // Section dividers (for alt/par)
    if (block.sectionDividers) {
      for (const div of block.sectionDividers) {
        g.line(block.x, div.y, block.x + block.width, div.y)
          .stroke({ color: theme.blockStroke, width: 1, dasharray: '6,4' });
        g.text(`[${div.label}]`)
          .font({ family: theme.fontFamily, size: theme.fontSize - 2 })
          .fill(theme.edgeTextColor)
          .move(block.x + 8, div.y + 2);
      }
    }

    g.attr('data-layer-block', block.id);
  }
}

function renderActivations(canvas: Svg, activations: ActivationLayout[], theme: Theme): void {
  for (const act of activations) {
    canvas
      .rect(12, act.endY - act.startY)
      .move(act.x, act.startY)
      .fill(theme.activationFill)
      .stroke({ color: theme.nodeStroke, width: 1 })
      .attr('data-activation', act.actorId);
  }
}

function renderNotes(canvas: Svg, notes: NoteLayout[], theme: Theme): void {
  for (const note of notes) {
    const g = canvas.group();

    g.rect(note.width, note.height)
      .move(note.x, note.y)
      .fill(theme.noteFill)
      .stroke({ color: theme.noteStroke, width: 1 });

    g.text(note.text)
      .font({ family: theme.fontFamily, size: theme.fontSize - 2 })
      .fill(theme.nodeTextColor)
      .center(note.x + note.width / 2, note.y + note.height / 2);

    if (note.layerIds.length > 0) {
      g.attr('data-layers', note.layerIds.join(' '));
    }
  }
}
