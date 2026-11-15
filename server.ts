import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import {
  CYCLING_MODE_INFO,
  OFFICIAL_SOURCE_ORG,
  OFFICIAL_SOURCE_URL,
  OFFICIAL_TRAILS,
  PARK_OFFICIAL_NAME,
} from './src/data/parkData.ts';
import { INTERNAL_TRAIL_GEOMETRIES } from './src/data/internalTrailsGeo.ts';
import { TtlCache } from './src/utils/apiCache.ts';
import {
  extractPlaceSearchQuery,
  inferChatTravelMode,
  shouldComputeRouteForQuestion,
} from './src/utils/chatLookup.ts';
import { sanitizeHttpUrl } from './src/utils/markdown.ts';
import {
  buildGeminiAttemptConfigs,
  classifyGeminiAttemptError,
} from './src/utils/geminiFallback.ts';
import { matchInternalTrailIdsFromText } from './src/utils/trails.ts';
import type {
  DailyWeatherItem,
  GroundingSource,
  HourlyWeatherItem,
  SupportPoiCategory,
  ValidatedPlace,
  WeatherAlertItem,
  WeatherResponseData,
} from './src/types/app.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const GMP_SOLUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';

function getMapsApiKey(): string {
  return (
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    ''
  ).trim();
}

function getMapsMapId(): string {
  return (process.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID').trim();
}

function isQuotaStatus(status: number, bodyText: string): boolean {
  return (
    status === 429 ||
    bodyText.includes('RESOURCE_EXHAUSTED') ||
    bodyText.includes('OVER_QUERY_LIMIT')
  );
}

class UpstreamHttpError extends Error {
  status: number;
  code: string;
  isQuota: boolean;

  constructor(status: number, code: string, message: string, isQuota = false) {
    super(message);
    this.status = status;
    this.code = code;
    this.isQuota = isQuota;
  }
}

const PLACES_MAIN_TTL_MS = 60 * 60 * 1000; // 60 min
const PLACES_SUPPORT_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const PLACES_CHAT_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const PLACES_PHOTO_TTL_MS = 30 * 60 * 1000; // 30 min
const ROUTES_TTL_MS = 10 * 60 * 1000; // 10 min
const WEATHER_TTL_MS = 20 * 60 * 1000; // 20 min

const placesMainCache = new TtlCache<{
  park: ValidatedPlace;
  pois: ValidatedPlace[];
  fetchedAt: string;
}>(4);
const placesSupportCache = new TtlCache<{
  category: SupportPoiCategory;
  pois: ValidatedPlace[];
}>(24);
const placesChatCache = new TtlCache<ValidatedPlace[]>(50);
const placesPhotoCache = new TtlCache<string>(100);
const routesCache = new TtlCache<any>(100);
const weatherCache = new TtlCache<WeatherResponseData>(12);

function normalizeAuthorUri(uri: unknown): string | undefined {
  if (typeof uri !== 'string' || !uri.trim()) return undefined;
  const trimmed = uri.trim();
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return trimmed;
}

function mapPlaceItem(
  raw: Record<string, any>,
  isParkMain = false,
  supportCategory?: SupportPoiCategory
): ValidatedPlace | null {
  const loc = raw.location;
  if (!loc || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') {
    return null;
  }

  const firstPhoto = Array.isArray(raw.photos) ? raw.photos[0] : null;
  const firstAttr =
    firstPhoto && Array.isArray(firstPhoto.authorAttributions)
      ? firstPhoto.authorAttributions[0]
      : null;

  const acc = raw.accessibilityOptions;
  const accessibility =
    acc && typeof acc === 'object'
      ? {
          wheelchairAccessibleEntrance:
            typeof acc.wheelchairAccessibleEntrance === 'boolean'
              ? acc.wheelchairAccessibleEntrance
              : undefined,
          wheelchairAccessibleParking:
            typeof acc.wheelchairAccessibleParking === 'boolean'
              ? acc.wheelchairAccessibleParking
              : undefined,
          wheelchairAccessibleRestroom:
            typeof acc.wheelchairAccessibleRestroom === 'boolean'
              ? acc.wheelchairAccessibleRestroom
              : undefined,
        }
      : undefined;

  return {
    id: String(raw.id || raw.name || ''),
    name: String(raw.displayName?.text || 'Local no Parque Estadual do Utinga'),
    formattedAddress: String(raw.formattedAddress || 'Belém - PA'),
    location: {
      lat: loc.latitude,
      lng: loc.longitude,
    },
    primaryType: typeof raw.primaryType === 'string' ? raw.primaryType : undefined,
    primaryTypeLabel:
      typeof raw.primaryTypeDisplayName?.text === 'string'
        ? raw.primaryTypeDisplayName.text
        : undefined,
    types: Array.isArray(raw.types) ? raw.types : [],
    googleMapsUri: typeof raw.googleMapsUri === 'string' ? raw.googleMapsUri : undefined,
    rating: typeof raw.rating === 'number' ? raw.rating : undefined,
    userRatingCount:
      typeof raw.userRatingCount === 'number' ? raw.userRatingCount : undefined,
    openNow:
      typeof raw.currentOpeningHours?.openNow === 'boolean'
        ? raw.currentOpeningHours.openNow
        : undefined,
    weekdayDescriptions: Array.isArray(raw.regularOpeningHours?.weekdayDescriptions)
      ? raw.regularOpeningHours.weekdayDescriptions
      : undefined,
    photo:
      firstPhoto && typeof firstPhoto.name === 'string'
        ? {
            name: firstPhoto.name,
            widthPx: typeof firstPhoto.widthPx === 'number' ? firstPhoto.widthPx : undefined,
            heightPx: typeof firstPhoto.heightPx === 'number' ? firstPhoto.heightPx : undefined,
            authorName:
              typeof firstAttr?.displayName === 'string'
                ? firstAttr.displayName
                : undefined,
            authorUri: normalizeAuthorUri(firstAttr?.uri),
          }
        : undefined,
    accessibility,
    isParkMain,
    supportCategory,
  };
}

async function placesTextSearch(
  apiKey: string,
  textQuery: string,
  fieldMask: string,
  extraBody: Record<string, unknown> = {}
): Promise<{ status: number; data: any; rawText: string }> {
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask,
      'X-Goog-Maps-Solution-ID': GMP_SOLUTION_ID,
    },
    body: JSON.stringify({
      textQuery,
      languageCode: 'pt-BR',
      regionCode: 'BR',
      ...extraBody,
    }),
  });
  const rawText = await response.text();
  let data: any = null;
  try {
    data = JSON.parse(rawText);
  } catch {
    data = null;
  }
  return { status: response.status, data, rawText };
}

