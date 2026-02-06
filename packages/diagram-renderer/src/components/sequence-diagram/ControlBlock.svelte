<script lang="ts">
	import type { LayoutBlockRegion } from './types.ts';

	interface Props {
		block: LayoutBlockRegion;
		totalColumns: number;
	}

	let { block, totalColumns }: Props = $props();

	// Block spans the full width and the relevant rows (CSS grid, 1-indexed, +2 for header row offset)
	let gridRow = $derived(`${block.startRow + 2} / ${block.endRow + 3}`);
	let gridColumn = $derived(`1 / ${totalColumns + 1}`);

	let typeLabel = $derived(block.blockType.toUpperCase());

	function blockColor(type: string): string {
		switch (type) {
			case 'alt': return 'rgba(102, 153, 255, 0.08)';
			case 'loop': return 'rgba(102, 204, 102, 0.08)';
			case 'opt': return 'rgba(204, 153, 51, 0.08)';
			case 'par': return 'rgba(153, 102, 204, 0.08)';
			case 'critical': return 'rgba(204, 51, 51, 0.08)';
			case 'break': return 'rgba(204, 102, 51, 0.08)';
			default: return 'rgba(128, 128, 128, 0.08)';
		}
	}

	function borderColor(type: string): string {
		switch (type) {
			case 'alt': return '#6699ff';
			case 'loop': return '#66cc66';
			case 'opt': return '#cc9933';
			case 'par': return '#9966cc';
			case 'critical': return '#cc3333';
			case 'break': return '#cc6633';
			default: return '#999';
		}
	}
</script>

<div
	class="control-block"
	style="
		grid-row: {gridRow};
		grid-column: {gridColumn};
		background: {blockColor(block.blockType)};
		border-color: {borderColor(block.blockType)};
	"
>
	<div class="block-label" style="background: {borderColor(block.blockType)};">
		{typeLabel}
		{#if block.label && block.label !== block.blockType}
			<span class="block-condition">[{block.label}]</span>
		{/if}
	</div>

	{#each block.sections as section}
		<div
			class="section-divider"
			style="
				top: calc({((section.startRow - block.startRow) / (block.endRow - block.startRow + 1)) * 100}% - 1px);
				border-color: {borderColor(block.blockType)};
			"
		>
			<span class="section-label" style="background: {borderColor(block.blockType)};">
				{section.label}
			</span>
		</div>
	{/each}
</div>

<style>
	.control-block {
		position: relative;
		border: 1.5px dashed;
		border-radius: 6px;
		margin: 4px 8px;
		pointer-events: none;
	}

	.block-label {
		position: absolute;
		top: -1px;
		left: -1px;
		padding: 2px 8px;
		border-radius: 4px 0 6px 0;
		font-family: monospace;
		font-size: 10px;
		font-weight: bold;
		color: white;
		z-index: 1;
		white-space: nowrap;
	}

	.block-condition {
		font-weight: normal;
		margin-left: 4px;
	}

	.section-divider {
		position: absolute;
		left: 0;
		right: 0;
		border-top: 1.5px dashed;
	}

	.section-label {
		position: absolute;
		left: 0;
		top: -1px;
		padding: 1px 6px;
		border-radius: 0 0 4px 0;
		font-family: monospace;
		font-size: 9px;
		color: white;
	}
</style>
