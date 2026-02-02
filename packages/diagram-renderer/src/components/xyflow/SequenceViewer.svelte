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

    import ActorNode from "./ActorNode.svelte";
    import LifelineNode from "./LifelineNode.svelte";
    import MessageNode from "./MessageNode.svelte";
    import NoteNode from "./NoteNode.svelte";
    import type { SequenceNodeData } from "../../transformers/sequence-diagram.ts";

    interface Props {
        nodes: Node<SequenceNodeData>[];
        edges: Edge[];
    }

    let { nodes, edges }: Props = $props();

    const nodeTypes = {
        actorNode: ActorNode,
        lifelineNode: LifelineNode,
        messageNode: MessageNode,
        noteNode: NoteNode,
    };
</script>

<div style="width: 100%; height: 600px;">
    <SvelteFlow {nodes} {edges} {nodeTypes} fitView>
        <Controls />
        <Background variant={BackgroundVariant.Dots} />
    </SvelteFlow>
</div>