async function placesNearbySearch(
  apiKey: string,
  lat: number,
  lng: number,
  radiusMeters: number,
  fieldMask: string
): Promise<{ status: number; data: any; rawText: string }> {
  const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask,
      'X-Goog-Maps-Solution-ID': GMP_SOLUTION_ID,
    },
    body: JSON.stringify({
      includedTypes: ['park', 'tourist_attraction', 'hiking_area', 'visitor_center', 'bicycle_store'],
      maxResultCount: 15,
      rankPreference: 'DISTANCE',
      languageCode: 'pt-BR',
      regionCode: 'BR',
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusMeters,
        },
      },
    }),
  });
  const rawText = await response.text();
  let data: any = null;
  try {
    data = JSON.parse(rawText);
  } catch {
    data = null;
  }
  return { status: response.status, data, rawText };
}

const EXCLUDED_POI_TYPES = new Set([
  'dog_park',
  'pet_store',
  'veterinary_care',
  'real_estate_agency',
  'apartment_building',
  'apartment_complex',
  'condominium_complex',
  'lodging',
]);

const EXCLUDED_NAME_RE = /\b(canino|asdeco|condom[ií]nio|residencial|pet\s*shop)\b/i;

function isRelevantUtingaPoi(place: ValidatedPlace): boolean {
  if (place.isParkMain) return true;
  if (place.primaryType && EXCLUDED_POI_TYPES.has(place.primaryType)) return false;
  if (place.types.some((t) => EXCLUDED_POI_TYPES.has(t))) return false;
  if (EXCLUDED_NAME_RE.test(place.name)) return false;
  return true;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientGeminiError(err: any): boolean {
  const status = typeof err?.status === 'number' ? err.status : 0;
  const msg = String(err?.message || err || '');
  return (
    status === 503 ||
    status === 429 ||
    status === 500 ||
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand') ||
    msg.includes('RESOURCE_EXHAUSTED')
  );
}

function formatGeminiErrorPt(err: any): { status: number; message: string } {
  const rawMsg = String(err?.message || err || '');
  const numericStatus = typeof err?.status === 'number' ? err.status : 500;

  if (
    numericStatus === 503 ||
    rawMsg.includes('UNAVAILABLE') ||
    rawMsg.includes('high demand')
  ) {
    return {
      status: 503,
      message:
        'O Guia Utinga está passando por alta demanda no momento. Aguarde alguns segundos e clique em Tentar novamente.',
    };
  }
  if (numericStatus === 429 || rawMsg.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message:
        'Limite temporário de solicitações ao Guia Utinga atingido. Aguarde um instante e tente novamente.',
    };
  }
  if (
    numericStatus === 400 ||
    numericStatus === 403 ||
    rawMsg.includes('API_KEY_INVALID') ||
    rawMsg.includes('PERMISSION_DENIED')
  ) {
    return {
      status: numericStatus === 403 ? 403 : 400,
      message:
        'Não foi possível autenticar com a API Gemini. Verifique a chave configurada no painel Settings > Secrets.',
    };
  }
  return {
    status: numericStatus >= 400 && numericStatus < 600 ? numericStatus : 502,
    message: 'Não foi possível concluir a resposta do Guia Utinga agora. Tente novamente.',
  };
}

interface ChatMapPoiInput {
  id?: string;
  name?: string;
  formattedAddress?: string;
  primaryTypeLabel?: string;
  lat?: number;
  lng?: number;
}

interface ChatComputedRouteContext {
  destinationName: string;
  travelMode: 'BICYCLE' | 'WALK' | 'DRIVE';
  distanceMeters: number;
  durationSeconds: number;
  steps: Array<{ instruction: string; distanceMeters: number }>;
}

async function lookupPlacesAndRouteForChat(
  placeQuery: string,
  userMessage: string,
  centerLat: number,
  centerLng: number
): Promise<{
  places: ValidatedPlace[];
  routeSummary: ChatComputedRouteContext | null;
}> {
  const apiKey = getMapsApiKey();
  if (!apiKey || !placeQuery.trim()) {
    return { places: [], routeSummary: null };
  }

  const normalizedQuery = placeQuery.trim().toLowerCase();
  const mask = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.location',
    'places.primaryType',
    'places.primaryTypeDisplayName',
    'places.types',
    'places.googleMapsUri',
    'places.rating',
    'places.userRatingCount',
    'places.currentOpeningHours.openNow',
  ].join(',');

  let foundPlaces: ValidatedPlace[] = [];
  try {
    const cached = await placesChatCache.runDeduplicated(
      `${normalizedQuery}:${centerLat.toFixed(3)}:${centerLng.toFixed(3)}`,
      PLACES_CHAT_TTL_MS,
      async () => {
        const res = await placesTextSearch(
          apiKey,
          `${placeQuery} próximo ao Parque Estadual do Utinga Belém PA`,
          mask,
          {
            pageSize: 4,
            locationBias: {
              circle: {
                center: { latitude: centerLat, longitude: centerLng },
                radius: 10000,
              },
            },
          }
        );
        if (res.status >= 400) {
          throw new UpstreamHttpError(
            res.status,
            'CHAT_PLACES_ERROR',
            'Falha na busca sob demanda de Places',
            isQuotaStatus(res.status, res.rawText)
          );
        }
        const rawList: any[] = Array.isArray(res.data?.places) ? res.data.places : [];
        return rawList
          .map((item) => mapPlaceItem(item, false))
          .filter((p): p is ValidatedPlace => Boolean(p && p.id));
      },
      {
        allowStaleOnError: () => true,
      }
    );
    foundPlaces = cached.value;
  } catch {
    foundPlaces = [];
  }

  let routeSummary: ChatComputedRouteContext | null = null;
  const primaryTarget = foundPlaces[0];

  if (primaryTarget && shouldComputeRouteForQuestion(userMessage)) {
    const mode = inferChatTravelMode(userMessage);
    const routeKey = `chat:${centerLat.toFixed(4)},${centerLng.toFixed(4)}:${primaryTarget.location.lat.toFixed(4)},${primaryTarget.location.lng.toFixed(4)}:${mode}`;

    try {
      const cachedRoute = await routesCache.runDeduplicated(
        routeKey,
        ROUTES_TTL_MS,
        async () => {
          const response = await fetch(
            'https://routes.googleapis.com/directions/v2:computeRoutes',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask':
                  'routes.duration,routes.distanceMeters,routes.legs.steps.navigationInstruction,routes.legs.steps.distanceMeters',
                'X-Goog-Maps-Solution-ID': GMP_SOLUTION_ID,
              },
              body: JSON.stringify({
                origin: {
                  location: {
                    latLng: { latitude: centerLat, longitude: centerLng },
                  },
                },
                destination: {
                  location: {
                    latLng: {
                      latitude: primaryTarget.location.lat,
                      longitude: primaryTarget.location.lng,
                    },
                  },
                },
                travelMode: mode,
                languageCode: 'pt-BR',
                units: 'METRIC',
              }),
            }
          );

          const rawText = await response.text();
          if (!response.ok) {
            throw new UpstreamHttpError(
              response.status,
              'CHAT_ROUTE_ERROR',
              'Falha ao calcular rota para chat',
              isQuotaStatus(response.status, rawText)
            );
          }

          const data = JSON.parse(rawText);
          const firstRoute = data?.routes?.[0];
          if (!firstRoute) {
            throw new UpstreamHttpError(404, 'NO_ROUTE', 'Sem rota');
          }
          const durationSeconds = Number(
            String(firstRoute.duration || '0s').replace('s', '')
          );
          const rawSteps: any[] = Array.isArray(firstRoute.legs?.[0]?.steps)
            ? firstRoute.legs[0].steps
            : [];

          return {
            distanceMeters: Number(firstRoute.distanceMeters || 0),
            durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
            steps: rawSteps.slice(0, 8).map((s) => ({
              instruction: String(
                s.navigationInstruction?.instructions || 'Siga pelo trajeto'
              ),
              distanceMeters: Number(s.distanceMeters || 0),
            })),
          };
        },
        { allowStaleOnError: () => true }
      );

      if (cachedRoute.value) {
        routeSummary = {
          destinationName: primaryTarget.name,
          travelMode: mode,
          distanceMeters: cachedRoute.value.distanceMeters,
          durationSeconds: cachedRoute.value.durationSeconds,
          steps: Array.isArray(cachedRoute.value.steps)
            ? cachedRoute.value.steps
            : [],
        };
      }
    } catch {
      routeSummary = null;
    }
  }

  return { places: foundPlaces, routeSummary };
}

