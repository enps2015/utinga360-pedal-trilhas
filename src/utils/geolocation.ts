import type { LatLngPoint } from '../types/app.ts';

export type LocationAccuracyQuality = 'high' | 'moderate' | 'low' | 'unknown';

export interface LocationFixAssessment {
  quality: LocationAccuracyQuality;
  accuracyMeters: number | null;
  accuracyLabel: string | null;
  distanceToParkMeters: number | null;
  distanceToParkLabel: string | null;
  isFarFromPark: boolean;
  needsAttention: boolean;
}

const EARTH_RADIUS_METERS = 6_371_000;
const FAR_FROM_PARK_THRESHOLD_METERS = 35_000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineDistanceMeters(a: LatLngPoint, b: LatLngPoint): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  return EARTH_RADIUS_METERS * c;
}

export function formatDistancePtBr(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '—';
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  const km = meters / 1000;
  if (km < 100) {
    return `${km.toFixed(1).replace('.', ',')} km`;
  }
  return `${Math.round(km).toLocaleString('pt-BR')} km`;
}

export function formatAccuracyPtBr(accuracyMeters: number | null | undefined): string | null {
  if (typeof accuracyMeters !== 'number' || !Number.isFinite(accuracyMeters) || accuracyMeters <= 0) {
    return null;
  }
  return `± ${formatDistancePtBr(accuracyMeters)}`;
}

export function classifyAccuracyQuality(
  accuracyMeters: number | null | undefined
): LocationAccuracyQuality {
  if (typeof accuracyMeters !== 'number' || !Number.isFinite(accuracyMeters) || accuracyMeters <= 0) {
    return 'unknown';
  }
  if (accuracyMeters <= 80) return 'high';
  if (accuracyMeters <= 400) return 'moderate';
  return 'low';
}

export function assessLocationFix(
  coords: LatLngPoint,
  accuracyMeters: number | null | undefined,
  parkLocation: LatLngPoint | null
): LocationFixAssessment {
  const normalizedAccuracy =
    typeof accuracyMeters === 'number' && Number.isFinite(accuracyMeters) && accuracyMeters > 0
      ? accuracyMeters
      : null;

  const quality = classifyAccuracyQuality(normalizedAccuracy);
  const distanceToParkMeters = parkLocation
    ? haversineDistanceMeters(coords, parkLocation)
    : null;
  const isFarFromPark =
    distanceToParkMeters !== null && distanceToParkMeters > FAR_FROM_PARK_THRESHOLD_METERS;

  return {
    quality,
    accuracyMeters: normalizedAccuracy,
    accuracyLabel: formatAccuracyPtBr(normalizedAccuracy),
    distanceToParkMeters,
    distanceToParkLabel:
      distanceToParkMeters !== null ? formatDistancePtBr(distanceToParkMeters) : null,
    isFarFromPark,
    needsAttention: quality === 'low' || isFarFromPark,
  };
}
