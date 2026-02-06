<script lang="ts">
	import type { PositionedEdge } from './types.ts';
	import type { DiagramState } from './state.svelte.ts';

	interface Props {
		edges: PositionedEdge[];
		state: DiagramState;
		width: number;
		height: number;
	}

	let { edges, state, width, height }: Props = $props();

	let hasSelection = $derived(state.selectedId !== null);

	function isHighlighted(edge: PositionedEdge): boolean {
		return state.connectedEdgeIds.has(edge.data.id);
	}

	function buildPath(edge: PositionedEdge): string {
		const points = [edge.sourcePoint, ...edge.bendPoints, edge.targetPoint];
		const [first, ...rest] = points;
		if (!first) return '';
		return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(' ')}`;
	}

	function getMarkerId(relationType: string): string {
		switch (relationType) {
			case 'extension': return 'url(#marker-triangle)';
			case 'composition': return 'url(#marker-diamond-filled)';
			case 'aggregation': return 'url(#marker-diamond-open)';
			case 'dependency': return 'url(#marker-arrow)';
			case 'lollipop': return 'url(#marker-circle)';
			default: return 'url(#marker-arrow)';
		}
	}
</script>

<svg
	class="edge-layer"
	{width}
	{height}
	viewBox="0 0 {width} {height}"
>
	<defs>
		<!-- Extension: hollow triangle -->
		<marker
			id="marker-triangle"
			viewBox="0 0 12 12"
			refX="12"
			refY="6"
			markerWidth="12"
			markerHeight="12"
			orient="auto-start-reverse"
		>
			<path d="M 0 0 L 12 6 L 0 12 Z" fill="white" stroke="#333" stroke-width="1.5" />
		</marker>

		<!-- Composition: filled diamond -->
		<marker
			id="marker-diamond-filled"
			viewBox="0 0 16 10"
			refX="0"
			refY="5"
			markerWidth="16"
			markerHeight="10"
			orient="auto-start-reverse"
		>
			<path d="M 0 5 L 8 0 L 16 5 L 8 10 Z" fill="#333" stroke="#333" stroke-width="1" />
		</marker>

		<!-- Aggregation: open diamond -->
		<marker
			id="marker-diamond-open"
			viewBox="0 0 16 10"
			refX="0"
			refY="5"
			markerWidth="16"
			markerHeight="10"
			orient="auto-start-reverse"
		>
			<path d="M 0 5 L 8 0 L 16 5 L 8 10 Z" fill="white" stroke="#333" stroke-width="1.5" />
		</marker>

		<!-- Dependency: open arrow -->
		<marker
			id="marker-arrow"
			viewBox="0 0 10 10"
			refX="10"
			refY="5"
			markerWidth="10"
			markerHeight="10"
			orient="auto-start-reverse"
		>
			<path d="M 0 0 L 10 5 L 0 10" fill="none" stroke="#333" stroke-width="1.5" />
		</marker>

		<!-- Lollipop: circle -->
		<marker
			id="marker-circle"
			viewBox="0 0 10 10"
			refX="10"
			refY="5"
			markerWidth="10"
			markerHeight="10"
			orient="auto-start-reverse"
		>
			<circle cx="5" cy="5" r="4" fill="white" stroke="#333" stroke-width="1.5" />
		</marker>
	</defs>

	{#each edges as edge (edge.data.id)}
		{@const highlighted = isHighlighted(edge)}
		<path
			d={buildPath(edge)}
			stroke={highlighted ? '#0066ff' : '#555'}
			stroke-width={highlighted ? 2 : 1.5}
			fill="none"
			stroke-dasharray={edge.data.lineType === 'dotted' ? '6,4' : undefined}
			opacity={hasSelection && !highlighted ? 0.15 : 1}
			marker-end={getMarkerId(edge.data.relationType)}
		/>
	{/each}
</svg>

<style>
	.edge-layer {
		position: absolute;
		top: 0;
		left: 0;
		pointer-events: none;
	}
</style>
