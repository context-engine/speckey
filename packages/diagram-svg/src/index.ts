/**
 * @speckey/diagram-svg - Server-side SVG renderer for diagrams
 *
 * Supports flowcharts (ELK layout) and sequence diagrams (arithmetic layout).
 * Uses svg.js + svgdom for SVG generation.
 * Works in Bun, Node.js, and Deno without requiring a browser.
 */

// ---- Flowchart ----
export { layoutFlowchart } from './layout/elk-layout.js';
export { renderFlowchartToSVG } from './render-flowchart.js';

// ---- Sequence ----
export { layoutSequence } from './layout/sequence-layout.js';
export type {
  ActorLayout,
  ActivationLayout,
  BlockLayout,
  LifelineLayout,
  MessageLayout,
  NoteLayout,
  SequenceLayout,
} from './layout/sequence-layout.js';
export { renderSequenceToSVG } from './render-sequence.js';

// ---- Shared ----
export { getShape, shapeRegistry } from './shapes/index.js';
export type { ShapeRenderer } from './shapes/types.js';
export { defaultTheme, mergeTheme } from './themes/default.js';
export type {
  LayoutResult,
  PositionedEdge,
  PositionedNode,
  RenderOptions,
  Theme,
} from './types.js';
