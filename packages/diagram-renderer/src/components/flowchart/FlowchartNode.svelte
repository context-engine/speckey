<script lang="ts">
  import type { PositionedFlowNode } from './types.ts';
  import type { FlowchartState } from './state.svelte.ts';

  interface Props {
    node: PositionedFlowNode;
    state: FlowchartState;
  }

  let { node, state }: Props = $props();

  let isSelected = $derived(state.selectedId === node.data.id);
  let isConnected = $derived(state.connectedToSelected.has(node.data.id));
  let isHovered = $derived(state.hoveredId === node.data.id);
  let hasSelection = $derived(state.selectedId !== null);
  let isDimmed = $derived(hasSelection && !isSelected && !isConnected);

  function handleClick() {
    state.select(node.data.id);
  }

  function handleMouseEnter() {
    state.hover(node.data.id);
  }

  function handleMouseLeave() {
    state.hover(null);
  }
</script>

<div
  class="flow-node shape-{node.data.shape}"
  class:selected={isSelected}
  class:connected={isConnected}
  class:hovered={isHovered}
  class:dimmed={isDimmed}
  style="left: {node.x}px; top: {node.y}px; width: {node.width}px; height: {node.height}px;"
  role="button"
  tabindex="0"
  onclick={handleClick}
  onkeydown={(e) => { if (e.key === 'Enter') handleClick(); }}
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
>
  <span class="node-text">{node.data.text}</span>
</div>

<style>
  .flow-node {
    position: absolute;
    background: white;
    border: 2px solid #333;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-sizing: border-box;
    transition: border-color 0.15s, box-shadow 0.15s, opacity 0.15s;
    z-index: 2;
  }

  .node-text {
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 13px;
    text-align: center;
    padding: 4px 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Shape: rect — default rectangle */
  .shape-rect {
    border-radius: 2px;
  }

  /* Shape: round — rounded corners */
  .shape-round {
    border-radius: 12px;
  }

  /* Shape: stadium — fully rounded sides (pill) */
  .shape-stadium {
    border-radius: 9999px;
  }

  /* Shape: diamond — clip-path polygon */
  .shape-diamond {
    border: none;
    clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
    box-shadow: inset 0 0 0 2px #333;
  }

  /* Shape: circle */
  .shape-circle {
    border-radius: 50%;
  }

  /* Shape: subroutine — double vertical borders */
  .shape-subroutine {
    border-radius: 2px;
    border-left: 6px double #333;
    border-right: 6px double #333;
  }

  /* Shape: hexagon — pointy left/right */
  .shape-hexagon {
    border: none;
    clip-path: polygon(10% 0%, 90% 0%, 100% 50%, 90% 100%, 10% 100%, 0% 50%);
    box-shadow: inset 0 0 0 2px #333;
  }

  /* --- Selection States --- */

  .flow-node.selected {
    border-color: #0066ff;
    box-shadow: 0 0 0 3px rgba(0, 102, 255, 0.25);
    z-index: 3;
  }

  .flow-node.connected {
    border-color: #66aaff;
    box-shadow: 0 0 0 2px rgba(102, 170, 255, 0.2);
  }

  .flow-node.hovered:not(.selected) {
    border-color: #555;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  }

  .flow-node.dimmed {
    opacity: 0.35;
  }

  /* clip-path shapes need inset box-shadow for border; override selection states */
  .shape-diamond.selected,
  .shape-hexagon.selected {
    box-shadow: inset 0 0 0 2px #0066ff, 0 0 0 3px rgba(0, 102, 255, 0.25);
  }

  .shape-diamond.connected,
  .shape-hexagon.connected {
    box-shadow: inset 0 0 0 2px #66aaff, 0 0 0 2px rgba(102, 170, 255, 0.2);
  }

  .shape-diamond.hovered:not(.selected),
  .shape-hexagon.hovered:not(.selected) {
    box-shadow: inset 0 0 0 2px #555, 0 2px 8px rgba(0, 0, 0, 0.12);
  }

  /* subroutine selection overrides double border color */
  .shape-subroutine.selected {
    border-left-color: #0066ff;
    border-right-color: #0066ff;
  }

  .shape-subroutine.connected {
    border-left-color: #66aaff;
    border-right-color: #66aaff;
  }
</style>
