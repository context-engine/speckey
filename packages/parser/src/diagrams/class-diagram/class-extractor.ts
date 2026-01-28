import type { CodeBlock } from "../../mermaid-extraction/types";
import type {
    ParsedClass,
    ParsedMethod,
    ParsedProperty,
    ParsedParameter,
    ParsedRelation,
    ParsedNamespace,
    ParsedNote,
    ClassDiagramResult,
    Visibility,
    Stereotype,
    RelationType,
    ClassBody,
    TypeParam,
} from "./types";

/**
 * Extracts class definitions, relationships, namespaces, and notes from Mermaid classDiagram blocks.
 *
 * ## Architecture Decision Record
 *
 * **Decision**: Use a manual regex-based parser instead of mermaid's JISON parser.
 *
 * **Context**: The architecture spec calls for using `mermaid.mermaidAPI.getDiagramFromText`
 * to access the internal `ClassDB`. However, mermaid v11+ requires a full browser DOM
 * environment (DOMPurify, window, document) that is difficult to polyfill in Node/Bun.
 *
 * **Consequences**:
 * - ✅ Works in Node/Bun without browser dependencies
 * - ✅ Simpler dependency graph
 * - ❌ May not handle all edge cases of mermaid syntax
 * - ❌ Requires maintenance as mermaid syntax evolves
 *
 * **TODO**: Migrate to mermaid's parser if they release a standalone package without DOM deps.
 */
export class ClassExtractor {
    /**
     * Extracts all elements from a mermaid class diagram code block.
     * @param block The mermaid code block to parse.
     * @returns A complete ClassDiagramResult with classes, relations, namespaces, and notes.
     */
    public extract(block: CodeBlock): ClassDiagramResult {
        const content = block.content.trim();

        // Check if this is a classDiagram
        if (!content.startsWith("classDiagram")) {
            return { classes: [], relations: [], namespaces: [], notes: [] };
        }

        // Strip comments
        const lines = content
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => !l.startsWith("%%"));

        const classes = this.extractClasses(lines, block.startLine);
        const relations = this.extractRelations(lines);
        const namespaces = this.extractNamespaces(lines);
        const notes = this.extractNotes(lines);

