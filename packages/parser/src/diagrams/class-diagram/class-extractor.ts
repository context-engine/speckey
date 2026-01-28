import type { CodeBlock } from "../../mermaid-extraction/types";
import { parseClassDiagram } from "mermaid-ast";
// Import main types directly from the library root, as seen in diagram-renderer
import type {
    ClassDiagramAST,
    ClassDefinition,
    ClassRelation,
    Namespace
} from "mermaid-ast";

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
    TypeParam
} from "./types";
import { AnnotationParser } from "./annotation-handling";

/**
 * Extracts class definitions, relationships, namespaces, and notes from Mermaid classDiagram blocks.
 */
export class ClassExtractor {
    private annotationParser = new AnnotationParser();

    public extract(block: CodeBlock): ClassDiagramResult {
        const content = block.content.trim();

        if (!content.startsWith("classDiagram")) {
            return { classes: [], relations: [], namespaces: [], notes: [] };
        }

        try {
            const ast = parseClassDiagram(content);
            return this.transformAST(ast, block.startLine, content);
        } catch (error) {
            console.error("Failed to parse class diagram:", error);
            return { classes: [], relations: [], namespaces: [], notes: [] };
        }
    }

    private transformAST(ast: ClassDiagramAST, startLineOffset: number, content: string): ClassDiagramResult {
        const classes: ParsedClass[] = [];
        const relations: ParsedRelation[] = [];
        const namespaces: ParsedNamespace[] = [];
        const notes: ParsedNote[] = [];

        // 1. Transform Classes
        // mermaid-ast classes are in a Map
        for (const [id, def] of ast.classes) {
            classes.push(this.transformClass(def, startLineOffset, content));
        }

        // 2. Transform Relations
        for (const rel of ast.relations) {
            relations.push(this.transformRelation(rel));
        }

        // 3. Transform Namespaces
        for (const [name, ns] of ast.namespaces) {
            namespaces.push(this.transformNamespace(name, ns));
            // Assign namespace to classes
            for (const classId of ns.classes) {
                const cls = classes.find(c => c.name === classId || c.name === classId.split('~')[0]);
                if (cls) cls.namespace = name;
            }
        }

        // 4. Transform Notes
        for (const note of ast.notes) {
            notes.push({
                text: note.text.replace(/<br\s*\/?>/gi, "\n"),
                forClass: note.forClass
            });
        }

        return { classes, relations, namespaces, notes };
    }

    private transformClass(def: ClassDefinition, startLineOffset: number, content: string): ParsedClass {
        // Debugging stereotypes
        // console.log(`[ClassExtractor] Parsing class ${def.id}:`, JSON.stringify(def));

        const { name, isGeneric, typeParams } = this.parseClassName(def.id, def.label);

        const body: ClassBody = {
            methods: [],
            properties: [],
            enumValues: []
        };

        let stereotype: Stereotype = "class";

        // Annotations
        // Annotations
        if (def.annotations && def.annotations.length > 0) {
            stereotype = this.mapStereotype(def.annotations[0]!);
        }

        if (def.members) {
            for (const member of def.members) {
                // Check if member is a stereotype definition (e.g. <<interface>>)
                // mermaid-ast 0.8.2 might parse it as a member with variable text
                const m = member as any;
                const text = m.text?.trim() || m.title?.trim() || "";
                const stereoMatch = text.match(/^<<(.+)>>$/);
                if (stereoMatch && stereoMatch[1]) {
                    stereotype = this.mapStereotype(stereoMatch[1]);
                } else {
                    this.parseMember(member, body, stereotype);
                }
            }
        }

        const { startLine, endLine } = this.findClassLineNumbers(def.id, content, startLineOffset);

        // Extract comments from the class body lines
        const classLines = content.split('\n').slice(startLine, endLine + 1);
        const comments = classLines
            .map(line => line.trim())
            .filter(line => line.startsWith("%%"));

        // console.log(`[ClassExtractor] ${def.id} Lines: ${startLine}-${endLine}`);
        // console.log(`[ClassExtractor] ${def.id} Comments:`, comments);

        const annotationsResult = this.annotationParser.parseAnnotations(comments);

        return {
            name,
            isGeneric,
            typeParams,
            stereotype,
            body,
            annotations: annotationsResult,
            startLine,
            endLine
        };
    }

