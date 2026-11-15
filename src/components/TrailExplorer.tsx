import { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  BookOpen,
  Compass,
  Flame,
  Info,
  Map as MapIcon,
  MessageSquare,
  Search,
} from 'lucide-react';
import { INTERNAL_TRAIL_GEOMETRIES } from '../data/internalTrailsGeo.ts';
import { OFFICIAL_SOURCE_URL, OFFICIAL_TRAILS } from '../data/parkData.ts';
import type { JournalEntry, OfficialTrail } from '../types/app.ts';
import {
  computePopularTrails,
  filterTrails,
  formatMetersPtBr,
  getInternalTrailForOfficial,
  sortTrailsByPopularity,
  summarizeTrails,
  type TrailDifficultyFilter,
} from '../utils/trails.ts';

interface TrailExplorerProps {
  journalEntries: JournalEntry[];
  onAskGuideAboutTrail: (trail: OfficialTrail) => void;
  onViewTrailOnMap?: (internalTrailId: string) => void;
  onGoToJournal?: () => void;
}

const DIFFICULTY_FILTERS: TrailDifficultyFilter[] = [
  'Todas',
  'Fácil',
  'Média',
  'Difícil',
];

function getDifficultyTextClass(difficulty: OfficialTrail['difficulty']): string {
  switch (difficulty) {
    case 'Fácil':
      return 'text-[#1B4332]';
    case 'Média':
      return 'text-[#B44B1E]';
    case 'Difícil':
      return 'text-[#991B1B]';
  }
}

