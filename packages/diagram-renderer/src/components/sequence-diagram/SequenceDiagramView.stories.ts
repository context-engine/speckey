import type { Meta, StoryObj } from '@storybook/svelte';
import { parseSequence } from '@speckey/mermaid-ast';
import SequenceDiagramView from './SequenceDiagramView.svelte';

// Simple request/response
const basicDiagram = `sequenceDiagram
    participant User
    participant CLI
    participant ConfigLoader

    User->>CLI: run(args)
    CLI->>ConfigLoader: load(configPath)
    ConfigLoader-->>CLI: PipelineConfig
    CLI-->>User: Output results
`;

// With alt/else and loop
const controlFlowDiagram = `sequenceDiagram
    participant User
    participant DS as DiagramState
    participant G as Graph

    User->>DS: select(fqn)
    DS->>G: getConnectedFqns(fqn)

    alt FQN exists in graph
        G-->>DS: Set of connected FQNs
        DS-->>DS: Update selectedFqn
    else FQN not in graph
        G-->>DS: Empty set
        DS-->>DS: connectedFqns = empty
    end

    User->>DS: setFilter(filter)
    loop For each visible node
        DS->>G: check visibility
        G-->>DS: visible/hidden
    end
    DS-->>User: Filter applied
`;

// Larger diagram with notes
const specKeyPipelineDiagram = `sequenceDiagram
    participant CLI
    participant Pipeline as ParsePipeline
    participant FD as FileDiscovery
    participant MP as MarkdownParser
    participant CV as ClassDiagramValidator
    participant PR as ProgressReporter

    CLI->>Pipeline: execute(config)
    Pipeline->>FD: discover(rootDir)
    FD-->>Pipeline: MarkdownFile[]

    Pipeline->>PR: start(fileCount)

    loop For each file
        Pipeline->>MP: parse(content)
        MP-->>Pipeline: ParsedDocument

        alt Has class diagrams
            Pipeline->>CV: validate(ast)
            CV-->>Pipeline: ValidationResult
        end

        Pipeline->>PR: advance(file)
    end

    Pipeline->>PR: finish(summary)
    PR-->>CLI: Summary report
    CLI-->>CLI: Display results

    Note over CLI,PR: Pipeline complete
`;

// Self-messages and notes
const selfMessageDiagram = `sequenceDiagram
    participant A as ServiceA
    participant B as ServiceB
    participant C as ServiceC

    A->>B: request()
    B->>B: processInternal()
    B->>C: delegate()
    C-->>B: result
    Note right of B: Cache the result
    B-->>A: response
    Note over A,C: Transaction complete
`;