    private findClassLineNumbers(classId: string, content: string, startLineOffset: number): { startLine: number, endLine: number } {
        const lines = content.split('\n');
        let startLine = 0;
        let endLine = 0;
        let found = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Match "class ClassId" or "class ClassId{" or "ClassId :"
            // A simple includes might match "User" in "UserService", so be careful.
            // But strict regex is complex. Let's try to be slightly more specific if possible, 
            // or rely on the previous heuristic if adequate for now.
            // Previous heuristic: line && line.includes(classId)

            if (line && line.includes(classId) && !found) {
                // Potential detection of class start
                // Check if it's really the class definition (starts with class or has curlies or :)
                if (line.trim().startsWith("class ") || line.includes("{") || line.includes(":")) {
                    startLine = startLineOffset + i;
                    endLine = startLine;
                    found = true;

                    // Check for block start
                    let openBraces = (line.match(/{/g) || []).length;
                    let closeBraces = (line.match(/}/g) || []).length;
                    let balance = openBraces - closeBraces;

                    if (balance > 0) {
                        // Scan forward for closing brace
                        for (let j = i + 1; j < lines.length; j++) {
                            const nextLine = lines[j];
                            if (!nextLine) continue;
                            const open = (nextLine.match(/{/g) || []).length;
                            const close = (nextLine.match(/}/g) || []).length;
                            balance += open - close;

                            if (balance <= 0) {
                                endLine = startLineOffset + j;
                                break;
                            }
                        }
                    } else if (openBraces > 0 && balance === 0) {
                        // Opened and closed on same line (empty class?)
                        endLine = startLineOffset + i;
                    }
                }
            }
        }