function buildGuiaUtingaSystemPrompt(
  weatherContext?: string | null,
  parkAddress?: string | null,
  mapPois: ChatMapPoiInput[] = [],
  searchedPlaces: ValidatedPlace[] = [],
  computedRouteSummary: ChatComputedRouteContext | null = null
): string {
  const trailsBlock = OFFICIAL_TRAILS.map(
    (t) =>
      `- ${t.name}: extensão oficial de ${t.distanceMeters} metros, dificuldade ${t.difficulty}. ${t.publishedSummary} Observação de georreferenciamento: ${t.nonGeoreferencedNote}`
  ).join('\n');

  const osmTrailsBlock = INTERNAL_TRAIL_GEOMETRIES.map((t) => {
    const lengthInfo = t.officialMeters
      ? `~${t.osmLengthMeters} m no OSM (oficial: ${t.officialMeters} m)`
      : `~${t.osmLengthMeters} m no OSM`;
    return `- ${t.name} [${t.category} | ${t.surfaceLabel} | ${lengthInfo}]: ${t.note}`;
  }).join('\n');

  const validMapPois = mapPois
    .filter((p) => p && typeof p.name === 'string' && p.name.trim().length > 0)
    .slice(0, 18);

  const mapPoisBlock =
    validMapPois.length > 0
      ? validMapPois
          .map((p) => {
            const coords =
              typeof p.lat === 'number' && typeof p.lng === 'number'
                ? ` (${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})`
                : '';
            const typeText = p.primaryTypeLabel ? ` [${p.primaryTypeLabel}]` : '';
            const addrText = p.formattedAddress ? ` — ${p.formattedAddress}` : '';
            return `- ${p.name}${typeText}${addrText}${coords}`;
          })
          .join('\n')
      : '- Nenhum POI adicional do Google Places carregado no mapa neste instante.';

  const searchedPlacesBlock =
    searchedPlaces.length > 0
      ? searchedPlaces
          .map((p) => {
            const ratingText =
              typeof p.rating === 'number'
                ? ` | Nota ${p.rating.toFixed(1)} (${p.userRatingCount || 0} avaliações)`
                : '';
            const openText =
              typeof p.openNow === 'boolean'
                ? p.openNow
                  ? ' | Aberto agora'
                  : ' | Fechado no momento'
                : '';
            return `- **${p.name}** (${p.primaryTypeLabel || 'Local'}) — Endereço real: ${p.formattedAddress} | Coordenadas: ${p.location.lat.toFixed(5)}, ${p.location.lng.toFixed(5)}${ratingText}${openText}`;
          })
          .join('\n')
      : '- Nenhuma busca extra no Google Places foi retornada para esta pergunta.';

  const routeBlock = computedRouteSummary
    ? `ROTA REAL CALCULADA VIA GOOGLE ROUTES API (${computedRouteSummary.travelMode} até ${computedRouteSummary.destinationName}):
- Distância estimada: ${(computedRouteSummary.distanceMeters / 1000).toFixed(2)} km (${computedRouteSummary.distanceMeters} m)
- Tempo estimado: ~${Math.max(1, Math.round(computedRouteSummary.durationSeconds / 60))} min
- Etapas principais:
${computedRouteSummary.steps
  .map((s, idx) => `  ${idx + 1}. ${s.instruction} (${s.distanceMeters} m)`)
  .join('\n')}`
    : '';

  return `Você é o "Guia Utinga", assistente conversacional do aplicativo Utinga360 - Pedal & Natureza, dedicado ao ${PARK_OFFICIAL_NAME}, em Belém do Pará, e aos seus acessos cicloviários e pontos de apoio no entorno.

REGRAS OBRIGATÓRIAS:
1. Responda sempre em português do Brasil, de forma clara, acolhedora, objetiva e bem formatada em Markdown simples (títulos curtos com ###, listas com - ou 1., negrito com **).
2. Ao dar recomendações personalizadas de passeio/trilha dentro do parque, confirme ou considere os 3 critérios essenciais (tempo disponível, modalidade — caminhar ou pedalar — e dificuldade: Fácil, Média ou Difícil) e explique o porquê da escolha. Já para perguntas objetivas de localização, rotas ou "como chegar" (como pontos no entorno, acessos ou lanchonetes/paradas de ciclistas), responda diretamente sem travar a resposta exigindo os 3 critérios antes.
3. Separe com total transparência a fonte de cada informação:
   a) **Dentro do parque (trilhas e pista principal)**: baseie-se EXCLUSIVAMENTE nos dados oficiais do IDEFLOR-Bio e nos traçados georreferenciados do OpenStreetMap listados abaixo. NUNCA invente trilhas oficiais internas inexistentes.
   b) **Pontos externos, acessos, arredores e paradas de ciclistas (ex.: Bar do Lulu, Portaria/Entrada, Centro de Acolhimento, bicicletarias, restaurantes/lanchonetes no entorno do Utinga / Guanabara / Águas Lindas / Curió-Utinga)**: utilize prioritariamente os dados reais da seção "BUSCA AO VIVO NO GOOGLE PLACES" e "ROTA REAL CALCULADA VIA GOOGLE ROUTES API" abaixo (além da ferramenta Google Maps se disponível e dos POIs do mapa). NUNCA invente nomes de ruas, endereços ou trajetos se eles não estiverem nos dados validados abaixo!
4. Deixe claro quais traçados estão georreferenciados no mapa interativo do app (Pista Principal ~4 km, Castanheira, Patuá/Patauá, Orla do Lago Bolonha, Trilha do Macaco, Mariana, Moça Bonita, Entorno do Lago Água Preta e trechos parciais de Bolonha, Acapú e Amapá).
5. Nunca interprete previsão meteorológica como garantia de segurança. Sempre oriente a observar as condições locais e recomendações da gestão do parque.
6. Se o visitante quiser ir de bicicleta às trilhas internas de terra (Amapá, Bolonha, Acapú, Castanheira, Água Preta ou Patuá), explique que essas trilhas são voltadas para caminhada ecológica; dentro do parque, a via cadastrada para pedalar é a Pista Principal pavimentada (~4 km).
7. Se os dados abaixo confirmarem o local e o trajeto, cite o endereço exato, distância/tempo estimado e as principais vias retornadas de forma objetiva, lembrando quando o ponto fica fora dos limites internos do parque. Caso não haja resultado confirmado, admita com transparência o que não foi possível confirmar.

DADOS OFICIAIS CADASTRADOS (Fonte: ${OFFICIAL_SOURCE_ORG} — ${OFFICIAL_SOURCE_URL}):
Trilhas Oficiais:
${trailsBlock}

TRAÇADOS GEORREFERENCIADOS NO MAPA DO APP (OpenStreetMap — ODbL):
${osmTrailsBlock}

Modo Ciclista (Pista Principal):
- Extensão aproximada: ${CYCLING_MODE_INFO.approximateTrackLengthLabel} (via pavimentada principal).
- Regras de circulação:
  * Ciclistas: ${CYCLING_MODE_INFO.circulationRules[0].detail}
  * Pedestres: ${CYCLING_MODE_INFO.circulationRules[1].detail}
- Recomendações de segurança: ${CYCLING_MODE_INFO.safetyRecommendations.join(' | ')}

PONTOS ATUALMENTE CARREGADOS NO MAPA DO USUÁRIO (Google Places / Mapa):
${mapPoisBlock}

BUSCA AO VIVO NO GOOGLE PLACES PARA A PERGUNTA ATUAL:
${searchedPlacesBlock}
${routeBlock ? `\n${routeBlock}\n` : ''}
Contexto atual validado:
- Endereço / entrada identificada no mapa: ${parkAddress || 'Parque Estadual do Utinga Camillo Vianna, Av. João Paulo II, s/n — Curió-Utinga, Belém - PA'}
- Condições meteorológicas informadas ao usuário: ${weatherContext || 'Não carregadas nesta conversa ou indisponíveis no momento (não assuma tempo bom).'}`;
}

