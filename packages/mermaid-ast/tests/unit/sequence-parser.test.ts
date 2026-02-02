/**
 * Unit tests for Sequence Diagram Parser
 */

import { describe, expect, it } from 'bun:test';
import { isSequenceDiagram, parseSequence } from '../../src/parser/index.js';
import type { SequenceMessage, SequenceNote } from '../../src/types/index.js';

describe('isSequenceDiagram', () => {
  it('should detect sequenceDiagram keyword', () => {
    expect(isSequenceDiagram('sequenceDiagram\n  A->>B: msg')).toBe(true);
    expect(isSequenceDiagram('  sequenceDiagram\n  A->>B: msg')).toBe(true);
  });

  it('should be case insensitive', () => {
    expect(isSequenceDiagram('SEQUENCEDIAGRAM\n  A->>B: msg')).toBe(true);
    expect(isSequenceDiagram('SequenceDiagram\n  A->>B: msg')).toBe(true);
  });

  it('should not detect non-sequence diagrams', () => {
    expect(isSequenceDiagram('flowchart LR\n  A --> B')).toBe(false);
    expect(isSequenceDiagram('classDiagram\n  A --> B')).toBe(false);
  });
});

describe('parseSequence - Actors', () => {
  it('should parse implicit actors from messages', () => {
    const ast = parseSequence('sequenceDiagram\n  Alice->>Bob: Hello');
    expect(ast.actors.has('Alice')).toBe(true);
    expect(ast.actors.has('Bob')).toBe(true);
  });

  it('should parse participant declarations', () => {
    const ast = parseSequence(`sequenceDiagram
    participant Alice
    participant Bob
    Alice->>Bob: Hello`);

    expect(ast.actors.has('Alice')).toBe(true);
    expect(ast.actors.has('Bob')).toBe(true);
    expect(ast.actors.get('Alice')?.type).toBe('participant');
  });

  it('should parse actor declarations', () => {
    const ast = parseSequence(`sequenceDiagram
    actor Alice
    actor Bob
    Alice->>Bob: Hello`);

    expect(ast.actors.get('Alice')?.type).toBe('actor');
    expect(ast.actors.get('Bob')?.type).toBe('actor');
  });

  it('should parse participant with alias', () => {
    const ast = parseSequence(`sequenceDiagram
    participant A as Alice
    A->>B: Hello`);

    const actor = ast.actors.get('A');
    expect(actor).toBeDefined();
    expect(actor?.name).toBe('Alice');
  });
});

describe('parseSequence - Messages', () => {
  it('should parse solid arrow messages', () => {
    const ast = parseSequence('sequenceDiagram\n  Alice->>Bob: Hello');
    expect(ast.statements.length).toBe(1);

    const msg = ast.statements[0] as SequenceMessage;
    expect(msg.type).toBe('message');
    expect(msg.from).toBe('Alice');
    expect(msg.to).toBe('Bob');
    expect(msg.text).toBe('Hello');
    expect(msg.arrowType).toBe('solid');
  });

  it('should parse dotted arrow messages', () => {
    const ast = parseSequence('sequenceDiagram\n  Alice-->>Bob: Hello');
    const msg = ast.statements[0] as SequenceMessage;
    expect(msg.arrowType).toBe('dotted');
  });

  it('should parse solid open arrow messages', () => {
    const ast = parseSequence('sequenceDiagram\n  Alice->Bob: Hello');
    const msg = ast.statements[0] as SequenceMessage;
    expect(msg.arrowType).toBe('solid_open');
  });

  it('should parse dotted open arrow messages', () => {
    const ast = parseSequence('sequenceDiagram\n  Alice-->Bob: Hello');
    const msg = ast.statements[0] as SequenceMessage;
    expect(msg.arrowType).toBe('dotted_open');
  });

  it('should parse cross arrow messages', () => {
    const ast = parseSequence('sequenceDiagram\n  Alice-xBob: Hello');
    const msg = ast.statements[0] as SequenceMessage;
    expect(msg.arrowType).toBe('solid_cross');
  });

  it('should parse dotted cross arrow messages', () => {
    const ast = parseSequence('sequenceDiagram\n  Alice--xBob: Hello');
    const msg = ast.statements[0] as SequenceMessage;
    expect(msg.arrowType).toBe('dotted_cross');
  });

  it('should parse multiple messages', () => {
    const ast = parseSequence(`sequenceDiagram
    Alice->>Bob: Hello
    Bob-->>Alice: Hi there`);

    expect(ast.statements.length).toBe(2);

    const msg1 = ast.statements[0] as SequenceMessage;
    expect(msg1.from).toBe('Alice');
    expect(msg1.to).toBe('Bob');

    const msg2 = ast.statements[1] as SequenceMessage;
    expect(msg2.from).toBe('Bob');
    expect(msg2.to).toBe('Alice');
  });
});

