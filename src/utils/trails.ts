import type {
  InternalTrailGeometry,
  JournalEntry,
  LatLngPoint,
  OfficialTrail,
  TrailDifficulty,
} from '../types/app.ts';

export type TrailDifficultyFilter = 'Todas' | TrailDifficulty;

export interface TrailPopularityItem {
  trail: OfficialTrail;
  visitCount: number;
  totalMinutes: number;
  lastVisitDate: string | null;
  rank: number;
}

export function formatMetersPtBr(meters: number): string {
  return `${new Intl.NumberFormat('pt-BR').format(meters)} m`;
}

export function filterTrails(
  trails: OfficialTrail[],
  difficulty: TrailDifficultyFilter,
  query: string
): OfficialTrail[] {
  const normalizedQuery = query.trim().toLowerCase();

  return trails.filter((trail) => {
    const matchesDifficulty =
      difficulty === 'Todas' || trail.difficulty === difficulty;

    if (!matchesDifficulty) return false;
    if (!normalizedQuery) return true;

    return (
      trail.name.toLowerCase().includes(normalizedQuery) ||
      trail.difficulty.toLowerCase().includes(normalizedQuery) ||
      trail.publishedSummary.toLowerCase().includes(normalizedQuery)
    );
  });
}

export function summarizeTrails(trails: OfficialTrail[]): {
  count: number;
  totalMeters: number;
  byDifficulty: Record<TrailDifficulty, number>;
} {
  const byDifficulty: Record<TrailDifficulty, number> = {
    Fácil: 0,
    Média: 0,
    Difícil: 0,
  };

  let totalMeters = 0;

  for (const trail of trails) {
    totalMeters += trail.distanceMeters;
    byDifficulty[trail.difficulty] += 1;
  }

  return {
    count: trails.length,
    totalMeters,
    byDifficulty,
  };
}

export function computePopularTrails(
  trails: OfficialTrail[],
  entries: JournalEntry[]
): TrailPopularityItem[] {
  const trailById = new Map<string, OfficialTrail>(
    trails.map((trail) => [trail.id, trail])
  );

  const stats = new Map<
    string,
    { visitCount: number; totalMinutes: number; lastVisitDate: string | null }
  >();

  for (const entry of entries) {
    if (!entry.trailId || !trailById.has(entry.trailId)) continue;

    const current = stats.get(entry.trailId) || {
      visitCount: 0,
      totalMinutes: 0,
      lastVisitDate: null,
    };

    const safeMinutes =
      typeof entry.durationMinutes === 'number' &&
      Number.isFinite(entry.durationMinutes) &&
      entry.durationMinutes > 0
        ? entry.durationMinutes
        : 0;

    const nextLastDate =
      !current.lastVisitDate || entry.date > current.lastVisitDate
        ? entry.date
        : current.lastVisitDate;

    stats.set(entry.trailId, {
      visitCount: current.visitCount + 1,
      totalMinutes: current.totalMinutes + safeMinutes,
      lastVisitDate: nextLastDate,
    });
  }

  const ranked = Array.from(stats.entries())
    .map(([trailId, data]) => ({
      trail: trailById.get(trailId)!,
      visitCount: data.visitCount,
      totalMinutes: data.totalMinutes,
      lastVisitDate: data.lastVisitDate,
      rank: 0,
    }))
    .sort((a, b) => {
      if (b.visitCount !== a.visitCount) {
        return b.visitCount - a.visitCount;
      }
      const dateCompare = (b.lastVisitDate || '').localeCompare(
        a.lastVisitDate || ''
      );
      if (dateCompare !== 0) return dateCompare;
      if (b.totalMinutes !== a.totalMinutes) {
        return b.totalMinutes - a.totalMinutes;
      }
      return a.trail.distanceMeters - b.trail.distanceMeters;
    });

  return ranked.map((item, idx) => ({
    ...item,
    rank: idx + 1,
  }));
}

export function sortTrailsByPopularity(
  trails: OfficialTrail[],
  popularity: TrailPopularityItem[]
): OfficialTrail[] {
  if (popularity.length === 0) return trails;

  const rankById = new Map<string, number>(
    popularity.map((item) => [item.trail.id, item.rank])
  );

  return [...trails].sort((a, b) => {
    const rankA = rankById.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const rankB = rankById.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return rankA - rankB;
  });
}

