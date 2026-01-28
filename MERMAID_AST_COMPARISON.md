# Mermaid-AST Comparison & Evaluation

## Project Overview

**Repository**: https://github.com/neongreen/mermaid-ast  
**Description**: Parse and render Mermaid diagrams to/from AST  
**License**: MIT  
**Approach**: Uses vendored JISON parsers from mermaid.js

## Key Strengths

1. **✅ Complete AST-based parser** - Supports all 18 mermaid diagram types
2. **✅ Round-trip guarantee** - `render(parse(text))` produces equivalent diagrams  
3. **✅ Uses official JISON parsers** - Vendored from mermaid.js for compatibility
4. **✅ Well-tested** - Unit tests, round-trip tests, golden JSON tests
5. **✅ Programmatic API** - Wrapper classes for building/mutating diagrams
6. **✅ TypeScript** - Full type definitions

## Class Diagram Implementation Comparison

### Their Approach (mermaid-ast)

| File | Lines | Purpose |
|------|-------|---------|
| `types/class.ts` | 91 | Type definitions for AST |
| `parser/class-parser.ts` | 352 | Parser using vendored JISON |
| `renderer/class-renderer.ts` | 257 | Render AST back to mermaid syntax |
| `tests/unit/class-parser.test.ts` | 285 | Unit tests |

**Total**: ~900 lines for complete class diagram support

### Our Approach (speckey)

| File | Lines | Purpose |
|------|-------|---------|
| `types.ts` | ~200 | Type definitions |
| `class-extractor.ts` | ~560 | Custom parser (no JISON) |
| Tests | ~700+ | Unit + integration tests |

**Total**: ~1500 lines

### Type Structure Comparison

#### Their Types (`mermaid-ast/src/types/class.ts`)

```typescript
export interface ClassDiagramAST {
  type: 'classDiagram';
  direction: ClassDirection;  // 'TB' | 'BT' | 'LR' | 'RL'
  classes: Map<string, ClassDefinition>;
  relations: ClassRelation[];
  namespaces: Map<string, Namespace>;
  notes: ClassNote[];
  classDefs: Map<string, ClassDefStyle>;
  accTitle?: string;
  accDescription?: string;
}

export interface ClassDefinition {
  id: string;
  label?: string;
  members: ClassMember[];
  annotations: string[];  // ["interface", "abstract", "service"]
  cssClasses: string[];
  styles: string[];
  link?: string;
  linkTarget?: string;
  tooltip?: string;
  callback?: string;
  callbackArgs?: string;
}

export interface ClassRelation {
  id1: string;
  id2: string;
  relation: {
    type1: RelationType;
    type2: RelationType;
    lineType: LineType;
  };
  relationTitle1?: string;
  relationTitle2?: string;
  title?: string;
}
```

#### Our Types (`implementation/packages/parser/src/diagrams/class-diagram/types.ts`)

```typescript
export interface ClassDiagramResult {
  classes: ParsedClass[];
  relations: ParsedRelation[];
  namespaces: ParsedNamespace[];
  notes: ParsedNote[];
}

export interface ParsedClass {
  name: string;
  isGeneric: boolean;
  typeParams: string[];
  stereotype: Stereotype;
  body: ClassBody;
  namespace?: string;
  startLine: number;
  endLine: number;
}

export interface ParsedRelation {
  from: string;
  to: string;
  type: RelationType;
  sourceCardinality?: string;
  targetCardinality?: string;
  label?: string;
}
```

### Key Differences

| Feature | mermaid-ast | Our Implementation |
|---------|-------------|-------------------|
| **Parser Engine** | Vendored JISON from mermaid.js | Custom regex-based parser |
| **Classes Storage** | `Map<string, ClassDefinition>` | `ParsedClass[]` |
| **Namespaces** | `Map` with class IDs list | Array with class list |
| **Direction** | Stored in AST | ❌ Not tracked |
| **Accessibility** | `accTitle`, `accDescription` | ❌ Not tracked |
| **CSS/Styles** | Full support | ❌ Not tracked |
| **Line Numbers** | ❌ Not tracked | ✅ Tracked |
| **Generics** | Via JISON parser | Custom parsing |
| **Rendering** | ✅ Can render back | ❌ No rendering |

## What We Can Learn

### 1. **Use the JISON Parser** ⭐ **MOST IMPORTANT**

Instead of writing our own parser, we could use the vendored JISON parser like they do:

