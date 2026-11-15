import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { BookOpen, CheckCircle2, Circle, MessageSquare, Plus, Trash2 } from 'lucide-react';
import { OFFICIAL_TRAILS } from '../data/parkData.ts';
import type { JournalActivityType, JournalEntry } from '../types/app.ts';
import {
  buildJournalSummaryForGuide,
  createJournalEntry,
  JOURNAL_ACTIVITIES,
  sortJournalEntries,
  summarizeJournal,
  summarizeTrailCoverage,
  validateJournalDraft,
} from '../utils/journal.ts';

interface VisitJournalViewProps {
  entries: JournalEntry[];
  onAddEntry: (entry: JournalEntry) => void;
  onDeleteEntry: (id: string) => void;
  onAskGuideFromJournal?: (prompt: string) => void;
}

const PRE_VISIT_CHECKLIST = [
  { id: 'agua', label: 'Garrafa de água para hidratação contínua' },
  { id: 'calcado', label: 'Calçado fechado e antiderrapante para trilha ou pedal' },
  { id: 'capacete', label: 'Capacete afivelado (obrigatório recomendado para ciclistas)' },
  { id: 'clima', label: 'Leitura recente do clima e atenção às nuvens no local' },
  { id: 'fauna', label: 'Compromisso de não alimentar nem tocar animais silvestres' },
];

const QUICK_DURATIONS = ['30', '45', '60', '90'];

