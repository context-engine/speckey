/**
 * FlowchartState — Svelte 5 runes-based state for flowchart selection and hover.
 * Same pattern as class-diagram/state.svelte.ts without expansion levels.
 */

import type { FlowEdgeData } from './types.ts';

export class FlowchartState {
  selectedId = $state<string | null>(null);
  hoveredId = $state<string | null>(null);

  private edges: FlowEdgeData[];

  constructor(edges: FlowEdgeData[]) {
    this.edges = edges;
  }

  /** Set of node IDs connected to the selected node via edges */
  connectedToSelected = $derived.by(() => {
    if (!this.selectedId) return new Set<string>();
    const connected = new Set<string>();
    for (const edge of this.edges) {
      if (edge.sourceId === this.selectedId) connected.add(edge.targetId);
      if (edge.targetId === this.selectedId) connected.add(edge.sourceId);
    }
    return connected;
  });

  /** Set of edge IDs connected to the selected node */
  connectedEdgeIds = $derived.by(() => {
    if (!this.selectedId) return new Set<string>();
    const edgeIds = new Set<string>();
    for (const edge of this.edges) {
      if (edge.sourceId === this.selectedId || edge.targetId === this.selectedId) {
        edgeIds.add(edge.id);
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
}

export function createFlowchartState(edges: FlowEdgeData[]): FlowchartState {
  return new FlowchartState(edges);
}
