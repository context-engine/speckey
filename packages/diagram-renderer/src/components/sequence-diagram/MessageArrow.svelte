<script lang="ts">
	import type { LayoutMessage } from './types.ts';

	interface Props {
		message: LayoutMessage;
		selected: boolean;
	}

	let { message, selected }: Props = $props();

	let isSelf = $derived(message.from === message.to);
	let isDotted = $derived(
		message.arrowType.startsWith('dotted') || message.arrowType === 'bidirectional_dotted',
	);
	let goesRight = $derived(message.targetColumn >= message.sourceColumn);
</script>

<div
	class="message-row"
	class:selected
	class:self-message={isSelf}
>
	{#if isSelf}
		<div class="self-arrow" class:dotted={isDotted}>
			<span class="message-text">{message.text}</span>
			<div class="self-loop">
				<div class="self-arrowhead"></div>
			</div>
		</div>
	{:else}
		<div class="arrow-container" class:reverse={!goesRight}>
			<span class="message-text">{message.text}</span>
			<div class="arrow-line" class:dotted={isDotted}>
				<div class="arrowhead" class:left={!goesRight}></div>
			</div>
		</div>
	{/if}
</div>

<style>
	.message-row {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 48px;
		padding: 4px 0;
	}

	.message-row.selected {
		background: rgba(0, 102, 255, 0.06);
		border-radius: 4px;
	}

	.arrow-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
		box-sizing: border-box;
		/* Inset so arrow starts/ends at column centers, not cell edges */
		padding: 0 calc(50% / var(--col-span, 2));
	}

	.message-text {
		font-family: monospace;
		font-size: 12px;
		white-space: nowrap;
		padding: 0 8px 4px;
		color: #333;
	}

	.arrow-line {
		width: calc(100% - 10px);
		height: 0;
		border-top: 2px solid #333;
		position: relative;
	}

	.arrow-line.dotted {
		border-top-style: dashed;
	}

	/* Right-pointing: gap on right, line left-aligned */
	.arrow-container:not(.reverse) .arrow-line {
		margin-right: auto;
	}

	/* Left-pointing: gap on left, line right-aligned */
	.arrow-container.reverse .arrow-line {
		margin-left: auto;
	}

	/* Arrowhead: right-pointing by default */
	.arrowhead {
		position: absolute;
		right: -10px;
		top: -7px;
		width: 0;
		height: 0;
		border-top: 6px solid transparent;
		border-bottom: 6px solid transparent;
		border-left: 10px solid #333;
	}

	.arrowhead.left {
		right: auto;
		left: -10px;
		border-left: none;
		border-right: 10px solid #333;
	}

	.arrow-container.reverse .message-text {
		text-align: right;
	}

	/* Self-message: anchored to lifeline center via relative positioning */
	.message-row.self-message {
		justify-content: flex-start;
	}

	.self-arrow {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		position: relative;
		left: 50%;
	}

	.self-loop {
		position: relative;
		width: 40px;
		height: 28px;
		border: 2px solid #333;
		border-left: none;
		border-radius: 0 8px 8px 0;
		margin-top: 2px;
	}

	.self-arrow.dotted .self-loop {
		border-style: dashed;
		border-left: none;
	}

	/* Left-pointing arrowhead at the return point of the self-loop */
	.self-arrowhead {
		position: absolute;
		left: -1px;
		bottom: -5px;
		width: 0;
		height: 0;
		border-top: 5px solid transparent;
		border-bottom: 5px solid transparent;
		border-right: 8px solid #333;
	}
</style>
