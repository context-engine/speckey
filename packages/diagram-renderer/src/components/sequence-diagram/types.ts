/**
 * Types for sequence diagram layout.
 * The layout flattens nested AST statements into grid-addressable rows.
 */

import type { SequenceArrowType, NotePlacement } from '@speckey/mermaid-ast';

// === Layout Row Items (flattened from AST) ===

export interface LayoutMessage {
  type: 'message';
  id: string;
  from: string;
  to: string;
  text: string;
  arrowType: SequenceArrowType;
  row: number;
  sourceColumn: number;
  targetColumn: number;
}

export interface LayoutNote {
  type: 'note';
  id: string;
  text: string;
  placement: NotePlacement;
  actorIds: string[];
  row: number;
  column: number;
  columnSpan: number;
}

export interface LayoutBlockRegion {
  id: string;
  blockType: 'alt' | 'loop' | 'opt' | 'par' | 'critical' | 'break';
  label: string;
  startRow: number;
  endRow: number;
  /** Section dividers within the block (e.g., else in alt, and in par) */
  sections: Array<{
    label: string;
    startRow: number;
  }>;
}

export type LayoutRow = LayoutMessage | LayoutNote;

// === Participant ===

export interface LayoutParticipant {
  id: string;
  name: string;
  column: number;
  type: 'participant' | 'actor';
}

// === Complete Layout ===

export interface SequenceLayout {
  participants: LayoutParticipant[];
  rows: LayoutRow[];
  blocks: LayoutBlockRegion[];
  totalColumns: number;
  totalRows: number;
}
