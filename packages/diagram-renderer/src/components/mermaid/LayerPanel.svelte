<script lang="ts">
    import type { Layer } from "../../lib/extract-layers.ts";
    import Self from "./LayerPanel.svelte";

    interface Props {
        layers: Layer[];
        hiddenLayers: Set<string>;
        onToggle: (id: string) => void;
    }

    let { layers, hiddenLayers, onToggle }: Props = $props();

    function getTypeColor(type: string): string {
        switch (type) {
            case "loop": return "#8b5cf6";
            case "alt": return "#f59e0b";
            case "opt": return "#3b82f6";
            case "par": return "#10b981";
            case "critical": return "#ef4444";
            case "break": return "#6b7280";
            case "rect": return "#ec4899";
            default: return "#6b7280";
        }
    }
</script>

{#if layers.length > 0}
    <aside class="layer-panel">
        <div class="panel-header">Layers</div>
        <div class="layer-list">
            {#each layers as layer}
                {@const isHidden = hiddenLayers.has(layer.id)}
                <label class="layer-item">
                    <input
                        type="checkbox"
                        checked={!isHidden}
                        onchange={() => onToggle(layer.id)}
                    />
                    <span class="layer-badge" style="background-color: {getTypeColor(layer.type)}">
                        {layer.type}
                    </span>
                    <span class="layer-label">{layer.label}</span>
                </label>
                {#if layer.children.length > 0}
                    <div class="nested">
                        <Self layers={layer.children} {hiddenLayers} {onToggle} />
                    </div>
                {/if}
            {/each}
        </div>
    </aside>
{/if}

<style>
    .layer-panel {
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        background: white;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
        min-width: 200px;
        overflow-y: auto;
    }

    .panel-header {
        padding: 8px 12px;
        font-weight: 600;
        color: #374151;
        border-bottom: 1px solid #e5e7eb;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .layer-list {
        padding: 4px 0;
    }

    .layer-item {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 12px;
        cursor: pointer;
        user-select: none;
    }

    .layer-item:hover {
        background: #f9fafb;
    }

    .layer-item input[type="checkbox"] {
        margin: 0;
        cursor: pointer;
    }

    .layer-badge {
        color: white;
        font-size: 10px;
        font-weight: 600;
        padding: 1px 5px;
        border-radius: 3px;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        flex-shrink: 0;
    }

    .layer-label {
        color: #4b5563;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .nested {
        padding-left: 20px;
    }
</style>
