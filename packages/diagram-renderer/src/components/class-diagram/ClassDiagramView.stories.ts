import type { Meta, StoryObj } from '@storybook/svelte';
import { parseClassDiagram } from '@speckey/mermaid-ast';
import ClassDiagramView from './ClassDiagramView.svelte';

// Simple inheritance example
const animalDiagram = `classDiagram
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

// E-commerce with associations
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

// Larger diagram mimicking a real spec module
const specKeyDiagram = `classDiagram
    class CLI {
        <<service>>
        +run(args)
        +showHelp()
        +showVersion()
    }
    class ParsePipeline {
        <<service>>
        +execute(config)
        +addPhase(phase)
    }
    class ConfigLoader {
        <<service>>
        -configPath: string
        +load(path)
        +validate(config)
        +merge(base, override)
    }
    class FileDiscovery {
        <<service>>
        -rootDir: string
        -patterns: string[]
        +discover(rootDir)
        +filter(files, patterns)
        +getMarkdownFiles()
    }
    class MarkdownParser {
        <<service>>
        +parse(content)
        +extractFrontMatter()
        +extractCodeBlocks()
    }
    class ClassDiagramValidator {
        <<service>>
        +validate(ast)
        +checkRelations(ast)
        +checkMembers(ast)
    }
    class ProgressReporter {
        <<service>>
        +start(total)
        +advance(file)
        +finish(summary)
    }
    CLI --> ParsePipeline : runs
    CLI --> ConfigLoader : loads config
    ParsePipeline --> FileDiscovery : discovers files
    ParsePipeline --> MarkdownParser : parses markdown
    ParsePipeline --> ClassDiagramValidator : validates
    ParsePipeline --> ProgressReporter : reports progress
    ConfigLoader ..> FileDiscovery : configures
    MarkdownParser ..> ClassDiagramValidator : feeds
`;

const meta = {
  title: 'Diagrams/Custom/ClassDiagram',
  component: ClassDiagramView,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<ClassDiagramView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AnimalInheritance: Story = {
  args: { ast: undefined as any },
  loaders: [
    async () => {
      const ast = parseClassDiagram(animalDiagram);
      return { ast };
    },
  ],
  render: (_args, { loaded: { ast } }) => ({
    Component: ClassDiagramView,
    props: { ast },
  }),
};

export const EcommerceModel: Story = {
  args: { ast: undefined as any },
  loaders: [
    async () => {
      const ast = parseClassDiagram(ecommerceDiagram);
      return { ast };
    },
  ],
  render: (_args, { loaded: { ast } }) => ({
    Component: ClassDiagramView,
    props: { ast },
  }),
};

export const SpecKeyArchitecture: Story = {
  args: { ast: undefined as any },
  loaders: [
    async () => {
      const ast = parseClassDiagram(specKeyDiagram);
      return { ast };
    },
  ],
  render: (_args, { loaded: { ast } }) => ({
    Component: ClassDiagramView,
    props: { ast },
  }),
};
