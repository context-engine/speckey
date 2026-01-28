# Mermaid Test Analysis

## Repository Added
Added `mermaid-js/mermaid` to `reference-projects/` and `.gitmodules` for test reference.

## Test File Structure

Main test file: `packages/mermaid/src/diagrams/class/classDiagram.spec.ts` (~1957 lines!)

## Key Findings

### Test Coverage (Features We're Missing or Under-tested)

1. **Nested Namespaces** ✅ (We have basic support, they test deeply nested: `Company.Project.Module.SubModule`)
   - Lines 19-89: Nested namespace tests with dot notation
   - We should add tests for dotted namespace names

2. **Class Labels with Special Characters** ⚠️ **Missing**
   - Lines 194-350: Classes with text labels `class C1["Display Label"]`
   - Support for special chars: `@?`, `()`, `[]`, `{}`, commas, periods, foreign chars
   - **Action**: Add support for text labels in class names

3. **Separators in Class Bodies** ⚠️ **Missing**
   - Lines 161-192: Support for `..`, `==`, `__`, `--` separators to group members
   - **Action**: Add separator parsing

4. **CSS Classes** ⚠️ **Missing**
   - Lines 244-303: `class C1["Label"]:::styleClass` syntax
   - `cssClass "C1" styleClass` command
   - **Action**: Decide if we need this (out of scope for pure parsing?)

5. **Click/Link Handlers** ⚠️ **Out of Scope**
   - Lines 752-900: `click Class1 href "url"` 
   - Not relevant for our parser

6. **Direction Directive** ⚠️ **Missing**
   - Lines 469-565: `direction TB/RL/BT/LR`
   - **Action**: Add direction parsing

7. **Accessibility** ⚠️ **Missing**
   - Lines 91-112: `accTitle` and `accDescr`
   - **Action**: Consider adding

8. **Class Name Edge Cases** ✅ Partially covered
   - Backticked names: `class \`Car\`` (line 141)
   - Names with dash: `class Ca-r` (line 147)
   - Names with underscore: `class \`A_Car\`` (line 155)
   - We handle basic names but should test edge cases

9. **Member Type Syntax** ⚠️ **Partially covered**
   - Both bracket and colon syntax: `C1 : int member1` vs `class C1 { int member1 }`
   - We only support bracket syntax

10. **Return Types on Methods** ✅ **We support this**
    - `getDepartureTime() datetime` (line 607)

## Test Coupling Assessment

**Low coupling** ✅ - Tests are well-isolated:
- Each test parses a diagram string
- Tests check specific aspects (namespaces, members, relations)
- Most tests don't depend on rendering/SVG logic
- Parser tests use JISON parser but test **input syntax** and **parsed structure**

## Recommended Actions

### High Priority (Missing Core Features)
1. **Text Labels**: `class C1["Display Name"]` - very common in real diagrams
2. **Colon Syntax**: `C1 : int member` - alternative to brackets
3. **Direction**: `direction TB` - affects layout

### Medium Priority  
4. **Separators**: `..`, `==`, `--` for grouping members
5. **Edge case class names**: backticks, special chars

### Low Priority (Nice to have)
6. **Accessibility**: `accTitle`, `accDescr`
7. **CSS classes**: May be out of scope

## Next Steps

1. Extract test fixtures for text labels, colon syntax, direction
2. Add failing tests to our suite
3. Implement support for these features
4. Cross-reference with mermaid's parser to ensure compatibility

---

## Additional Files Analyzed

### classTypes.spec.ts (763 lines)

**Focus**: Unit tests for `ClassMember` parsing - **highly valuable for our member parsing**

#### Key Findings

1. **Parameter Type Order Flexibility** ✅ **We support this**
   - Both `getTime(int count)` (type first) AND `getTime(count int)` (name first)
   - Lines 115-219 test both orderings

2. **Generic Parameters** ⚠️ **Partially supported**
   - Simple: `List~T~` → display as `List<T>` (lines 327-377)
   - Multiple: `List~T~, List~OT~` (lines 380-431)
   - Nested: `List~List~T~~` → `List<List<T>>` (lines 433-484)
   - Composite: `List~K, V~` → `List<K, V>` (lines 486-543)
   - We parse `~T~` but may not handle nested/composite correctly

