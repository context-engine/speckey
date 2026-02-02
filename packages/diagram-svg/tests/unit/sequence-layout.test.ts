/**
 * Unit tests for sequence diagram layout engine
 */

import { describe, expect, it } from 'bun:test';
import { layoutSequence } from '../../src/layout/sequence-layout.js';
import { defaultTheme } from '../../src/themes/default.js';
import type { SequenceAST, SequenceMessage, SequenceLoop, SequenceAlt } from '@speckey/mermaid-ast';

function makeAST(actors: string[], statements: SequenceAST['statements']): SequenceAST {
  const actorMap = new Map(
    actors.map((id) => [id, { id, name: id, type: 'participant' as const }]),
  );
  return { type: 'sequence', actors: actorMap, boxes: [], statements };
}

describe('layoutSequence - Actors', () => {
  it('should position actors horizontally with correct spacing', () => {
    const ast = makeAST(['Alice', 'Bob', 'Charlie'], []);
    const layout = layoutSequence(ast, defaultTheme);

    expect(layout.actors.length).toBe(3);
    expect(layout.actors[0].id).toBe('Alice');
    expect(layout.actors[1].id).toBe('Bob');
    expect(layout.actors[2].id).toBe('Charlie');

    // Each actor spaced by actorSpacing (200)
    const dx = layout.actors[1].x - layout.actors[0].x;
    expect(dx).toBe(defaultTheme.actorSpacing);
  });

  it('should create lifelines for each actor', () => {
    const ast = makeAST(['Alice', 'Bob'], []);
    const layout = layoutSequence(ast, defaultTheme);

    expect(layout.lifelines.length).toBe(2);
    expect(layout.lifelines[0].actorId).toBe('Alice');
    expect(layout.lifelines[1].actorId).toBe('Bob');
    // Lifeline starts below actor box
    expect(layout.lifelines[0].topY).toBeGreaterThan(layout.actors[0].y);
  });
});

describe('layoutSequence - Messages', () => {
  it('should layout simple messages vertically', () => {
    const ast = makeAST(['Alice', 'Bob'], [
      { type: 'message', from: 'Alice', to: 'Bob', text: 'Hello', arrowType: 'solid' },
      { type: 'message', from: 'Bob', to: 'Alice', text: 'Hi', arrowType: 'dotted' },
    ]);
    const layout = layoutSequence(ast, defaultTheme);

    expect(layout.messages.length).toBe(2);
    expect(layout.messages[0].index).toBe(0);
    expect(layout.messages[1].index).toBe(1);
    // Second message below first
    expect(layout.messages[1].y).toBeGreaterThan(layout.messages[0].y);
    // First message goes left to right
    expect(layout.messages[0].fromX).toBeLessThan(layout.messages[0].toX);
    // Second message goes right to left
    expect(layout.messages[1].fromX).toBeGreaterThan(layout.messages[1].toX);
  });

  it('should preserve arrow types', () => {
    const ast = makeAST(['A', 'B'], [
      { type: 'message', from: 'A', to: 'B', text: 'sync', arrowType: 'solid' },
      { type: 'message', from: 'B', to: 'A', text: 'response', arrowType: 'dotted' },
    ]);
    const layout = layoutSequence(ast, defaultTheme);

    expect(layout.messages[0].arrowType).toBe('solid');
    expect(layout.messages[1].arrowType).toBe('dotted');
  });

  it('should handle self-messages', () => {
    const ast = makeAST(['Alice'], [
      { type: 'message', from: 'Alice', to: 'Alice', text: 'think', arrowType: 'solid' },
    ]);
    const layout = layoutSequence(ast, defaultTheme);

    expect(layout.messages[0].isSelf).toBe(true);
    expect(layout.messages[0].toX).toBeGreaterThan(layout.messages[0].fromX);
  });
});