function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function VisitJournalView({
  entries,
  onAddEntry,
  onDeleteEntry,
  onAskGuideFromJournal,
}: VisitJournalViewProps) {
  const [date, setDate] = useState(getTodayDateString());
  const [activity, setActivity] = useState<JournalActivityType>(
    'Pedal na Pista Principal (~4 km)'
  );
  const [trailId, setTrailId] = useState<string>('');
  const [durationMinutes, setDurationMinutes] = useState<string>('45');
  const [notes, setNotes] = useState<string>('');
  const [errors, setErrors] = useState<
    Partial<Record<'date' | 'activity' | 'durationMinutes' | 'notes', string>>
  >({});
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [filterActivity, setFilterActivity] = useState<'Todas' | JournalActivityType>(
    'Todas'
  );
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const notesInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!saveNotice) return;
    const timer = window.setTimeout(() => setSaveNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [saveNotice]);

  const summary = useMemo(() => summarizeJournal(entries), [entries]);
  const coverage = useMemo(
    () =>
      summarizeTrailCoverage(
        entries,
        OFFICIAL_TRAILS.map((t) => t.id)
      ),
    [entries]
  );
  const visibleEntries = useMemo(() => {
    const sorted = sortJournalEntries(entries);
    if (filterActivity === 'Todas') return sorted;
    return sorted.filter((e) => e.activity === filterActivity);
  }, [entries, filterActivity]);

  const toggleChecklistItem = (id: string) => {
    setCheckedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const validation = validateJournalDraft({
      date,
      activity,
      trailId: activity === 'Caminhada em Trilha' ? trailId : undefined,
      durationMinutes,
      notes,
    });

    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    const entry = createJournalEntry({
      date,
      activity,
      trailId: activity === 'Caminhada em Trilha' ? trailId : undefined,
      durationMinutes,
      notes,
    });

    onAddEntry(entry);
    setErrors({});
    setNotes('');
    setSaveNotice('Visita salva no armazenamento local do navegador.');
  };

  const handleSelectTrailShortcut = (selectedTrailId: string) => {
    setActivity('Caminhada em Trilha');
    setTrailId(selectedTrailId);
    setSaveNotice(null);
    notesInputRef.current?.focus();
  };

  return (
    <section aria-labelledby="diario-heading" className="space-y-6">
      {/* Header & Metrics */}
      <div className="bg-[#FFFDF9] border border-[#DDD3C1] rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-[#9A3B15]">
              Armazenamento local no navegador
            </p>
            <h2
              id="diario-heading"
              className="text-2xl font-semibold text-[#1C241E] mt-0.5 tracking-tight"
            >
              Diário de Visitas
            </h2>
          </div>
          <div className="grid grid-cols-3 gap-4 sm:gap-6 text-left sm:text-right">
            <div>
              <div className="text-xs text-[#5E584D]">Visitas</div>
              <div
                data-testid="journal-total-visits"
                className="text-lg font-semibold font-mono tabular-nums text-[#1C241E]"
              >
                {summary.totalVisits}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#5E584D]">Tempo total</div>
              <div className="text-lg font-semibold font-mono tabular-nums text-[#1C241E]">
                {summary.totalMinutes} min
              </div>
            </div>
            <div>
              <div className="text-xs text-[#5E584D]">Mais frequente</div>
              <div className="text-xs font-medium text-[#1C241E] mt-1 truncate max-w-[130px]">
                {summary.mostFrequentActivity || '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Official Trail Coverage & Guide Integration */}
        <div className="pt-4 border-t border-[#E7DFCE] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-[#1B4332]">
                Cobertura das trilhas oficiais:
              </span>
              <span
                data-testid="journal-trail-coverage"
                className="font-mono tabular-nums font-semibold text-[#1C241E]"
              >
                {coverage.completedCount} de {coverage.totalOfficialCount} registradas
              </span>
              <span className="text-[#5E584D]">
                · {coverage.cyclingSessions} pedal(is) na pista principal
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {OFFICIAL_TRAILS.map((t) => {
                const done = coverage.completedTrailIds.includes(t.id);
                const selectedShortcut =
                  activity === 'Caminhada em Trilha' && trailId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleSelectTrailShortcut(t.id)}
                    title={`Selecionar ${t.name} para novo registro`}
                    className={`inline-flex items-center gap-1.5 min-h-[34px] text-xs px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                      selectedShortcut
                        ? 'bg-[#1B4332] border-[#1B4332] text-white font-medium'
                        : done
                          ? 'bg-[#EAF3EE] border-[#C5DBC9] text-[#1B4332] font-medium hover:bg-[#DCECE3]'
                          : 'bg-[#F8F4EC] border-[#DDD3C1] text-[#5E584D] hover:text-[#1C241E] hover:bg-[#EFE8DA]'
                    }`}
                  >
                    {done ? (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    ) : (
                      <Circle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    )}
                    <span>{t.name.replace('Trilha da ', '').replace('Trilha do ', '')}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {onAskGuideFromJournal && (
            <button
              type="button"
              onClick={() =>
                onAskGuideFromJournal(
                  buildJournalSummaryForGuide(entries, OFFICIAL_TRAILS)
                )
              }
              className="inline-flex items-center justify-center gap-2 min-h-[42px] px-4 py-2 text-xs font-medium text-[#1B4332] bg-[#EFE8DA] hover:bg-[#E4DAC7] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Sugerir próxima atividade com Guia Utinga</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Form */}
        <form
          onSubmit={handleSubmit}
          noValidate
          className="lg:col-span-5 bg-[#FFFDF9] border border-[#DDD3C1] rounded-2xl p-5 space-y-4"
        >
          <h3 className="text-base font-semibold text-[#1C241E]">
            Registrar nova visita
          </h3>

          <div className="space-y-1.5">
            <label
              htmlFor="journal-date"
              className="block text-xs font-medium text-[#3B4239]"
            >
              Data da visita
            </label>
            <input
              id="journal-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 text-sm bg-[#FFFDF9] border border-[#DDD3C1] rounded-xl text-[#1C241E] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#B44B1E]/25 focus:border-[#B44B1E]"
            />
            {errors.date && (
              <p className="text-xs text-red-700" role="alert">
                {errors.date}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="journal-activity"
              className="block text-xs font-medium text-[#3B4239]"
            >
              Atividade realizada
            </label>
            <select
              id="journal-activity"
              value={activity}
              onChange={(e) => setActivity(e.target.value as JournalActivityType)}
              className="w-full min-h-[42px] px-3 py-2 text-sm bg-[#FFFDF9] border border-[#DDD3C1] rounded-xl text-[#1C241E] focus:outline-none focus:ring-2 focus:ring-[#B44B1E]/25 focus:border-[#B44B1E]"
            >
              {JOURNAL_ACTIVITIES.map((act) => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </select>
            {errors.activity && (
              <p className="text-xs text-red-700" role="alert">
                {errors.activity}
              </p>
            )}
          </div>

          {activity === 'Caminhada em Trilha' && (
            <div className="space-y-1.5">
              <label
                htmlFor="journal-trail"
                className="block text-xs font-medium text-[#3B4239]"
              >
                Trilha oficial (opcional)
              </label>
              <select
                id="journal-trail"
                value={trailId}
                onChange={(e) => setTrailId(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm bg-[#FFFDF9] border border-[#DDD3C1] rounded-xl text-[#1C241E] focus:outline-none focus:ring-2 focus:ring-[#B44B1E]/25 focus:border-[#B44B1E]"
              >
                <option value="">Selecionar trilha...</option>
                {OFFICIAL_TRAILS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.distanceMeters} m · {t.difficulty})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-[#5E584D]">
                Ao informar a trilha, o registro passa a contar nas trilhas mais populares do Explorador.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="journal-duration"
                className="block text-xs font-medium text-[#3B4239]"
              >
                Duração (minutos)
              </label>
              <div className="flex items-center gap-1">
                {QUICK_DURATIONS.map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setDurationMinutes(mins)}
                    className={`min-h-[28px] px-2.5 py-0.5 text-[11px] font-mono tabular-nums rounded-md transition-colors cursor-pointer ${
                      durationMinutes === mins
                        ? 'bg-[#1B4332] text-white'
                        : 'bg-[#EFE8DA] text-[#3B4239] hover:bg-[#E4DAC7]'
                    }`}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            </div>
            <input
              id="journal-duration"
              type="number"
              min={1}
              max={720}
              step={1}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 text-sm bg-[#FFFDF9] border border-[#DDD3C1] rounded-xl text-[#1C241E] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#B44B1E]/25 focus:border-[#B44B1E]"
            />
            {errors.durationMinutes && (
              <p className="text-xs text-red-700" role="alert">
                {errors.durationMinutes}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="journal-notes"
              className="block text-xs font-medium text-[#3B4239]"
            >
              Observações da visita
            </label>
            <textarea
              ref={notesInputRef}
              id="journal-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: Trecho sombreado, avistamento de aves, ritmo confortável..."
              className="w-full px-3 py-2.5 text-sm bg-[#FFFDF9] border border-[#DDD3C1] rounded-xl text-[#1C241E] placeholder:text-[#7A7265] focus:outline-none focus:ring-2 focus:ring-[#B44B1E]/25 focus:border-[#B44B1E]"
            />
            {errors.notes && (
              <p className="text-xs text-red-700" role="alert">
                {errors.notes}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 text-sm font-medium text-white bg-[#1B4332] hover:bg-[#133124] rounded-xl transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Salvar registro</span>
          </button>

          {saveNotice && (
            <p
              role="status"
              className="text-xs font-medium text-[#1B4332] bg-[#EAF3EE] px-3 py-2 rounded-lg"
            >
              {saveNotice}
            </p>
          )}
        </form>

        {/* Entries List */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-[#1C241E]">
              Registros salvos
            </h3>
            <select
              aria-label="Filtrar registros por atividade"
              value={filterActivity}
              onChange={(e) =>
                setFilterActivity(e.target.value as 'Todas' | JournalActivityType)
              }
              className="min-h-[38px] px-3 py-1.5 text-xs bg-[#FFFDF9] border border-[#DDD3C1] rounded-xl text-[#1C241E]"
            >
              <option value="Todas">Todas as atividades</option>
              {JOURNAL_ACTIVITIES.map((act) => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </select>
          </div>

          {visibleEntries.length === 0 ? (
            <div className="bg-[#FFFDF9] border border-[#DDD3C1] rounded-2xl p-8 text-center space-y-2">
              <BookOpen
                className="w-7 h-7 text-[#5E584D] mx-auto"
                aria-hidden="true"
              />
              <p className="text-sm font-medium text-[#1C241E]">
                Ainda não há visitas registradas nesta visualização.
              </p>
              <p className="text-xs text-[#5E584D]">
                Preencha o formulário ao lado para guardar suas caminhadas e pedais
                diretamente no seu navegador.
              </p>
            </div>
          ) : (
            <div className="space-y-3" data-testid="journal-entries-list">
              {visibleEntries.map((entry) => {
                const trail = entry.trailId
                  ? OFFICIAL_TRAILS.find((t) => t.id === entry.trailId)
                  : undefined;

                return (
                  <article
                    key={entry.id}
                    className="bg-[#FFFDF9] border border-[#DDD3C1] rounded-2xl p-4 sm:p-5 flex items-start justify-between gap-4"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#5E584D]">
                        <span className="font-mono font-medium tabular-nums text-[#1C241E]">
                          {entry.date.split('-').reverse().join('/')}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-[#B44B1E]">
                          {entry.activity}
                        </span>
                        {trail && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{trail.name}</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {entry.durationMinutes} min
                        </span>
                      </div>
                      <p className="text-sm text-[#3B4239] leading-relaxed break-words">
                        {entry.notes}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => onDeleteEntry(entry.id)}
                      aria-label={`Excluir registro de ${entry.date} (${entry.activity})`}
                      className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center text-[#5E584D] hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </article>
                );
              })}
            </div>
          )}
          {/* Local Pre-Visit Safety Checklist */}
          <div className="bg-[#FFFDF9] border border-[#DDD3C1] rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[#1C241E]">
                Checklist rápido pré-trilha e pré-pedal
              </h3>
              <span className="text-xs font-mono tabular-nums text-[#5E584D]">
                {Object.values(checkedItems).filter(Boolean).length}/
                {PRE_VISIT_CHECKLIST.length}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PRE_VISIT_CHECKLIST.map((item) => {
                const checked = Boolean(checkedItems[item.id]);
                return (
                  <label
                    key={item.id}
                    className={`flex items-start gap-2.5 min-h-[44px] p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                      checked
                        ? 'bg-[#EAF3EE] border-[#1B4332]/30 text-[#1C241E]'
                        : 'bg-[#F8F4EC] border-[#DDD3C1] text-[#3B4239]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleChecklistItem(item.id)}
                      className="mt-0.5 accent-[#B44B1E] rounded"
                    />
                    <span className="leading-snug">{item.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
