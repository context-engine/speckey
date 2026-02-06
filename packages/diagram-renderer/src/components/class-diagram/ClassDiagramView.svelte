<script lang="ts">
	import type { ClassDiagramAST } from '@speckey/mermaid-ast';
	import type { PositionedDiagram } from './types.ts';
	import { layoutClassDiagram, transformAST } from './layout.ts';
	import { createDiagramState } from './state.svelte.ts';
	import ClassBox from './ClassBox.svelte';
	import EdgeLayer from './EdgeLayer.svelte';

	interface Props {
		ast: ClassDiagramAST;
	}

	let { ast }: Props = $props();

	// Transform AST into our types for state
	let transformed = $derived(transformAST(ast));
	let diagramState = $derived(
		createDiagramState(
			transformed.edges,
			transformed.nodes.map((n) => n.id),
		),
	);

	// Layout is async — track with state
	let diagram = $state<PositionedDiagram | null>(null);
	let layoutError = $state<string | null>(null);
	let isLoading = $state(true);

	// Re-layout when AST or expansion levels change
	$effect(() => {
		const levels = diagramState.expansionLevels;
		isLoading = true;
		layoutError = null;

		layoutClassDiagram(ast, levels)
			.then((result) => {
				diagram = result;
				isLoading = false;
			})
			.catch((err) => {
				layoutError = err instanceof Error ? err.message : String(err);
				isLoading = false;
			});
	});

	function handleExpandAll() {
		diagramState.expandAll();
	}

	function handleCollapseAll() {
		diagramState.collapseAll();
	}

	function handleClearSelection() {
		diagramState.select(null);
	}
</script>

<div class="diagram-wrapper">
	<div class="toolbar">
		<button onclick={handleExpandAll}>Expand All</button>
		<button onclick={handleCollapseAll}>Collapse All</button>
		{#if diagramState.selectedId}
			<button onclick={handleClearSelection}>Clear Selection</button>
			<span class="selection-info">Selected: {diagramState.selectedId}</span>
		{/if}
	</div>

	{#if isLoading && !diagram}
		<div class="status">Calculating layout...</div>
	{:else if layoutError}
		<div class="status error">Layout failed: {layoutError}</div>
	{:else if diagram}
		<div
			class="diagram-container"
			style="width: {diagram.width}px; height: {diagram.height}px;"
		>
			<EdgeLayer
				edges={diagram.edges}
				state={diagramState}
				width={diagram.width}
				height={diagram.height}
			/>
			{#each diagram.nodes as node (node.data.id)}
				<ClassBox {node} state={diagramState} />
			{/each}
		</div>
	{/if}
</div>

<style>
	.diagram-wrapper {
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

	.diagram-container {
		position: relative;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		background: #fafafa;
		overflow: auto;
	}

	.status {
		padding: 24px;
		text-align: center;
		color: #6b7280;
		font-size: 14px;
	}

	.status.error {
		color: #dc2626;
	}
</style>
