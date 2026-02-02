/**
 * Sequence Diagram Layout Engine
 *
 * Pure arithmetic layout: SequenceAST → SequenceLayout.
 * No ELK needed — participants are evenly spaced horizontally,
 * messages stack vertically with fixed row height.
 */

import type {
  SequenceAST,
  SequenceStatement,
  SequenceMessage,
  SequenceNote,
  SequenceLoop,
  SequenceAlt,
  SequenceOpt,
  SequencePar,
  SequenceCritical,
  SequenceBreak,
  SequenceRect,
  SequenceArrowType,
  NotePlacement,
} from '@speckey/mermaid-ast';
import type { Theme } from '../types.js';

// ---- Layout result types ----

export interface ActorLayout {
  id: string;
  label: string;
  type: 'participant' | 'actor';
  x: number;
  y: number;
  width: number;
  height: number;
  /** Center x for lifeline */
  centerX: number;
}

export interface LifelineLayout {
  actorId: string;
  x: number;
  topY: number;
  bottomY: number;
}

export interface MessageLayout {
  index: number;
  fromX: number;
  toX: number;
  y: number;
  label: string;
  arrowType: SequenceArrowType;
  isSelf: boolean;
  /** Layer IDs this message belongs to (for toggling) */
  layerIds: string[];
}

export interface BlockLayout {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** For alt/par: section dividers at these y-positions */
  sectionDividers?: Array<{ y: number; label: string }>;
}

export interface ActivationLayout {
  actorId: string;
  x: number;
  startY: number;
  endY: number;
}

export interface NoteLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  /** Layer IDs for toggling */
  layerIds: string[];
}

export interface SequenceLayout {
  width: number;
  height: number;
  actors: ActorLayout[];
  lifelines: LifelineLayout[];
  messages: MessageLayout[];
  blocks: BlockLayout[];
  activations: ActivationLayout[];
  notes: NoteLayout[];
  /** Mirrored actor boxes at bottom */
  mirrorActors: boolean;
}

// ---- Internal state during layout ----

interface LayoutState {
  actorOrder: string[];
  actorX: Map<string, number>;
  currentY: number;
  messageIndex: number;
  blockCounter: number;
  messages: MessageLayout[];
  blocks: BlockLayout[];
  activations: ActivationLayout[];
  notes: NoteLayout[];
  activeActors: Map<string, number[]>; // actor -> stack of startY values
  layerStack: string[]; // current nesting of layer IDs
  theme: Theme;
  padding: number;
}

// ---- Constants ----

const ACTOR_BOX_WIDTH = 120;
const ACTOR_BOX_HEIGHT = 40;
const SELF_MESSAGE_WIDTH = 40;
const SELF_MESSAGE_HEIGHT = 30;
const NOTE_WIDTH = 120;
const NOTE_HEIGHT = 30;
const NOTE_MARGIN = 10;
const ACTIVATION_WIDTH = 12;
const BLOCK_PADDING = 10;

/**
 * Layout a sequence diagram from its AST.
 */
export function layoutSequence(ast: SequenceAST, theme: Theme, padding = 40): SequenceLayout {
  const actorOrder = Array.from(ast.actors.keys());
  const actorX = new Map<string, number>();

  // Position actors horizontally
  const actorSpacing = theme.actorSpacing;
  const startX = padding;
  for (let i = 0; i < actorOrder.length; i++) {
    actorX.set(actorOrder[i], startX + i * actorSpacing);
  }

  const state: LayoutState = {
    actorOrder,
    actorX,
    currentY: padding + ACTOR_BOX_HEIGHT + 20, // below top actor boxes
    messageIndex: 0,
    blockCounter: 0,
    messages: [],
    blocks: [],
    activations: [],
    notes: [],
    activeActors: new Map(),
    layerStack: [],
    theme,
    padding,
  };

  // Walk statements recursively
  walkStatements(ast.statements, state);

  // Close any remaining activations
  for (const [actorId, starts] of state.activeActors) {
    for (const startY of starts) {
      state.activations.push({
        actorId,
        x: actorX.get(actorId)! + ACTOR_BOX_WIDTH / 2 - ACTIVATION_WIDTH / 2,
        startY,
        endY: state.currentY,
      });
    }
  }

  // Build actor layouts
  const actors: ActorLayout[] = actorOrder.map((id) => {
    const actor = ast.actors.get(id)!;
    const x = actorX.get(id)!;
    return {
      id,
      label: actor.name,
      type: actor.type,
      x,
      y: padding,
      width: ACTOR_BOX_WIDTH,
      height: ACTOR_BOX_HEIGHT,
      centerX: x + ACTOR_BOX_WIDTH / 2,
    };
  });

  // Bottom of diagram
  const bottomY = state.currentY + 20;

  // Lifelines
  const lifelines: LifelineLayout[] = actorOrder.map((id) => {
    const cx = actorX.get(id)! + ACTOR_BOX_WIDTH / 2;
    return {
      actorId: id,
      x: cx,
      topY: padding + ACTOR_BOX_HEIGHT,
      bottomY,
    };
  });

  // Total dimensions
  const rightmostActor = actorOrder.length > 0 ? actorX.get(actorOrder[actorOrder.length - 1])! : 0;
  const width = rightmostActor + ACTOR_BOX_WIDTH + padding;
  const height = bottomY + ACTOR_BOX_HEIGHT + padding; // room for mirrored actors

  return {
    width,
    height,
    actors,
    lifelines,
    messages: state.messages,
    blocks: state.blocks,
    activations: state.activations,
    notes: state.notes,
    mirrorActors: true,
  };
}

