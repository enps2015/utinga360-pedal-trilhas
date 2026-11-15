import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFICIAL_TRAILS } from '../data/parkData.ts';
import { filterTrails, formatMetersPtBr, summarizeTrails } from './trails.ts';

test('OFFICIAL_TRAILS contains the 6 official IDEFLOR-Bio trails with exact extensions', () => {
  assert.equal(OFFICIAL_TRAILS.length, 6);

  const expected = new Map<string, { meters: number; difficulty: string }>([
    ['amapa', { meters: 336, difficulty: 'Fácil' }],
    ['bolonha', { meters: 776, difficulty: 'Fácil' }],
    ['acapu', { meters: 1142, difficulty: 'Média' }],
    ['castanheira', { meters: 1555, difficulty: 'Média' }],
    ['agua-preta', { meters: 1761, difficulty: 'Difícil' }],
    ['patua', { meters: 765, difficulty: 'Fácil' }],
  ]);

  for (const trail of OFFICIAL_TRAILS) {
    const spec = expected.get(trail.id);
    assert.ok(spec, `Unexpected trail id: ${trail.id}`);
    assert.equal(trail.distanceMeters, spec.meters);
    assert.equal(trail.difficulty, spec.difficulty);
    assert.ok(
      trail.nonGeoreferencedNote.length > 20,
      `Trail ${trail.id} must explicitly explain un-georeferenced status`
    );
  }
});

test('filterTrails filters accurately by difficulty and text query', () => {
  const easy = filterTrails(OFFICIAL_TRAILS, 'Fácil', '');
  assert.equal(easy.length, 3);
  assert.deepEqual(
    easy.map((t) => t.id).sort(),
    ['amapa', 'bolonha', 'patua']
  );

  const search = filterTrails(OFFICIAL_TRAILS, 'Todas', 'castanheira');
  assert.equal(search.length, 1);
  assert.equal(search[0].distanceMeters, 1555);
});

test('formatMetersPtBr formats Brazilian Portuguese thousands separator', () => {
  assert.equal(formatMetersPtBr(336), '336 m');
  assert.equal(formatMetersPtBr(1142), '1.142 m');
  assert.equal(formatMetersPtBr(1761), '1.761 m');
});

test('summarizeTrails totals official meters and difficulty counts', () => {
  const summary = summarizeTrails(OFFICIAL_TRAILS);
  assert.equal(summary.count, 6);
  assert.equal(summary.totalMeters, 336 + 776 + 1142 + 1555 + 1761 + 765);
  assert.deepEqual(summary.byDifficulty, { Fácil: 3, Média: 2, Difícil: 1 });
});

import { INTERNAL_TRAIL_GEOMETRIES, PARK_BOUNDARY_RING } from '../data/internalTrailsGeo.ts';
import {
  getInternalTrailById,
  getInternalTrailForOfficial,
  getTrailPointsFlat,
  summarizeInternalTrails,
} from './trails.ts';

test('INTERNAL_TRAIL_GEOMETRIES contains real Utinga coordinates within Belém park bounds', () => {
  assert.ok(PARK_BOUNDARY_RING.length > 50);
  assert.ok(INTERNAL_TRAIL_GEOMETRIES.length >= 10);

  for (const trail of INTERNAL_TRAIL_GEOMETRIES) {
    assert.ok(trail.osmWayIds.length > 0);
    assert.ok(trail.osmLengthMeters > 50);
    const pts = getTrailPointsFlat(trail);
    assert.ok(pts.length >= 5, `Trail ${trail.id} should have detailed vertices`);
    for (const pt of pts) {
      assert.ok(pt.lat < -1.39 && pt.lat > -1.45, `Invalid lat for ${trail.id}: ${pt.lat}`);
      assert.ok(pt.lng < -48.38 && pt.lng > -48.46, `Invalid lng for ${trail.id}: ${pt.lng}`);
    }
  }

  const mainTrack = getInternalTrailById(INTERNAL_TRAIL_GEOMETRIES, 'pista-principal');
  assert.ok(mainTrack);
  assert.ok(mainTrack.osmLengthMeters > 3500 && mainTrack.osmLengthMeters < 4300);

  const castanheira = getInternalTrailForOfficial(INTERNAL_TRAIL_GEOMETRIES, 'castanheira');
  assert.ok(castanheira);
  assert.equal(castanheira.coverageStatus, 'complete');

  const summary = summarizeInternalTrails(INTERNAL_TRAIL_GEOMETRIES);
  assert.equal(summary.officialMappedCount, 5);
  assert.ok(summary.totalOsmMeters > 15000);
});

import type { JournalEntry } from '../types/app.ts';
import { computePopularTrails, sortTrailsByPopularity } from './trails.ts';

