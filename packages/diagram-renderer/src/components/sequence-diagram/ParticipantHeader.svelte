<script lang="ts">
	import type { LayoutParticipant } from './types.ts';

	interface Props {
		participant: LayoutParticipant;
		selected: boolean;
		color: string;
	}

	let { participant, selected, color }: Props = $props();
</script>

<div
	class="participant-header"
	class:selected
	style="border-top-color: {color};"
>
	{#if participant.type === 'actor'}
		<div class="actor-icon">🧑</div>
	{/if}
	<div class="participant-name">{participant.name}</div>
</div>

<style>
	.participant-header {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 8px 16px;
		background: white;
		border: 2px solid #333;
		border-top: 4px solid #333;
		border-radius: 4px;
		font-family: monospace;
		font-size: 13px;
		min-width: 80px;
		text-align: center;
		transition: border-color 0.15s, box-shadow 0.15s;
	}

	.participant-header.selected {
		border-color: #0066ff;
		border-top-color: #0066ff !important;
		box-shadow: 0 0 0 2px rgba(0, 102, 255, 0.25);
	}

	.actor-icon {
		font-size: 18px;
		margin-bottom: 2px;
	}

	.participant-name {
		font-weight: bold;
		white-space: nowrap;
	}
</style>
