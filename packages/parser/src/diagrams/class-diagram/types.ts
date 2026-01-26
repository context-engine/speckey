export type Visibility = "public" | "private" | "protected" | "package";

export type Stereotype =
    | "class"
    | "interface"
    | "abstract"
    | "enum"
    | "service"
    | "entity";

export type RelationType =
    | "inheritance" // <|--
    | "composition" // *--
    | "aggregation" // o--
    | "association" // -->
    | "link" // --
    | "dependency" // ..>
    | "realization" // ..|>
    | "dashed" // ..
    | "lollipop"; // ()--

export interface TypeParam {
    name: string;
    extends?: string;
}

export interface ParsedParameter {
    name: string;
    type: string;
    optional: boolean;
    defaultValue?: string;
    isGeneric: boolean;
    typeVar?: string;
}

export interface ParsedMethod {
    name: string;
    visibility: Visibility;
    parameters: ParsedParameter[];
    returnType: string;
    isAbstract: boolean;
    isStatic: boolean;
}

export interface ParsedProperty {
    name: string;
    visibility: Visibility;
    type: string;
    isStatic: boolean;
}

export interface ClassBody {
    methods: ParsedMethod[];
    properties: ParsedProperty[];
    enumValues: string[];
}

export interface ParsedClass {
    name: string;
    isGeneric: boolean;
    typeParams: TypeParam[];
    stereotype: Stereotype;
    body: ClassBody;
    namespace?: string;
    startLine?: number;
    endLine?: number;
}

export interface ParsedRelation {
    sourceClass: string;
    targetClass: string;
    type: RelationType;
    label?: string;
    sourceCardinality?: string;
    targetCardinality?: string;
}

export interface ParsedNamespace {
    name: string;
    classes: string[];
}

export interface ParsedNote {
    text: string;
    forClass?: string;
}

export interface ClassDiagramResult {
    classes: ParsedClass[];
    relations: ParsedRelation[];
    namespaces: ParsedNamespace[];
    notes: ParsedNote[];
}