// Database Writer - most complex: 5 participants, opt, loop with nested alt, 3-way alt (orphan policy)
const databaseWriterDiagram = `sequenceDiagram
    participant PP as ParsePipeline
    participant DW as DgraphWriter
    participant PR as PackageRegistry
    participant TM as TransactionManager
    participant DB as Dgraph

    Note over PP,DB: === PHASE 5: DATABASE WRITE ===

    PP->>DW: write(classSpecs, config)

    DW->>DB: Connect to database
    alt Connection failed
        DB-->>DW: Error
        DW-->>PP: WriteResult errors
    else Connected
        DB-->>DW: Connected
    end

    opt config.backupBeforeWrite = true
        DW->>DW: backup(config.dbPath)
        DW->>DB: Create backup
        alt Backup failed
            DB-->>DW: Error
        else Success
            DB-->>DW: Backup created
        end
    end

    Note over DW,DB: === START TRANSACTION ===

    DW->>TM: begin()
    TM-->>DW: Transaction (status: ACTIVE)

    loop For each ClassSpec
        Note over DW: === UPSERT ENTITY ===
        DW->>DW: mapToMutation(classSpec)
        DW->>DW: lookupByFqn(classSpec.fqn)
        DW->>DB: Query by spec_fqn
        DB-->>DW: EntityInDgraph or null

        alt Entity exists (update)
            DW->>DW: preserveUserFields(existing, mutation)
            DW->>DB: Update mutation
            DW->>TM: tx.addOperation(UPDATE, fqn, uid)
            alt Update failed
                DB-->>DW: Error
                DW->>TM: rollback(tx)
                DW-->>PP: WriteResult errors
            else Success
                DB-->>DW: Updated
            end
        else Entity new (insert)
            DW->>DB: Insert mutation
            DW->>TM: tx.addOperation(INSERT, fqn, uid)
            alt Insert failed
                DB-->>DW: Error
                DW->>TM: rollback(tx)
                DW-->>PP: WriteResult errors
            else Success
                DB-->>DW: Inserted (uid)
            end
        end
    end

    Note over DW,DB: === ORPHAN DETECTION ===

    DW->>DW: detectOrphans(parsedFqns)
    DW->>DB: Query all entity FQNs
    DB-->>DW: allFqns[]
    DW->>DW: Compare parsed vs DB

    alt Orphans found
        alt Policy: KEEP
            Note over DW: Record orphan FQNs for reporting
        else Policy: WARN
            Note over DW: Record orphan FQNs + warnings
        else Policy: DELETE
            loop For each orphan
                DW->>DB: Delete entity
                DW->>TM: tx.addOperation(DELETE, fqn, uid)
                alt Delete failed
                    DB-->>DW: Error
                    DW->>TM: rollback(tx)
                    DW-->>PP: WriteResult errors
                else Success
                    DB-->>DW: Deleted
                end
            end
        end
    end

    Note over DW,DB: === COMMIT ===

    DW->>TM: commit(tx)
    alt Commit failed
        TM-->>DW: CommitResult failed
        DW->>TM: rollback(tx)
        DW-->>PP: WriteResult errors
    else Success
        TM-->>DW: CommitResult success
        DW->>DW: rebuildIndexes()
        DW->>DB: Rebuild indexes
        alt Index rebuild failed
            DB-->>DW: Error
        else Success
            DB-->>DW: Indexes rebuilt
        end
    end

    DW->>DB: Disconnect
    DW-->>PP: WriteResult summary
`;

// Diagram Renderer contract - Class Diagram rendering flow
const rendererContractDiagram = `sequenceDiagram
    participant User
    participant CDV as ClassDiagramView
    participant L as Layout
    participant G as Graph
    participant DS as DiagramState

    Note over User,DS: === RENDER CLASS DIAGRAM ===
    CDV->>G: Query class nodes and relationship edges
    alt Graph returns data
        G-->>CDV: ClassNodeData[], RelationshipEdgeData[]
        CDV->>DS: Read expansion levels for each node
        DS-->>CDV: Map of fqn to expansion level
        CDV->>L: layout(nodes, edges, expansion levels)
        alt Layout succeeds
            L-->>CDV: PositionedDiagram
            CDV-->>User: Class diagram rendered
        else Layout fails
            L-->>CDV: Layout error
            CDV-->>User: Error state with message
        end
    else Graph returns empty data
        G-->>CDV: Empty arrays
        CDV-->>User: Empty state placeholder
    end

    Note over User,DS: === CLASS NODE CLICK ===
    User->>CDV: Click class node
    CDV->>DS: select(node.fqn)
    DS->>G: getConnectedFqns(node.fqn)
    alt FQN has connections
        G-->>DS: Connected FQNs
        DS-->>CDV: Selection + connections updated
        CDV-->>User: Selected node highlighted
    else FQN has no connections
        G-->>DS: Empty set
        DS-->>CDV: Selection updated, no connections
        CDV-->>User: Selected node highlighted alone
    end

    Note over User,DS: === CLASS NODE HOVER ===
    User->>CDV: Hover class node
    CDV->>DS: hover(node.fqn)
    CDV-->>User: Node + direct edges highlighted

    Note over User,DS: === TOGGLE EXPANSION ===
    User->>CDV: Double-click class node
    CDV->>DS: toggleExpansion(node.fqn)
    DS-->>CDV: Expansion level changed
    CDV->>L: Re-layout (node size changed)
    L-->>CDV: Updated positions
    CDV-->>User: Node shows more/less detail
`;