        return { startLine, endLine };
    }

    private transformRelation(rel: ClassRelation): ParsedRelation {
        let type: RelationType = "association";

        // mermaid-ast structure:
        // id1, id2, relation: { type1, type2, lineType }, relationTitle1, relationTitle2, title
        if (!rel.relation) {
            return {
                sourceClass: rel.id1,
                targetClass: rel.id2,
                type: "association",
                label: rel.title,
                sourceCardinality: rel.relationTitle1,
                targetCardinality: rel.relationTitle2
            };
        }
        const { type1, type2, lineType } = rel.relation;

        if (type1 === 'extension' || type2 === 'extension') {
            type = "inheritance";
        } else if (type1 === 'composition' || type2 === 'composition') {
            type = "composition";
        } else if (type1 === 'aggregation' || type2 === 'aggregation') {
            type = "aggregation";
        } else if (type1 === 'lollipop' || type2 === 'lollipop') {
            type = "lollipop";
        } else if (lineType === 'dotted') {
            type = "dependency";
        } else if (lineType === 'solid') {
            type = "association"; // Default to association for solid lines
            if (type1 === 'none' && type2 === 'none') type = "link";
        }

        return {
            sourceClass: rel.id1,
            targetClass: rel.id2,
            type,
            label: rel.title,
            sourceCardinality: rel.relationTitle1,
            targetCardinality: rel.relationTitle2
        };
    }

    private transformNamespace(name: string, ns: Namespace): ParsedNamespace {
        return {
            name: name,
            classes: ns.classes
        };
    }

    private parseClassName(id: string, label?: string): { name: string, isGeneric: boolean, typeParams: TypeParam[] } {
        const raw = label || id;

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

    private mapStereotype(annotation: string): Stereotype {
        const clean = annotation.toLowerCase().replace(/<|>/g, '');
        switch (clean) {
            case "interface": return "interface";
            case "abstract": return "abstract";
            case "enumeration":
            case "enum": return "enum";
            case "service": return "service";
            case "entity": return "entity";
            default: return "class";
        }
    }

    // Use 'any' for member temporarily to bypass strict type check if interface mismatches, 
    // but try to cast to expected shape.
    private parseMember(member: any, body: ClassBody, stereotype: Stereotype): void {
        // ClassMember in 0.8.2: { text: string, visibility: string, type: 'method'|'attribute' }
        const text = member.text?.trim() || member.title?.trim() || "";
        const visibility = this.mapVisibility(member.visibility || member.accessibility);

        const isStatic = text.endsWith("$") || member.isStatic;
        const isAbstract = text.endsWith("*") || member.isAbstract;

        let localText = text;
        if (localText.endsWith("$")) localText = localText.slice(0, -1).trim();
        if (localText.endsWith("*")) localText = localText.slice(0, -1).trim();

        if (localText.includes("(") || localText.endsWith(")")) {
            const parsedMethod = this.parseMethodSignature(localText, visibility, !!isStatic, !!isAbstract);
            body.methods.push(parsedMethod);
        } else if (stereotype === "enum") {
            body.enumValues.push(localText);
        } else {
            const parsedProp = this.parsePropertySignature(localText, visibility, !!isStatic);
            body.properties.push(parsedProp);
        }
    }

    private mapVisibility(acc?: string): Visibility {
        switch (acc) {
            case "+": return "public";
            case "-": return "private";
            case "#": return "protected";
            case "~": return "package";
            default: return "public";
        }
    }

    private parseMethodSignature(text: string, visibility: Visibility, isStatic: boolean, isAbstract: boolean): ParsedMethod {
        const match = text.match(/^([\w]+)\s*\(([^)]*)\)\s*(.*)$/);
        if (match && match[1]) {
            const name = match[1];
            const paramsStr = match[2] ?? "";
            let returnType = (match[3] ?? "").trim() || "void";

            return {
                name,
                visibility,
                parameters: this.parseParameters(paramsStr),
                returnType: this.normalizeType(returnType),
                isAbstract,
                isStatic
            };
        }
        return { name: text, visibility, parameters: [], returnType: "void", isAbstract, isStatic };
    }

    private parsePropertySignature(text: string, visibility: Visibility, isStatic: boolean): ParsedProperty {
        let name = text;
        let type = "any";

        if (name.includes(":")) {
            const parts = name.split(":");
            name = parts[0] ? parts[0].trim() : name;
            type = parts[1] ? parts[1].trim() : "any";
        } else {
            const spaceMatch = name.match(/^(.+?)\s+(\S+)$/);
            if (spaceMatch && spaceMatch[1] && spaceMatch[2]) {
                type = spaceMatch[1];
                name = spaceMatch[2];
            }
        }

        return { name, visibility, type: this.normalizeType(type), isStatic };
    }

    private parseParameters(paramsStr: string): ParsedParameter[] {
        if (!paramsStr.trim()) return [];
        return paramsStr.split(",").map(p => this.parseParameter(p.trim()));
    }

    private parseParameter(p: string): ParsedParameter {
        let text = p;
        let defaultValue: string | undefined;

        // Extract default value
        if (text.includes("=")) {
            const parts = text.split("=");
            text = parts[0] ? parts[0].trim() : text;
            defaultValue = parts[1] ? parts[1].trim() : undefined;
        }

        let name = text;
        let type = "any";

        if (text.includes(":")) {
            const parts = text.split(":");
            name = parts[0] ? parts[0].trim() : text;
            type = parts[1] ? parts[1].trim() : "any";
        } else {
            const spaceMatch = text.match(/^(.+?)\s+(\S+)$/);
            if (spaceMatch && spaceMatch[1] && spaceMatch[2]) {
                type = spaceMatch[1];
                name = spaceMatch[2];
            }
        }

        // Check optional
        let optional = false;
        if (name.endsWith("?")) {
            optional = true;
            name = name.slice(0, -1);
        }

        return {
            name,
            type: this.normalizeType(type),
            optional,
            defaultValue,
            isGeneric: type.includes("<")
        };
    }

    private normalizeType(type: string): string {
        return type.replace(/~(.+?)~/g, "<$1>");
    }
}
