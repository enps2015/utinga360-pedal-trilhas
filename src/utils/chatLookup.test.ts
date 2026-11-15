import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractPlaceSearchQuery,
  inferChatTravelMode,
  shouldComputeRouteForQuestion,
} from './chatLookup.ts';

test('extractPlaceSearchQuery extracts specific stops and landmarks without triggering on internal trail queries', () => {
  assert.equal(
    extractPlaceSearchQuery(
      'Como chego de bike ao Bar do Lulu saindo da entrada do Parque do Utinga?'
    ),
    'Bar do Lulu'
  );
  assert.equal(
    extractPlaceSearchQuery('Como chegar de bike ao Bar do Lulu?'),
    'Bar do Lulu'
  );
  assert.equal(
    extractPlaceSearchQuery('Onde fica o Recanto da Volta?'),
    'Recanto da Volta'
  );
  assert.equal(
    extractPlaceSearchQuery('Tem alguma bicicletaria perto da entrada?'),
    'bicicletaria'
  );
  assert.equal(
    extractPlaceSearchQuery('Qual trilha fácil fazer em 1 hora?'),
    null
  );
  assert.equal(
    extractPlaceSearchQuery('Posso pedalar nas trilhas de terra?'),
    null
  );
  assert.equal(
    extractPlaceSearchQuery('O que observar no clima de hoje?'),
    null
  );
});

test('shouldComputeRouteForQuestion and inferChatTravelMode classify route intent and travel mode', () => {
  assert.equal(
    shouldComputeRouteForQuestion('Como chego de bike ao Bar do Lulu?'),
    true
  );
  assert.equal(
    shouldComputeRouteForQuestion('Onde fica o Bar do Lulu?'),
    false
  );
  assert.equal(inferChatTravelMode('Como chego de bike ao Bar do Lulu?'), 'BICYCLE');
  assert.equal(inferChatTravelMode('Como chego a pé até a portaria?'), 'WALK');
  assert.equal(inferChatTravelMode('Como ir de carro até o estacionamento?'), 'DRIVE');
});
