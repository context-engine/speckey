<script lang="ts">
	import type { SequenceLifelineNodeData } from "../../transformers/sequence-diagram.ts";
	import { Handle, Position } from "@xyflow/svelte";

	interface Props {
		data: SequenceLifelineNodeData;
		selected?: boolean;
	}

	let { data, selected = false }: Props = $props();
</script>

<div class="lifeline" style="height: {data.height}px;">
	<div class="lifeline-bar" style="background-color: {data.color};"></div>
	<div class="lifeline-line"></div>

	<Handle type="source" position={Position.Right} style="opacity: 0;" />
	<Handle type="target" position={Position.Left} style="opacity: 0;" />
</div>

<style>
	.lifeline {
		position: relative;
		width: 6px;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.lifeline-bar {
		width: 6px;
		height: 100%;
		border-radius: 3px;
		opacity: 0.8;
		position: absolute;
		top: 0;
		left: 0;
	}

	.lifeline-line {
		position: absolute;
		top: 0;
		left: 50%;
		transform: translateX(-50%);
		width: 1px;
		height: 100%;
		background: repeating-linear-gradient(
			to bottom,
			#d1d5db 0px,
			#d1d5db 4px,
			transparent 4px,
			transparent 8px
		);
		z-index: -1;
	}
</style>