        return { classes, relations, namespaces, notes };
    }

    /**
     * Legacy method for backward compatibility.
     */
    public extractClasses(block: CodeBlock): ParsedClass[];
    public extractClasses(lines: string[], startLine: number): ParsedClass[];
    public extractClasses(
        blockOrLines: CodeBlock | string[],
        startLine?: number
    ): ParsedClass[] {
        if (Array.isArray(blockOrLines)) {
            return this.parseClasses(blockOrLines, startLine ?? 1);
        }
        const block = blockOrLines;
        const content = block.content.trim();
        if (!content.startsWith("classDiagram")) {
            return [];
        }
        const lines = content
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => !l.startsWith("%%"));
        return this.parseClasses(lines, block.startLine);
    }

    private parseClasses(lines: string[], blockStartLine: number): ParsedClass[] {
        const results: ParsedClass[] = [];
        let currentClass: ParsedClass | null = null;
        let currentClassStartLine = 0;
        let inClassBody = false;
        let currentNamespace: string | undefined = undefined;
        let inNamespaceBody = false;
        let pendingStereotype: Stereotype | null = null; // Track stereotype before class

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue;

            // Check for namespace start
            const namespaceMatch = line.match(/^namespace\s+(\S+)\s*\{?$/);
            if (namespaceMatch && namespaceMatch[1]) {
                currentNamespace = namespaceMatch[1];
                inNamespaceBody = line.endsWith("{");
                continue;
            }

            // Check for namespace end
            if (line === "}" && inNamespaceBody && !inClassBody) {
                currentNamespace = undefined;
                inNamespaceBody = false;
                continue;
            }

            // Check for stereotype annotation (before or after class)
            if (line.startsWith("<<") && line.endsWith(">>")) {
                const stereotype = line.slice(2, -2).toLowerCase();
                const mappedStereotype = this.mapStereotype(stereotype);
                if (currentClass) {
                    // Apply to current class
                    currentClass.stereotype = mappedStereotype;
                } else {
                    // Store for next class
                    pendingStereotype = mappedStereotype;
                }
                continue;
            }

            // Check for class declaration
            const classMatch = line.match(/^class\s+([^{]+?)\s*(\{)?$/);
            if (classMatch && classMatch[1]) {
                if (currentClass) {
                    currentClass.endLine = blockStartLine + i - 1;
                    results.push(currentClass);
                }

                const rawName = classMatch[1].trim();
                const nameInfo = this.parseClassName(rawName);
                currentClassStartLine = blockStartLine + i + 1;

                currentClass = {
                    name: nameInfo.name,
                    isGeneric: nameInfo.isGeneric,
                    typeParams: nameInfo.typeParams,
                    stereotype: pendingStereotype || "class", // Use pending or default
                    body: { methods: [], properties: [], enumValues: [] },
                    namespace: currentNamespace,
                    startLine: currentClassStartLine,
                    endLine: currentClassStartLine,
                };

                pendingStereotype = null; // Reset after use

                inClassBody = !!classMatch[2];
                continue;
            }

            // Check for closing brace
            if (line === "}" && currentClass && inClassBody) {
                currentClass.endLine = blockStartLine + i;
                results.push(currentClass);
                currentClass = null;
                inClassBody = false;
                continue;
            }



            // Parse members if we're inside a class body
            if (currentClass && inClassBody) {
                this.parseMember(line, currentClass.body, currentClass.stereotype);
            }
        }

        // Push the last class
        if (currentClass) {
            if (!currentClass.endLine) {
                currentClass.endLine = blockStartLine + lines.length - 1;
            }
            results.push(currentClass);
        }

        return results;
    }

    private extractRelations(lines: string[]): ParsedRelation[] {
        const relations: ParsedRelation[] = [];

        // Relation patterns (order matters - more specific first)
        const relationPatterns = [
            { regex: /<\|--/, type: "inheritance" as RelationType },
            { regex: /\*--/, type: "composition" as RelationType },
            { regex: /o--/, type: "aggregation" as RelationType },
            { regex: /-->/, type: "association" as RelationType },
            { regex: /\.\.\|>/, type: "realization" as RelationType },
            { regex: /\.\.>/, type: "dependency" as RelationType },
            { regex: /\.\./, type: "dashed" as RelationType },
            { regex: /\(\)--/, type: "lollipop" as RelationType },
            { regex: /--\(\)/, type: "lollipop" as RelationType },
            { regex: /--/, type: "link" as RelationType }, // Must be after lollipop
        ];

        for (const line of lines) {
            if (
                line.startsWith("class ") ||
                line.startsWith("namespace ") ||
                line.startsWith("note ")
            ) {
                continue;
            }

            for (const pattern of relationPatterns) {
                if (pattern.regex.test(line)) {
                    const relation = this.parseRelationLine(line, pattern.type);
                    if (relation) {
                        relations.push(relation);
                    }
                    break;
                }
            }
        }

        return relations;
    }

    private parseRelationLine(
        line: string,
        type: RelationType
    ): ParsedRelation | null {
        // Handle cardinality: ClassA "1" --> "*" ClassB : label
        const cardinalityMatch = line.match(
            /^(\S+)\s*"([^"]+)"\s*[<>|.*o()-]+\s*"([^"]+)"\s*(\S+)(?:\s*:\s*(.+))?$/
        );
        if (
            cardinalityMatch &&
            cardinalityMatch[1] &&
            cardinalityMatch[4]
        ) {
            return {
                sourceClass: cardinalityMatch[1],
                targetClass: cardinalityMatch[4],
                type,
                sourceCardinality: cardinalityMatch[2],
                targetCardinality: cardinalityMatch[3],
                label: cardinalityMatch[5]?.trim(),
            };
        }

        // Handle simple: ClassA --> ClassB : label
        const simpleMatch = line.match(
            /^(\S+)\s*[<>|.*o()-]+\s*(\S+)(?:\s*:\s*(.+))?$/
        );
        if (simpleMatch && simpleMatch[1] && simpleMatch[2]) {
            return {
                sourceClass: simpleMatch[1],
                targetClass: simpleMatch[2],
                type,
                label: simpleMatch[3]?.trim(),
            };
        }

        return null;
    }

    private extractNamespaces(lines: string[]): ParsedNamespace[] {
        const namespaces: ParsedNamespace[] = [];
        let currentNamespace: ParsedNamespace | null = null;
        let braceDepth = 0;

        for (const line of lines) {
            const namespaceMatch = line.match(/^namespace\s+(\S+)\s*\{?$/);
            if (namespaceMatch && namespaceMatch[1]) {
                currentNamespace = { name: namespaceMatch[1], classes: [] };
                if (line.endsWith("{")) {
                    braceDepth = 1;
                }
                continue;
            }

            if (currentNamespace) {
                if (line === "{") {
                    braceDepth++;
                } else if (line === "}") {
                    braceDepth--;
                    if (braceDepth === 0) {
                        namespaces.push(currentNamespace);
                        currentNamespace = null;
                    }
                } else {
                    const classMatch = line.match(/^class\s+([^{]+?)(\s*\{)?$/);
                    if (classMatch && classMatch[1]) {
                        const rawName = classMatch[1].trim();
                        const nameInfo = this.parseClassName(rawName);
                        currentNamespace.classes.push(nameInfo.name);
                        // If class has opening brace on same line, track it
                        if (classMatch[2]) {
                            braceDepth++;
                        }
                    }
                }
            }
        }

        return namespaces;
    }

    private extractNotes(lines: string[]): ParsedNote[] {
        const notes: ParsedNote[] = [];

        for (const line of lines) {
            // note for ClassName "text"
            const noteForMatch = line.match(/^note\s+for\s+(\S+)\s+"([^"]+)"$/);
            if (noteForMatch && noteForMatch[1] && noteForMatch[2]) {
                notes.push({
                    text: noteForMatch[2].replace(/\\n/g, "\n"),
                    forClass: noteForMatch[1],
                });
                continue;
            }

            // note "text"
            const noteMatch = line.match(/^note\s+"([^"]+)"$/);
            if (noteMatch && noteMatch[1]) {
                notes.push({
                    text: noteMatch[1].replace(/\\n/g, "\n"),
                });
            }
        }

        return notes;
    }

    private parseClassName(raw: string): {
        name: string;
        isGeneric: boolean;
        typeParams: TypeParam[];
    } {
        const match = raw.match(/^(.+?)~(.+)~$/);
        if (match && match[1] && match[2]) {
            const name = match[1].trim();
            const paramsStr = match[2];
            const typeParams: TypeParam[] = [];

            const parts = paramsStr.split(",");
            for (const part of parts) {
                const extendsMatch = part.match(/^\s*(.+?)\s+extends\s+(.+?)\s*$/);
                if (extendsMatch && extendsMatch[1] && extendsMatch[2]) {
                    typeParams.push({
                        name: extendsMatch[1],
                        extends: extendsMatch[2],
                    });
                } else {
                    typeParams.push({ name: part.trim() });
                }
            }

            return { name, isGeneric: true, typeParams };
        }

        return { name: raw, isGeneric: false, typeParams: [] };
    }

    private mapStereotype(stereotype: string): Stereotype {
        switch (stereotype) {
            case "interface":
                return "interface";
            case "abstract":
                return "abstract";
            case "enumeration":
            case "enum":
                return "enum";
            case "service":
                return "service";
            case "entity":
                return "entity";
            default:
                return "class";
        }
    }

    private parseMember(
        line: string,
        body: ClassBody,
        stereotype: Stereotype
    ): void {
        if (!line || line === "{" || line === "}") return;

        const visibilityChar = line[0] ?? "";
        let visibility: Visibility = "public";
        let memberLine = line;

        if (["+", "-", "#", "~"].includes(visibilityChar)) {
            visibility = this.mapVisibility(visibilityChar);
            memberLine = line.slice(1).trim();
        }

        // Check if it's a method (contains parentheses)
        if (memberLine.includes("(")) {
            const method = this.parseMethod(memberLine, visibility);
            body.methods.push(method);
        } else if (stereotype === "enum" && !memberLine.includes(" ")) {
            body.enumValues.push(memberLine);
        } else {
            const property = this.parseProperty(memberLine, visibility);
            body.properties.push(property);
        }
    }

    private mapVisibility(char: string): Visibility {
        switch (char) {
            case "+":
                return "public";
            case "-":
                return "private";
            case "#":
                return "protected";
            case "~":
                return "package";
            default:
                return "public";
        }
    }

    private parseMethod(line: string, visibility: Visibility): ParsedMethod {
        let text = line;
        let isAbstract = false;
        let isStatic = false;

        // Check for abstract marker (*)
        if (text.endsWith("*")) {
            isAbstract = true;
            text = text.slice(0, -1).trim();
        }

        // Check for static marker ($)
        if (text.endsWith("$")) {
            isStatic = true;
            text = text.slice(0, -1).trim();
        }

        const match = text.match(/^([\w]+)\s*\(([^)]*)\)\s*(.*)$/);
        if (match && match[1]) {
            const name = match[1];
            const paramsStr = match[2] ?? "";
            let returnType = (match[3] ?? "").trim() || "void";

            // Check for static/abstract in return type position
            if (returnType.endsWith("*")) {
                isAbstract = true;
                returnType = returnType.slice(0, -1).trim() || "void";
            }
            if (returnType.endsWith("$")) {
                isStatic = true;
                returnType = returnType.slice(0, -1).trim() || "void";
            }

            returnType = this.normalizeType(returnType);
            const parameters = this.parseParameters(paramsStr);

            return { name, visibility, parameters, returnType, isAbstract, isStatic };
        }

        return {
            name: text,
            visibility,
            parameters: [],
            returnType: "void",
            isAbstract,
            isStatic,
        };
    }

    private parseParameters(paramsStr: string): ParsedParameter[] {
        if (!paramsStr.trim()) return [];
        const parts = paramsStr.split(",").map((s) => s.trim());
        return parts.map((p) => this.parseParameter(p));
    }

    private parseParameter(p: string): ParsedParameter {
        let name = p;
        let type = "any";
        let optional = false;
        let defaultValue: string | undefined = undefined;

        // Check for default value: "count: int = 10"
        if (p.includes("=")) {
            const splitParts = p.split("=").map((s) => s.trim());
            name = splitParts[0] ?? p;
            defaultValue = splitParts[1];
        }

        // Check for colon separator: "name: type" or "opts?: Options"
        if (name.includes(":")) {
            const colonParts = name.split(":").map((s) => s.trim());
            name = colonParts[0] ?? name;
            type = colonParts[1] ?? "any";
        } else {
            // Space separator: "int bar" or "List~T~ items"
            const spaceMatch = name.match(/^(.+?)\s+(\S+)$/);
            if (spaceMatch && spaceMatch[1] && spaceMatch[2]) {
                type = spaceMatch[1];
                name = spaceMatch[2];
            }
        }

        // Check for optional marker
        if (name.endsWith("?")) {
            optional = true;
            name = name.slice(0, -1);
        }

        // Normalize type (convert ~T~ to <T>)
        type = this.normalizeType(type);

        return {
            name,
            type,
            optional,
            defaultValue,
            isGeneric: type.includes("<"),
            typeVar: undefined,
        };
    }

    private parseProperty(line: string, visibility: Visibility): ParsedProperty {
        let text = line;
        let isStatic = false;

        // Check for static marker ($)
        if (text.endsWith("$")) {
            isStatic = true;
            text = text.slice(0, -1).trim();
        }

        let name = text;
        let type = "any";

        // Check for colon separator: "name: type"
        if (name.includes(":")) {
            const colonParts = name.split(":").map((s) => s.trim());
            name = colonParts[0] ?? name;
            type = colonParts[1] ?? "any";
        } else {
            // Space separator: "string name" or "List~String~ names"
            const spaceMatch = name.match(/^(.+?)\s+(\S+)$/);
            if (spaceMatch && spaceMatch[1] && spaceMatch[2]) {
                type = spaceMatch[1];
                name = spaceMatch[2];
            }
        }

        return { name, visibility, type: this.normalizeType(type), isStatic };
    }

    private normalizeType(type: string): string {
        // Convert List~T~ to List<T>
        return type.replace(/~(.+?)~/g, "<$1>");
    }
}
