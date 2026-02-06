<script lang="ts">
	import type { PositionedNode, ExpansionLevel } from './types.ts';
	import type { DiagramState } from './state.svelte.ts';

	interface Props {
		node: PositionedNode;
		state: DiagramState;
	}

	let { node, state }: Props = $props();

	let expansion: ExpansionLevel = $derived(state.getExpansion(node.data.id));
	let isSelected = $derived(state.selectedId === node.data.id);
	let isConnected = $derived(state.connectedToSelected.has(node.data.id));
	let isHovered = $derived(state.hoveredId === node.data.id);
	let hasSelection = $derived(state.selectedId !== null);
	let isDimmed = $derived(hasSelection && !isSelected && !isConnected);

	function handleClick() {
		state.select(node.data.id);
	}

	function handleDblClick() {
		state.toggleExpansion(node.data.id);
	}

	function handleMouseEnter() {
		state.hover(node.data.id);
	}

	function handleMouseLeave() {
		state.hover(null);
	}

	function visibilitySymbol(v?: string): string {
		switch (v) {
			case '+': return '+';
			case '-': return '-';
			case '#': return '#';
			case '~': return '~';
			default: return '';
		}
	}
</script>

<div
	class="class-box"
	class:selected={isSelected}
	class:connected={isConnected}
	class:hovered={isHovered}
	class:dimmed={isDimmed}
	style="left: {node.x}px; top: {node.y}px; width: {node.width}px; height: {node.height}px;"
	role="button"
	tabindex="0"
	onclick={handleClick}
	ondblclick={handleDblClick}
	onkeydown={(e) => { if (e.key === 'Enter') handleClick(); }}
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
>
	{#if node.data.stereotype}
		<div class="stereotype">&laquo;{node.data.stereotype}&raquo;</div>
	{/if}
	<div class="class-name">{node.data.name}</div>

	{#if expansion >= 2 && node.data.attributes.length > 0}
		<div class="divider"></div>
		<div class="members">
			{#each node.data.attributes as attr}
				<div class="member">{visibilitySymbol(attr.visibility)}{attr.name}</div>
			{/each}
		</div>
	{/if}

	{#if expansion >= 1 && node.data.methods.length > 0}
		<div class="divider"></div>
		<div class="members">
			{#each node.data.methods as method}
				<div class="member">{visibilitySymbol(method.visibility)}{method.name}</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.class-box {
		position: absolute;
		background: white;
		border: 2px solid #333;
		border-radius: 4px;
		font-family: monospace;
		font-size: 12px;
		cursor: pointer;
		box-sizing: border-box;
		overflow: hidden;
		transition: border-color 0.15s, box-shadow 0.15s, opacity 0.15s;
	}

	.class-box.selected {
		border-color: #0066ff;
		box-shadow: 0 0 0 3px rgba(0, 102, 255, 0.25);
		z-index: 2;
	}

	.class-box.connected {
		border-color: #66aaff;
		box-shadow: 0 0 0 2px rgba(102, 170, 255, 0.2);
	}

	.class-box.hovered:not(.selected) {
		border-color: #555;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
	}

	.class-box.dimmed {
		opacity: 0.35;
	}

	.stereotype {
		text-align: center;
		font-style: italic;
		color: #666;
		padding: 4px 8px 0;
		font-size: 10px;
	}

	.class-name {
		text-align: center;
		font-weight: bold;
		padding: 8px;
	}

	.divider {
		border-top: 1px solid #333;
	}

	.members {
		padding: 4px 8px;
	}

	.member {
		padding: 1px 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		font-size: 11px;
	}
</style>
