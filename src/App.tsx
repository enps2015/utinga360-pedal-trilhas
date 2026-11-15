import { useCallback, useEffect, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import {
  Bike,
  BookOpen,
  CloudRain,
  Compass,
  Map as MapIcon,
  MessageSquare,
} from 'lucide-react';
import { CyclingModeView } from './components/CyclingModeView.tsx';
import { EnvironmentalWeatherView } from './components/EnvironmentalWeatherView.tsx';
import { GuiaUtingaDrawer } from './components/GuiaUtingaDrawer.tsx';
import { ParkMapWorkspace } from './components/ParkMapWorkspace.tsx';
import { SourcesFooter } from './components/SourcesFooter.tsx';
import { TrailExplorer } from './components/TrailExplorer.tsx';
import { UtingaLogo } from './components/UtingaLogo.tsx';
import { VisitJournalView } from './components/VisitJournalView.tsx';
import { PARK_BOUNDARY_RING } from './data/internalTrailsGeo.ts';
import { computeRingCentroid, formatMetersPtBr } from './utils/trails.ts';
import { readBrowserTtlCache, writeBrowserTtlCache } from './utils/apiCache.ts';
import { loadJournalFromStorage, saveJournalToStorage } from './utils/journal.ts';
import { formatWeatherConditionPt } from './utils/weatherFormat.ts';
import type {
  ActiveTab,
  JournalEntry,
  OfficialTrail,
  TravelModeOption,
  ValidatedPlace,
  WeatherResponseData,
} from './types/app.ts';

interface MapsConfig {
  mapsApiKey: string;
  mapId: string;
  configured: boolean;
}

const PLACES_BROWSER_CACHE_KEY = 'utinga360_places_cache_v1';
const PLACES_BROWSER_CACHE_TTL_MS = 30 * 60 * 1000;
const WEATHER_BROWSER_CACHE_KEY = 'utinga360_weather_cache_v1';
const WEATHER_BROWSER_CACHE_TTL_MS = 15 * 60 * 1000;
const FALLBACK_PARK_COORDINATES = computeRingCentroid(PARK_BOUNDARY_RING);

const NAV_ITEMS: Array<{ id: ActiveTab; label: string }> = [
  { id: 'mapa', label: 'Mapa' },
  { id: 'trilhas', label: 'Trilhas' },
  { id: 'ciclista', label: 'Ciclista' },
  { id: 'clima', label: 'Clima' },
  { id: 'diario', label: 'Diário' },
];

function NavIcon({ id }: { id: ActiveTab }) {
  switch (id) {
    case 'mapa':
      return <MapIcon className="w-5 h-5" aria-hidden="true" />;
    case 'trilhas':
      return <Compass className="w-5 h-5" aria-hidden="true" />;
    case 'ciclista':
      return <Bike className="w-5 h-5" aria-hidden="true" />;
    case 'clima':
      return <CloudRain className="w-5 h-5" aria-hidden="true" />;
    case 'diario':
      return <BookOpen className="w-5 h-5" aria-hidden="true" />;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('mapa');
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  const [mapsConfig, setMapsConfig] = useState<MapsConfig | null>(null);
  const [park, setPark] = useState<ValidatedPlace | null>(null);
  const [pois, setPois] = useState<ValidatedPlace[]>([]);
  const [placesLoading, setPlacesLoading] = useState(true);
  const [placesError, setPlacesError] = useState<string | null>(null);

  const [weather, setWeather] = useState<WeatherResponseData | null>(() =>
    typeof window !== 'undefined'
      ? readBrowserTtlCache<WeatherResponseData>(
          window.sessionStorage,
          WEATHER_BROWSER_CACHE_KEY
        )
      : null
  );
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  const [preferredTravelMode, setPreferredTravelMode] = useState<
    TravelModeOption | undefined
  >(undefined);

  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(() =>
    typeof window !== 'undefined'
      ? loadJournalFromStorage(window.localStorage)
      : []
  );

  const [guideOpen, setGuideOpen] = useState(false);
  const [guidePrompt, setGuidePrompt] = useState<string | null>(null);
  const [focusedInternalTrailId, setFocusedInternalTrailId] = useState<
    string | null
  >(null);

  // Listen for Demo Key quota exceeded events
  useEffect(() => {
    const onQuota = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  // Return scroll to top cleanly when changing primary tabs
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeTab]);

  // Load Maps configuration
  useEffect(() => {
    let active = true;
    const envKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
    const envMapId = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID').trim();

    fetch('/api/config/maps')
      .then((res) => res.json())
      .then((data: MapsConfig) => {
        if (!active) return;
        const resolvedKey = (data.mapsApiKey || envKey).trim();
        setMapsConfig({
          mapsApiKey: resolvedKey,
          mapId: data.mapId || envMapId || 'DEMO_MAP_ID',
          configured: Boolean(resolvedKey),
        });
      })
      .catch(() => {
        if (!active) return;
        setMapsConfig({
          mapsApiKey: envKey,
          mapId: envMapId || 'DEMO_MAP_ID',
          configured: Boolean(envKey),
        });
      });

    return () => {
      active = false;
    };
  }, []);

  // Fetch Places-validated park and POIs with browser TTL cache to preserve quota
  const fetchParkPlaces = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh && typeof window !== 'undefined') {
      const cached = readBrowserTtlCache<{
        park: ValidatedPlace | null;
        pois: ValidatedPlace[];
      }>(window.localStorage, PLACES_BROWSER_CACHE_KEY);
      if (cached?.park) {
        setPark(cached.park);
        setPois(Array.isArray(cached.pois) ? cached.pois : []);
        setPlacesLoading(false);
        setPlacesError(null);
        return;
      }
    }

    setPlacesLoading(true);
    setPlacesError(null);
    try {
      const res = await fetch(
        `/api/places/utinga${forceRefresh ? '?force=1' : ''}`
      );
      if (res.status === 429) {
        setQuotaExceeded(true);
      }
      const data = await res.json();
      if (!res.ok) {
        if (data?.code === 'QUOTA_EXCEEDED') {
          setQuotaExceeded(true);
        }
        setPlacesError(
          data?.error || 'Não foi possível validar o parque via Google Places API.'
        );
        return;
      }
      const nextPark = data.park || null;
      const nextPois = Array.isArray(data.pois) ? data.pois : [];
      setPlacesError(null);
      setPark(nextPark);
      setPois(nextPois);
      if (typeof window !== 'undefined' && nextPark) {
        writeBrowserTtlCache(
          window.localStorage,
          PLACES_BROWSER_CACHE_KEY,
          { park: nextPark, pois: nextPois },
          PLACES_BROWSER_CACHE_TTL_MS
        );
      }
    } catch {
      setPlacesError(
        'Erro de conexão ao consultar os pontos de interesse do Parque Estadual do Utinga.'
      );
    } finally {
      setPlacesLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchParkPlaces(false);
  }, [fetchParkPlaces]);

  const effectiveParkCoordinates = park?.location || FALLBACK_PARK_COORDINATES;

  // Lazy-fetch Weather only when the user opens the Clima tab (or triggers refresh)
  const fetchWeather = useCallback(
    async (lat: number, lng: number, forceRefresh = false) => {
      if (!forceRefresh && typeof window !== 'undefined') {
        const cached = readBrowserTtlCache<WeatherResponseData>(
          window.sessionStorage,
          WEATHER_BROWSER_CACHE_KEY
        );
        if (cached) {
          setWeather(cached);
          setWeatherError(null);
          return;
        }
      }

      setWeatherLoading(true);
      setWeatherError(null);
      try {
        const res = await fetch(
          `/api/weather?lat=${lat}&lng=${lng}${forceRefresh ? '&force=1' : ''}`
        );
        if (res.status === 429) {
          setQuotaExceeded(true);
        }
        const data = await res.json();
        if (!res.ok) {
          if (data?.code === 'QUOTA_EXCEEDED') {
            setQuotaExceeded(true);
          }
          setWeatherError(
            data?.error || 'Não foi possível obter os dados meteorológicos.'
          );
          return;
        }
        setWeatherError(null);
        setWeather(data);
        if (typeof window !== 'undefined') {
          writeBrowserTtlCache(
            window.sessionStorage,
            WEATHER_BROWSER_CACHE_KEY,
            data,
            WEATHER_BROWSER_CACHE_TTL_MS
          );
        }
      } catch {
        setWeatherError('Erro de conexão ao consultar a Google Weather API.');
      } finally {
        setWeatherLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (
      activeTab === 'clima' &&
      effectiveParkCoordinates &&
      !weather &&
      !weatherLoading &&
      !weatherError
    ) {
      void fetchWeather(
        effectiveParkCoordinates.lat,
        effectiveParkCoordinates.lng,
        false
      );
    }
  }, [
    activeTab,
    effectiveParkCoordinates,
    weather,
    weatherLoading,
    weatherError,
    fetchWeather,
  ]);

  const handleAddJournalEntry = (entry: JournalEntry) => {
    setJournalEntries((prev) => {
      const next = [entry, ...prev];
      saveJournalToStorage(window.localStorage, next);
      return next;
    });
  };

  const handleDeleteJournalEntry = (id: string) => {
    setJournalEntries((prev) => {
      const next = prev.filter((item) => item.id !== id);
      saveJournalToStorage(window.localStorage, next);
      return next;
    });
  };

  const handleAskGuideAboutTrail = (trail: OfficialTrail) => {
    setGuidePrompt(
      `Quero saber sobre a ${trail.name} (${formatMetersPtBr(
        trail.distanceMeters
      )}, dificuldade ${trail.difficulty}). Ela combina com quanto tempo disponível e quais cuidados devo observar?`
    );
    setGuideOpen(true);
  };

  const handleAskGuideCycling = () => {
    setGuidePrompt(
      'Pretendo pedalar na pista principal (~4 km). Quais opções tenho e quais recomendações devo seguir?'
    );
    setGuideOpen(true);
  };

  const localizedWeatherCondition = weather
    ? formatWeatherConditionPt(weather.conditionType, weather.conditionText)
    : null;

  const weatherSummaryText = weather
    ? `${localizedWeatherCondition}, temperatura ${
        weather.temperatureC !== null ? `${weather.temperatureC.toFixed(1)} °C` : 'n/d'
      }, chance de chuva ${
        weather.precipitationProbability !== null
          ? `${weather.precipitationProbability}%`
          : 'n/d'
      }, umidade ${
        weather.relativeHumidity !== null ? `${weather.relativeHumidity}%` : 'n/d'
      }, alertas ativos: ${weather.alerts.length}.`
    : null;

  const mapContent = (
    <ParkMapWorkspace
      mapId={mapsConfig?.mapId || 'DEMO_MAP_ID'}
      park={park}
      pois={pois}
      placesLoading={placesLoading}
      placesError={placesError}
      onRetryPlaces={() => void fetchParkPlaces(true)}
      preferredTravelMode={preferredTravelMode}
      focusedInternalTrailId={focusedInternalTrailId}
      onClearFocusedInternalTrail={() => setFocusedInternalTrailId(null)}
      onOpenCyclingMode={() => setActiveTab('ciclista')}
      onOpenTrailExplorer={() => setActiveTab('trilhas')}
    />
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#F4EFE6] text-[#1C241E] pb-20 md:pb-0">
      {/* Demo Key Quota Warning Banner (google-maps-platform Case A) */}
      {quotaExceeded && (
        <div className="bg-[#FBF0EA] border-b border-[#E8C5B4] text-[#7C2D12] px-4 py-2 text-xs md:text-sm text-center">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-[#64230D] hover:text-[#B44B1E]"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Top Bar Contract: Zone 1 (Brand) — Zone 2 (Nav) — Zone 3 (Primary CTA) */}
      <header className="sticky top-0 z-40 bg-[#FFFDF9]/95 backdrop-blur-md border-b border-[#DDD3C1]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 md:h-16 flex items-center justify-between gap-8">
          <a
            href="#inicio"
            aria-label="Utinga360 - Voltar ao mapa principal"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('mapa');
            }}
            className="inline-flex items-center rounded-lg focus-visible:outline-offset-4 whitespace-nowrap shrink-0"
          >
            <UtingaLogo />
          </a>

          <nav
            aria-label="Navegação principal"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-[#5E584D]"
          >
            {NAV_ITEMS.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`py-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'text-[#1B4332] border-[#C2592A] font-semibold'
                      : 'border-transparent hover:text-[#1C241E]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-[#B44B1E] hover:bg-[#943C16] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Guia Utinga</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="inicio" className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 sm:py-6">
        {activeTab === 'mapa' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
              <div className="lg:col-span-7 space-y-1.5">
                <p className="text-xs font-medium text-[#9A3B15]">
                  Belém do Pará · Parque Estadual do Utinga Camillo Vianna
                </p>
                <h1 className="text-2xl sm:text-3xl font-semibold text-[#1C241E] tracking-tight text-balance">
                  Utinga360 - Pedal &amp; Natureza
                </h1>
                <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-1 text-xs pt-0.5">
                  <button
                    type="button"
                    onClick={() => setActiveTab('ciclista')}
                    className="inline-flex items-center gap-1 font-medium text-[#0E7490] hover:underline transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Bike className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Pedal na Pista (~4 km)</span>
                  </button>
                  <span aria-hidden="true" className="hidden sm:inline text-[#DDD3C1]">
                    |
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('trilhas')}
                    className="inline-flex items-center gap-1 font-medium text-[#1B4332] hover:underline transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Compass className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>6 trilhas oficiais</span>
                  </button>
                  <span aria-hidden="true" className="hidden sm:inline text-[#DDD3C1]">
                    |
                  </span>
                  {weather ? (
                    <button
                      type="button"
                      onClick={() => setActiveTab('clima')}
                      className="text-[#5E584D] hover:text-[#0E7490] transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <span className="font-mono tabular-nums font-semibold text-[#1C241E]">
                        {weather.temperatureC !== null
                          ? `${weather.temperatureC.toFixed(1)} °C`
                          : ''}
                      </span>{' '}
                      · {localizedWeatherCondition} · Clima
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveTab('clima')}
                      data-testid="lazy-weather-shortcut"
                      className="font-medium text-[#5E584D] hover:text-[#0E7490] hover:underline transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Consultar clima no parque
                    </button>
                  )}
                </div>
              </div>

              <div className="lg:col-span-5 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setActiveTab('ciclista')}
                  className="group relative h-20 sm:h-24 rounded-xl overflow-hidden border border-[#DDD3C1] bg-[#1B4332] text-left cursor-pointer focus-visible:outline-offset-2"
                >
                  <img
                    src="/assets/images/utinga_canopy_hero_1794596576600.jpg"
                    alt="Ciclistas pedalando pela pista asfaltada do Parque do Utinga"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10" />
                  <div className="absolute inset-x-0 bottom-0 p-2.5 text-white">
                    <div className="flex items-center gap-1 text-[11px] font-medium text-[#B8E3EE]">
                      <Bike className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">Modo Ciclista</span>
                    </div>
                    <div className="text-xs sm:text-sm font-semibold leading-tight truncate">
                      Pedal ~4 km no parque
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('trilhas')}
                  className="group relative h-20 sm:h-24 rounded-xl overflow-hidden border border-[#DDD3C1] bg-[#1B4332] text-left cursor-pointer focus-visible:outline-offset-2"
                >
                  <img
                    src="/assets/images/utinga_trail_walk_1794596576881.jpg"
                    alt="Trilha ecológica na floresta amazônica do Parque do Utinga"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10" />
                  <div className="absolute inset-x-0 bottom-0 p-2.5 text-white">
                    <div className="flex items-center gap-1 text-[11px] font-medium text-[#F5D0BC]">
                      <Compass className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">Explorar Trilhas</span>
                    </div>
                    <div className="text-xs sm:text-sm font-semibold leading-tight truncate">
                      6 oficiais e 12 ramais
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {mapsConfig === null ? (
              <div
                aria-busy="true"
                className="h-[420px] lg:h-[620px] bg-[#FFFDF9] border border-[#DDD3C1] rounded-2xl flex items-center justify-center text-sm text-[#5E584D]"
              >
                Inicializando Google Maps Platform...
              </div>
            ) : mapsConfig.mapsApiKey ? (
              <APIProvider
                apiKey={mapsConfig.mapsApiKey}
                libraries={['marker', 'places', 'routes']}
                language="pt-BR"
                region="BR"
              >
                {mapContent}
              </APIProvider>
            ) : (
              <div className="bg-[#FFFDF9] border border-[#E8C5B4] rounded-2xl p-6 space-y-3">
                <h2 className="text-base font-semibold text-[#1C241E]">
                  Google Maps Platform aguardando chave configurada
                </h2>
                <p className="text-sm text-[#3B4239]">
                  Nenhuma chave do Google Maps Platform foi detectada no ambiente atual.
                  Conclua a ativação do Google Maps Platform no painel de configuração
                  para exibir o mapa interativo, pontos validados e rotas. Enquanto isso,
                  você pode explorar as trilhas oficiais, o modo ciclista e o diário de
                  visitas.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'trilhas' && (
          <TrailExplorer
            journalEntries={journalEntries}
            onAskGuideAboutTrail={handleAskGuideAboutTrail}
            onViewTrailOnMap={(internalTrailId) => {
              setFocusedInternalTrailId(internalTrailId);
              setActiveTab('mapa');
            }}
            onGoToJournal={() => setActiveTab('diario')}
          />
        )}

        {activeTab === 'ciclista' && (
          <CyclingModeView
            onAskGuideCycling={handleAskGuideCycling}
            onGoToMapRoute={() => {
              setPreferredTravelMode('BICYCLE');
              setActiveTab('mapa');
            }}
            onViewMainTrackOnMap={() => {
              setFocusedInternalTrailId('pista-principal');
              setActiveTab('mapa');
            }}
          />
        )}

        {activeTab === 'clima' && (
          <EnvironmentalWeatherView
            weather={weather}
            loading={weatherLoading}
            error={weatherError}
            parkCoordinates={effectiveParkCoordinates}
            onRefresh={() => {
              if (effectiveParkCoordinates) {
                void fetchWeather(
                  effectiveParkCoordinates.lat,
                  effectiveParkCoordinates.lng,
                  true
                );
              }
            }}
          />
        )}

        {activeTab === 'diario' && (
          <VisitJournalView
            entries={journalEntries}
            onAddEntry={handleAddJournalEntry}
            onDeleteEntry={handleDeleteJournalEntry}
            onAskGuideFromJournal={(prompt) => {
              setGuidePrompt(prompt);
              setGuideOpen(true);
            }}
          />
        )}
      </main>

      <SourcesFooter />

      {/* Mobile Bottom Navigation Bar (<= 64px, under 15% mobile sticky cap) */}
      <nav
        aria-label="Navegação inferior móvel"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-[#FFFDF9]/95 backdrop-blur-md border-t border-[#DDD3C1] grid grid-cols-5 items-center"
      >
        {NAV_ITEMS.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                active ? 'text-[#B44B1E] font-semibold' : 'text-[#5E584D]'
              }`}
            >
              <NavIcon id={item.id} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Guia Utinga Gemini Assistant Drawer */}
      <GuiaUtingaDrawer
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        initialPrompt={guidePrompt}
        onConsumeInitialPrompt={() => setGuidePrompt(null)}
        weatherContext={weatherSummaryText}
        parkAddress={park?.formattedAddress || null}
        mapPois={pois}
        parkCoordinates={effectiveParkCoordinates}
        onFocusTrailOnMap={(internalTrailId) => {
          setFocusedInternalTrailId(internalTrailId);
          setActiveTab('mapa');
          setGuideOpen(false);
        }}
      />
    </div>
  );
}
