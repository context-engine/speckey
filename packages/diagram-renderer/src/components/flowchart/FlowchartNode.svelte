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

  let strokeColor = $derived(
    isSelected ? '#0066ff' : isConnected ? '#66aaff' : isHovered ? '#555' : '#333',
  );

  let isSvgShape = $derived(node.data.shape === 'diamond' || node.data.shape === 'hexagon');

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
  {#if isSvgShape}
    <svg class="shape-svg" viewBox="0 0 {node.width} {node.height}">
      {#if node.data.shape === 'diamond'}
        <polygon
          points="{node.width / 2},1 {node.width - 1},{node.height / 2} {node.width / 2},{node.height - 1} 1,{node.height / 2}"
          fill="white"
          stroke={strokeColor}
          stroke-width="2"
        />
      {:else if node.data.shape === 'hexagon'}
        {@const inset = node.width * 0.1}
        <polygon
          points="{inset},1 {node.width - inset},1 {node.width - 1},{node.height / 2} {node.width - inset},{node.height - 1} {inset},{node.height - 1} 1,{node.height / 2}"
          fill="white"
          stroke={strokeColor}
          stroke-width="2"
        />
      {/if}
    </svg>
  {/if}
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
    position: relative;
    z-index: 1;
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

  /* Shape: diamond — SVG polygon, no CSS border */
  .shape-diamond {
    border: none;
    background: none;
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

  /* Shape: hexagon — SVG polygon, no CSS border */
  .shape-hexagon {
    border: none;
    background: none;
  }

  /* SVG shape background */
  .shape-svg {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
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

  /* SVG shapes: stroke color is reactive, suppress rectangular box-shadow */
  .shape-diamond.selected,
  .shape-diamond.connected,
  .shape-diamond.hovered:not(.selected),
  .shape-hexagon.selected,
  .shape-hexagon.connected,
  .shape-hexagon.hovered:not(.selected) {
    box-shadow: none;
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
