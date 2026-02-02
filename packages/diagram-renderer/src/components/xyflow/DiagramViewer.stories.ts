import type { Meta, StoryObj } from "@storybook/svelte";
import { parseClassDiagram } from "@speckey/mermaid-ast";
import { transformClassDiagram } from "../../transformers/class-diagram.ts";
import DiagramViewer from "./DiagramViewer.svelte";

// Sample class diagram
const sampleDiagram = `classDiagram
    class Animal {
        +String name
        +int age
        +makeSound()
    }
    class Dog {
        +String breed
        +bark()
        +fetch()
    }
    class Cat {
        +String color
        +meow()
        +scratch()
    }
    Animal <|-- Dog
    Animal <|-- Cat
`;

// E-commerce example
const ecommerceDiagram = `classDiagram
    class Product {
        +int id
        +String name
        +float price
        +getDetails()
    }
    class Order {
        +int orderId
        +Date orderDate
        +calculateTotal()
    }
    class Customer {
        +String email
        +String name
        +placeOrder()
    }
    Customer --> Order : places
    Order --> Product : contains
`;

const meta = {
    title: "Diagrams/ClassDiagram",
    component: DiagramViewer,
    tags: ["autodocs"],
    parameters: {
        layout: "fullscreen",
    },
} satisfies Meta<DiagramViewer>;

export default meta;
type Story = StoryObj<typeof meta>;

// Animal Inheritance story with async loader
export const AnimalInheritance: Story = {
    args: { nodes: [], edges: [] },
    loaders: [
        async () => {
            const ast = parseClassDiagram(sampleDiagram);
            const result = await transformClassDiagram(ast);
            return { diagramData: result };
        },
    ],
    render: (args, { loaded: { diagramData } }) => ({
        Component: DiagramViewer,
        props: {
            nodes: diagramData.nodes,
            edges: diagramData.edges,
        },
    }),
};

// E-commerce Model story with async loader
export const EcommerceModel: Story = {
    args: { nodes: [], edges: [] },
    loaders: [
        async () => {
            const ast = parseClassDiagram(ecommerceDiagram);
            const result = await transformClassDiagram(ast);
            return { diagramData: result };
        },
    ],
    render: (args, { loaded: { diagramData } }) => ({
        Component: DiagramViewer,
        props: {
            nodes: diagramData.nodes,
            edges: diagramData.edges,
        },
    }),
};
