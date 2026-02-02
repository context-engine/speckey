<script lang="ts">
	import type { SequenceActorNodeData } from "../../transformers/sequence-diagram.ts";

	interface Props {
		data: SequenceActorNodeData;
		selected?: boolean;
	}

	let { data, selected = false }: Props = $props();
</script>

<div class="actor-node" class:selected>
	<span class="color-dot" style="background-color: {data.color}"></span>
	<span class="actor-name">{data.name}</span>
</div>

<style>
	.actor-node {
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
		font-size: 14px;
		font-weight: 600;
		color: #374151;
		padding: 4px 0;
		user-select: none;
	}

	.actor-node.selected {
		color: #0066ff;
	}

	.color-dot {
		width: 10px;
		height: 10px;
		border-radius: 2px;
		flex-shrink: 0;
	}

	.actor-name {
		white-space: nowrap;
	}
</style>
