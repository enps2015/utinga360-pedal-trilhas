export type TrailDifficulty = 'Fácil' | 'Média' | 'Difícil';

export interface OfficialTrail {
  id: string;
  name: string;
  distanceMeters: number;
  difficulty: TrailDifficulty;
  publishedSummary: string;
  nonGeoreferencedNote: string;
  sourceLabel: string;
}

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface PlacePhotoMeta {
  name: string;
  widthPx?: number;
  heightPx?: number;
  authorName?: string;
  authorUri?: string;
}

export interface PlaceAccessibilityInfo {
  wheelchairAccessibleEntrance?: boolean;
  wheelchairAccessibleParking?: boolean;
  wheelchairAccessibleRestroom?: boolean;
}

export type SupportPoiCategory = 'bicycle_store' | 'parking' | 'bus_station';

export interface ValidatedPlace {
  id: string;
  name: string;
  formattedAddress: string;
  location: LatLngPoint;
  primaryType?: string;
  primaryTypeLabel?: string;
  types: string[];
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  openNow?: boolean;
  weekdayDescriptions?: string[];
  photo?: PlacePhotoMeta;
  accessibility?: PlaceAccessibilityInfo;
  isParkMain?: boolean;
  supportCategory?: SupportPoiCategory;
}

export type TravelModeOption = 'DRIVE' | 'BICYCLE' | 'WALK' | 'TRANSIT';

export interface RouteStepSummary {
  instruction: string;
  distanceMeters: number;
  durationText: string;
}

export interface ComputedRouteSummary {
  distanceMeters: number;
  durationSeconds: number;
  travelMode: TravelModeOption;
  destinationName: string;
  encodedPolyline?: string;
  steps: RouteStepSummary[];
  source: 'js-sdk' | 'rest-proxy';
}

export interface WeatherAlertItem {
  alertId: string;
  title: string;
  eventType?: string;
  areaName?: string;
  severity?: string;
  urgency?: string;
  certainty?: string;
  description?: string;
  instructions: string[];
  startTime?: string;
  expirationTime?: string;
  dataSource: {
    publisher?: string;
    name: string;
    authorityUri?: string;
  };
}

export interface DailyWeatherItem {
  dateLabel: string;
  maxTempC: number | null;
  minTempC: number | null;
  dayCondition: string;
  precipitationProbability: number | null;
  thunderstormProbability: number | null;
  iconBaseUri?: string;
}

export interface HourlyWeatherItem {
  hourLabel: string;
  tempC: number | null;
  conditionText: string;
  conditionType: string;
  precipitationProbability: number | null;
  thunderstormProbability: number | null;
  iconBaseUri?: string;
}

export interface WeatherResponseData {
  fetchedAt: string;
  observationTime: string | null;
  timeZoneId: string;
  isDaytime: boolean | null;
  conditionText: string;
  conditionType: string;
  iconBaseUri?: string;
  temperatureC: number | null;
  feelsLikeC: number | null;
  relativeHumidity: number | null;
  uvIndex: number | null;
  precipitationProbability: number | null;
  precipitationMm: number | null;
  thunderstormProbability: number | null;
  windSpeedKmh: number | null;
  windGustKmh: number | null;
  windCardinal: string | null;
  visibilityKm: number | null;
  cloudCover: number | null;
  hourlyForecast: HourlyWeatherItem[];
  dailyForecast: DailyWeatherItem[];
  alerts: WeatherAlertItem[];
  coordinatesUsed: LatLngPoint;
}

export type JournalActivityType =
  | 'Caminhada em Trilha'
  | 'Pedal na Pista Principal (~4 km)'
  | 'Observação da Natureza'
  | 'Visita Geral';

export interface JournalEntry {
  id: string;
  date: string;
  activity: JournalActivityType;
  trailId?: string;
  durationMinutes: number;
  notes: string;
  createdAt: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
  kind: 'maps' | 'web';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  groundingSources?: GroundingSource[];
  matchedTrailIds?: string[];
}

export type ActiveTab = 'mapa' | 'trilhas' | 'ciclista' | 'clima' | 'diario';

export type InternalTrailCategory =
  | 'main-cycling-track'
  | 'official-trail'
  | 'osm-internal-trail';

export type InternalTrailCoverage = 'complete' | 'partial' | 'osm-only';

export interface InternalTrailGeometry {
  id: string;
  officialTrailId: string | null;
  category: InternalTrailCategory;
  name: string;
  osmWayIds: number[];
  osmLengthMeters: number;
  officialMeters: number | null;
  coverageStatus: InternalTrailCoverage;
  surfaceLabel: string;
  note: string;
  segments: LatLngPoint[][];
}