export function TrailExplorer({
  journalEntries,
  onAskGuideAboutTrail,
  onViewTrailOnMap,
  onGoToJournal,
}: TrailExplorerProps) {
  const [difficulty, setDifficulty] = useState<TrailDifficultyFilter>('Todas');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'popular' | 'official'>('popular');
  const [imgError, setImgError] = useState(false);

  const summary = useMemo(() => summarizeTrails(OFFICIAL_TRAILS), []);
  const popularTrails = useMemo(
    () => computePopularTrails(OFFICIAL_TRAILS, journalEntries),
    [journalEntries]
  );

  const popularityByTrailId = useMemo(
    () => new Map(popularTrails.map((item) => [item.trail.id, item])),
    [popularTrails]
  );

  const totalPopularLogs = useMemo(
    () => popularTrails.reduce((acc, item) => acc + item.visitCount, 0),
    [popularTrails]
  );

  const filtered = useMemo(() => {
    const base =
      sortBy === 'popular'
        ? sortTrailsByPopularity(OFFICIAL_TRAILS, popularTrails)
        : OFFICIAL_TRAILS;
    return filterTrails(base, difficulty, searchQuery);
  }, [sortBy, popularTrails, difficulty, searchQuery]);

  const topPopular = popularTrails.slice(0, 3);
  const easyStarterTrails = useMemo(
    () => OFFICIAL_TRAILS.filter((t) => t.difficulty === 'Fácil'),
    []
  );

  return (
    <section aria-labelledby="trilhas-heading" className="space-y-6">
      {/* Editorial Intro */}
      <div className="bg-[#FFFDF9] border border-[#DDD3C1] rounded-2xl overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-5 items-stretch">
          <div className="md:col-span-2 relative min-h-[180px] bg-[#1B4332]">
            {!imgError ? (
              <img
                src="/assets/images/utinga_trail_walk_1794596576881.jpg"
                alt="Trilha ecológica em meio à floresta amazônica no Parque Estadual do Utinga"
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-6 text-[#EFE8DA] text-center">
                <Compass className="w-8 h-8 mb-2 opacity-80" aria-hidden="true" />
                <span className="text-sm font-medium">Trilhas do Parque do Utinga</span>
              </div>
            )}
          </div>
          <div className="md:col-span-3 p-5 sm:p-6 flex flex-col justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-[#9A3B15] tracking-wide">
                IDEFLOR-Bio · Dados oficiais de extensão e dificuldade
              </p>
              <h2
                id="trilhas-heading"
                className="text-2xl font-semibold text-[#1C241E] mt-1 tracking-tight"
              >
                Explorador de Trilhas
              </h2>
              <p className="text-sm text-[#3B4239] mt-2 leading-relaxed">
                Consulte as seis trilhas oficiais publicadas pelo IDEFLOR-Bio. As trilhas
                com traçado vetorial mapeado no OpenStreetMap (ODbL) podem ser visualizadas
                diretamente no mapa; trechos não mapeados ou sem registro nominal permanecem
                identificados de forma transparente.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-[#E7DFCE]">
              <div>
                <div className="text-xs text-[#5E584D]">Trilhas cadastradas</div>
                <div className="text-lg font-semibold font-mono tabular-nums text-[#1C241E]">
                  {summary.count}
                </div>
              </div>
              <div>
                <div className="text-xs text-[#5E584D]">Extensão somada</div>
                <div className="text-lg font-semibold font-mono tabular-nums text-[#1C241E]">
                  {formatMetersPtBr(summary.totalMeters)}
                </div>
              </div>
              <div>
                <div className="text-xs text-[#5E584D]">Distribuição</div>
                <div className="text-xs font-medium text-[#1C241E] mt-1 tabular-nums">
                  {summary.byDifficulty.Fácil}F · {summary.byDifficulty.Média}M ·{' '}
                  {summary.byDifficulty.Difícil}D
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Popular Trails Section based on Diário de Visitas */}
      <div
        data-testid="popular-trails-section"
        className="bg-[#FFFDF9] border border-[#DDD3C1] rounded-2xl p-5 sm:p-6 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-[#B44B1E]">
              <Flame className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Baseado nos registros do Diário de Visitas (local)</span>
            </div>
            <h3 className="text-lg font-semibold text-[#1C241E]">
              Trilhas mais populares para ajudar sua escolha
            </h3>
          </div>

          {onGoToJournal && (
            <button
              type="button"
              onClick={onGoToJournal}
              className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3.5 py-1.5 text-xs font-medium text-[#1B4332] bg-[#EFE8DA] hover:bg-[#E4DAC7] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Registrar visita no Diário</span>
            </button>
          )}
        </div>

        {popularTrails.length === 0 ? (
          <div className="pt-3 border-t border-[#E7DFCE] space-y-2">
            <p className="text-sm text-[#3B4239] leading-relaxed">
              Ainda não há caminhadas vinculadas a trilhas específicas no seu{' '}
              <strong className="font-semibold text-[#1C241E]">Diário de Visitas</strong>.
              Assim que visitas com trilha selecionada forem registradas, este painel
              ordenará automaticamente as mais frequentadas para orientar novos visitantes.
            </p>
            <p className="text-xs text-[#5E584D] leading-relaxed">
              Para uma primeira visita, os dados oficiais do IDEFLOR-Bio indicam três
              opções de nível <strong className="text-[#1B4332]">Fácil</strong>:{' '}
              {easyStarterTrails
                .map((t) => `${t.name} (${formatMetersPtBr(t.distanceMeters)})`)
                .join(', ')}
              .
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-[#5E584D]">
              Ranking calculado a partir de{' '}
              <span className="font-mono font-semibold text-[#1C241E] tabular-nums">
                {totalPopularLogs}
              </span>{' '}
              {totalPopularLogs === 1
                ? 'registro de trilha salvo'
                : 'registros de trilhas salvos'}{' '}
              no Diário de Visitas ({popularTrails.length} de {OFFICIAL_TRAILS.length}{' '}
              trilhas oficiais registradas).
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {topPopular.map((item) => {
                const osmMatch = getInternalTrailForOfficial(
                  INTERNAL_TRAIL_GEOMETRIES,
                  item.trail.id
                );
                return (
                  <div
                    key={item.trail.id}
                    data-testid={`popular-trail-card-${item.trail.id}`}
                    className="p-4 rounded-xl bg-[#F8F4EC] flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono font-semibold text-[#B44B1E] tabular-nums">
                          #{item.rank} Popular
                        </span>
                        <span className="font-mono font-semibold text-[#1C241E] tabular-nums">
                          {item.visitCount}{' '}
                          {item.visitCount === 1 ? 'registro' : 'registros'}
                        </span>
                      </div>

                      <h4 className="text-sm font-semibold text-[#1C241E]">
                        {item.trail.name}
                      </h4>

                      <div className="text-xs text-[#5E584D] flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-mono tabular-nums text-[#1C241E]">
                          {formatMetersPtBr(item.trail.distanceMeters)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`font-medium ${getDifficultyTextClass(
                            item.trail.difficulty
                          )}`}
                        >
                          {item.trail.difficulty}
                        </span>
                      </div>

                      <div className="text-[11px] text-[#5E584D] font-mono tabular-nums">
                        {item.totalMinutes} min acumulados
                        {item.lastVisitDate
                          ? ` · Última: ${item.lastVisitDate
                              .split('-')
                              .reverse()
                              .join('/')}`
                          : ''}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#E7DFCE]">
                      {osmMatch && onViewTrailOnMap && (
                        <button
                          type="button"
                          onClick={() => onViewTrailOnMap(osmMatch.id)}
                          className="inline-flex items-center gap-1 min-h-[40px] px-3 py-1.5 text-xs font-medium text-white bg-[#1B4332] hover:bg-[#133124] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                        >
                          <MapIcon className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Ver no mapa</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onAskGuideAboutTrail(item.trail)}
                        className="inline-flex items-center gap-1 min-h-[40px] px-3 py-1.5 text-xs font-medium text-[#1B4332] bg-[#FFFDF9] border border-[#DDD3C1] hover:bg-[#EFE8DA] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Perguntar</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Filters, Sort & Search */}
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        <div
          role="group"
          aria-label="Filtrar trilhas por dificuldade"
          className="inline-flex items-center gap-1 p-1 bg-[#EFE8DA] rounded-xl border border-[#DDD3C1] overflow-x-auto"
        >
          {DIFFICULTY_FILTERS.map((item) => {
            const active = difficulty === item;
            return (
              <button
                key={item}
                type="button"
                onClick={() => setDifficulty(item)}
                className={`min-h-[38px] px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[#FFFDF9] text-[#1B4332] font-semibold shadow-xs'
                    : 'text-[#5E584D] hover:text-[#1C241E]'
                }`}
              >
                {item}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center flex-1 lg:justify-end">
          <div className="relative sm:w-60">
            <ArrowUpDown
              className="w-3.5 h-3.5 text-[#5E584D] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <label htmlFor="trail-sort" className="sr-only">
              Ordenar trilhas
            </label>
            <select
              id="trail-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'popular' | 'official')}
              className="w-full min-h-[42px] pl-8 pr-7 py-2 text-xs font-medium bg-[#FFFDF9] border border-[#DDD3C1] rounded-xl text-[#1C241E] focus:outline-none focus:ring-2 focus:ring-[#B44B1E]/25 focus:border-[#B44B1E]"
            >
              <option value="popular">Mais populares (Diário)</option>
              <option value="official">Ordem oficial (extensão)</option>
            </select>
          </div>

          <div className="relative flex-1 sm:max-w-xs">
            <Search
              className="w-4 h-4 text-[#5E584D] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <label htmlFor="trail-search" className="sr-only">
              Buscar trilha pelo nome
            </label>
            <input
              id="trail-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar trilha (ex: Bolonha)..."
              className="w-full min-h-[42px] pl-9 pr-3 py-2 text-sm bg-[#FFFDF9] border border-[#DDD3C1] rounded-xl text-[#1C241E] placeholder:text-[#7A7265] focus:outline-none focus:ring-2 focus:ring-[#B44B1E]/25 focus:border-[#B44B1E]"
            />
          </div>
        </div>
      </div>

      {/* Trails List */}
      {filtered.length === 0 ? (
        <div className="bg-[#FFFDF9] border border-[#DDD3C1] rounded-2xl p-8 text-center">
          <p className="text-sm font-medium text-[#1C241E]">
            Nenhuma trilha encontrada para os filtros selecionados.
          </p>
          <button
            type="button"
            onClick={() => {
              setDifficulty('Todas');
              setSearchQuery('');
            }}
            className="mt-3 min-h-[40px] px-4 py-2 text-xs font-medium text-white bg-[#1B4332] hover:bg-[#133124] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            Limpar filtros
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="trails-grid">
          {filtered.map((trail) => {
            const osmMatch = getInternalTrailForOfficial(
              INTERNAL_TRAIL_GEOMETRIES,
              trail.id
            );
            const popStats = popularityByTrailId.get(trail.id);
            return (
              <article
                key={trail.id}
                data-testid={`trail-card-${trail.id}`}
                className="bg-[#FFFDF9] border border-[#DDD3C1] rounded-2xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-4">
                  {/* Header */}
                  <div className="space-y-1">
                    {popStats && (
                      <div className="text-xs font-mono font-semibold text-[#B44B1E] tabular-nums">
                        #{popStats.rank} no Diário · {popStats.visitCount}{' '}
                        {popStats.visitCount === 1 ? 'registro' : 'registros'}
                      </div>
                    )}
                    <h3 className="text-lg font-semibold text-[#1C241E]">
                      {trail.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#5E584D]">
                      <span className="font-mono font-semibold tabular-nums text-[#1C241E]">
                        {formatMetersPtBr(trail.distanceMeters)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`font-semibold ${getDifficultyTextClass(
                          trail.difficulty
                        )}`}
                      >
                        Dificuldade {trail.difficulty}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>Caminhada ecológica</span>
                    </div>
                  </div>

                  {/* Published Data Block */}
                  <div className="space-y-1.5 pt-3 border-t border-[#E7DFCE]">
                    <div className="text-xs font-semibold text-[#1B4332]">
                      Dados publicados (IDEFLOR-Bio)
                    </div>
                    <p className="text-sm text-[#3B4239] leading-relaxed">
                      {trail.publishedSummary}
                    </p>
                  </div>

                  {/* Georeferenced / Non-Georeferenced Explicit Separation */}
                  <div
                    className={`space-y-1.5 p-3.5 rounded-xl ${
                      osmMatch ? 'bg-[#EAF3EE]' : 'bg-[#F8F4EC]'
                    }`}
                  >
                    <div
                      className={`flex items-center gap-1.5 text-xs font-semibold ${
                        osmMatch ? 'text-[#1B4332]' : 'text-[#8A3411]'
                      }`}
                    >
                      <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        {osmMatch
                          ? osmMatch.coverageStatus === 'complete'
                            ? `Traçado no mapa (OpenStreetMap · ${formatMetersPtBr(osmMatch.osmLengthMeters)})`
                            : `Traçado parcial no mapa (OpenStreetMap · ${formatMetersPtBr(osmMatch.osmLengthMeters)} de ${formatMetersPtBr(trail.distanceMeters)})`
                          : 'Informação ainda não georreferenciada'}
                      </span>
                    </div>
                    <p className="text-xs text-[#4B473F] leading-relaxed">
                      {trail.nonGeoreferencedNote}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#E7DFCE]">
                  <a
                    href={OFFICIAL_SOURCE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-[#5E584D] hover:text-[#1B4332] underline underline-offset-2"
                  >
                    Ver fonte oficial
                  </a>
                  <div className="flex flex-wrap items-center gap-2">
                    {osmMatch && onViewTrailOnMap && (
                      <button
                        type="button"
                        onClick={() => onViewTrailOnMap(osmMatch.id)}
                        className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-2 text-xs font-medium text-white bg-[#1B4332] hover:bg-[#133124] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <MapIcon className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Ver no mapa</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onAskGuideAboutTrail(trail)}
                      className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 text-xs font-medium text-[#1B4332] bg-[#EFE8DA] hover:bg-[#E4DAC7] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Perguntar ao Guia</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
