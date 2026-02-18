<script lang="ts">
  import type { FlowchartAST } from '@speckey/mermaid-ast';
  import type { PositionedFlowchart } from './types.ts';
  import { layoutFlowchart, transformAST } from './layout.ts';
  import { createFlowchartState } from './state.svelte.ts';
  import FlowchartNode from './FlowchartNode.svelte';
  import FlowchartEdgeLayer from './FlowchartEdgeLayer.svelte';
  import SubgraphRegion from './SubgraphRegion.svelte';

  interface Props {
    ast: FlowchartAST;
  }

  let { ast }: Props = $props();

  let transformed = $derived(transformAST(ast));
  let flowState = $derived(createFlowchartState(transformed.edges));

  let diagram = $state<PositionedFlowchart | null>(null);
  let layoutError = $state<string | null>(null);
  let isLoading = $state(true);

  $effect(() => {
    const _ast = ast;
    isLoading = true;
    layoutError = null;

    layoutFlowchart(_ast)
      .then((result) => {
        diagram = result;
        isLoading = false;
      })
      .catch((err) => {
        layoutError = err instanceof Error ? err.message : String(err);
        isLoading = false;
      });
  });

  function handleClearSelection() {
    flowState.select(null);
  }
</script>

<div class="diagram-wrapper">
  <div class="toolbar">
    {#if flowState.selectedId}
      <button onclick={handleClearSelection}>Clear Selection</button>
      <span class="selection-info">Selected: {flowState.selectedId}</span>
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
      {#each diagram.subgraphs as sg (sg.data.id)}
        <SubgraphRegion subgraph={sg} />
      {/each}

      <FlowchartEdgeLayer
        edges={diagram.edges}
        state={flowState}
        width={diagram.width}
        height={diagram.height}
      />

      {#each diagram.nodes as node (node.data.id)}
        <FlowchartNode {node} state={flowState} />
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
    min-height: 36px;
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