describe('parseSequence - Notes', () => {
  it('should parse note right of', () => {
    const ast = parseSequence(`sequenceDiagram
    Alice->>Bob: Hello
    note right of Bob: This is a note`);

    const notes = ast.statements.filter((s) => s.type === 'note');
    expect(notes.length).toBe(1);

    const note = notes[0] as SequenceNote;
    expect(note.placement).toBe('right_of');
    expect(note.actors).toContain('Bob');
  });

  it('should parse note left of', () => {
    const ast = parseSequence(`sequenceDiagram
    Alice->>Bob: Hello
    note left of Alice: This is a note`);

    const notes = ast.statements.filter((s) => s.type === 'note');
    expect(notes.length).toBe(1);

    const note = notes[0] as SequenceNote;
    expect(note.placement).toBe('left_of');
  });

  it('should parse note over', () => {
    const ast = parseSequence(`sequenceDiagram
    Alice->>Bob: Hello
    note over Alice,Bob: Shared note`);

    const notes = ast.statements.filter((s) => s.type === 'note');
    expect(notes.length).toBe(1);

    const note = notes[0] as SequenceNote;
    expect(note.placement).toBe('over');
  });
});

describe('parseSequence - Activation', () => {
  it('should parse activate statement', () => {
    const ast = parseSequence(`sequenceDiagram
    Alice->>Bob: Hello
    activate Bob
    Bob-->>Alice: Hi
    deactivate Bob`);

    const activations = ast.statements.filter(
      (s) => s.type === 'activate' || s.type === 'deactivate'
    );
    expect(activations.length).toBe(2);
  });
});

describe('parseSequence - Loops', () => {
  it('should parse loop block', () => {
    const ast = parseSequence(`sequenceDiagram
    loop Every minute
        Alice->>Bob: Ping
        Bob-->>Alice: Pong
    end`);

    const loops = ast.statements.filter((s) => s.type === 'loop');
    expect(loops.length).toBe(1);
  });

  it('should include nested statements inside loop', () => {
    const ast = parseSequence(`sequenceDiagram
    loop Every minute
        Alice->>Bob: Ping
        Bob-->>Alice: Pong
    end`);

    const loop = ast.statements[0] as import('../../src/types/sequence.js').SequenceLoop;
    expect(loop.type).toBe('loop');
    expect(loop.text).toBe('Every minute');
    expect(loop.statements.length).toBe(2);

    const msg1 = loop.statements[0] as SequenceMessage;
    expect(msg1.from).toBe('Alice');
    expect(msg1.text).toBe('Ping');

    const msg2 = loop.statements[1] as SequenceMessage;
    expect(msg2.from).toBe('Bob');
    expect(msg2.text).toBe('Pong');
  });
});

describe('parseSequence - Alt/Else', () => {
  it('should parse alt block', () => {
    const ast = parseSequence(`sequenceDiagram
    Alice->>Bob: Hello
    alt is sick
        Bob-->>Alice: Not so good
    else is well
        Bob-->>Alice: Great!
    end`);

    const alts = ast.statements.filter((s) => s.type === 'alt');
    expect(alts.length).toBe(1);
  });

  it('should include nested statements inside alt sections', () => {
    const ast = parseSequence(`sequenceDiagram
    alt is sick
        Bob-->>Alice: Not so good
    else is well
        Bob-->>Alice: Great!
    end`);

    const alt = ast.statements[0] as import('../../src/types/sequence.js').SequenceAlt;
    expect(alt.type).toBe('alt');
    expect(alt.sections.length).toBe(2);

    expect(alt.sections[0].condition).toBe('is sick');
    expect(alt.sections[0].statements.length).toBe(1);
    expect((alt.sections[0].statements[0] as SequenceMessage).text).toBe('Not so good');

    expect(alt.sections[1].condition).toBe('is well');
    expect(alt.sections[1].statements.length).toBe(1);
    expect((alt.sections[1].statements[0] as SequenceMessage).text).toBe('Great!');
  });
});

describe('parseSequence - Opt', () => {
  it('should parse opt block', () => {
    const ast = parseSequence(`sequenceDiagram
    Alice->>Bob: Hello
    opt Extra response
        Bob-->>Alice: Thanks
    end`);

    const opts = ast.statements.filter((s) => s.type === 'opt');
    expect(opts.length).toBe(1);
  });

  it('should include nested statements inside opt', () => {
    const ast = parseSequence(`sequenceDiagram
    opt Extra response
        Bob-->>Alice: Thanks
    end`);

    const opt = ast.statements[0] as import('../../src/types/sequence.js').SequenceOpt;
    expect(opt.type).toBe('opt');
    expect(opt.text).toBe('Extra response');
    expect(opt.statements.length).toBe(1);
    expect((opt.statements[0] as SequenceMessage).text).toBe('Thanks');
  });
});

