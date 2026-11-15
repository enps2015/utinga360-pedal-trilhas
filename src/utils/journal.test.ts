import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildJournalSummaryForGuide,
  createJournalEntry,
  loadJournalFromStorage,
  saveJournalToStorage,
  sortJournalEntries,
  summarizeJournal,
  summarizeTrailCoverage,
  validateJournalDraft,
} from './journal.ts';

test('validateJournalDraft rejects missing or invalid fields', () => {
  const invalid = validateJournalDraft({
    date: '',
    activity: 'Caminhada em Trilha',
    durationMinutes: 0,
    notes: 'ok',
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.date);
  assert.ok(invalid.errors.durationMinutes);
  assert.ok(invalid.errors.notes);
});

test('createJournalEntry creates valid entry and summarizeJournal computes totals', () => {
  const e1 = createJournalEntry(
    {
      date: '2026-11-10',
      activity: 'Pedal na Pista Principal (~4 km)',
      durationMinutes: '45',
      notes: 'Pedal matinal na pista pavimentada com boa sombra.',
    },
    'id-1',
    '2026-11-10T10:00:00.000Z'
  );
  const e2 = createJournalEntry(
    {
      date: '2026-11-12',
      activity: 'Caminhada em Trilha',
      trailId: 'bolonha',
      durationMinutes: 60,
      notes: 'Caminhada tranquila observando aves.',
    },
    'id-2',
    '2026-11-12T10:00:00.000Z'
  );

  const sorted = sortJournalEntries([e1, e2]);
  assert.equal(sorted[0].id, 'id-2');

  const summary = summarizeJournal(sorted);
  assert.equal(summary.totalVisits, 2);
  assert.equal(summary.totalMinutes, 105);

  const coverage = summarizeTrailCoverage(sorted, ['amapa', 'bolonha', 'acapu']);
  assert.equal(coverage.completedCount, 1);
  assert.deepEqual(coverage.completedTrailIds, ['bolonha']);
  assert.equal(coverage.cyclingSessions, 1);

  const prompt = buildJournalSummaryForGuide(sorted, [
    { id: 'amapa', name: 'Trilha da Amapá', difficulty: 'Fácil' },
    { id: 'bolonha', name: 'Trilha da Bolonha', difficulty: 'Fácil' },
  ]);
  assert.match(prompt, /2 visita\(s\)/);
  assert.match(prompt, /Trilha da Bolonha/);
});

test('saveJournalToStorage and loadJournalFromStorage round-trip cleanly', () => {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  };

  const entry = createJournalEntry(
    {
      date: '2026-11-13',
      activity: 'Visita Geral',
      durationMinutes: 30,
      notes: 'Reconhecimento do Centro de Acolhimento.',
    },
    'id-3',
    '2026-11-13T09:00:00.000Z'
  );

  saveJournalToStorage(mockStorage, [entry]);
  const loaded = loadJournalFromStorage(mockStorage);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].notes, 'Reconhecimento do Centro de Acolhimento.');
});

