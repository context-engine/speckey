<script lang="ts">
	import type { SequenceAST } from '@speckey/mermaid-ast';
	import { layoutSequenceDiagram } from './layout.ts';
	import type { SequenceLayout, LayoutMessage } from './types.ts';
	import ParticipantHeader from './ParticipantHeader.svelte';
	import MessageArrow from './MessageArrow.svelte';
	import ControlBlock from './ControlBlock.svelte';

	interface Props {
		ast: SequenceAST;
	}

	let { ast }: Props = $props();

	let layout: SequenceLayout = $derived(layoutSequenceDiagram(ast));

	// Selection state
	let selectedId = $state<string | null>(null);

	function selectParticipant(id: string) {
		selectedId = selectedId === id ? null : id;
	}

	function selectMessage(id: string) {
		selectedId = selectedId === id ? null : id;
	}

	// Participant colors
	const COLORS = [
		'#22c55e', '#3b82f6', '#f59e0b', '#ef4444',
		'#a855f7', '#06b6d4', '#ec4899', '#84cc16',
	];

	function getColor(index: number): string {
		return COLORS[index % COLORS.length]!;
	}

	let gridTemplateColumns = $derived(
		`repeat(${layout.totalColumns}, minmax(140px, 1fr))`,
	);

	// Compute grid-column for a message: span from source to target column (1-indexed)
	function messageGridColumn(msg: LayoutMessage): string {
		if (msg.from === msg.to) {
			// Self-message: stay in one column
			return `${msg.sourceColumn + 1} / ${msg.sourceColumn + 2}`;
		}
		const minCol = Math.min(msg.sourceColumn, msg.targetColumn) + 1;
		const maxCol = Math.max(msg.sourceColumn, msg.targetColumn) + 2;
		return `${minCol} / ${maxCol}`;
	}

	function messageColSpan(msg: LayoutMessage): number {
		if (msg.from === msg.to) return 1;
		return Math.abs(msg.targetColumn - msg.sourceColumn) + 1;
	}
</script>

<div class="sequence-wrapper">
	{#if selectedId}
		<div class="toolbar">
			<button onclick={() => { selectedId = null; }}>Clear Selection</button>
			<span class="selection-info">Selected: {selectedId}</span>
		</div>
	{/if}

	<div
		class="sequence-grid"
		style="grid-template-columns: {gridTemplateColumns};"
	>
		<!-- Row 1: Participant headers -->
		{#each layout.participants as participant, i}
			<div
				class="participant-cell"
				style="grid-column: {participant.column + 1}; grid-row: 1;"
			>
				<div
					role="button"
					tabindex="0"
					onclick={() => selectParticipant(participant.id)}
					onkeydown={(e) => { if (e.key === 'Enter') selectParticipant(participant.id); }}
				>
					<ParticipantHeader
						{participant}
						selected={selectedId === participant.id}
						color={getColor(i)}
					/>
				</div>
			</div>
		{/each}

		<!-- Lifeline columns spanning all message rows -->
		{#each layout.participants as participant, i}
			<div
				class="lifeline-track"
				style="
					grid-column: {participant.column + 1};
					grid-row: 2 / {layout.totalRows + 2};
				"
			>
				<div class="lifeline-line" style="border-color: {getColor(i)};"></div>
			</div>
		{/each}

		<!-- Control blocks (behind messages) -->
		{#each layout.blocks as block (block.id)}
			<ControlBlock {block} totalColumns={layout.totalColumns} />
		{/each}

		<!-- Messages: placed directly in the outer grid at correct column span -->
		{#each layout.rows as row (row.id)}
			{#if row.type === 'message'}
				<div
					role="button"
					tabindex="0"
					class="message-cell"
					style="
						grid-column: {messageGridColumn(row)};
						grid-row: {row.row + 2};
						--col-span: {messageColSpan(row)};
					"
					onclick={() => selectMessage(row.id)}
					onkeydown={(e) => { if (e.key === 'Enter') selectMessage(row.id); }}
				>
					<MessageArrow
						message={row}
						selected={selectedId === row.id || selectedId === row.from || selectedId === row.to}
					/>
				</div>
			{:else if row.type === 'note'}
				<div
					class="note-card"
					style="
						grid-column: {row.column + 1} / {row.column + row.columnSpan + 1};
						grid-row: {row.row + 2};
					"
				>
					<div class="note-content">{row.text}</div>
				</div>
			{/if}
		{/each}
	</div>
</div>

<style>
	.sequence-wrapper {
		font-family: system-ui, -apple-system, sans-serif;
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 0;
		margin-bottom: 8px;
		border-bottom: 1px solid #e5e7eb;
	}

	.toolbar button {
		padding: 4px 12px;
		border: 1px solid #d1d5db;
		border-radius: 4px;
		background: white;
		cursor: pointer;
		font-size: 12px;
	}

	.toolbar button:hover {
		background: #f3f4f6;
	}

	.selection-info {
		font-size: 12px;
		color: #0066ff;
		margin-left: 8px;
		font-family: monospace;
	}

	.sequence-grid {
		display: grid;
		row-gap: 0;
		column-gap: 0;
		padding: 16px;
		background: #fafafa;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		overflow-x: auto;
	}

	.participant-cell {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0 8px 12px;
		z-index: 3;
	}

	.participant-cell > [role="button"] {
		cursor: pointer;
	}

	.lifeline-track {
		display: flex;
		justify-content: center;
		pointer-events: none;
		z-index: 0;
	}

	.lifeline-line {
		width: 0;
		border-left: 2px dashed;
		opacity: 0.4;
		height: 100%;
	}

	.message-cell {
		z-index: 1;
		cursor: pointer;
	}

	.note-card {
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2;
		padding: 4px 8px;
	}

	.note-content {
		background: #fffde7;
		border: 1px solid #fbc02d;
		border-radius: 4px;
		padding: 6px 10px;
		font-family: monospace;
		font-size: 11px;
		text-align: center;
		word-wrap: break-word;
	}
</style>