describe('parseSequence - Par', () => {
  it('should parse par block', () => {
    const ast = parseSequence(`sequenceDiagram
    par Alice to Bob
        Alice->>Bob: Hello
    and Alice to John
        Alice->>John: Hello
    end`);

    const pars = ast.statements.filter((s) => s.type === 'par');
    expect(pars.length).toBe(1);
  });

  it('should include nested statements inside par sections', () => {
    const ast = parseSequence(`sequenceDiagram
    par Alice to Bob
        Alice->>Bob: Hello guys
    and Alice to John
        Alice->>John: Hello John
    end`);

    const par = ast.statements[0] as import('../../src/types/sequence.js').SequencePar;
    expect(par.type).toBe('par');
    expect(par.sections.length).toBe(2);

    expect(par.sections[0].statements.length).toBe(1);
    expect((par.sections[0].statements[0] as SequenceMessage).text).toBe('Hello guys');

    expect(par.sections[1].statements.length).toBe(1);
    expect((par.sections[1].statements[0] as SequenceMessage).text).toBe('Hello John');
  });
});

describe('parseSequence - Autonumber', () => {
  it('should parse autonumber', () => {
    const ast = parseSequence(`sequenceDiagram
    autonumber
    Alice->>Bob: Hello
    Bob-->>Alice: Hi`);

    const autonumbers = ast.statements.filter((s) => s.type === 'autonumber');
    expect(autonumbers.length).toBe(1);
  });
});

describe('parseSequence - Nested blocks', () => {
  it('should parse loop nested inside alt', () => {
    const ast = parseSequence(`sequenceDiagram
    alt success
        Bob->>Alice: OK
        loop retry
            Alice->>Bob: Again
        end
    else failure
        Bob->>Alice: Error
    end`);

    const alt = ast.statements[0] as import('../../src/types/sequence.js').SequenceAlt;
    expect(alt.sections[0].statements.length).toBe(2);

    const innerLoop = alt.sections[0].statements[1] as import('../../src/types/sequence.js').SequenceLoop;
    expect(innerLoop.type).toBe('loop');
    expect(innerLoop.statements.length).toBe(1);
    expect((innerLoop.statements[0] as SequenceMessage).text).toBe('Again');

    expect(alt.sections[1].statements.length).toBe(1);
    expect((alt.sections[1].statements[0] as SequenceMessage).text).toBe('Error');
  });

  it('should parse alt nested inside loop', () => {
    const ast = parseSequence(`sequenceDiagram
    loop Every minute
        Alice->>Bob: Check
        alt is ok
            Bob-->>Alice: Fine
        else is bad
            Bob-->>Alice: Help
        end
    end`);

    const loop = ast.statements[0] as import('../../src/types/sequence.js').SequenceLoop;
    expect(loop.statements.length).toBe(2);

    const innerAlt = loop.statements[1] as import('../../src/types/sequence.js').SequenceAlt;
    expect(innerAlt.type).toBe('alt');
    expect(innerAlt.sections[0].statements.length).toBe(1);
    expect(innerAlt.sections[1].statements.length).toBe(1);
  });
});

describe('parseSequence - Complex diagrams', () => {
  it('should parse a complete sequence diagram with nested content', () => {
    const ast = parseSequence(`sequenceDiagram
    participant Alice
    participant Bob
    participant Charlie

    Alice->>Bob: Hello Bob
    Bob-->>Alice: Hi Alice

    loop Health check
        Bob->>Charlie: Status?
        Charlie-->>Bob: OK
    end

    alt is healthy
        Bob->>Alice: All good
    else is sick
        Bob->>Alice: Problem detected
    end`);

    expect(ast.actors.size).toBe(3);
    // 2 messages + 1 loop + 1 alt
    expect(ast.statements.length).toBe(4);

    const loop = ast.statements[2] as import('../../src/types/sequence.js').SequenceLoop;
    expect(loop.type).toBe('loop');
    expect(loop.statements.length).toBe(2);

    const alt = ast.statements[3] as import('../../src/types/sequence.js').SequenceAlt;
    expect(alt.type).toBe('alt');
    expect(alt.sections[0].statements.length).toBe(1);
    expect(alt.sections[1].statements.length).toBe(1);
  });
});
