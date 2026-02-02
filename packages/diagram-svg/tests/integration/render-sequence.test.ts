/**
 * Integration tests for sequence diagram SVG rendering
 */

import { describe, expect, it } from 'bun:test';
import { renderSequenceToSVG } from '../../src/render-sequence.js';
import type { SequenceAST } from '@speckey/mermaid-ast';

function makeAST(actors: string[], statements: SequenceAST['statements']): SequenceAST {
  const actorMap = new Map(
    actors.map((id) => [id, { id, name: id, type: 'participant' as const }]),
  );
  return { type: 'sequence', actors: actorMap, boxes: [], statements };
}

describe('renderSequenceToSVG', () => {
  it('should produce valid SVG string', () => {
    const ast = makeAST(['Alice', 'Bob'], [
      { type: 'message', from: 'Alice', to: 'Bob', text: 'Hello', arrowType: 'solid' },
    ]);

    const svg = renderSequenceToSVG(ast);

    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('Alice');
    expect(svg).toContain('Bob');
    expect(svg).toContain('Hello');
  });

  it('should include data-message-index attributes', () => {
    const ast = makeAST(['A', 'B'], [
      { type: 'message', from: 'A', to: 'B', text: 'msg1', arrowType: 'solid' },
      { type: 'message', from: 'B', to: 'A', text: 'msg2', arrowType: 'dotted' },
    ]);

    const svg = renderSequenceToSVG(ast);

    expect(svg).toContain('data-message-index="0"');
    expect(svg).toContain('data-message-index="1"');
  });

  it('should include data-layers on messages inside blocks', () => {
    const ast = makeAST(['A', 'B'], [
      {
        type: 'loop',
        text: 'retry',
        statements: [
          { type: 'message', from: 'A', to: 'B', text: 'ping', arrowType: 'solid' },
        ],
      },
    ]);

    const svg = renderSequenceToSVG(ast);

    expect(svg).toContain('data-layers="loop-0"');
    expect(svg).toContain('data-layer-block="loop-0"');
  });

  it('should include data-actor attributes on actor groups', () => {
    const ast = makeAST(['Alice', 'Bob'], []);

    const svg = renderSequenceToSVG(ast);

    expect(svg).toContain('data-actor="Alice"');
    expect(svg).toContain('data-actor="Bob"');
  });

  it('should include data-lifeline attributes', () => {
    const ast = makeAST(['Alice'], []);

    const svg = renderSequenceToSVG(ast);

    expect(svg).toContain('data-lifeline="Alice"');
  });

  it('should render alt block with section dividers', () => {
    const ast = makeAST(['A', 'B'], [
      {
        type: 'alt',
        sections: [
          {
            condition: 'success',
            statements: [
              { type: 'message', from: 'A', to: 'B', text: 'ok', arrowType: 'solid' },
            ],
          },
          {
            condition: 'failure',
            statements: [
              { type: 'message', from: 'A', to: 'B', text: 'err', arrowType: 'solid' },
            ],
          },
        ],
      },
    ]);

    const svg = renderSequenceToSVG(ast);

    expect(svg).toContain('ALT');
    expect(svg).toContain('[success]');
    expect(svg).toContain('[failure]');
    expect(svg).toContain('data-layer-block="alt-0"');
  });

  it('should render nested blocks with stacked layer IDs', () => {
    const ast = makeAST(['A', 'B'], [
      {
        type: 'loop',
        text: 'outer',
        statements: [
          {
            type: 'loop',
            text: 'inner',
            statements: [
              { type: 'message', from: 'A', to: 'B', text: 'deep', arrowType: 'solid' },
            ],
          },
        ],
      },
    ]);

    const svg = renderSequenceToSVG(ast);

    expect(svg).toContain('data-layers="loop-0 loop-1"');
  });
});
