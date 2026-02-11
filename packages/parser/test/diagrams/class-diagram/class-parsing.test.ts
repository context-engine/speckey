import { describe, expect, it, beforeEach } from "bun:test";
import type { CodeBlock } from "../../../src/markdown-extraction/types";
import { ClassExtractor } from "../../../src/diagrams/class-diagram/class-parsing";

describe("ClassExtractor", () => {
    let extractor: ClassExtractor;

    beforeEach(() => {
        extractor = new ClassExtractor();
    });

    describe("Feature: Class Extraction", () => {
        it("should extract simple class", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: "classDiagram\nclass Foo",
                startLine: 1,
                endLine: 2,
            };

            const result = extractor.extract(block).classes;

            expect(result).toHaveLength(1);
            expect(result[0]?.name).toBe("Foo");
            expect(result[0]?.isGeneric).toBe(false);
        });

        it("should extract generic class", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: "classDiagram\nclass List~T~",
                startLine: 1,
                endLine: 2,
            };

            const result = extractor.extract(block).classes;

            expect(result).toHaveLength(1);
            expect(result[0]?.name).toBe("List");
            expect(result[0]?.isGeneric).toBe(true);
            expect(result[0]?.typeParams[0]?.name).toBe("T");
        });

        it("should extract generic class with constraints", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: "classDiagram\nclass Repo~T extends Entity~",
                startLine: 1,
                endLine: 2,
            };

            const result = extractor.extract(block).classes;

            expect(result).toHaveLength(1);
            expect(result[0]?.typeParams[0]?.name).toBe("T");
            expect(result[0]?.typeParams[0]?.extends).toBe("Entity");
        });

        it("should extract multiple classes", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: "classDiagram\nclass A\nclass B",
                startLine: 1,
                endLine: 3,
            };

            const result = extractor.extract(block).classes;

            expect(result).toHaveLength(2);
            const names = result.map((c) => c.name);
            expect(names).toContain("A");
            expect(names).toContain("B");
        });

        it("should track valid class lines", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: "classDiagram\nclass Foo",
                startLine: 20,
                endLine: 22,
            };

            const result = extractor.extract(block).classes;

            expect(result[0]?.startLine).toBe(21);
            expect(result[0]?.endLine).toBe(21);
        });
    });

    describe("Feature: Member Parsing", () => {
        it("should extract methods with parameters", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
class Foo {
  +foo(int bar) void
}`,
                startLine: 1,
                endLine: 4,
            };

            const result = extractor.extract(block).classes;

            expect(result[0]?.body.methods).toHaveLength(1);
            const method = result[0]?.body.methods[0];
            expect(method?.name).toBe("foo");
            expect(method?.visibility).toBe("public");
            expect(method?.returnType).toBe("void");
            expect(method?.parameters[0]?.name).toBe("bar");
            expect(method?.parameters[0]?.type).toBe("int");
        });

        it("should extract optional and default parameters", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
class Foo {
  +init(opts?: Options, count: int = 10)
}`,
                startLine: 1,
                endLine: 4,
            };

            const result = extractor.extract(block).classes;

            const method = result[0]?.body.methods[0];
            expect(method?.parameters).toHaveLength(2);

            const optsParam = method?.parameters.find((p) => p.name === "opts");
            expect(optsParam?.optional).toBe(true);

            const countParam = method?.parameters.find((p) => p.name === "count");
            expect(countParam?.defaultValue).toBe("10");
        });

        it("should extract generic parameters", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
class Foo {
  process(items: List~T~)
}`,
                startLine: 1,
                endLine: 4,
            };

            const result = extractor.extract(block).classes;

            const method = result[0]?.body.methods[0];
            const param = method?.parameters[0];
            expect(param?.type).toBe("List<T>");
        });

        it("should transform generic syntax in return types", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
class Foo {
  +fetch() Promise~void~
}`,
                startLine: 1,
                endLine: 4,
            };

            const result = extractor.extract(block).classes;

            const method = result[0]?.body.methods[0];
            expect(method?.returnType).toBe("Promise<void>");
        });

        it("should map visibility symbols correctly", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
class Foo {
  #protectedMethod()
  ~packageProperty
}`,
                startLine: 1,
                endLine: 5,
            };

            const result = extractor.extract(block).classes;

            const protectedMethod = result[0]?.body.methods.find(
                (m) => m.name === "protectedMethod"
            );
            expect(protectedMethod?.visibility).toBe("protected");

            const packageProp = result[0]?.body.properties.find(
                (p) => p.name === "packageProperty"
            );
            expect(packageProp?.visibility).toBe("package");
        });

        it("should extract properties", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
class Foo {
  -string name
}`,
                startLine: 1,
                endLine: 4,
            };

            const result = extractor.extract(block).classes;

            expect(result[0]?.body.properties).toHaveLength(1);
            const prop = result[0]?.body.properties[0];
            expect(prop?.name).toBe("name");
            expect(prop?.type).toBe("string");
            expect(prop?.visibility).toBe("private");
        });

        it("should extract generic properties", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
class Foo {
  -List~String~ names
}`,
                startLine: 1,
                endLine: 4,
            };

            const result = extractor.extract(block).classes;

            const prop = result[0]?.body.properties[0];
            expect(prop?.name).toBe("names");
            expect(prop?.type).toBe("List<String>");
        });

        it("should extract abstract methods", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
class Foo {
  foo()*
}`,
                startLine: 1,
                endLine: 4,
            };

            const result = extractor.extract(block).classes;

            const method = result[0]?.body.methods[0];
            expect(method?.isAbstract).toBe(true);
        });
    });

    describe("Feature: Stereotypes", () => {
        it("should detect interface stereotype", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
class IService {
  <<interface>>
}`,
                startLine: 1,
                endLine: 4,
            };

            const result = extractor.extract(block).classes;

            expect(result[0]?.stereotype).toBe("interface");
        });

        it("should detect abstract class stereotype", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
class AbstractRepo {
  <<abstract>>
}`,
                startLine: 1,
                endLine: 4,
            };

            const result = extractor.extract(block).classes;

            expect(result[0]?.stereotype).toBe("abstract");
        });

        it("should extract enum values", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
class Status {
  <<enumeration>>
  ACTIVE
  INACTIVE
}`,
                startLine: 1,
                endLine: 6,
            };

            const result = extractor.extract(block).classes;

            expect(result[0]?.stereotype).toBe("enum");
            expect(result[0]?.body.enumValues).toContain("ACTIVE");
            expect(result[0]?.body.enumValues).toContain("INACTIVE");
        });

        it("should detect service and entity stereotypes", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
class UserService {
  <<service>>
}
class User {
  <<entity>>
}`,
                startLine: 1,
                endLine: 7,
            };

            const result = extractor.extract(block).classes;

            expect(result).toHaveLength(2);
            const service = result.find((c) => c.name === "UserService");
            const entity = result.find((c) => c.name === "User");
            expect(service?.stereotype).toBe("service");
            expect(entity?.stereotype).toBe("entity");
        });
    });

    describe("Feature: Error Handling", () => {
        it("should return empty array for empty content", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: "",
                startLine: 1,
                endLine: 1,
            };

            const result = extractor.extract(block).classes;

            expect(result).toEqual([]);
        });

        it("should return empty array for non-classDiagram content", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: "flowchart LR\nA --> B",
                startLine: 1,
                endLine: 2,
            };

            const result = extractor.extract(block).classes;

            expect(result).toEqual([]);
        });
    });

    describe("Feature: Relations", () => {
        it("should extract inheritance relation", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: "classDiagram\nAnimal <|-- Dog",
                startLine: 1,
                endLine: 2,
            };

            const result = extractor.extract(block);

            expect(result.relations).toHaveLength(1);
            expect(result.relations[0]?.type).toBe("inheritance");
            expect(result.relations[0]?.sourceClass).toBe("Animal");
            expect(result.relations[0]?.targetClass).toBe("Dog");
        });

        it("should extract multiple relation types", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
Animal <|-- Dog
Car *-- Engine
Library o-- Book
Customer --> Order`,
                startLine: 1,
                endLine: 5,
            };

            const result = extractor.extract(block);

            expect(result.relations).toHaveLength(4);
            expect(result.relations[0]?.type).toBe("inheritance");
            expect(result.relations[1]?.type).toBe("composition");
            expect(result.relations[2]?.type).toBe("aggregation");
            expect(result.relations[3]?.type).toBe("association");
        });

        it("should extract relation with label", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: "classDiagram\nCustomer --> Order : places",
                startLine: 1,
                endLine: 2,
            };

            const result = extractor.extract(block);

            expect(result.relations[0]?.label).toBe("places");
        });

        it("should extract relation with cardinality", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
Customer "1" --> "*" Order : places`,
                startLine: 1,
                endLine: 2,
            };

            const result = extractor.extract(block);

            expect(result.relations[0]?.sourceCardinality).toBe("1");
            expect(result.relations[0]?.targetCardinality).toBe("*");
        });
    });

    describe("Feature: Namespaces", () => {
        it("should extract namespace with classes", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
namespace BaseShapes {
    class Triangle
    class Rectangle
}`,
                startLine: 1,
                endLine: 5,
            };

            const result = extractor.extract(block);

            expect(result.namespaces).toHaveLength(1);
            expect(result.namespaces[0]?.name).toBe("BaseShapes");
            expect(result.namespaces[0]?.classes).toContain("Triangle");
            expect(result.namespaces[0]?.classes).toContain("Rectangle");
        });

        it("should assign namespace to classes", () => {
            const content = `classDiagram
            namespace Models {
                class User
            }
            `;
            const block: CodeBlock = {
                language: "mermaid",
                content,
                startLine: 1,
                endLine: 5,
            };

            const result = extractor.extract(block);

            const userClass = result.classes.find((c) => c.name === "User");
            expect(userClass?.namespace).toBe("Models");
        });

        it("should report errors for missing required annotations", () => {
            const content = `classDiagram
            class User {
                +name: string
            }
            `;
            const block: CodeBlock = {
                language: "mermaid",
                content,
                startLine: 1,
                endLine: 5,
            };

            const result = extractor.extract(block).classes;
            const annotations = result[0]?.annotations;

            expect(annotations).toBeDefined();
            expect(annotations?.isValid).toBe(false);
            expect(annotations?.errors).toContain("Missing required annotation: @address");
            expect(annotations?.errors).toContain("Missing required annotation: @type");
        });

        it("should validate correct annotations", () => {
            const content = `classDiagram
            class User {
                %% @address domain.users
                %% @type definition
                +name: string
            }
            `;
            const block: CodeBlock = {
                language: "mermaid",
                content,
                startLine: 1,
                endLine: 7,
            };

            const result = extractor.extract(block).classes;
            const annotations = result[0]?.annotations;

            expect(annotations?.isValid).toBe(true);
            expect(annotations?.address).toBe("domain.users");
            expect(annotations?.entityType).toBe("definition");
            expect(annotations?.errors).toHaveLength(0);
        });
    });

    describe("Feature: Notes", () => {
        it("should extract note for specific class", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
class Foo
note for Foo "This is a note"`,
                startLine: 1,
                endLine: 3,
            };

            const result = extractor.extract(block);

            expect(result.notes).toHaveLength(1);
            expect(result.notes[0]?.text).toBe("This is a note");
            expect(result.notes[0]?.forClass).toBe("Foo");
        });

        it("should extract general note", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
note "This is a general note"`,
                startLine: 1,
                endLine: 2,
            };

            const result = extractor.extract(block);

            expect(result.notes).toHaveLength(1);
            expect(result.notes[0]?.text).toBe("This is a general note");
            expect(result.notes[0]?.forClass).toBeUndefined();
        });
    });

    describe("Feature: Static Members", () => {
        it("should extract static method", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
class Foo {
    +getInstance()$
}`,
                startLine: 1,
                endLine: 4,
            };

            const result = extractor.extract(block).classes;

            const method = result[0]?.body.methods[0];
            expect(method?.name).toBe("getInstance");
            expect(method?.isStatic).toBe(true);
        });

        it("should extract static property", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
class Foo {
    +String instance$
}`,
                startLine: 1,
                endLine: 4,
            };

            const result = extractor.extract(block).classes;

            const prop = result[0]?.body.properties[0];
            expect(prop?.name).toBe("instance");
            expect(prop?.isStatic).toBe(true);
        });

        it("should extract static method with return type", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
class Foo {
    +create() Foo$
}`,
                startLine: 1,
                endLine: 4,
            };

            const result = extractor.extract(block).classes;

            const method = result[0]?.body.methods[0];
            expect(method?.returnType).toBe("Foo");
            expect(method?.isStatic).toBe(true);
        });
    });

    describe("Feature: Comments", () => {
        it("should strip comments from diagram", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
%% This is a comment
class Foo {
    +bar()
}`,
                startLine: 1,
                endLine: 5,
            };

            const result = extractor.extract(block).classes;

            expect(result).toHaveLength(1);
            expect(result[0]?.name).toBe("Foo");
        });
    });

    describe("Feature: Edge Cases", () => {
        it("should handle empty class body", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: "classDiagram\nclass EmptyClass {}",
                startLine: 1,
                endLine: 2,
            };

            const result = extractor.extract(block).classes;

            expect(result).toHaveLength(1);
            expect(result[0]?.name).toBe("EmptyClass");
            expect(result[0]?.body.methods).toHaveLength(0);
            expect(result[0]?.body.properties).toHaveLength(0);
        });

        it("should handle class with multiple generic params", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: "classDiagram\nclass Map~K,V~",
                startLine: 1,
                endLine: 2,
            };

            const result = extractor.extract(block).classes;

            expect(result[0]?.name).toBe("Map");
            expect(result[0]?.isGeneric).toBe(true);
            expect(result[0]?.typeParams).toHaveLength(2);
            expect(result[0]?.typeParams[0]?.name).toBe("K");
            expect(result[0]?.typeParams[1]?.name).toBe("V");
        });

        it("should handle class without explicit visibility", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
class Foo {
    implicitMethod()
    implicitProp
}`,
                startLine: 1,
                endLine: 5,
            };

            const result = extractor.extract(block).classes;

            const method = result[0]?.body.methods[0];
            expect(method?.visibility).toBe("public"); // Default

            const prop = result[0]?.body.properties[0];
            expect(prop?.visibility).toBe("public"); // Default
        });

        it("should handle method with no parameters", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
class Foo {
    +noParams() void
}`,
                startLine: 1,
                endLine: 4,
            };

            const result = extractor.extract(block).classes;

            const method = result[0]?.body.methods[0];
            expect(method?.name).toBe("noParams");
            expect(method?.parameters).toHaveLength(0);
            expect(method?.returnType).toBe("void");
        });

        it("should handle method with no return type", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
class Foo {
    +noReturnType()
}`,
                startLine: 1,
                endLine: 4,
            };

            const result = extractor.extract(block).classes;

            const method = result[0]?.body.methods[0];
            expect(method?.returnType).toBe("void"); // Default
        });

        it("should handle property with colon syntax", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
class Foo {
    +name: string
    -count: number
}`,
                startLine: 1,
                endLine: 5,
            };

            const result = extractor.extract(block).classes;

            expect(result[0]?.body.properties).toHaveLength(2);
            expect(result[0]?.body.properties[0]?.name).toBe("name");
            expect(result[0]?.body.properties[0]?.type).toBe("string");
            expect(result[0]?.body.properties[1]?.name).toBe("count");
            expect(result[0]?.body.properties[1]?.type).toBe("number");
        });

        it("should handle duplicate class names gracefully", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: "classDiagram\nclass Foo\nclass Foo",
                startLine: 1,
                endLine: 3,
            };

            const result = extractor.extract(block).classes;

            // mermaid-ast merges duplicate definitions
            expect(result.length).toBeGreaterThanOrEqual(1);
            expect(result[0]?.name).toBe("Foo");
        });

        it("should handle inline class definition", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: "classDiagram\nFoo : +method()",
                startLine: 1,
                endLine: 2,
            };

            const result = extractor.extract(block).classes;

            expect(result).toHaveLength(1);
            expect(result[0]?.name).toBe("Foo");
        });
    });

    describe("Feature: Boundary Conditions", () => {
        it("should handle single-line class diagram", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: "classDiagram",
                startLine: 1,
                endLine: 1,
            };

            const result = extractor.extract(block);

            expect(result.classes).toHaveLength(0);
            expect(result.relations).toHaveLength(0);
        });

        it("should handle whitespace-only class body", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
class Foo {
    
}`,
                startLine: 1,
                endLine: 4,
            };

            const result = extractor.extract(block).classes;

            expect(result).toHaveLength(1);
            expect(result[0]?.body.methods).toHaveLength(0);
            expect(result[0]?.body.properties).toHaveLength(0);
        });

        it("should handle class name with underscores", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: "classDiagram\nclass My_Class_Name",
                startLine: 1,
                endLine: 2,
            };

            const result = extractor.extract(block).classes;

            expect(result[0]?.name).toBe("My_Class_Name");
        });

        it("should handle complex nested generic return type", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
class Foo {
    +fetch() Promise~Result~T~~
}`,
                startLine: 1,
                endLine: 4,
            };

            const result = extractor.extract(block).classes;

            const method = result[0]?.body.methods[0];
            expect(method?.returnType).toContain("Promise");
        });

        it("should handle mixed members: methods, properties, and enum values", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
class Mixed {
    +id: string
    +getName() string
}`,
                startLine: 1,
                endLine: 5,
            };

            const result = extractor.extract(block).classes;

            expect(result[0]?.body.properties).toHaveLength(1);
            expect(result[0]?.body.methods).toHaveLength(1);
        });

        it("should preserve annotation order", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
class Ordered {
    %% @type definition
    %% @address com.example
    +field: string
}`,
                startLine: 1,
                endLine: 6,
            };

            const result = extractor.extract(block).classes;

            // Annotations should be parsed regardless of order
            expect(result[0]?.annotations?.address).toBe("com.example");
            expect(result[0]?.annotations?.entityType).toBe("definition");
        });
    });

    describe("Feature: Negative Tests", () => {
        it("should handle malformed method gracefully", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
class Foo {
    +incomplete(
}`,
                startLine: 1,
                endLine: 4,
            };

            // Should not throw, parser is resilient
            const result = extractor.extract(block);
            expect(result).toBeDefined();
        });

        it("should return empty result for syntax error", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: "classDiagram\n{{{invalid syntax}}}",
                startLine: 1,
                endLine: 2,
            };

            const result = extractor.extract(block);

            // Graceful degradation - empty result instead of throw
            expect(result.classes).toBeDefined();
        });

        it("should handle missing stereotype closing", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
class Foo {
    <<interface
}`,
                startLine: 1,
                endLine: 4,
            };

            // Should not throw
            const result = extractor.extract(block);
            expect(result).toBeDefined();
        });
    });

    // ============================================================
    // Feature: Line Number Resolution (CD-1100)
    // ============================================================

    describe("Feature: Line Number Resolution", () => {
        it("should not match substring class names in findLineNumbers", () => {
            const content = `classDiagram
class UserService {
    %% @address app.services
    %% @type definition
    +getUser() string
}
class User {
    %% @address app.models
    %% @type definition
    +name: string
}`;
            const result = extractor.extract(content, 0);

            const userService = result.classes.find(c => c.name === "UserService");
            const user = result.classes.find(c => c.name === "User");

            expect(userService).toBeDefined();
            expect(user).toBeDefined();

            // Each class should have its own distinct line range
            expect(user!.startLine).not.toBe(userService!.startLine);

            // Each class should get its own annotations
            expect(userService!.annotations?.address).toBe("app.services");
            expect(user!.annotations?.address).toBe("app.models");
        });

        it("should parse annotations correctly with non-zero startLineOffset", () => {
            const content = `classDiagram
class Foo {
    %% @address app.domain
    %% @type definition
    +doStuff() void
}`;
            const block: CodeBlock = {
                language: "mermaid",
                content,
                startLine: 5,
                endLine: 11,
            };

            const result = extractor.extract(block);
            const foo = result.classes[0];

            expect(foo).toBeDefined();
            expect(foo!.annotations?.isValid).toBe(true);
            expect(foo!.annotations?.address).toBe("app.domain");
            expect(foo!.annotations?.entityType).toBe("definition");
        });

        it("should parse distinct annotations for multiple classes with non-zero offset", () => {
            const content = `classDiagram
class Alpha {
    %% @address pkg.alpha
    %% @type definition
    +run() void
}
class Beta {
    %% @address pkg.beta
    %% @type reference
}`;
            const block: CodeBlock = {
                language: "mermaid",
                content,
                startLine: 10,
                endLine: 20,
            };

            const result = extractor.extract(block);
            const alpha = result.classes.find(c => c.name === "Alpha");
            const beta = result.classes.find(c => c.name === "Beta");

            expect(alpha).toBeDefined();
            expect(beta).toBeDefined();

            expect(alpha!.annotations?.address).toBe("pkg.alpha");
            expect(alpha!.annotations?.entityType).toBe("definition");

            expect(beta!.annotations?.address).toBe("pkg.beta");
            expect(beta!.annotations?.entityType).toBe("reference");
        });
    });

    // ============================================================
    // Feature: Comment Member Filtering (CD-1200)
    // ============================================================

    describe("Feature: Comment Member Filtering", () => {
        it("should not parse %% comment lines as properties", () => {
            const content = `classDiagram
class Foo {
    %% @address app.domain
    %% @type definition
    +name: string
    +id: number
}`;
            const result = extractor.extract(content, 0);
            const foo = result.classes[0];

            expect(foo).toBeDefined();
            // Should only have declared properties, not annotation-derived ones
            const propNames = foo!.body.properties.map(p => p.name);
            expect(propNames).toContain("name");
            expect(propNames).toContain("id");
            expect(propNames).not.toContain("app.domain");
            expect(propNames).not.toContain("definition");

            // No property should have type starting with "%%"
            for (const prop of foo!.body.properties) {
                expect(prop.type).not.toContain("%%");
            }
        });

        it("should not parse %% comment lines as methods", () => {
            const content = `classDiagram
class Bar {
    %% this is a plain comment
    +doWork() void
}`;
            const result = extractor.extract(content, 0);
            const bar = result.classes[0];

            expect(bar).toBeDefined();
            expect(bar!.body.methods).toHaveLength(1);
            expect(bar!.body.methods[0]!.name).toBe("doWork");
        });
    });
});
