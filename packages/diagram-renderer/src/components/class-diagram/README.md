# Class Diagram Renderer

HTML nodes positioned by ELK.js + SVG edge layer with orthogonal routing.

## Data Flow

```
ClassDiagramAST                        (from @speckey/mermaid-ast)
|  classes: Map<id, ClassDefinition>     -- id, label, annotations[], members[]
|  relations: ClassRelation[]            -- id1, id2, {type1, type2, lineType}, title
|  direction: 'TB' | 'BT' | 'LR' | 'RL'
|
+-- transformAST()                     [layout.ts:67]
|   Converts mermaid-ast types -> renderer types:
|     ClassDefinition  ->  ClassNodeData          { id, name, stereotype?, attributes[], methods[] }
|     ClassRelation    ->  RelationshipEdgeData   { id, sourceId, targetId, relationType, lineType, label? }
|     member           ->  MemberData             { name, visibility?, memberType }
|
+-- createDiagramState()               [state.svelte.ts:75]
|   Takes: RelationshipEdgeData[], nodeIds[]
|   Creates reactive class:
|     $state:   selectedId, hoveredId, expansionLevels (Map<id, 0|1|2>)
|     $derived: connectedToSelected (Set), connectedEdgeIds (Set)
|     methods:  select(), hover(), toggleExpansion(), expandAll(), collapseAll()
|
+-- layoutClassDiagram()               [layout.ts:118]  -- async
|   Takes: ClassDiagramAST + expansionLevels Map
|   1. Calls transformAST() internally (redundant -- also called in view)
|   2. Builds ELK graph: nodes (180px wide, height from expansion), edges
|   3. Runs ELK: layered algorithm, orthogonal routing, layer sweep crossing minimization
|   4. Reads back: node (x,y), edge sections (startPoint, bendPoints[], endPoint)
|   Returns:
|     PositionedDiagram
|       nodes: PositionedNode[] { data: ClassNodeData, x, y, width, height }
|       edges: PositionedEdge[] { data: RelationshipEdgeData, sourcePoint, targetPoint, bendPoints[] }
|       width, height
|
+-- Rendering                          [ClassDiagramView.svelte]
    Container: relative div at diagram.width x diagram.height
    +-- EdgeLayer.svelte -- single SVG, absolute top:0 left:0, pointer-events:none
    |   For each edge: SVG <path> M->L->L with markers (triangle, diamond, arrow, circle)
    |   Selection: highlighted edges full opacity, others dim
    +-- ClassBox.svelte[] -- absolute positioned divs
        3 expansion levels: L0 name-only, L1 +methods, L2 +attributes+methods
        Selection: blue border + shadow, connected: subtle, dimmed: opacity 0.35
```

## Data Structures

| Type | Description |
|------|-------------|
| `ClassNodeData` | Renderer's own node type: id, name, stereotype, attributes, methods |
| `MemberData` | name, visibility (+/-/#/~), memberType (method/attribute) |
| `RelationshipEdgeData` | Renderer's own edge type: sourceId, targetId, relationType, lineType, label |
| `PositionedNode` | ClassNodeData + x, y, width, height (after ELK layout) |
| `PositionedEdge` | RelationshipEdgeData + sourcePoint, targetPoint, bendPoints[] |
| `PositionedDiagram` | Complete layout result: nodes, edges, width, height |
| `ExpansionLevel` | 0 (name only) / 1 (+methods) / 2 (+attributes+methods) |
| `DiagramState` | Reactive state class with selection, hover, expansion, connected derivation |

## Known Issues

- `transformAST()` is called twice -- once in ClassDiagramView (for state creation) and once inside layoutClassDiagram() (for ELK input). Redundant.
- `layoutClassDiagram()` takes AST directly instead of the renderer's own types. The AST->types conversion and layout computation are coupled.
- State gets recreated on AST change -- `diagramState` is `$derived` from transformed AST, so any AST change creates a new state object, losing selection and expansion.
- Fixed 180px node width -- long class names or member names get truncated. No dynamic text measurement.
- ELK direction is derived from `ast.direction` inside layout. Should be a layout parameter, not coupled to AST.

## Design Notes (for when we return with graph data)

The PoC types are deliberately simple (flat strings, merged MemberData). When graph data flows through, revisit:

- **Separate ClassAttribute / ClassMethod types** -- attributes have (name, type, visibility, defaultValue), methods have (name, returnType, parameters[], visibility, isAbstract). Currently merged as MemberData with a memberType discriminator.
- **ClassStereotype as enum** -- known set (interface, abstract, enumeration, service, entity, type) instead of free string. Enables visual treatment per stereotype.
- **description field on ClassDefinition** -- for tooltip or expanded detail view.
- **Type references as linkable objects** -- `type?: string` can't link to other classes. Needs to carry referenceId(s) to enable click-to-navigate between connected types. Exact shape depends on what the graph provides.
- **sourceLabel / targetLabel on relationships** -- for multiplicity display at edge endpoints.
- **Extract transformAST() into its own adapter class** -- the AST->renderer-types conversion is a distinct concern. Should be an adapter with a clear interface that a future graph adapter can also implement.
