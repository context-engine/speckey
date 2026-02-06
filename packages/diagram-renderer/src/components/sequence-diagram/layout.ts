/**
 * Arithmetic layout for sequence diagrams.
 * Flattens nested AST statements into grid rows and tracks control block regions.
 */

import type {
  SequenceAST,
  SequenceStatement,
  SequenceMessage,
  SequenceNote,
  SequenceAlt,
  SequenceLoop,
  SequenceOpt,
  SequencePar,
  SequenceCritical,
  SequenceBreak,
} from '@speckey/mermaid-ast';
import type {
  SequenceLayout,
  LayoutParticipant,
  LayoutRow,
  LayoutMessage,
  LayoutNote,
  LayoutBlockRegion,
} from './types.ts';

interface LayoutContext {
  participantColumns: Map<string, number>;
  rows: LayoutRow[];
  blocks: LayoutBlockRegion[];
  currentRow: number;
  messageCount: number;
  noteCount: number;
  blockCount: number;
}

function getColumn(ctx: LayoutContext, actorId: string): number {
  return ctx.participantColumns.get(actorId) ?? 0;
}

function flattenStatements(ctx: LayoutContext, statements: SequenceStatement[]): void {
  for (const stmt of statements) {
    switch (stmt.type) {
      case 'message':
        flattenMessage(ctx, stmt);
        break;
      case 'note':
        flattenNote(ctx, stmt);
        break;
      case 'alt':
        flattenAlt(ctx, stmt);
        break;
      case 'loop':
        flattenLoop(ctx, stmt);
        break;
      case 'opt':
        flattenOpt(ctx, stmt);
        break;
      case 'par':
        flattenPar(ctx, stmt);
        break;
      case 'critical':
        flattenCritical(ctx, stmt);
        break;
      case 'break':
        flattenBreak(ctx, stmt);
        break;
      // Skip activate/deactivate, autonumber, rect, links, etc. for PoC
      default:
        break;
    }
  }
}

function flattenMessage(ctx: LayoutContext, msg: SequenceMessage): void {
  const row: LayoutMessage = {
    type: 'message',
    id: `msg-${ctx.messageCount++}`,
    from: msg.from,
    to: msg.to,
    text: msg.text,
    arrowType: msg.arrowType,
    row: ctx.currentRow,
    sourceColumn: getColumn(ctx, msg.from),
    targetColumn: getColumn(ctx, msg.to),
  };
  ctx.rows.push(row);
  ctx.currentRow++;
}

function flattenNote(ctx: LayoutContext, note: SequenceNote): void {
  const firstActorCol = note.actors.length > 0 ? getColumn(ctx, note.actors[0]!) : 0;
  const lastActorCol = note.actors.length > 1
    ? getColumn(ctx, note.actors[note.actors.length - 1]!)
    : firstActorCol;

  let column: number;
  let columnSpan: number;

  if (note.placement === 'over') {
    column = Math.min(firstActorCol, lastActorCol);
    columnSpan = Math.abs(lastActorCol - firstActorCol) + 1;
  } else if (note.placement === 'left_of') {
    column = Math.max(0, firstActorCol - 1);
    columnSpan = 1;
  } else {
    // right_of
    column = firstActorCol;
    columnSpan = 1;
  }

  const row: LayoutNote = {
    type: 'note',
    id: `note-${ctx.noteCount++}`,
    text: note.text,
    placement: note.placement,
    actorIds: note.actors,
    row: ctx.currentRow,
    column,
    columnSpan,
  };
  ctx.rows.push(row);
  ctx.currentRow++;
}

function flattenAlt(ctx: LayoutContext, alt: SequenceAlt): void {
  const startRow = ctx.currentRow;
  const sections: Array<{ label: string; startRow: number }> = [];

  for (let i = 0; i < alt.sections.length; i++) {
    const section = alt.sections[i]!;
    sections.push({ label: section.condition, startRow: ctx.currentRow });
    flattenStatements(ctx, section.statements);
  }

  ctx.blocks.push({
    id: `block-${ctx.blockCount++}`,
    blockType: 'alt',
    label: sections[0]?.label ?? 'alt',
    startRow,
    endRow: ctx.currentRow - 1,
    sections: sections.slice(1), // First section is the main label
  });
}

function flattenLoop(ctx: LayoutContext, loop: SequenceLoop): void {
  const startRow = ctx.currentRow;
  flattenStatements(ctx, loop.statements);

  ctx.blocks.push({
    id: `block-${ctx.blockCount++}`,
    blockType: 'loop',
    label: loop.text,
    startRow,
    endRow: ctx.currentRow - 1,
    sections: [],
  });
}

function flattenOpt(ctx: LayoutContext, opt: SequenceOpt): void {
  const startRow = ctx.currentRow;
  flattenStatements(ctx, opt.statements);

  ctx.blocks.push({
    id: `block-${ctx.blockCount++}`,
    blockType: 'opt',
    label: opt.text,
    startRow,
    endRow: ctx.currentRow - 1,
    sections: [],
  });
}

function flattenPar(ctx: LayoutContext, par: SequencePar): void {
  const startRow = ctx.currentRow;
  const sections: Array<{ label: string; startRow: number }> = [];

  for (let i = 0; i < par.sections.length; i++) {
    const section = par.sections[i]!;
    sections.push({ label: section.text, startRow: ctx.currentRow });
    flattenStatements(ctx, section.statements);
  }

  ctx.blocks.push({
    id: `block-${ctx.blockCount++}`,
    blockType: 'par',
    label: sections[0]?.label ?? 'par',
    startRow,
    endRow: ctx.currentRow - 1,
    sections: sections.slice(1),
  });
}

function flattenCritical(ctx: LayoutContext, critical: SequenceCritical): void {
  const startRow = ctx.currentRow;
  const sections: Array<{ label: string; startRow: number }> = [];

  flattenStatements(ctx, critical.statements);

  for (const option of critical.options) {
    sections.push({ label: option.text, startRow: ctx.currentRow });
    flattenStatements(ctx, option.statements);
  }

  ctx.blocks.push({
    id: `block-${ctx.blockCount++}`,
    blockType: 'critical',
    label: critical.text,
    startRow,
    endRow: ctx.currentRow - 1,
    sections,
  });
}

function flattenBreak(ctx: LayoutContext, brk: SequenceBreak): void {
  const startRow = ctx.currentRow;
  flattenStatements(ctx, brk.statements);

  ctx.blocks.push({
    id: `block-${ctx.blockCount++}`,
    blockType: 'break',
    label: brk.text,
    startRow,
    endRow: ctx.currentRow - 1,
    sections: [],
  });
}

/**
 * Compute a sequence diagram layout from a SequenceAST.
 */
export function layoutSequenceDiagram(ast: SequenceAST): SequenceLayout {
  // Build participant list in declaration order
  const participants: LayoutParticipant[] = [];
  const participantColumns = new Map<string, number>();
  let colIndex = 0;

  for (const [id, actor] of ast.actors) {
    participants.push({
      id,
      name: actor.name || id,
      column: colIndex,
      type: actor.type,
    });
    participantColumns.set(id, colIndex);
    colIndex++;
  }

  const ctx: LayoutContext = {
    participantColumns,
    rows: [],
    blocks: [],
    currentRow: 0,
    messageCount: 0,
    noteCount: 0,
    blockCount: 0,
  };

  flattenStatements(ctx, ast.statements);

  return {
    participants,
    rows: ctx.rows,
    blocks: ctx.blocks,
    totalColumns: participants.length,
    totalRows: ctx.currentRow,
  };
}