3. **Generic Return Types** ⚠️ **Need to verify**
   - `getTimes() List~T~` → display as `getTimes() : List<T>` (lines 545-596)
   - Nested return: `List~List~T~~` (lines 598-663)

4. **Method Names with Generics** ⚠️ **Missing**
   - `getTime~T~(this T, int seconds)` → `getTime<T>(this T, int seconds)` (line 674)
   - Generic methods, not just generic parameters

5. **Double Colons in Names** ⚠️ **Missing**
   - C++ style: `std::map ~int,string~ pMap;` (line 667)

6. **Comprehensive Visibility Testing** ✅ **We support this**
   - All tests verify +, -, #, ~ for public, private, protected, internal
   - Static ($) and abstract (*) classifiers tested thoroughly

7. **CSS Style Application** ℹ️ **Out of scope for us**
   - Tests verify static members get `text-decoration:underline;`
   - Abstract members get `font-style:italic;`
   - We don't need CSS, but should track isStatic/isAbstract correctly

### classDiagram-styles.spec.js (118 lines)

**Focus**: CSS class and style application - **mostly out of scope for pure parsing**

#### Key Findings

1. **CSS Class Shorthand** ⚠️ **Parser-relevant**
   - `class Class01:::exClass` - triple colon for inline CSS class (line 14)
   - Applied to classes with bodies: `class Class1:::exClass { }` (line 22)
   - We should parse this syntax even if we don't apply styles

2. **cssClass Directive** ⚠️ **Parser-relevant**
   - `cssClass "Class01" exClass` (line 45)
   - Comma-separated: `cssClass "Class01,Class02" exClass` (line 54)
   - Should be recognized as a command

3. **classDef Directive** ⚠️ **Parser-relevant**
   - `classDef pink fill:#f9f` - define reusable style (line 76)
   - Should be recognized and ignored during parsing

4. **style Directive** ⚠️ **Out of scope**
   - `style Class01 fill:#f9f,stroke:#333,stroke-width:4px` (line 64)
   - Pure styling, no structural meaning

**Decision**: We should parse `:::` syntax and `cssClass`/`classDef` commands to avoid syntax errors, but we don't need to process styles.

---

## Updated Priority Assessment

### High Priority (Core parsing features)
1. ✅ **Text Labels**: `class C1["Display Name"]` - CRITICAL
2. ⚠️ **Colon Syntax**: `C1 : int member` - very common alternative
3. ⚠️ **Direction**: `direction TB` - affects layout understanding
4. ⚠️ **CSS Class Shorthand**: `class C1:::style` - avoid parse errors

### Medium Priority (Enhanced member parsing)
5. ⚠️ **Nested Generics**: `List~List~T~~` - we parse simple, need complex
6. ⚠️ **Generic Methods**: `method~T~(params)` - method-level generics
7. ⚠️ **Double Colon Names**: `std::map` - C++ support

### Low Priority
8. **Separators**: `..`, `==`, `--` for grouping
9. **Directives to recognize**: `cssClass`, `classDef`, `style`
10. **Accessibility**: `accTitle`, `accDescr`

## Test Coupling Re-assessment

**classTypes.spec.ts**: ✅ **Perfect for extraction**
- Tests are **100% unit tests** of member parsing
- No dependencies on rendering, just string → object parsing
- Every test case is a direct input/output pair
- **Highly reusable**: We can extract test strings directly

**classDiagram-styles.spec.js**: ⚠️ **Partially useful**
- Tests CSS application (out of scope)
- BUT: Shows us syntax we need to handle gracefully
- Helps us avoid "unknown syntax" errors

## Actionable Test Extraction

From classTypes.spec.ts, we should add tests for:
```typescript
// Nested generics
"+getTimetableList(List~List~T~~)" → should parse correctly

// Composite generics  
"getTimes(List~K, V~)" → should parse correctly

// Generic methods
"getTime~T~(this T, int seconds) DateTime" → should parse correctly

// Double colons
"std::map ~int,string~ pMap;" → should parse correctly
```
