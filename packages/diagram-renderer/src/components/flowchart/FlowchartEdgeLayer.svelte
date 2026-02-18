<script lang="ts">
  import type { PositionedFlowEdge, Point } from './types.ts';
  import type { FlowchartState } from './state.svelte.ts';

  interface Props {
    edges: PositionedFlowEdge[];
    state: FlowchartState;
    width: number;
    height: number;
  }

  let { edges, state, width, height }: Props = $props();

  let hasSelection = $derived(state.selectedId !== null);

  function isHighlighted(edge: PositionedFlowEdge): boolean {
    return state.connectedEdgeIds.has(edge.data.id);
  }

  function buildPath(edge: PositionedFlowEdge): string {
    const points = [edge.sourcePoint, ...edge.bendPoints, edge.targetPoint];
    const [first, ...rest] = points;
    if (!first) return '';
    return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(' ')}`;
  }

  function getLabelPosition(edge: PositionedFlowEdge): Point {
    const points = [edge.sourcePoint, ...edge.bendPoints, edge.targetPoint];
    if (points.length < 2) return edge.sourcePoint;
    const midIndex = Math.floor(points.length / 2);
    const a = points[midIndex - 1]!;
    const b = points[midIndex]!;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
</script>

<svg
  class="edge-layer"
  {width}
  {height}
  viewBox="0 0 {width} {height}"
>
  <defs>
    <marker
      id="marker-flow-arrow"
      viewBox="0 0 10 10"
      refX="10"
      refY="5"
      markerWidth="10"
      markerHeight="10"
      orient="auto-start-reverse"
    >
      <path d="M 0 0 L 10 5 L 0 10 Z" fill="#333" stroke="none" />
    </marker>

    <marker
      id="marker-flow-arrow-hi"
      viewBox="0 0 10 10"
      refX="10"
      refY="5"
      markerWidth="10"
      markerHeight="10"
      orient="auto-start-reverse"
    >
      <path d="M 0 0 L 10 5 L 0 10 Z" fill="#0066ff" stroke="none" />
    </marker>
  </defs>

  {#each edges as edge (edge.data.id)}
    {@const highlighted = isHighlighted(edge)}
    {@const markerEnd = edge.data.arrowType === 'arrow_open'
      ? ''
      : highlighted
        ? 'url(#marker-flow-arrow-hi)'
        : 'url(#marker-flow-arrow)'}

    <path
      d={buildPath(edge)}
      stroke={highlighted ? '#0066ff' : '#555'}
      stroke-width={highlighted ? 2.5 : 1.5}
      fill="none"
      stroke-dasharray={edge.data.stroke === 'dotted' ? '6,4' : undefined}
      opacity={hasSelection && !highlighted ? 0.15 : 1}
      marker-end={markerEnd}
    />

    {#if edge.data.label}
      {@const pos = getLabelPosition(edge)}
      <rect
        x={pos.x - edge.data.label.length * 3.5 - 4}
        y={pos.y - 10}
        width={edge.data.label.length * 7 + 8}
        height={18}
        fill="white"
        stroke="#e5e7eb"
        stroke-width="1"
        rx="3"
        opacity={hasSelection && !highlighted ? 0.15 : 1}
      />
      <text
        x={pos.x}
        y={pos.y + 3}
        text-anchor="middle"
        font-size="11"
        font-family="system-ui, -apple-system, sans-serif"
        fill={highlighted ? '#0066ff' : '#555'}
        opacity={hasSelection && !highlighted ? 0.15 : 1}
      >
        {edge.data.label}
      </text>
    {/if}
  {/each}
</svg>

<style>
  .edge-layer {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    z-index: 1;
  }
</style>
