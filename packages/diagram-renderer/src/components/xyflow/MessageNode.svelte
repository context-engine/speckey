<script lang="ts">
	import type { SequenceMessageNodeData } from "../../transformers/sequence-diagram.ts";
	import { Handle, Position } from "@xyflow/svelte";

	interface Props {
		data: SequenceMessageNodeData;
		selected?: boolean;
	}

	let { data, selected = false }: Props = $props();
</script>

<div class="message-node" class:selected>
	<Handle type="target" position={Position.Left} style="opacity: 0;" />
	<div class="message-text">{data.text}</div>
	<Handle type="source" position={Position.Right} style="opacity: 0;" />
</div>

<style>
	.message-node {
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		padding: 16px 20px;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
		font-size: 13px;
		color: #374151;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
		min-width: 120px;
		text-align: center;
		line-height: 1.5;
	}

	.message-node.selected {
		border-color: #0066ff;
		box-shadow: 0 0 0 2px rgba(0, 102, 255, 0.15);
	}

	.message-text {
		word-break: break-word;
	}
</style>
