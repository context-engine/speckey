/**
 * DiagramState — Svelte 5 runes-based state management for class diagrams.
 * Uses $state for mutable values and $derived for computed values.
 */

import type { RelationshipEdgeData, ExpansionLevel } from './types.ts';

export class DiagramState {
  selectedId = $state<string | null>(null);
  hoveredId = $state<string | null>(null);
  expansionLevels = $state<Map<string, ExpansionLevel>>(new Map());

  private relations: RelationshipEdgeData[];
  private nodeIds: string[];

  constructor(relations: RelationshipEdgeData[], nodeIds: string[]) {
    this.relations = relations;
    this.nodeIds = nodeIds;
  }

  /** Set of node IDs connected to the selected node via edges */
  connectedToSelected = $derived.by(() => {
    if (!this.selectedId) return new Set<string>();
    const connected = new Set<string>();
    for (const rel of this.relations) {
      if (rel.sourceId === this.selectedId) connected.add(rel.targetId);
      if (rel.targetId === this.selectedId) connected.add(rel.sourceId);
    }
    return connected;
  });

  /** Set of edge IDs connected to the selected node */
  connectedEdgeIds = $derived.by(() => {
    if (!this.selectedId) return new Set<string>();
    const edgeIds = new Set<string>();
    for (const rel of this.relations) {
      if (rel.sourceId === this.selectedId || rel.targetId === this.selectedId) {
        edgeIds.add(rel.id);
      }
    }
    return edgeIds;
  });

  select(id: string | null) {
    this.selectedId = this.selectedId === id ? null : id;
  }

  hover(id: string | null) {
    this.hoveredId = id;
  }

  toggleExpansion(id: string) {
    const current = this.expansionLevels.get(id) ?? 1;
    const next = ((current + 1) % 3) as ExpansionLevel;
    this.expansionLevels = new Map(this.expansionLevels).set(id, next);
  }

  getExpansion(id: string): ExpansionLevel {
    return this.expansionLevels.get(id) ?? 1;
  }

  expandAll() {
    const next = new Map<string, ExpansionLevel>();
    for (const id of this.nodeIds) {
      next.set(id, 2);
    }
    this.expansionLevels = next;
  }

  collapseAll() {
    this.expansionLevels = new Map();
  }
}

export function createDiagramState(
  relations: RelationshipEdgeData[],
  nodeIds: string[],
): DiagramState {
  return new DiagramState(relations, nodeIds);
}
