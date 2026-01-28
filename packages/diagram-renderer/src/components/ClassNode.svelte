<script lang="ts">
	import type { ClassNodeData } from "../transformers/class-diagram.ts";
	import { Handle, Position } from "@xyflow/svelte";

	interface Props {
		data: ClassNodeData;
		selected?: boolean;
	}

	let { data, selected = false }: Props = $props();
</script>

<div class="class-node" class:selected>
	{#if data.stereotype}
		<div class="stereotype">«{data.stereotype}»</div>
	{/if}
	<div class="class-name">{data.name}</div>

	{#if data.attributes.length > 0}
		<div class="divider"></div>
		<div class="members">
			{#each data.attributes as attr}
				<div class="member">{attr}</div>
			{/each}
		</div>
	{/if}

	{#if data.methods.length > 0}
		<div class="divider"></div>
		<div class="members">
			{#each data.methods as method}
				<div class="member">{method}</div>
			{/each}
		</div>
	{/if}

	<Handle type="source" position={Position.Right} />
	<Handle type="target" position={Position.Left} />
</div>

<style>
	.class-node {
		background: white;
		border: 2px solid #333;
		border-radius: 4px;
		min-width: 150px;
		font-family: monospace;
		font-size: 12px;
	}

	.class-node.selected {
		border-color: #0066ff;
		box-shadow: 0 0 0 2px rgba(0, 102, 255, 0.3);
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
		padding: 2px 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