test('computePopularTrails ranks official trails by Diário de Visitas count and handles ties', () => {
  assert.deepEqual(computePopularTrails(OFFICIAL_TRAILS, []), []);

  const entries: JournalEntry[] = [
    {
      id: '1',
      date: '2026-11-01',
      activity: 'Pedal na Pista Principal (~4 km)',
      durationMinutes: 45,
      notes: 'Pedal sem trailId não entra no ranking de trilhas.',
      createdAt: '2026-11-01T10:00:00Z',
    },
    {
      id: '2',
      date: '2026-11-02',
      activity: 'Caminhada em Trilha',
      trailId: 'inexistente',
      durationMinutes: 20,
      notes: 'ID desconhecido ignorado.',
      createdAt: '2026-11-02T10:00:00Z',
    },
    {
      id: '3',
      date: '2026-11-03',
      activity: 'Caminhada em Trilha',
      trailId: 'patua',
      durationMinutes: 30,
      notes: 'Primeira vez na Patuá.',
      createdAt: '2026-11-03T10:00:00Z',
    },
    {
      id: '4',
      date: '2026-11-10',
      activity: 'Caminhada em Trilha',
      trailId: 'patua',
      durationMinutes: 35,
      notes: 'Retorno na Patuá.',
      createdAt: '2026-11-10T10:00:00Z',
    },
    {
      id: '5',
      date: '2026-11-09',
      activity: 'Caminhada em Trilha',
      trailId: 'castanheira',
      durationMinutes: 65,
      notes: 'Trilha da Castanheira completa.',
      createdAt: '2026-11-09T10:00:00Z',
    },
    {
      id: '6',
      date: '2026-11-11',
      activity: 'Caminhada em Trilha',
      trailId: 'amapa',
      durationMinutes: 20,
      notes: 'Caminhada curta no Amapá.',
      createdAt: '2026-11-11T10:00:00Z',
    },
  ];

  const popular = computePopularTrails(OFFICIAL_TRAILS, entries);
  assert.equal(popular.length, 3);
  assert.equal(popular[0].trail.id, 'patua');
  assert.equal(popular[0].visitCount, 2);
  assert.equal(popular[0].totalMinutes, 65);
  assert.equal(popular[0].lastVisitDate, '2026-11-10');
  assert.equal(popular[0].rank, 1);

  // Tie between amapa (1 visit, 2026-11-11) and castanheira (1 visit, 2026-11-09) -> amapa is more recent
  assert.equal(popular[1].trail.id, 'amapa');
  assert.equal(popular[1].rank, 2);
  assert.equal(popular[2].trail.id, 'castanheira');
  assert.equal(popular[2].rank, 3);

  const sortedTrails = sortTrailsByPopularity(OFFICIAL_TRAILS, popular);
  assert.deepEqual(
    sortedTrails.slice(0, 3).map((t) => t.id),
    ['patua', 'amapa', 'castanheira']
  );
  assert.equal(sortedTrails.length, 6);
});

import {
  computeRingCentroid,
  getParkEntranceFallbackPoint,
  matchInternalTrailIdsFromText,
} from './trails.ts';

test('computeRingCentroid and getParkEntranceFallbackPoint derive valid Utinga coordinates from OSM geometry', () => {
  const center = computeRingCentroid(PARK_BOUNDARY_RING);
  assert.ok(center);
  assert.ok(center.lat < -1.40 && center.lat > -1.44);
  assert.ok(center.lng < -48.39 && center.lng > -48.45);

  const entrance = getParkEntranceFallbackPoint(INTERNAL_TRAIL_GEOMETRIES);
  assert.ok(entrance);
  assert.ok(entrance.lat < -1.41 && entrance.lat > -1.44);
  assert.ok(entrance.lng < -48.43 && entrance.lng > -48.45);
});

test('matchInternalTrailIdsFromText detects mentioned park tracks and trails accurately', () => {
  const matched = matchInternalTrailIdsFromText(
    'Para pedalar, use a Pista Principal (~4 km). Se quiser caminhar, a Trilha do Patauá e a Trilha da Castanheira estão mapeadas, além da Trilha do Macaco e do Ramal Moça Bonita.',
    INTERNAL_TRAIL_GEOMETRIES
  );
  assert.deepEqual(matched, [
    'pista-principal',
    'castanheira',
    'patua',
    'macaco',
    'moca-bonita',
  ]);

  assert.deepEqual(
    matchInternalTrailIdsFromText(
      'O Bar do Lulu fica nos arredores de Ananindeua/Utinga.',
      INTERNAL_TRAIL_GEOMETRIES
    ),
    []
  );
});