// ---- Statement walker ----

function walkStatements(statements: SequenceStatement[], state: LayoutState): void {
  for (const stmt of statements) {
    switch (stmt.type) {
      case 'message':
        layoutMessage(stmt, state);
        break;
      case 'note':
        layoutNote(stmt, state);
        break;
      case 'activate':
        startActivation(stmt.actor, state);
        break;
      case 'deactivate':
        endActivation(stmt.actor, state);
        break;
      case 'loop':
        layoutLoop(stmt, state);
        break;
      case 'alt':
        layoutAlt(stmt, state);
        break;
      case 'opt':
        layoutOpt(stmt, state);
        break;
      case 'par':
        layoutPar(stmt, state);
        break;
      case 'critical':
        layoutCritical(stmt, state);
        break;
      case 'break':
        layoutBreak(stmt, state);
        break;
      case 'rect':
        layoutRect(stmt, state);
        break;
      // autonumber, link, etc. don't affect layout
      default:
        break;
    }
  }
}

function layoutMessage(msg: SequenceMessage, state: LayoutState): void {
  const fromCX = getActorCenterX(msg.from, state);
  const toCX = getActorCenterX(msg.to, state);
  const isSelf = msg.from === msg.to;

  if (isSelf) {
    state.currentY += SELF_MESSAGE_HEIGHT;
  }

  const y = state.currentY;

  state.messages.push({
    index: state.messageIndex++,
    fromX: fromCX,
    toX: isSelf ? fromCX + SELF_MESSAGE_WIDTH : toCX,
    y,
    label: msg.text,
    arrowType: msg.arrowType,
    isSelf,
    layerIds: [...state.layerStack],
  });

  // Handle activation shortcuts
  if (msg.activate) {
    startActivation(msg.to, state);
  }
  if (msg.deactivate) {
    endActivation(msg.from, state);
  }

  state.currentY += state.theme.messageSpacing;
}

function layoutNote(note: SequenceNote, state: LayoutState): void {
  const y = state.currentY;
  let x: number;

  if (note.placement === 'over') {
    if (note.actors.length === 1) {
      x = getActorCenterX(note.actors[0], state) - NOTE_WIDTH / 2;
    } else {
      const left = getActorCenterX(note.actors[0], state);
      const right = getActorCenterX(note.actors[note.actors.length - 1], state);
      x = left;
      // Width spans between actors — handled by note width
    }
  } else if (note.placement === 'left_of') {
    x = getActorCenterX(note.actors[0], state) - NOTE_WIDTH - NOTE_MARGIN;
  } else {
    // right_of
    x = getActorCenterX(note.actors[0], state) + NOTE_MARGIN;
  }

  state.notes.push({
    x,
    y,
    width: NOTE_WIDTH,
    height: NOTE_HEIGHT,
    text: note.text,
    layerIds: [...state.layerStack],
  });

  state.currentY += NOTE_HEIGHT + 10;
}

function startActivation(actorId: string, state: LayoutState): void {
  if (!state.activeActors.has(actorId)) {
    state.activeActors.set(actorId, []);
  }
  state.activeActors.get(actorId)!.push(state.currentY);
}

function endActivation(actorId: string, state: LayoutState): void {
  const starts = state.activeActors.get(actorId);
  if (starts && starts.length > 0) {
    const startY = starts.pop()!;
    state.activations.push({
      actorId,
      x: state.actorX.get(actorId)! + ACTOR_BOX_WIDTH / 2 - ACTIVATION_WIDTH / 2,
      startY,
      endY: state.currentY,
    });
    if (starts.length === 0) {
      state.activeActors.delete(actorId);
    }
  }
}

// ---- Block layouts ----

function layoutBlockWithStatements(
  blockType: string,
  label: string,
  statements: SequenceStatement[],
  state: LayoutState,
  sectionDividers?: Array<{ y: number; label: string }>,
): void {
  const blockId = `${blockType}-${state.blockCounter++}`;
  state.layerStack.push(blockId);

  const startY = state.currentY;
  state.currentY += BLOCK_PADDING + 20; // room for block header

  walkStatements(statements, state);

  state.currentY += BLOCK_PADDING;

  const blockX = state.padding;
  const rightmostActor = state.actorOrder.length > 0
    ? state.actorX.get(state.actorOrder[state.actorOrder.length - 1])!
    : 0;
  const blockWidth = rightmostActor + ACTOR_BOX_WIDTH - state.padding;

  state.blocks.push({
    id: blockId,
    type: blockType,
    label,
    x: blockX,
    y: startY,
    width: blockWidth,
    height: state.currentY - startY,
    sectionDividers,
  });

  state.layerStack.pop();
}

