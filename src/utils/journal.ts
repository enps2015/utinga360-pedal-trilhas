import type { JournalActivityType, JournalEntry } from '../types/app.ts';

export const JOURNAL_STORAGE_KEY = 'utinga360_visit_journal_v1';

export const JOURNAL_ACTIVITIES: JournalActivityType[] = [
  'Caminhada em Trilha',
  'Pedal na Pista Principal (~4 km)',
  'Observação da Natureza',
  'Visita Geral',
];

export interface JournalDraftInput {
  date: string;
  activity: JournalActivityType;
  trailId?: string;
  durationMinutes: number | string;
  notes: string;
}

export interface JournalValidationResult {
  valid: boolean;
  errors: Partial<Record<'date' | 'activity' | 'durationMinutes' | 'notes', string>>;
  parsedDuration?: number;
}

export function validateJournalDraft(input: JournalDraftInput): JournalValidationResult {
  const errors: JournalValidationResult['errors'] = {};

  if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date.trim())) {
    errors.date = 'Informe uma data válida no formato AAAA-MM-DD.';
  }

  if (!JOURNAL_ACTIVITIES.includes(input.activity)) {
    errors.activity = 'Selecione uma atividade válida.';
  }

  const numericDuration =
    typeof input.durationMinutes === 'number'
      ? input.durationMinutes
      : Number(String(input.durationMinutes).trim());

  if (!Number.isFinite(numericDuration) || !Number.isInteger(numericDuration) || numericDuration <= 0) {
    errors.durationMinutes = 'Informe uma duração inteira maior que 0 minutos.';
  } else if (numericDuration > 720) {
    errors.durationMinutes = 'A duração máxima por registro é de 720 minutos (12 horas).';
  }

  const trimmedNotes = input.notes.trim();
  if (trimmedNotes.length < 3) {
    errors.notes = 'Escreva uma observação com pelo menos 3 caracteres.';
  } else if (trimmedNotes.length > 600) {
    errors.notes = 'As observações devem ter no máximo 600 caracteres.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    parsedDuration:
      Object.keys(errors).length === 0 ? numericDuration : undefined,
  };
}

export function createJournalEntry(
  input: JournalDraftInput,
  id: string = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  nowIso: string = new Date().toISOString()
): JournalEntry {
  const validation = validateJournalDraft(input);
  if (!validation.valid || validation.parsedDuration === undefined) {
    throw new Error('Dados do diário inválidos.');
  }

  return {
    id,
    date: input.date.trim(),
    activity: input.activity,
    trailId: input.trailId?.trim() ? input.trailId.trim() : undefined,
    durationMinutes: validation.parsedDuration,
    notes: input.notes.trim(),
    createdAt: nowIso,
  };
}

export function sortJournalEntries(entries: JournalEntry[]): JournalEntry[] {
  return [...entries].sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date);
    if (dateCompare !== 0) return dateCompare;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function summarizeJournal(entries: JournalEntry[]): {
  totalVisits: number;
  totalMinutes: number;
  mostFrequentActivity: JournalActivityType | null;
} {
  if (entries.length === 0) {
    return { totalVisits: 0, totalMinutes: 0, mostFrequentActivity: null };
  }

  let totalMinutes = 0;
  const counts: Record<string, number> = {};

  for (const entry of entries) {
    totalMinutes += entry.durationMinutes;
    counts[entry.activity] = (counts[entry.activity] || 0) + 1;
  }

  let topActivity: JournalActivityType | null = null;
  let topCount = 0;
  for (const [activity, count] of Object.entries(counts)) {
    if (count > topCount) {
      topCount = count;
      topActivity = activity as JournalActivityType;
    }
  }

  return {
    totalVisits: entries.length,
    totalMinutes,
    mostFrequentActivity: topActivity,
  };
}

export function summarizeTrailCoverage(
  entries: JournalEntry[],
  officialTrailIds: string[]
): {
  completedTrailIds: string[];
  completedCount: number;
  totalOfficialCount: number;
  cyclingSessions: number;
} {
  const validSet = new Set(officialTrailIds);
  const completedSet = new Set<string>();
  let cyclingSessions = 0;

  for (const entry of entries) {
    if (entry.trailId && validSet.has(entry.trailId)) {
      completedSet.add(entry.trailId);
    }
    if (entry.activity === 'Pedal na Pista Principal (~4 km)') {
      cyclingSessions += 1;
    }
  }

  return {
    completedTrailIds: Array.from(completedSet),
    completedCount: completedSet.size,
    totalOfficialCount: officialTrailIds.length,
    cyclingSessions,
  };
}

export function buildJournalSummaryForGuide(
  entries: JournalEntry[],
  officialTrails: Array<{ id: string; name: string; difficulty: string }>
): string {
  if (entries.length === 0) {
    return 'Ainda não registrei nenhuma visita no meu Diário do Utinga. Quero uma recomendação inicial considerando meu tempo disponível, modalidade e dificuldade.';
  }
  const coverage = summarizeTrailCoverage(
    entries,
    officialTrails.map((t) => t.id)
  );
  const completedNames = officialTrails
    .filter((t) => coverage.completedTrailIds.includes(t.id))
    .map((t) => `${t.name} (${t.difficulty})`);
  const totalMinutes = entries.reduce((sum, e) => sum + e.durationMinutes, 0);

  return `Meu histórico no Diário do Utinga soma ${entries.length} visita(s) (${totalMinutes} min no total, ${coverage.cyclingSessions} sessão(ões) de pedal). Trilhas oficiais já registradas: ${
    completedNames.length > 0 ? completedNames.join(', ') : 'nenhuma ainda'
  }. Com base nisso e nas condições atuais, qual seria a próxima atividade mais recomendada e por quê?`;
}

export function loadJournalFromStorage(storage: Pick<Storage, 'getItem'>): JournalEntry[] {
  try {
    const raw = storage.getItem(JOURNAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sortJournalEntries(
      parsed.filter(
        (item): item is JournalEntry =>
          Boolean(
            item &&
              typeof item.id === 'string' &&
              typeof item.date === 'string' &&
              typeof item.activity === 'string' &&
              typeof item.durationMinutes === 'number' &&
              typeof item.notes === 'string'
          )
      )
    );
  } catch {
    return [];
  }
}

export function saveJournalToStorage(
  storage: Pick<Storage, 'setItem'>,
  entries: JournalEntry[]
): void {
  storage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(entries));
}
