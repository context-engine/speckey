<script lang="ts">
  import type { PositionedFlowSubgraph } from './types.ts';

  interface Props {
    subgraph: PositionedFlowSubgraph;
  }

  let { subgraph }: Props = $props();
</script>

<div
  class="subgraph-region"
  style="
    left: {subgraph.x}px;
    top: {subgraph.y}px;
    width: {subgraph.width}px;
    height: {subgraph.height}px;
  "
>
  <div class="subgraph-label">
    {subgraph.data.title}
  </div>
</div>

<style>
  .subgraph-region {
    position: absolute;
    border: 1.5px dashed #999;
    border-radius: 8px;
    background: rgba(128, 128, 128, 0.05);
    pointer-events: none;
    z-index: 0;
  }

  .subgraph-label {
    position: absolute;
    top: -1px;
    left: -1px;
    padding: 2px 10px;
    background: #999;
    border-radius: 6px 0 6px 0;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 11px;
    font-weight: 600;
    color: white;
    white-space: nowrap;
  }
</style>
