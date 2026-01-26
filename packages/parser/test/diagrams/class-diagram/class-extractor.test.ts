import { describe, expect, it, beforeEach } from "bun:test";
import type { CodeBlock } from "../../../src/mermaid-extraction/types";
import { ClassExtractor } from "../../../src/diagrams/class-diagram/class-extractor";

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

            const result = extractor.extractClasses(block);

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

            const result = extractor.extractClasses(block);

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

            const result = extractor.extractClasses(block);

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

            const result = extractor.extractClasses(block);

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

            const result = extractor.extractClasses(block);

            expect(result[0]?.startLine).toBe(22);
            expect(result[0]?.endLine).toBe(22);
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

            const result = extractor.extractClasses(block);

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

            const result = extractor.extractClasses(block);

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

            const result = extractor.extractClasses(block);

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

            const result = extractor.extractClasses(block);

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

            const result = extractor.extractClasses(block);

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

            const result = extractor.extractClasses(block);

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

            const result = extractor.extractClasses(block);

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

            const result = extractor.extractClasses(block);

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

            const result = extractor.extractClasses(block);

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

            const result = extractor.extractClasses(block);

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

            const result = extractor.extractClasses(block);

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

            const result = extractor.extractClasses(block);

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

            const result = extractor.extractClasses(block);

            expect(result).toEqual([]);
        });

        it("should return empty array for non-classDiagram content", () => {
            const block: CodeBlock = {
                language: "mermaid",
                content: "flowchart LR\nA --> B",
                startLine: 1,
                endLine: 2,
            };

            const result = extractor.extractClasses(block);

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
            const block: CodeBlock = {
                language: "mermaid",
                content: `classDiagram
namespace Models {
    class User {
        +string name
    }
}`,
                startLine: 1,
                endLine: 6,
            };

            const result = extractor.extract(block);

            const userClass = result.classes.find((c) => c.name === "User");
            expect(userClass?.namespace).toBe("Models");
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

            const result = extractor.extractClasses(block);

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

            const result = extractor.extractClasses(block);

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

            const result = extractor.extractClasses(block);

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

            const result = extractor.extractClasses(block);

            expect(result).toHaveLength(1);
            expect(result[0]?.name).toBe("Foo");
        });
    });
});
