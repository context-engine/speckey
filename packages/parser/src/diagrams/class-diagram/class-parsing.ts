import { parseClassDiagram } from "mermaid-ast";
import type {
    ClassDiagramAST,
    ClassDefinition,
    ClassRelation,
    Namespace
} from "mermaid-ast";
import type { CodeBlock } from "../../markdown-extraction/types";

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
 * Parses Mermaid classDiagram source into structured domain models.
 *
 * @address speckey.parser.class
 * @type definition
 */
export class ClassExtractor {
    private annotationParser = new AnnotationParser();

    /**
     * Parse mermaid classDiagram source and produce a ClassDiagramResult.
     */
    extract(input: string | CodeBlock, startLineOffset?: number): ClassDiagramResult {
        const source = typeof input === "string" ? input : input.content;
        const lineOffset = typeof input === "string" ? (startLineOffset ?? 0) : input.startLine;
        const content = source.trim();

        if (!content.startsWith("classDiagram")) {
            return { classes: [], relations: [], namespaces: [], notes: [] };
        }

        try {
            const ast = this.parseWithMermaidAst(content);
            const classes = this.transformClasses(ast, lineOffset, content);
            const relations = this.transformRelations(ast);
            const namespaces = this.transformNamespaces(ast, classes);
            const notes = this.transformNotes(ast);

            return { classes, relations, namespaces, notes };
        } catch (error) {
            const rawMessage = error instanceof Error ? error.message : String(error);
            // Adjust mermaid-internal line numbers to markdown file line numbers
            const parseError = rawMessage.replace(
                /on line (\d+)/g,
                (_, n) => `on line ${Number(n) + lineOffset}`,
            );
            return { classes: [], relations: [], namespaces: [], notes: [], parseError };
        }
    }

    private parseWithMermaidAst(source: string): ClassDiagramAST {
        return parseClassDiagram(source);
    }

    private transformClasses(ast: ClassDiagramAST, startLineOffset: number, content: string): ParsedClass[] {
        const classes: ParsedClass[] = [];
        for (const [_id, def] of ast.classes) {
            classes.push(this.transformClass(def, startLineOffset, content));
        }
        return classes;
    }