export function getInternalTrailById(
  trails: InternalTrailGeometry[],
  id: string | null | undefined
): InternalTrailGeometry | null {
  if (!id) return null;
  return trails.find((t) => t.id === id) || null;
}

export function getInternalTrailForOfficial(
  trails: InternalTrailGeometry[],
  officialTrailId: string
): InternalTrailGeometry | null {
  return trails.find((t) => t.officialTrailId === officialTrailId) || null;
}

export function getTrailPointsFlat(trail: InternalTrailGeometry): LatLngPoint[] {
  const pts: LatLngPoint[] = [];
  for (const seg of trail.segments) {
    for (const pt of seg) {
      pts.push(pt);
    }
  }
  return pts;
}

export function summarizeInternalTrails(trails: InternalTrailGeometry[]): {
  count: number;
  totalOsmMeters: number;
  officialMappedCount: number;
} {
  let totalOsmMeters = 0;
  let officialMappedCount = 0;
  for (const t of trails) {
    totalOsmMeters += t.osmLengthMeters;
    if (t.officialTrailId) officialMappedCount += 1;
  }
  return {
    count: trails.length,
    totalOsmMeters,
    officialMappedCount,
  };
}

export function computeRingCentroid(ring: LatLngPoint[]): LatLngPoint | null {
  if (ring.length === 0) return null;
  let latSum = 0;
  let lngSum = 0;
  // Exclude duplicate closing vertex if closed ring
  const limit =
    ring.length > 1 &&
    ring[0].lat === ring[ring.length - 1].lat &&
    ring[0].lng === ring[ring.length - 1].lng
      ? ring.length - 1
      : ring.length;

  for (let i = 0; i < limit; i += 1) {
    latSum += ring[i].lat;
    lngSum += ring[i].lng;
  }

  return {
    lat: Number((latSum / limit).toFixed(6)),
    lng: Number((lngSum / limit).toFixed(6)),
  };
}

export function getParkEntranceFallbackPoint(
  trails: InternalTrailGeometry[]
): LatLngPoint | null {
  const mainTrack = getInternalTrailById(trails, 'pista-principal');
  const firstSeg = mainTrack?.segments[0];
  if (!firstSeg || firstSeg.length === 0) return null;
  // In OSM way 351253021..383656474, the western/reception end is the last point of pista-principal
  return firstSeg[firstSeg.length - 1];
}

function normalizeForTrailMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const TRAIL_MATCH_ALIASES: Record<string, string[]> = {
  'pista-principal': ['pista principal', 'rua do utinga', 'ciclovia principal', 'pista asfaltada'],
  castanheira: ['trilha da castanheira', 'castanheira'],
  patua: ['trilha do patua', 'trilha do pataua', 'patua', 'pataua'],
  bolonha: ['trilha da bolonha'],
  acapu: ['trilha do acapu', 'acapu'],
  amapa: ['trilha do amapa'],
  macaco: ['trilha do macaco'],
  mariana: ['trilha da mariana'],
  'orla-bolonha': ['orla do lago bolonha', 'caminho da orla do lago bolonha'],
  'moca-bonita': ['moca bonita', 'ramal moca bonita'],
  'entorno-agua-preta': ['entorno do lago agua preta', 'trilha leste'],
};

export function matchInternalTrailIdsFromText(
  text: string,
  trails: InternalTrailGeometry[]
): string[] {
  const normalized = normalizeForTrailMatch(text);
  if (!normalized) return [];

  const matchedIds: string[] = [];
  for (const trail of trails) {
    const aliases = new Set<string>([
      normalizeForTrailMatch(trail.name),
      ...(TRAIL_MATCH_ALIASES[trail.id] || []),
    ]);

    let found = false;
    for (const alias of aliases) {
      if (alias.length < 4) continue;
      if (normalized.includes(alias)) {
        found = true;
        break;
      }
    }
    if (found) {
      matchedIds.push(trail.id);
    }
  }

  return matchedIds;
}


