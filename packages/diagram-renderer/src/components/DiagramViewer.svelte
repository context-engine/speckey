<script lang="ts">
    import {
        SvelteFlow,
        Controls,
        Background,
        BackgroundVariant,
        type Node,
        type Edge,
    } from "@xyflow/svelte";
    import "@xyflow/svelte/dist/style.css";

    import ClassNode from "./ClassNode.svelte";
    import type { ClassNodeData } from "../transformers/class-diagram.ts";

    interface Props {
        nodes: Node<ClassNodeData>[];
        edges: Edge[];
    }

    let { nodes, edges }: Props = $props();

    const nodeTypes = {
        classNode: ClassNode,
    };
</script>

<div style="width: 100%; height: 500px;">
    <SvelteFlow {nodes} {edges} {nodeTypes} fitView>
        <Controls />
        <Background variant={BackgroundVariant.Dots} />
    </SvelteFlow>
</div>
