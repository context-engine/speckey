# Sequence Diagram Renderer

CSS Grid layout with arithmetic row/column assignment. No external layout engine.

## Data Flow

```
SequenceAST                            (from @speckey/mermaid-ast)
|  actors: Map<id, { name, type }>       -- participant | actor
|  statements: SequenceStatement[]       -- recursive tree (messages, notes, alt, loop, opt, par, critical, break)
|
+-- layoutSequenceDiagram()            [layout.ts:232]  -- sync
|   1. Maps actors -> LayoutParticipant[] with column indices
|   2. Flattens recursive statement tree into grid rows:
|      SequenceMessage  ->  LayoutMessage       { id, from, to, text, arrowType*, row, sourceColumn, targetColumn }
|      SequenceNote     ->  LayoutNote          { id, text, placement*, actorIds[], row, column, columnSpan }
|      SequenceAlt etc  ->  LayoutBlockRegion   { id, blockType, label, startRow, endRow, sections[] }
|   * arrowType and placement are mermaid-ast enums (leaked dependency)
|   Returns:
|     SequenceLayout { participants, rows, blocks, totalColumns, totalRows }
|
+-- State: ad-hoc                      [SequenceDiagramView.svelte:17]
|   Just: let selectedId = $state<string | null>(null)
|   No hover, no connected derivation
|
+-- Rendering                          [SequenceDiagramView.svelte]
    CSS Grid: grid-template-columns = repeat(N, minmax(140px, 1fr))
    Row 1: ParticipantHeader[] -- boxes with colored top border
    Rows 2+:
    +-- Lifeline tracks -- vertical dashed lines (border-left, z:0)
    +-- ControlBlock[] -- dashed bordered regions, full-width, percentage-based section dividers
    +-- MessageArrow[] -- arrow lines with CSS arrowheads, grid-column spans source->target
    |   Self-messages: positioned via `left: 50%` relative positioning
    |   Regular: line width calc(100%-10px), arrowhead absolute positioned
    +-- Note cards -- yellow background, spanning columns
```

## Data Structures

| Type | Description |
|------|-------------|
| `LayoutParticipant` | id, name, column index, type (participant/actor) |
| `LayoutMessage` | id, from, to, text, arrowType (mermaid-ast enum), row, sourceColumn, targetColumn |
| `LayoutNote` | id, text, placement (mermaid-ast enum), actorIds, row, column, columnSpan |
| `LayoutBlockRegion` | id, blockType (alt/loop/opt/par/critical/break), label, startRow, endRow, sections[] |
| `SequenceLayout` | Complete layout result: participants, rows, blocks, totalColumns, totalRows |

## Known Issues

- Types leak mermaid-ast: `LayoutMessage.arrowType` is `SequenceArrowType` from mermaid-ast, `LayoutNote.placement` is `NotePlacement` from mermaid-ast. These should be the renderer's own enums.
- `layoutSequenceDiagram()` takes AST directly and reads mermaid-ast statement types internally. AST->types conversion and layout are coupled (same issue as class diagram).
- No real state management -- just a `$state` variable in the view. No hover, no connected-entity derivation. Compare with class diagram's `DiagramState` class.
- Control block section dividers use percentage-based positioning (`top: calc(percentage%)`) which assumes equal row heights. Messages and notes can have different heights, causing dividers to drift.
- Arrow rendering is CSS-hack-heavy -- `calc(100% - 10px)`, `margin-right: auto`, absolute-positioned arrowheads. Works but fragile at edge cases (very narrow columns).
- Self-message uses `position: relative; left: 50%` which can overflow at narrow widths.
- Note `left_of` at column 0: `Math.max(0, firstActorCol - 1)` places the note in the same column as the participant, causing overlap.
