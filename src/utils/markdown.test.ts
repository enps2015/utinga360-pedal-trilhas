import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseInlineTokens,
  parseMarkdownBlocks,
  sanitizeHttpUrl,
} from './markdown';

test('sanitizeHttpUrl accepts http/https and rejects javascript/data URIs', () => {
  assert.equal(sanitizeHttpUrl('https://maps.google.com/?q=Utinga'), 'https://maps.google.com/?q=Utinga');
  assert.equal(sanitizeHttpUrl('http://example.com'), 'http://example.com/');
  assert.equal(sanitizeHttpUrl('javascript:alert(1)'), null);
  assert.equal(sanitizeHttpUrl('data:text/html,hi'), null);
});

test('parseInlineTokens parses bold, italic, code, and safe markdown links', () => {
  const tokens = parseInlineTokens(
    'Siga pela **Pista Principal** por *4 km* usando `bike` ou veja [Google Maps](https://maps.google.com/?q=Utinga).'
  );
  assert.deepEqual(tokens, [
    { type: 'text', text: 'Siga pela ' },
    { type: 'bold', text: 'Pista Principal' },
    { type: 'text', text: ' por ' },
    { type: 'italic', text: '4 km' },
    { type: 'text', text: ' usando ' },
    { type: 'code', text: 'bike' },
    { type: 'text', text: ' ou veja ' },
    { type: 'link', label: 'Google Maps', href: 'https://maps.google.com/?q=Utinga' },
    { type: 'text', text: '.' },
  ]);
});

test('parseMarkdownBlocks parses headings, bullet lists, numbered lists, and paragraphs', () => {
  const sample = [
    '### Como chegar ao Bar do Lulu',
    '',
    'Ponto muito frequentado por ciclistas no entorno do Lago Água Preta.',
    '',
    '* **Saída recomendada:** siga pela Pista Principal (~4 km).',
    '* **Dica:** leve água e observe o horário.',
    '',
    '1. Pedale até a Casa da Mata',
    '2. Continue pelo acesso ao Recanto da Volta',
  ].join('\n');

  const blocks = parseMarkdownBlocks(sample);
  assert.equal(blocks.length, 4);
  assert.equal(blocks[0].type, 'heading');
  assert.equal(blocks[1].type, 'paragraph');
  assert.equal(blocks[2].type, 'unordered-list');
  assert.equal(blocks[3].type, 'ordered-list');
  if (blocks[2].type === 'unordered-list') {
    assert.equal(blocks[2].items.length, 2);
    assert.deepEqual(blocks[2].items[0][0], {
      type: 'bold',
      text: 'Saída recomendada:',
    });
  }
});
