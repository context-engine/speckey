<script lang="ts">
	import type { SequenceNoteNodeData } from "../../transformers/sequence-diagram.ts";

	interface Props {
		data: SequenceNoteNodeData;
		selected?: boolean;
	}

	let { data, selected = false }: Props = $props();
</script>

<div class="note-node" class:selected>
	<div class="note-text">{data.text}</div>
</div>

<style>
	.note-node {
		background: #ffffcc;
		border: 1px solid #cccc66;
		border-radius: 2px;
		min-width: 80px;
		font-family: monospace;
		font-size: 11px;
		padding: 6px 8px;
		text-align: center;
	}

	.note-node.selected {
		border-color: #0066ff;
		box-shadow: 0 0 0 2px rgba(0, 102, 255, 0.3);
	}

	.note-text {
		white-space: pre-wrap;
		word-break: break-word;
	}
</style>
