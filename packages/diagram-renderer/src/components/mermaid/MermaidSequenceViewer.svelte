<script lang="ts">
    import { onMount } from "svelte";
    import type { SequenceAST } from "@speckey/mermaid-ast";
    import { extractLayers, type Layer } from "../../lib/extract-layers.ts";
    import { tagSvgWithLayers } from "../../lib/tag-svg-layers.ts";
    import LayerPanel from "./LayerPanel.svelte";

    interface Props {
        syntax: string;
        ast: SequenceAST;
    }

    let { syntax, ast }: Props = $props();

    let svgContainer: HTMLDivElement | undefined = $state();
    let layers: Layer[] = $state([]);
    let hiddenLayers: Set<string> = $state(new Set());
    let renderError: string | null = $state(null);

    // Pan/zoom state
    let scale = $state(1);
    let panX = $state(0);
    let panY = $state(0);
    let isPanning = $state(false);
    let lastPointerX = 0;
    let lastPointerY = 0;

    // Generate CSS to hide layers
    let hiddenCSS = $derived(
        [...hiddenLayers]
            .map(
                (id) =>
                    `[data-layers~="${id}"], [data-layer-block="${id}"] { display: none !important; }`,
            )
            .join("\n"),
    );

    // Unique ID for this instance's mermaid render
    let diagramId = `mermaid-seq-${Math.random().toString(36).slice(2, 9)}`;

    onMount(async () => {
        if (!svgContainer) return;

        try {
            // Dynamic import — mermaid requires DOM
            const mermaid = (await import("mermaid")).default;
            mermaid.initialize({
                startOnLoad: false,
                theme: "default",
                sequence: {
                    mirrorActors: true,
                    showSequenceNumbers: false,
                },
            });

            // Render the original mermaid syntax directly
            const { svg } = await mermaid.render(diagramId, syntax);
            svgContainer.innerHTML = svg;

            // Extract layers from AST
            const extraction = extractLayers(ast);
            layers = extraction.layers;

            // Tag SVG elements with layer data
            const svgEl = svgContainer.querySelector("svg");
            if (svgEl) {
                const result = tagSvgWithLayers(
                    svgEl,
                    extraction.layers,
                    extraction.messageToLayers,
                    extraction.totalMessages,
                );
                console.log("[MermaidSequenceViewer] Tag result:", result);
                if (!result.ok) {
                    console.warn(
                        "[MermaidSequenceViewer] Layer tagging incomplete — diagram renders without full layer support",
                    );
                }
            }
        } catch (err) {
            renderError =
                err instanceof Error ? err.message : "Failed to render diagram";
            console.error("[MermaidSequenceViewer] Render error:", err);
        }
    });

    function toggleLayer(layerId: string) {
        const next = new Set(hiddenLayers);
        if (next.has(layerId)) {
            next.delete(layerId);
        } else {
            next.add(layerId);
        }
        hiddenLayers = next;
    }

    function handleWheel(e: WheelEvent) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.min(Math.max(scale * delta, 0.25), 3);
        scale = newScale;
    }

    function handlePointerDown(e: PointerEvent) {
        isPanning = true;
        lastPointerX = e.clientX;
        lastPointerY = e.clientY;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }

    function handlePointerMove(e: PointerEvent) {
        if (!isPanning) return;
        panX += e.clientX - lastPointerX;
        panY += e.clientY - lastPointerY;
        lastPointerX = e.clientX;
        lastPointerY = e.clientY;
    }

    function handlePointerUp(e: PointerEvent) {
        isPanning = false;
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }

    function resetView() {
        scale = 1;
        panX = 0;
        panY = 0;
    }
</script>

<div class="mermaid-viewer-wrapper">
    {@html `<style>${hiddenCSS}</style>`}

    <div class="viewer-layout">
        <LayerPanel {layers} {hiddenLayers} onToggle={toggleLayer} />

        <div class="viewer-main">
            <div class="toolbar">
                <button class="toolbar-btn" onclick={() => { scale = Math.min(scale * 1.2, 3); }}>+</button>
                <button class="toolbar-btn" onclick={() => { scale = Math.max(scale * 0.8, 0.25); }}>−</button>
                <button class="toolbar-btn" onclick={resetView}>Reset</button>
                <span class="zoom-label">{Math.round(scale * 100)}%</span>
            </div>

            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
                class="svg-viewport"
                onwheel={handleWheel}
                onpointerdown={handlePointerDown}
                onpointermove={handlePointerMove}
                onpointerup={handlePointerUp}
            >
                {#if renderError}
                    <div class="error">{renderError}</div>
                {:else}
                    <div
                        class="svg-inner"
                        style="transform: translate({panX}px, {panY}px) scale({scale}); transform-origin: 0 0;"
                        bind:this={svgContainer}
                    ></div>
                {/if}
            </div>
        </div>
    </div>
</div>

<style>
    .mermaid-viewer-wrapper {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .viewer-layout {
        display: flex;
        gap: 12px;
        height: 600px;
    }

    .viewer-main {
        flex: 1;
        display: flex;
        flex-direction: column;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        overflow: hidden;
        background: #fafafa;
    }

    .toolbar {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px 8px;
        border-bottom: 1px solid #e5e7eb;
        background: white;
    }

    .toolbar-btn {
        padding: 2px 8px;
        border: 1px solid #d1d5db;
        border-radius: 4px;
        background: white;
        cursor: pointer;
        font-size: 13px;
        color: #374151;
    }

    .toolbar-btn:hover {
        background: #f3f4f6;
    }

    .zoom-label {
        font-size: 12px;
        color: #6b7280;
        margin-left: 4px;
    }

    .svg-viewport {
        flex: 1;
        overflow: hidden;
        cursor: grab;
        position: relative;
    }

    .svg-viewport:active {
        cursor: grabbing;
    }

    .svg-inner {
        display: inline-block;
        padding: 20px;
    }

    .svg-inner :global(svg) {
        max-width: none !important;
    }

    .error {
        padding: 20px;
        color: #dc2626;
        font-size: 14px;
    }
</style>