function layoutLoop(stmt: SequenceLoop, state: LayoutState): void {
  layoutBlockWithStatements('loop', stmt.text, stmt.statements, state);
}

function layoutOpt(stmt: SequenceOpt, state: LayoutState): void {
  layoutBlockWithStatements('opt', stmt.text, stmt.statements, state);
}

function layoutBreak(stmt: SequenceBreak, state: LayoutState): void {
  layoutBlockWithStatements('break', stmt.text, stmt.statements, state);
}

function layoutRect(stmt: SequenceRect, state: LayoutState): void {
  layoutBlockWithStatements('rect', stmt.color, stmt.statements, state);
}

function layoutAlt(stmt: SequenceAlt, state: LayoutState): void {
  const blockId = `alt-${state.blockCounter++}`;
  state.layerStack.push(blockId);

  const startY = state.currentY;
  const dividers: Array<{ y: number; label: string }> = [];

  for (let i = 0; i < stmt.sections.length; i++) {
    if (i > 0) {
      dividers.push({ y: state.currentY, label: stmt.sections[i].condition });
    }
    state.currentY += BLOCK_PADDING + (i === 0 ? 20 : 10); // header space for first section
    walkStatements(stmt.sections[i].statements, state);
    state.currentY += BLOCK_PADDING;
  }

  const blockX = state.padding;
  const rightmostActor = state.actorOrder.length > 0
    ? state.actorX.get(state.actorOrder[state.actorOrder.length - 1])!
    : 0;
  const blockWidth = rightmostActor + ACTOR_BOX_WIDTH - state.padding;

  state.blocks.push({
    id: blockId,
    type: 'alt',
    label: stmt.sections[0].condition,
    x: blockX,
    y: startY,
    width: blockWidth,
    height: state.currentY - startY,
    sectionDividers: dividers,
  });

  state.layerStack.pop();
}

function layoutPar(stmt: SequencePar, state: LayoutState): void {
  const blockId = `par-${state.blockCounter++}`;
  state.layerStack.push(blockId);

  const startY = state.currentY;
  const dividers: Array<{ y: number; label: string }> = [];

  for (let i = 0; i < stmt.sections.length; i++) {
    if (i > 0) {
      dividers.push({ y: state.currentY, label: stmt.sections[i].text });
    }
    state.currentY += BLOCK_PADDING + (i === 0 ? 20 : 10);
    walkStatements(stmt.sections[i].statements, state);
    state.currentY += BLOCK_PADDING;
  }

  const blockX = state.padding;
  const rightmostActor = state.actorOrder.length > 0
    ? state.actorX.get(state.actorOrder[state.actorOrder.length - 1])!
    : 0;
  const blockWidth = rightmostActor + ACTOR_BOX_WIDTH - state.padding;

  state.blocks.push({
    id: blockId,
    type: 'par',
    label: stmt.sections[0].text,
    x: blockX,
    y: startY,
    width: blockWidth,
    height: state.currentY - startY,
    sectionDividers: dividers,
  });

  state.layerStack.pop();
}

function layoutCritical(stmt: SequenceCritical, state: LayoutState): void {
  const blockId = `critical-${state.blockCounter++}`;
  state.layerStack.push(blockId);

  const startY = state.currentY;
  const dividers: Array<{ y: number; label: string }> = [];

  // Main body
  state.currentY += BLOCK_PADDING + 20;
  walkStatements(stmt.statements, state);
  state.currentY += BLOCK_PADDING;

  // Options
  for (const opt of stmt.options) {
    dividers.push({ y: state.currentY, label: opt.text });
    state.currentY += BLOCK_PADDING + 10;
    walkStatements(opt.statements, state);
    state.currentY += BLOCK_PADDING;
  }

  const blockX = state.padding;
  const rightmostActor = state.actorOrder.length > 0
    ? state.actorX.get(state.actorOrder[state.actorOrder.length - 1])!
    : 0;
  const blockWidth = rightmostActor + ACTOR_BOX_WIDTH - state.padding;

  state.blocks.push({
    id: blockId,
    type: 'critical',
    label: stmt.text,
    x: blockX,
    y: startY,
    width: blockWidth,
    height: state.currentY - startY,
    sectionDividers: dividers,
  });

  state.layerStack.pop();
}

// ---- Helpers ----

function getActorCenterX(actorId: string, state: LayoutState): number {
  const x = state.actorX.get(actorId);
  if (x === undefined) {
    // Unknown actor — place after the last known one
    return (state.actorOrder.length * state.theme.actorSpacing) + state.padding + ACTOR_BOX_WIDTH / 2;
  }
  return x + ACTOR_BOX_WIDTH / 2;
}