// Type Resolver - recursive type parsing with nested alt/loop
const typeResolverDiagram = `sequenceDiagram
    participant EB as EntityBuilder
    participant TR as TypeResolver
    participant PR as PackageRegistry
    participant DVQ as DeferredValidationQueue

    Note over EB,DVQ: === RESOLVE METHOD TYPES ===

    EB->>TR: resolveMethodTypes(methods, context)

    loop For each method
        TR->>TR: resolveType(returnType, context)

        alt Built-in type
            TR-->>TR: category BUILT_IN
        else Array type (T[])
            TR->>TR: parseArrayType(typeString)
            TR->>TR: resolveType(elementType, context)
        else Generic type (Promise T)
            TR->>TR: parseGenericType(typeString)
            loop For each type param
                TR->>TR: resolveType(param, context)
            end
        else Union type (A or B)
            TR->>TR: parseUnionType(typeString)
            loop For each member
                TR->>TR: resolveType(member, context)
            end
        else Custom class type
            TR->>TR: resolveCustomType(typeName, context)
            alt Found in current diagram
                TR-->>TR: resolved from diagram
            else Not in current diagram
                TR->>PR: lookup(typeName)
                alt Found in registry
                    PR-->>TR: ClassSpec
                else Not found anywhere
                    PR-->>TR: undefined
                    TR->>DVQ: enqueue(deferred entry)
                    DVQ-->>TR: void
                end
            end
        end

        loop For each parameter
            TR->>TR: resolveType(param.type, context)
        end
    end

    TR-->>EB: ResolvedMethod[]
`;

const meta = {
  title: 'Diagrams/Custom/SequenceDiagram',
  component: SequenceDiagramView,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<SequenceDiagramView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicFlow: Story = {
  args: { ast: undefined as any },
  loaders: [
    async () => {
      const ast = parseSequence(basicDiagram);
      return { ast };
    },
  ],
  render: (_args, { loaded: { ast } }) => ({
    Component: SequenceDiagramView,
    props: { ast },
  }),
};

export const ControlFlow: Story = {
  args: { ast: undefined as any },
  loaders: [
    async () => {
      const ast = parseSequence(controlFlowDiagram);
      return { ast };
    },
  ],
  render: (_args, { loaded: { ast } }) => ({
    Component: SequenceDiagramView,
    props: { ast },
  }),
};

export const SpecKeyPipeline: Story = {
  args: { ast: undefined as any },
  loaders: [
    async () => {
      const ast = parseSequence(specKeyPipelineDiagram);
      return { ast };
    },
  ],
  render: (_args, { loaded: { ast } }) => ({
    Component: SequenceDiagramView,
    props: { ast },
  }),
};

export const SelfMessages: Story = {
  args: { ast: undefined as any },
  loaders: [
    async () => {
      const ast = parseSequence(selfMessageDiagram);
      return { ast };
    },
  ],
  render: (_args, { loaded: { ast } }) => ({
    Component: SequenceDiagramView,
    props: { ast },
  }),
};

export const DatabaseWriter: Story = {
  args: { ast: undefined as any },
  loaders: [
    async () => {
      const ast = parseSequence(databaseWriterDiagram);
      return { ast };
    },
  ],
  render: (_args, { loaded: { ast } }) => ({
    Component: SequenceDiagramView,
    props: { ast },
  }),
};

export const RendererContract: Story = {
  args: { ast: undefined as any },
  loaders: [
    async () => {
      const ast = parseSequence(rendererContractDiagram);
      return { ast };
    },
  ],
  render: (_args, { loaded: { ast } }) => ({
    Component: SequenceDiagramView,
    props: { ast },
  }),
};

export const TypeResolver: Story = {
  args: { ast: undefined as any },
  loaders: [
    async () => {
      const ast = parseSequence(typeResolverDiagram);
      return { ast };
    },
  ],
  render: (_args, { loaded: { ast } }) => ({
    Component: SequenceDiagramView,
    props: { ast },
  }),
};