    private transformClass(def: ClassDefinition, startLineOffset: number, content: string): ParsedClass {
        const { name, isGeneric, typeParams } = this.parseClassName(def.id, def.label);

        const body: ClassBody = {
            methods: [],
            properties: [],
            enumValues: []
        };

        let stereotype: Stereotype = "class";

        if (def.annotations && def.annotations.length > 0) {
            stereotype = this.parseStereotype(def.annotations[0]!);
        }

        if (def.members) {
            for (const member of def.members) {
                const m = member as any;
                const text = m.text?.trim() || m.title?.trim() || "";
                const stereoMatch = text.match(/^<<(.+)>>$/);
                if (stereoMatch && stereoMatch[1]) {
                    stereotype = this.parseStereotype(stereoMatch[1]);
                } else {
                    this.parseMember(member, body, stereotype);
                }
            }
        }

        const { startLine, endLine } = this.findLineNumbers(def.id, content, startLineOffset);

        const relativeStart = startLine - startLineOffset;
        const relativeEnd = endLine - startLineOffset;
        const classLines = content.split('\n').slice(relativeStart, relativeEnd + 1);
        const comments = classLines
            .map(line => line.trim())
            .filter(line => line.startsWith("%%"));

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

    private transformRelations(ast: ClassDiagramAST): ParsedRelation[] {
        const relations: ParsedRelation[] = [];
        for (const rel of ast.relations) {
            relations.push(this.transformRelation(rel));
        }
        return relations;
    }

    private transformRelation(rel: ClassRelation): ParsedRelation {
        let type: RelationType = "association";

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

        if ((type1 === 'extension' || type2 === 'extension') && lineType === 'dotted') {
            type = "realization";
        } else if (type1 === 'extension' || type2 === 'extension') {
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
            type = "association";
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

    private transformNamespaces(ast: ClassDiagramAST, classes: ParsedClass[]): ParsedNamespace[] {
        const namespaces: ParsedNamespace[] = [];
        for (const [name, ns] of ast.namespaces) {
            namespaces.push({ name, classes: ns.classes });
            for (const classId of ns.classes) {
                const cls = classes.find(c => c.name === classId || c.name === classId.split('~')[0]);
                if (cls) cls.namespace = name;
            }
        }
        return namespaces;
    }

    private transformNotes(ast: ClassDiagramAST): ParsedNote[] {
        return ast.notes.map(note => ({
            text: note.text.replace(/<br\s*\/?>/gi, "\n"),
            forClass: note.forClass
        }));
    }

    private parseClassName(id: string, label?: string): { name: string, isGeneric: boolean, typeParams: TypeParam[] } {
        const raw = label || id;

        const match = raw.match(/^(.+?)~(.+)~$/);
        if (match && match[1] && match[2]) {
            const name = match[1].trim();
            const typeParams = this.parseGenericParams(match[2]);
            return { name, isGeneric: true, typeParams };
        }

        return { name: raw, isGeneric: false, typeParams: [] };
    }

    private parseGenericParams(paramsStr: string): TypeParam[] {
        return paramsStr.split(",").map(part => {
            const extendsMatch = part.match(/^\s*(.+?)\s+extends\s+(.+?)\s*$/);
            if (extendsMatch && extendsMatch[1] && extendsMatch[2]) {
                return { name: extendsMatch[1], extends: extendsMatch[2] };
            }
            return { name: part.trim() };
        });
    }

    private parseStereotype(annotation: string): Stereotype {
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

    private parseMember(member: any, body: ClassBody, stereotype: Stereotype): void {
        const text = member.text?.trim() || member.title?.trim() || "";

        if (text.startsWith("%%")) return;

        const visibility = this.mapVisibility(member.visibility || member.accessibility);

        const isStatic = text.endsWith("$") || member.isStatic;
        const isAbstract = text.endsWith("*") || member.isAbstract;

        let localText = text;
        if (localText.endsWith("$")) localText = localText.slice(0, -1).trim();
        if (localText.endsWith("*")) localText = localText.slice(0, -1).trim();

        if (localText.includes("(") || localText.endsWith(")")) {
            body.methods.push(this.parseMethodSignature(localText, visibility, !!isStatic, !!isAbstract));
        } else if (stereotype === "enum") {
            body.enumValues.push(localText);
        } else {
            body.properties.push(this.parsePropertySignature(localText, visibility, !!isStatic));
        }
    }

    private parseMethodSignature(text: string, visibility: Visibility, isStatic: boolean, isAbstract: boolean): ParsedMethod {
        const match = text.match(/^([\w]+)\s*\(([^)]*)\)\s*(.*)$/);
        if (match && match[1]) {
            const name = match[1];
            const paramsStr = match[2] ?? "";
            const returnType = (match[3] ?? "").trim() || "void";

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

        let optional = false;
        if (name.endsWith("?")) {
            optional = true;
            name = name.slice(0, -1);
        }

        const normalizedType = this.normalizeType(type);
        const isGeneric = normalizedType.includes("<");
        const typeVar = isGeneric ? type.replace(/.*<(.+?)>.*/, "$1") : undefined;

        return {
            name,
            type: normalizedType,
            optional,
            defaultValue,
            isGeneric,
            typeVar
        };
    }

    private findLineNumbers(classId: string, content: string, startLineOffset: number): { startLine: number, endLine: number } {
        const lines = content.split('\n');
        let startLine = 0;
        let endLine = 0;
        let found = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line && new RegExp(`\\b${classId}\\b`).test(line) && !found) {
                if (line.trim().startsWith("class ") || line.includes("{") || line.includes(":")) {
                    startLine = startLineOffset + i;
                    endLine = startLine;
                    found = true;

                    let openBraces = (line.match(/{/g) || []).length;
                    let closeBraces = (line.match(/}/g) || []).length;
                    let balance = openBraces - closeBraces;

                    if (balance > 0) {
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
                        endLine = startLineOffset + i;
                    }
                }
            }
        }

        return { startLine, endLine };
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

    private normalizeType(type: string): string {
        return type.replace(/~(.+?)~/g, "<$1>");
    }
}