async function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'utinga360' });
  });

  app.get('/api/config/maps', (_req: Request, res: Response) => {
    const mapsApiKey = getMapsApiKey();
    res.json({
      mapsApiKey,
      mapId: getMapsMapId(),
      configured: Boolean(mapsApiKey),
    });
  });

  app.get('/api/places/utinga', async (req: Request, res: Response) => {
    const apiKey = getMapsApiKey();
    if (!apiKey) {
      res.status(503).json({
        error: 'Chave da API do Google Maps Platform não configurada no ambiente do servidor.',
        code: 'MAPS_NOT_CONFIGURED',
      });
      return;
    }

    const forceRefresh = req.query.force === '1';

    const fieldMask = [
      'places.id',
      'places.displayName',
      'places.formattedAddress',
      'places.location',
      'places.primaryType',
      'places.primaryTypeDisplayName',
      'places.types',
      'places.googleMapsUri',
      'places.rating',
      'places.userRatingCount',
      'places.currentOpeningHours.openNow',
      'places.regularOpeningHours.weekdayDescriptions',
      'places.accessibilityOptions',
      'places.photos',
    ].join(',');

    try {
      const cached = await placesMainCache.runDeduplicated(
        'utinga-main',
        PLACES_MAIN_TTL_MS,
        async () => {
          const mainRes = await placesTextSearch(
            apiKey,
            'Parque Estadual do Utinga Camillo Vianna Belém PA',
            fieldMask,
            { pageSize: 5 }
          );

          if (mainRes.status >= 400) {
            if (isQuotaStatus(mainRes.status, mainRes.rawText)) {
              throw new UpstreamHttpError(
                429,
                'QUOTA_EXCEEDED',
                'Limite de cota da Places API atingido no momento.',
                true
              );
            }
            throw new UpstreamHttpError(
              mainRes.status,
              'PLACES_API_ERROR',
              mainRes.data?.error?.message || `Erro na Places API (${mainRes.status}).`,
              false
            );
          }

          const rawPlaces: any[] = Array.isArray(mainRes.data?.places)
            ? mainRes.data.places
            : [];
          const parkPlaceRaw =
            rawPlaces.find((p) =>
              String(p.displayName?.text || '').toLowerCase().includes('utinga')
            ) || rawPlaces[0];

          const park = parkPlaceRaw ? mapPlaceItem(parkPlaceRaw, true) : null;
          if (!park) {
            throw new UpstreamHttpError(
              404,
              'PARK_NOT_FOUND',
              'Não foi possível localizar o Parque Estadual do Utinga na Places API.',
              false
            );
          }

          const nearbyMask = [
            'places.id',
            'places.displayName',
            'places.formattedAddress',
            'places.location',
            'places.primaryType',
            'places.primaryTypeDisplayName',
            'places.types',
            'places.googleMapsUri',
            'places.rating',
            'places.userRatingCount',
            'places.currentOpeningHours.openNow',
            'places.accessibilityOptions',
            'places.photos',
          ].join(',');

          // Consolidated from 3 secondary calls to 2 parallel calls to preserve quota
          const [nearbyRes, landmarksRes] = await Promise.all([
            placesNearbySearch(
              apiKey,
              park.location.lat,
              park.location.lng,
              2600,
              nearbyMask
            ),
            placesTextSearch(
              apiKey,
              'Centro de Acolhimento Recanto da Volta Lago Bolonha Lago Água Preta Parque do Utinga Belém',
              nearbyMask,
              {
                pageSize: 10,
                locationBias: {
                  circle: {
                    center: { latitude: park.location.lat, longitude: park.location.lng },
                    radius: 3800,
                  },
                },
              }
            ),
          ]);

          const seenIds = new Set<string>([park.id]);
          const pois: ValidatedPlace[] = [park];

          const combined = [
            ...(Array.isArray(landmarksRes.data?.places) ? landmarksRes.data.places : []),
            ...(Array.isArray(nearbyRes.data?.places) ? nearbyRes.data.places : []),
          ];

          for (const item of combined) {
            if (pois.length >= 12) break;
            const mapped = mapPlaceItem(item, false);
            if (!mapped || !mapped.id || seenIds.has(mapped.id)) continue;
            if (!isRelevantUtingaPoi(mapped)) continue;
            seenIds.add(mapped.id);
            pois.push(mapped);
          }

          return {
            park,
            pois,
            fetchedAt: new Date().toISOString(),
          };
        },
        {
          forceRefresh,
          allowStaleOnError: (err) =>
            err instanceof UpstreamHttpError && (err.isQuota || err.status >= 500),
        }
      );

      res.setHeader('Cache-Control', 'public, max-age=1800');
      res.json({
        ...cached.value,
        stale: cached.stale,
      });
    } catch (err) {
      if (err instanceof UpstreamHttpError) {
        res.status(err.status).json({ error: err.message, code: err.code });
        return;
      }
      res.status(502).json({
        error:
          err instanceof Error
            ? `Falha de conexão com a Places API: ${err.message}`
            : 'Falha de conexão com a Places API.',
        code: 'PLACES_NETWORK_ERROR',
      });
    }
  });

  app.get('/api/places/photo', async (req: Request, res: Response) => {
    const apiKey = getMapsApiKey();
    if (!apiKey) {
      res.status(503).json({ error: 'Maps API não configurada.', code: 'MAPS_NOT_CONFIGURED' });
      return;
    }

    const name = String(req.query.name || '').trim();
    if (!/^places\/[^/]+\/photos\/[^/]+$/.test(name)) {
      res.status(400).json({ error: 'Identificador de foto inválido.', code: 'INVALID_PHOTO_NAME' });
      return;
    }

    try {
      const cached = await placesPhotoCache.runDeduplicated(
        name,
        PLACES_PHOTO_TTL_MS,
        async () => {
          const mediaUrl = new URL(`https://places.googleapis.com/v1/${name}/media`);
          mediaUrl.searchParams.set('maxWidthPx', '640');
          mediaUrl.searchParams.set('maxHeightPx', '420');
          mediaUrl.searchParams.set('skipHttpRedirect', 'true');

          const response = await fetch(mediaUrl.toString(), {
            headers: {
              'X-Goog-Api-Key': apiKey,
              'X-Goog-Maps-Solution-ID': GMP_SOLUTION_ID,
            },
          });
          const rawText = await response.text();
          if (!response.ok) {
            if (isQuotaStatus(response.status, rawText)) {
              throw new UpstreamHttpError(429, 'QUOTA_EXCEEDED', 'Cota da Places API atingida.', true);
            }
            throw new UpstreamHttpError(response.status, 'PHOTO_UNAVAILABLE', 'Foto indisponível.', false);
          }

          const data = JSON.parse(rawText);
          if (typeof data?.photoUri === 'string' && data.photoUri.startsWith('https://')) {
            return data.photoUri;
          }
          throw new UpstreamHttpError(404, 'PHOTO_NOT_FOUND', 'URI de foto não encontrada.', false);
        },
        {
          allowStaleOnError: (err) =>
            err instanceof UpstreamHttpError && (err.isQuota || err.status >= 500),
        }
      );

      res.setHeader('Cache-Control', 'public, max-age=1800');
      res.redirect(302, cached.value);
    } catch (err) {
      if (err instanceof UpstreamHttpError) {
        res.status(err.status).json({ error: err.message, code: err.code });
        return;
      }
      res.status(502).json({ error: 'Falha ao carregar foto do local.', code: 'PHOTO_NETWORK_ERROR' });
    }
  });

  app.get('/api/places/support', async (req: Request, res: Response) => {
    const apiKey = getMapsApiKey();
    if (!apiKey) {
      res.status(503).json({ error: 'Maps API não configurada.', code: 'MAPS_NOT_CONFIGURED' });
      return;
    }

    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const category = String(req.query.category || '') as SupportPoiCategory;
    const categoryTypesMap: Record<SupportPoiCategory, string[]> = {
      bicycle_store: ['bicycle_store'],
      parking: ['parking'],
      bus_station: ['bus_station', 'transit_station'],
    };

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !categoryTypesMap[category]) {
      res.status(400).json({ error: 'Parâmetros inválidos para busca de apoio.', code: 'INVALID_SUPPORT_QUERY' });
      return;
    }

    const mask = [
      'places.id',
      'places.displayName',
      'places.formattedAddress',
      'places.location',
      'places.primaryType',
      'places.primaryTypeDisplayName',
      'places.types',
      'places.googleMapsUri',
      'places.rating',
      'places.userRatingCount',
      'places.currentOpeningHours.openNow',
    ].join(',');

    const cacheKey = `${lat.toFixed(3)}:${lng.toFixed(3)}:${category}`;

    try {
      const cached = await placesSupportCache.runDeduplicated(
        cacheKey,
        PLACES_SUPPORT_TTL_MS,
        async () => {
          const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask': mask,
              'X-Goog-Maps-Solution-ID': GMP_SOLUTION_ID,
            },
            body: JSON.stringify({
              includedTypes: categoryTypesMap[category],
              maxResultCount: 8,
              rankPreference: 'DISTANCE',
              languageCode: 'pt-BR',
              regionCode: 'BR',
              locationRestriction: {
                circle: {
                  center: { latitude: lat, longitude: lng },
                  radius: 2400,
                },
              },
            }),
          });

          const rawText = await response.text();
          if (!response.ok) {
            if (isQuotaStatus(response.status, rawText)) {
              throw new UpstreamHttpError(429, 'QUOTA_EXCEEDED', 'Limite de cota da Places API atingido.', true);
            }
            throw new UpstreamHttpError(response.status, 'SUPPORT_API_ERROR', 'Erro ao buscar pontos de apoio.', false);
          }

          const data = JSON.parse(rawText);
          const rawList: any[] = Array.isArray(data?.places) ? data.places : [];
          const pois: ValidatedPlace[] = [];
          for (const item of rawList) {
            const mapped = mapPlaceItem(item, false, category);
            if (mapped && mapped.id) pois.push(mapped);
          }

          return { category, pois };
        },
        {
          allowStaleOnError: (err) =>
            err instanceof UpstreamHttpError && (err.isQuota || err.status >= 500),
        }
      );

      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.json({ ...cached.value, stale: cached.stale });
    } catch (err) {
      if (err instanceof UpstreamHttpError) {
        res.status(err.status).json({ error: err.message, code: err.code });
        return;
      }
      res.status(502).json({ error: 'Erro de rede ao buscar pontos de apoio.', code: 'SUPPORT_NETWORK_ERROR' });
    }
  });

  app.post('/api/routes/compute', async (req: Request, res: Response) => {
    const apiKey = getMapsApiKey();
    if (!apiKey) {
      res.status(503).json({
        error: 'Chave da API do Google Maps Platform não configurada.',
        code: 'MAPS_NOT_CONFIGURED',
      });
      return;
    }

    const { origin, destination, travelMode } = req.body || {};
    if (
      !origin ||
      !destination ||
      typeof destination.lat !== 'number' ||
      typeof destination.lng !== 'number'
    ) {
      res.status(400).json({
        error: 'Origem e coordenadas de destino são obrigatórias.',
        code: 'INVALID_ROUTE_REQUEST',
      });
      return;
    }

    const restTravelModeMap: Record<string, string> = {
      DRIVE: 'DRIVE',
      BICYCLE: 'BICYCLE',
      WALK: 'WALK',
      TRANSIT: 'TRANSIT',
    };
    const mode = restTravelModeMap[String(travelMode || 'DRIVE')] || 'DRIVE';

    const originWaypoint =
      typeof origin === 'string'
        ? { address: origin }
        : typeof origin?.lat === 'number' && typeof origin?.lng === 'number'
          ? { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } }
          : null;

    if (!originWaypoint) {
      res.status(400).json({ error: 'Formato de origem inválido.', code: 'INVALID_ORIGIN' });
      return;
    }

    const originCacheKey =
      typeof origin === 'string'
        ? origin.trim().toLowerCase()
        : `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}`;
    const routeCacheKey = `${originCacheKey}:${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}:${mode}`;

    try {
      const cached = await routesCache.runDeduplicated(
        routeCacheKey,
        ROUTES_TTL_MS,
        async () => {
          const response = await fetch(
            'https://routes.googleapis.com/directions/v2:computeRoutes',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask':
                  'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps.navigationInstruction,routes.legs.steps.distanceMeters,routes.legs.steps.staticDuration',
                'X-Goog-Maps-Solution-ID': GMP_SOLUTION_ID,
              },
              body: JSON.stringify({
                origin: originWaypoint,
                destination: {
                  location: {
                    latLng: { latitude: destination.lat, longitude: destination.lng },
                  },
                },
                travelMode: mode,
                languageCode: 'pt-BR',
                units: 'METRIC',
              }),
            }
          );

          const rawText = await response.text();
          let data: any = null;
          try {
            data = JSON.parse(rawText);
          } catch {
            data = null;
          }

          if (!response.ok) {
            if (isQuotaStatus(response.status, rawText)) {
              throw new UpstreamHttpError(429, 'QUOTA_EXCEEDED', 'Limite de cota da Routes API atingido.', true);
            }
            throw new UpstreamHttpError(
              response.status,
              'ROUTES_API_ERROR',
              data?.error?.message || `Não foi possível calcular a rota (HTTP ${response.status}).`,
              false
            );
          }

          const firstRoute = data?.routes?.[0];
          if (!firstRoute) {
            throw new UpstreamHttpError(
              404,
              'NO_ROUTE_FOUND',
              'Nenhuma rota encontrada para o modo de deslocamento selecionado.',
              false
            );
          }

          const durationSeconds = Number(
            String(firstRoute.duration || '0s').replace('s', '')
          );
          const rawSteps: any[] = Array.isArray(firstRoute.legs?.[0]?.steps)
            ? firstRoute.legs[0].steps
            : [];

          const steps = rawSteps.map((s) => ({
            instruction: String(s.navigationInstruction?.instructions || 'Siga pelo trajeto'),
            distanceMeters: Number(s.distanceMeters || 0),
            durationText: String(s.staticDuration || '0s'),
          }));

          return {
            distanceMeters: Number(firstRoute.distanceMeters || 0),
            durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
            encodedPolyline: firstRoute.polyline?.encodedPolyline || undefined,
            steps,
          };
        },
        {
          allowStaleOnError: (err) =>
            err instanceof UpstreamHttpError && (err.isQuota || err.status >= 500),
        }
      );

      res.json(cached.value);
    } catch (err) {
      if (err instanceof UpstreamHttpError) {
        res.status(err.status).json({ error: err.message, code: err.code });
        return;
      }
      res.status(502).json({
        error:
          err instanceof Error
            ? `Erro de conexão na Routes API: ${err.message}`
            : 'Erro de conexão na Routes API.',
        code: 'ROUTES_NETWORK_ERROR',
      });
    }
  });

  app.get('/api/weather', async (req: Request, res: Response) => {
    const apiKey = getMapsApiKey();
    if (!apiKey) {
      res.status(503).json({
        error: 'Chave da API do Google Maps Platform não configurada.',
        code: 'MAPS_NOT_CONFIGURED',
      });
      return;
    }

    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({
        error: 'Parâmetros lat e lng válidos são obrigatórios para consultar a Weather API.',
        code: 'INVALID_COORDINATES',
      });
      return;
    }

    const forceRefresh = req.query.force === '1';
    const weatherCacheKey = `${lat.toFixed(3)}:${lng.toFixed(3)}`;

    try {
      const cached = await weatherCache.runDeduplicated(
        weatherCacheKey,
        WEATHER_TTL_MS,
        async () => {
          const currentUrl = new URL('https://weather.googleapis.com/v1/currentConditions:lookup');
          currentUrl.searchParams.set('key', apiKey);
          currentUrl.searchParams.set('location.latitude', String(lat));
          currentUrl.searchParams.set('location.longitude', String(lng));
          currentUrl.searchParams.set('unitsSystem', 'METRIC');

          const dailyUrl = new URL('https://weather.googleapis.com/v1/forecast/days:lookup');
          dailyUrl.searchParams.set('key', apiKey);
          dailyUrl.searchParams.set('location.latitude', String(lat));
          dailyUrl.searchParams.set('location.longitude', String(lng));
          dailyUrl.searchParams.set('days', '3');
          dailyUrl.searchParams.set('unitsSystem', 'METRIC');

          const hourlyUrl = new URL('https://weather.googleapis.com/v1/forecast/hours:lookup');
          hourlyUrl.searchParams.set('key', apiKey);
          hourlyUrl.searchParams.set('location.latitude', String(lat));
          hourlyUrl.searchParams.set('location.longitude', String(lng));
          hourlyUrl.searchParams.set('hours', '12');
          hourlyUrl.searchParams.set('unitsSystem', 'METRIC');

          const alertsUrl = new URL('https://weather.googleapis.com/v1/publicAlerts:lookup');
          alertsUrl.searchParams.set('key', apiKey);
          alertsUrl.searchParams.set('location.latitude', String(lat));
          alertsUrl.searchParams.set('location.longitude', String(lng));
          alertsUrl.searchParams.set('languageCode', 'pt-BR');

          const headers = { 'X-Goog-Maps-Solution-ID': GMP_SOLUTION_ID };

          const [currentRes, dailyRes, hourlyRes, alertsRes] = await Promise.all([
            fetch(currentUrl.toString(), { headers }),
            fetch(dailyUrl.toString(), { headers }),
            fetch(hourlyUrl.toString(), { headers }),
            fetch(alertsUrl.toString(), { headers }),
          ]);

          const currentText = await currentRes.text();
          if (!currentRes.ok) {
            if (isQuotaStatus(currentRes.status, currentText)) {
              throw new UpstreamHttpError(
                429,
                'QUOTA_EXCEEDED',
                'Limite de cota da Weather API atingido.',
                true
              );
            }
            let parsedErr: any = null;
            try {
              parsedErr = JSON.parse(currentText);
            } catch {
              parsedErr = null;
            }
            throw new UpstreamHttpError(
              currentRes.status,
              'WEATHER_API_ERROR',
              parsedErr?.error?.message ||
                `Falha ao consultar a Google Weather API (HTTP ${currentRes.status}).`,
              false
            );
          }

          const currentData = JSON.parse(currentText);
          const dailyData = dailyRes.ok ? await dailyRes.json() : { forecastDays: [] };
          const hourlyData = hourlyRes.ok ? await hourlyRes.json() : { forecastHours: [] };
          const alertsData = alertsRes.ok ? await alertsRes.json() : { weatherAlerts: [] };

          const hourlyForecast: HourlyWeatherItem[] = Array.isArray(hourlyData.forecastHours)
            ? hourlyData.forecastHours.slice(0, 12).map((h: any) => {
                const disp = h.displayDateTime;
                const hourLabel =
                  disp && typeof disp.hours === 'number'
                    ? `${String(disp.hours).padStart(2, '0')}h`
                    : '--h';
                return {
                  hourLabel,
                  tempC:
                    typeof h.temperature?.degrees === 'number' ? h.temperature.degrees : null,
                  conditionText: String(
                    h.weatherCondition?.description?.text ||
                      h.weatherCondition?.type ||
                      'Condição prevista'
                  ),
                  conditionType: String(h.weatherCondition?.type || 'UNKNOWN'),
                  precipitationProbability:
                    typeof h.precipitation?.probability?.percent === 'number'
                      ? h.precipitation.probability.percent
                      : null,
                  thunderstormProbability:
                    typeof h.thunderstormProbability === 'number'
                      ? h.thunderstormProbability
                      : null,
                  iconBaseUri: h.weatherCondition?.iconBaseUri,
                };
              })
            : [];

          const dailyForecast: DailyWeatherItem[] = Array.isArray(dailyData.forecastDays)
            ? dailyData.forecastDays.slice(0, 3).map((d: any) => {
                const disp = d.displayDate;
                const dateLabel =
                  disp && disp.day && disp.month
                    ? `${String(disp.day).padStart(2, '0')}/${String(disp.month).padStart(2, '0')}`
                    : 'Dia';
                return {
                  dateLabel,
                  maxTempC:
                    typeof d.maxTemperature?.degrees === 'number'
                      ? d.maxTemperature.degrees
                      : null,
                  minTempC:
                    typeof d.minTemperature?.degrees === 'number'
                      ? d.minTemperature.degrees
                      : null,
                  dayCondition: String(
                    d.daytimeForecast?.weatherCondition?.description?.text ||
                      d.daytimeForecast?.weatherCondition?.type ||
                      'Indisponível'
                  ),
                  precipitationProbability:
                    typeof d.daytimeForecast?.precipitation?.probability?.percent === 'number'
                      ? d.daytimeForecast.precipitation.probability.percent
                      : null,
                  thunderstormProbability:
                    typeof d.daytimeForecast?.thunderstormProbability === 'number'
                      ? d.daytimeForecast.thunderstormProbability
                      : null,
                  iconBaseUri: d.daytimeForecast?.weatherCondition?.iconBaseUri,
                };
              })
            : [];

          const alerts: WeatherAlertItem[] = Array.isArray(alertsData.weatherAlerts)
            ? alertsData.weatherAlerts.map((a: any) => ({
                alertId: String(a.alertId || Math.random()),
                title: String(a.alertTitle?.text || a.eventType || 'Alerta Meteorológico'),
                eventType: a.eventType,
                areaName: a.areaName,
                severity: a.severity,
                urgency: a.urgency,
                certainty: a.certainty,
                description: a.description,
                instructions: Array.isArray(a.instruction) ? a.instruction : [],
                startTime: a.startTime,
                expirationTime: a.expirationTime,
                dataSource: {
                  publisher: a.dataSource?.publisher,
                  name: String(a.dataSource?.name || 'Autoridade Meteorológica'),
                  authorityUri: a.dataSource?.authorityUri,
                },
              }))
            : [];

          const payload: WeatherResponseData = {
            fetchedAt: new Date().toISOString(),
            observationTime: currentData.currentTime || null,
            timeZoneId: currentData.timeZone?.id || 'America/Belem',
            isDaytime:
              typeof currentData.isDaytime === 'boolean' ? currentData.isDaytime : null,
            conditionText: String(
              currentData.weatherCondition?.description?.text ||
                currentData.weatherCondition?.type ||
                'Condição atual'
            ),
            conditionType: String(currentData.weatherCondition?.type || 'UNKNOWN'),
            iconBaseUri: currentData.weatherCondition?.iconBaseUri,
            temperatureC:
              typeof currentData.temperature?.degrees === 'number'
                ? currentData.temperature.degrees
                : null,
            feelsLikeC:
              typeof currentData.feelsLikeTemperature?.degrees === 'number'
                ? currentData.feelsLikeTemperature.degrees
                : null,
            relativeHumidity:
              typeof currentData.relativeHumidity === 'number'
                ? currentData.relativeHumidity
                : null,
            uvIndex: typeof currentData.uvIndex === 'number' ? currentData.uvIndex : null,
            precipitationProbability:
              typeof currentData.precipitation?.probability?.percent === 'number'
                ? currentData.precipitation.probability.percent
                : null,
            precipitationMm:
              typeof currentData.precipitation?.qpf?.quantity === 'number'
                ? currentData.precipitation.qpf.quantity
                : null,
            thunderstormProbability:
              typeof currentData.thunderstormProbability === 'number'
                ? currentData.thunderstormProbability
                : null,
            windSpeedKmh:
              typeof currentData.wind?.speed?.value === 'number'
                ? currentData.wind.speed.value
                : null,
            windGustKmh:
              typeof currentData.wind?.gust?.value === 'number'
                ? currentData.wind.gust.value
                : null,
            windCardinal: currentData.wind?.direction?.cardinal || null,
            visibilityKm:
              typeof currentData.visibility?.distance === 'number'
                ? currentData.visibility.distance
                : null,
            cloudCover:
              typeof currentData.cloudCover === 'number' ? currentData.cloudCover : null,
            hourlyForecast,
            dailyForecast,
            alerts,
            coordinatesUsed: { lat, lng },
          };

          return payload;
        },
        {
          forceRefresh,
          allowStaleOnError: (err) =>
            err instanceof UpstreamHttpError && (err.isQuota || err.status >= 500),
        }
      );

      res.setHeader('Cache-Control', 'public, max-age=600');
      res.json(cached.value);
    } catch (err) {
      if (err instanceof UpstreamHttpError) {
        res.status(err.status).json({ error: err.message, code: err.code });
        return;
      }
      res.status(502).json({
        error:
          err instanceof Error
            ? `Erro de conexão com a Weather API: ${err.message}`
            : 'Erro de conexão com a Weather API.',
        code: 'WEATHER_NETWORK_ERROR',
      });
    }
  });

  app.post('/api/gemini/chat', async (req: Request, res: Response) => {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      res.status(503).json({
        error: 'Chave da API Gemini não configurada no servidor.',
        code: 'GEMINI_NOT_CONFIGURED',
      });
      return;
    }

    const { messages, weatherContext, parkAddress, mapPois, parkCoordinates } =
      req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({
        error: 'Envie uma mensagem para conversar com o Guia Utinga.',
        code: 'EMPTY_MESSAGES',
      });
      return;
    }

    const sanitizedHistory = messages
      .filter(
        (m: any) =>
          m &&
          (m.role === 'user' || m.role === 'assistant') &&
          typeof m.content === 'string' &&
          m.content.trim().length > 0
      )
      .slice(-12);

    if (sanitizedHistory.length === 0) {
      res.status(400).json({ error: 'Mensagem inválida.', code: 'INVALID_MESSAGES' });
      return;
    }

    const sanitizedPois: ChatMapPoiInput[] = Array.isArray(mapPois)
      ? mapPois
          .filter((p: any) => p && typeof p.name === 'string')
          .slice(0, 18)
          .map((p: any) => ({
            id: typeof p.id === 'string' ? p.id : undefined,
            name: String(p.name).slice(0, 120),
            formattedAddress:
              typeof p.formattedAddress === 'string'
                ? p.formattedAddress.slice(0, 180)
                : undefined,
            primaryTypeLabel:
              typeof p.primaryTypeLabel === 'string'
                ? p.primaryTypeLabel.slice(0, 60)
                : undefined,
            lat: typeof p.lat === 'number' && Number.isFinite(p.lat) ? p.lat : undefined,
            lng: typeof p.lng === 'number' && Number.isFinite(p.lng) ? p.lng : undefined,
          }))
      : [];

    const centerLat =
      typeof parkCoordinates?.lat === 'number' &&
      Number.isFinite(parkCoordinates.lat)
        ? parkCoordinates.lat
        : -1.4255;
    const centerLng =
      typeof parkCoordinates?.lng === 'number' &&
      Number.isFinite(parkCoordinates.lng)
        ? parkCoordinates.lng
        : -48.4368;

    try {
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const conversationContents = sanitizedHistory.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content.trim() }],
      }));

      const lastUserMessage =
        [...sanitizedHistory].reverse().find((m) => m.role === 'user')?.content || '';
      const placeQuery = extractPlaceSearchQuery(lastUserMessage);
      const { places: searchedPlaces, routeSummary: computedRouteSummary } =
        placeQuery
          ? await lookupPlacesAndRouteForChat(
              placeQuery,
              lastUserMessage,
              centerLat,
              centerLng
            )
          : { places: [], routeSummary: null };

      const systemInstruction = buildGuiaUtingaSystemPrompt(
        weatherContext,
        parkAddress,
        sanitizedPois,
        searchedPlaces,
        computedRouteSummary
      );

      const attemptConfigs = buildGeminiAttemptConfigs(process.env.GEMINI_MODEL);
      const unavailableModels = new Set<string>();
      const unsupportedToolCombos = new Set<string>();

      let responseText: string | undefined;
      const groundingSources: GroundingSource[] = [];
      const seenSourceUris = new Set<string>();
      let lastError: any = null;

      for (const place of searchedPlaces) {
        const mapsUri = sanitizeHttpUrl(String(place.googleMapsUri || ''));
        if (mapsUri && !seenSourceUris.has(mapsUri)) {
          seenSourceUris.add(mapsUri);
          groundingSources.push({
            title: `${place.name} — Google Maps`,
            uri: mapsUri,
            kind: 'maps',
          });
        }
      }

      for (const attempt of attemptConfigs) {
        if (unavailableModels.has(attempt.model)) continue;
        if (unsupportedToolCombos.has(`${attempt.model}:${attempt.toolMode}`)) continue;

        if (attempt.delayMs > 0) {
          await sleepMs(attempt.delayMs);
        }
        try {
          const config: Record<string, any> = {
            systemInstruction,
          };

          if (attempt.toolMode === 'maps') {
            config.tools = [{ googleMaps: {} }];
            config.toolConfig = {
              retrievalConfig: {
                latLng: { latitude: centerLat, longitude: centerLng },
              },
            };
          } else if (attempt.toolMode === 'search') {
            config.tools = [{ googleSearch: {} }];
          }

          const response = await ai.models.generateContent({
            model: attempt.model,
            contents: conversationContents,
            config,
          });
          const candidate = response.text?.trim();
          if (candidate) {
            responseText = candidate;

            const rawChunks =
              response.candidates?.[0]?.groundingMetadata?.groundingChunks;
            if (Array.isArray(rawChunks)) {
              for (const chunk of rawChunks) {
                const mapsUri = sanitizeHttpUrl(String(chunk?.maps?.uri || ''));
                if (mapsUri && !seenSourceUris.has(mapsUri)) {
                  seenSourceUris.add(mapsUri);
                  groundingSources.push({
                    title: String(chunk?.maps?.title || 'Ver local no Google Maps'),
                    uri: mapsUri,
                    kind: 'maps',
                  });
                  continue;
                }
                const webUri = sanitizeHttpUrl(String(chunk?.web?.uri || ''));
                if (webUri && !seenSourceUris.has(webUri)) {
                  seenSourceUris.add(webUri);
                  groundingSources.push({
                    title: String(chunk?.web?.title || 'Fonte consultada'),
                    uri: webUri,
                    kind: 'web',
                  });
                }
              }
            }
            break;
          }
        } catch (attemptErr: any) {
          lastError = attemptErr;
          const classification = classifyGeminiAttemptError(
            attemptErr,
            attempt.toolMode
          );
          if (classification.isModelUnavailable) {
            unavailableModels.add(attempt.model);
          }
          if (classification.isToolUnsupported) {
            unsupportedToolCombos.add(`${attempt.model}:${attempt.toolMode}`);
          }
          if (!classification.shouldTryNext) {
            break;
          }
        }
      }

      if (!responseText) {
        if (lastError) {
          const formatted = formatGeminiErrorPt(lastError);
          res.status(formatted.status).json({
            error: formatted.message,
            code: 'GEMINI_API_ERROR',
          });
          return;
        }
        res.status(502).json({
          error:
            'O Guia Utinga não retornou texto nesta tentativa. Tente reformular sua pergunta.',
          code: 'EMPTY_AI_RESPONSE',
        });
        return;
      }

      const matchedTrailIds = matchInternalTrailIdsFromText(
        responseText,
        INTERNAL_TRAIL_GEOMETRIES
      );

      res.json({
        reply: responseText,
        groundingSources,
        matchedTrailIds,
      });
    } catch (err: any) {
      const formatted = formatGeminiErrorPt(err);
      res.status(formatted.status).json({
        error: formatted.message,
        code: 'GEMINI_API_ERROR',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath, { maxAge: '1h' }));
    app.get('*', (req: Request, res: Response, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Utinga360 server listening on http://0.0.0.0:${PORT}`);
  });
}

createApp();