**Advantages**:
- ✅ Guaranteed mermaid.js compatibility
- ✅ Handles all edge cases (they spent years on this)
- ✅ Automatic updates when we sync parsers
- ✅ Less code to maintain

**How they do it** (simplified):
```typescript
import classParser from '../vendored/parsers/class.js';

// Create yy object with callbacks
const yy = {
  addClass(id: string) { /* add to AST */ },
  addRelation(rel) { /* add to AST */ },
  addMember(id, member) { /* parse and add */ },
  // ... etc
};

classParser.yy = yy;
classParser.parse(input);
```

### 2. **Type Structure**

Their type structure is cleaner:
- Uses `Map` for O(1) lookups vs our array searches
- Separates concerns better (classes, relations, namespaces, notes)
- `annotations` array vs our single `stereotype` enum

### 3. **Features We're Missing**

From their implementation:
1. **Direction** - `direction TB/LR/RL/BT`
2. **Accessibility** - `accTitle`, `accDescription`  
3. **CSS Classes** - `cssClass`, `classDef`
4. **Inline styles** - `style` directive
5. **Click/Link handlers** - `click`, `link`, `callback`
6. **Text labels** - `class C1["Display Text"]`

### 4. **Testing Approach**

They have 3 test types:
1. **Unit tests** - Parse/render specific features
2. **Round-trip tests** - `render(parse(render(parse(x)))) === render(parse(x))`
3. **Golden JSON tests** - Snapshot testing of AST structure

## Recommendations

### Option A: Adopt Their JISON Parser ⭐ **RECOMMENDED**

**Pros**:
- Maximum compatibility with mermaid.js
- Less code to maintain
- Handles all edge cases
- Easy to update (sync script provided)

**Cons**:
- Dependency on vendored code
- Slightly larger bundle
- Less control over parsing

**Implementation**:
1. Copy their vendored JISON parser
2. Adapt their `createClassYY` to build our AST types
3. Keep our type structure but align with theirs where sensible
4. Add line number tracking (they don't have this)

### Option B: Keep Custom Parser, Add Missing Features

**Pros**:
- Full control
- Smaller bundle (no JISON)
- Already working

**Cons**:
- Must manually track mermaid.js changes
- More edge cases to handle
- More code to maintain

**Implementation**:
1. Add direction parsing
2. Add text label support `class C1["Label"]`
3. Add CSS class syntax `class C1:::styleClass`
4. Improve generic parsing (nested, composite)

### Option C: Hybrid Approach

Use their JISON parser but keep our AST structure:
- Parse using JISON → their AST
- Transform to our AST structure
- Keep our line number tracking

## Decision Matrix

| Criterion | Option A (JISON) | Option B (Custom) | Option C (Hybrid) |
|-----------|------------------|-------------------|-------------------|
| Compatibility | ⭐⭐⭐ | ⭐ | ⭐⭐⭐ |
| Maintainability | ⭐⭐⭐ | ⭐ | ⭐⭐ |
| Bundle Size | ⭐ | ⭐⭐⭐ | ⭐ |
| Control | ⭐ | ⭐⭐⭐ | ⭐⭐ |
| Line Tracking | Custom add | ✅ | ✅ |
| Effort | Medium | High | High |

##  Immediate Action Items

1. **Review their parser tests** - Extract test cases we're missing
2. **Compare AST structures** - Identify type alignment opportunities
3. **Evaluate JISON adoption** - Proof of concept with their parser
4. **Extract golden test fixtures** - Use their `.mmd` files as additional test cases

## Files to Study

```
speckey/reference-projects/mermaid-ast/packages/mermaid-ast/
├── src/
│   ├── types/class.ts                  # AST type definitions
│   ├── parser/class-parser.ts          # JISON parser wrapper
│   ├── renderer/class-renderer.ts      # Render AST → mermaid  
│   └── vendored/
│       ├── parsers/class.js            # Compiled JISON parser
│       └── grammars/class.jison        # JISON grammar
├── tests/
│   ├── unit/class-parser.test.ts       # Unit tests
│   ├── roundtrip/class-roundtrip.test.ts # Round-trip tests
│   ├── golden/class/*.mmd              # Test fixtures
│   └── fixtures/class.json             # Golden AST
└── examples/class-diagram.ts           # Usage examples
```

## Conclusion

**mermaid-ast is highly relevant and usable**. Their JISON-based approach is battle-tested and provides guaranteed compatibility with mermaid.js. We should seriously consider adopting their parser while keeping our line tracking feature.

**Next steps**: Create a proof-of-concept using their JISON parser with our AST types to evaluate feasibility.