describe('layoutSequence - Blocks', () => {
  it('should layout loop block with correct layer ID', () => {
    const ast = makeAST(['Alice', 'Bob'], [
      {
        type: 'loop',
        text: 'Every minute',
        statements: [
          { type: 'message', from: 'Alice', to: 'Bob', text: 'Ping', arrowType: 'solid' },
        ],
      },
    ]);
    const layout = layoutSequence(ast, defaultTheme);

    expect(layout.blocks.length).toBe(1);
    expect(layout.blocks[0].type).toBe('loop');
    expect(layout.blocks[0].label).toBe('Every minute');
    expect(layout.blocks[0].id).toBe('loop-0');

    // Message inside loop should have layer ID
    expect(layout.messages.length).toBe(1);
    expect(layout.messages[0].layerIds).toEqual(['loop-0']);
  });

  it('should layout alt block with section dividers', () => {
    const ast = makeAST(['Alice', 'Bob'], [
      {
        type: 'alt',
        sections: [
          {
            condition: 'success',
            statements: [
              { type: 'message', from: 'Bob', to: 'Alice', text: 'OK', arrowType: 'solid' },
            ],
          },
          {
            condition: 'failure',
            statements: [
              { type: 'message', from: 'Bob', to: 'Alice', text: 'Error', arrowType: 'solid' },
            ],
          },
        ],
      },
    ]);
    const layout = layoutSequence(ast, defaultTheme);

    expect(layout.blocks.length).toBe(1);
    expect(layout.blocks[0].type).toBe('alt');
    expect(layout.blocks[0].sectionDividers?.length).toBe(1);
    expect(layout.blocks[0].sectionDividers![0].label).toBe('failure');

    // Both messages should have the alt layer ID
    expect(layout.messages.length).toBe(2);
    expect(layout.messages[0].layerIds).toEqual(['alt-0']);
    expect(layout.messages[1].layerIds).toEqual(['alt-0']);
  });

  it('should handle nested blocks with stacked layer IDs', () => {
    const ast = makeAST(['A', 'B'], [
      {
        type: 'loop',
        text: 'retry',
        statements: [
          {
            type: 'alt',
            sections: [
              {
                condition: 'ok',
                statements: [
                  { type: 'message', from: 'A', to: 'B', text: 'done', arrowType: 'solid' },
                ],
              },
              {
                condition: 'fail',
                statements: [
                  { type: 'message', from: 'A', to: 'B', text: 'retry', arrowType: 'solid' },
                ],
              },
            ],
          },
        ],
      },
    ]);
    const layout = layoutSequence(ast, defaultTheme);

    expect(layout.blocks.length).toBe(2); // loop + alt

    // Messages inside nested alt should have both layer IDs
    expect(layout.messages[0].layerIds).toEqual(['loop-0', 'alt-1']);
    expect(layout.messages[1].layerIds).toEqual(['loop-0', 'alt-1']);
  });
});

describe('layoutSequence - Activations', () => {
  it('should create activation boxes', () => {
    const ast = makeAST(['Alice', 'Bob'], [
      { type: 'message', from: 'Alice', to: 'Bob', text: 'call', arrowType: 'solid', activate: true },
      { type: 'message', from: 'Bob', to: 'Alice', text: 'return', arrowType: 'dotted', deactivate: true },
    ]);
    const layout = layoutSequence(ast, defaultTheme);

    expect(layout.activations.length).toBe(1);
    expect(layout.activations[0].actorId).toBe('Bob');
    expect(layout.activations[0].endY).toBeGreaterThan(layout.activations[0].startY);
  });
});

describe('layoutSequence - Notes', () => {
  it('should layout notes', () => {
    const ast = makeAST(['Alice', 'Bob'], [
      { type: 'note', placement: 'right_of', actors: ['Alice'], text: 'A note' },
    ]);
    const layout = layoutSequence(ast, defaultTheme);

    expect(layout.notes.length).toBe(1);
    expect(layout.notes[0].text).toBe('A note');
  });
});

describe('layoutSequence - Dimensions', () => {
  it('should calculate total width and height', () => {
    const ast = makeAST(['Alice', 'Bob'], [
      { type: 'message', from: 'Alice', to: 'Bob', text: 'Hi', arrowType: 'solid' },
    ]);
    const layout = layoutSequence(ast, defaultTheme);

    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
    // Width should accommodate both actors
    expect(layout.width).toBeGreaterThan(defaultTheme.actorSpacing);
  });
});
