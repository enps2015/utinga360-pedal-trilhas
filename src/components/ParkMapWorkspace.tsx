import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AdvancedMarker,
  APILoadingStatus,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Accessibility,
  AlertCircle,
  Bike,
  Bus,
  Car,
  Clock,
  Compass,
  Crosshair,
  ExternalLink,
  Footprints,
  Layers,
  List,
  MapPin,
  Map as MapIcon,
  Navigation,
  ParkingCircle,
  RefreshCw,
  Route,
  Search,
  Train,
  Wrench,
  X,
} from 'lucide-react';
import type {
  ComputedRouteSummary,
  InternalTrailCategory,
  InternalTrailGeometry,
  LatLngPoint,
  RouteStepSummary,
  SupportPoiCategory,
  TravelModeOption,
  ValidatedPlace,
} from '../types/app.ts';
import {
  INTERNAL_TRAIL_GEOMETRIES,
  OSM_ATTRIBUTION_LABEL,
  PARK_BOUNDARY_RING,
} from '../data/internalTrailsGeo.ts';
import {
  decodeEncodedPolyline,
  formatRouteDistance,
  formatRouteDuration,
} from '../utils/polyline.ts';
import { assessLocationFix, formatDistancePtBr } from '../utils/geolocation.ts';
import {
  computeRingCentroid,
  formatMetersPtBr,
  getInternalTrailById,
  getParkEntranceFallbackPoint,
  getTrailPointsFlat,
  summarizeInternalTrails,
} from '../utils/trails.ts';

interface ParkMapWorkspaceProps {
  mapId: string;
  park: ValidatedPlace | null;
  pois: ValidatedPlace[];
  placesLoading: boolean;
  placesError: string | null;
  onRetryPlaces: () => void;
  preferredTravelMode?: TravelModeOption;
  focusedInternalTrailId?: string | null;
  onClearFocusedInternalTrail?: () => void;
  onOpenCyclingMode?: () => void;
  onOpenTrailExplorer?: () => void;
}

const TRAVEL_MODES: Array<{
  id: TravelModeOption;
  label: string;
  sdkMode: string;
}> = [
  { id: 'DRIVE', label: 'Carro', sdkMode: 'DRIVING' },
  { id: 'BICYCLE', label: 'Bicicleta', sdkMode: 'BICYCLING' },
  { id: 'WALK', label: 'A pé', sdkMode: 'WALKING' },
  { id: 'TRANSIT', label: 'Transporte', sdkMode: 'TRANSIT' },
];

function TravelModeIcon({ mode }: { mode: TravelModeOption }) {
  switch (mode) {
    case 'DRIVE':
      return <Car className="w-3.5 h-3.5" aria-hidden="true" />;
    case 'BICYCLE':
      return <Bike className="w-3.5 h-3.5" aria-hidden="true" />;
    case 'WALK':
      return <Footprints className="w-3.5 h-3.5" aria-hidden="true" />;
    case 'TRANSIT':
      return <Train className="w-3.5 h-3.5" aria-hidden="true" />;
  }
}

interface PoiMarkerProps {
  place: ValidatedPlace;
  selected: boolean;
  onSelect: (place: ValidatedPlace) => void;
  onCloseInfo: () => void;
  onRouteToPlace: (place: ValidatedPlace) => void;
}

function PoiMarkerWithInfo({
  place,
  selected,
  onSelect,
  onCloseInfo,
  onRouteToPlace,
}: PoiMarkerProps) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [photoFailed, setPhotoFailed] = useState(false);

  const pinBg = place.isParkMain
    ? '#1B4332'
    : place.supportCategory
      ? '#0E7490'
      : '#3B4239';

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={place.location}
        title={place.name}
        onClick={() => onSelect(place)}
      >
        <Pin
          background={pinBg}
          borderColor={selected ? '#C2592A' : '#FFFFFF'}
          glyphColor="#FFFFFF"
          scale={place.isParkMain ? 1.25 : place.supportCategory ? 0.9 : 1.0}
        />
      </AdvancedMarker>
      {selected && marker && (
        <InfoWindow anchor={marker} maxWidth={300} onCloseClick={onCloseInfo}>
          <div className="p-1 space-y-2 text-[#1C241E]">
            {place.photo?.name && !photoFailed && (
              <div className="space-y-1">
                <img
                  src={`/api/places/photo?name=${encodeURIComponent(place.photo.name)}`}
                  alt={`Foto de ${place.name}`}
                  referrerPolicy="no-referrer"
                  onError={() => setPhotoFailed(true)}
                  className="w-full h-32 object-cover rounded-lg bg-[#EFE8DA]"
                />
                {place.photo.authorName && (
                  <p className="text-[10px] text-[#5E584D]">
                    Foto:{' '}
                    {place.photo.authorUri ? (
                      <a
                        href={place.photo.authorUri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        {place.photo.authorName}
                      </a>
                    ) : (
                      place.photo.authorName
                    )}
                  </p>
                )}
              </div>
            )}

            <div>
              <div className="text-sm font-semibold leading-snug">{place.name}</div>
              <div className="text-xs text-[#5E584D] mt-0.5">
                {place.primaryTypeLabel || 'Ponto validado via Google Places'}
              </div>
            </div>
            <p className="text-xs text-[#3B4239] leading-relaxed">
              {place.formattedAddress}
            </p>

            {(place.accessibility?.wheelchairAccessibleEntrance ||
              place.accessibility?.wheelchairAccessibleParking) && (
              <div className="flex flex-wrap gap-2 text-[11px] text-[#1B4332] font-medium">
                {place.accessibility.wheelchairAccessibleEntrance && (
                  <span>· Entrada acessível</span>
                )}
                {place.accessibility.wheelchairAccessibleParking && (
                  <span>· Estacionamento acessível</span>
                )}
              </div>
            )}

            {typeof place.rating === 'number' && (
              <div className="text-xs text-[#5E584D] font-mono tabular-nums">
                Avaliação: {place.rating.toFixed(1)}
                {place.userRatingCount ? ` (${place.userRatingCount})` : ''}
              </div>
            )}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => onRouteToPlace(place)}
                className="px-2.5 py-1.5 text-xs font-medium text-white bg-[#1B4332] hover:bg-[#133124] rounded-lg transition-colors cursor-pointer"
              >
                Rota até aqui
              </button>
              {place.googleMapsUri && (
                <a
                  href={place.googleMapsUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-[#1B4332] underline"
                >
                  Abrir no Maps
                </a>
              )}
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

interface RouteOverlayProps {
  routeSummary: ComputedRouteSummary | null;
  originPoint: LatLngPoint | null;
  destinationPoint: LatLngPoint | null;
  travelMode: TravelModeOption;
  sdkPolylines: google.maps.Polyline[];
}

function RoutePolylineOverlay({
  routeSummary,
  originPoint,
  destinationPoint,
  sdkPolylines,
}: RouteOverlayProps) {
  const map = useMap();
  const polyRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map) return;

    if (polyRef.current) {
      polyRef.current.setMap(null);
      polyRef.current = null;
    }

    if (!routeSummary) return;

    if (sdkPolylines.length > 0) {
      sdkPolylines.forEach((p) => {
        p.setOptions({
          strokeColor: '#B44B1E',
          strokeOpacity: 0.92,
          strokeWeight: 6,
        });
        p.setMap(map);
      });
    } else if (routeSummary.encodedPolyline) {
      const path = decodeEncodedPolyline(routeSummary.encodedPolyline);
      if (path.length > 0) {
        const line = new google.maps.Polyline({
          path,
          geodesic: true,
          strokeColor: '#B44B1E',
          strokeOpacity: 0.92,
          strokeWeight: 5,
          map,
        });
        polyRef.current = line;

        const bounds = new google.maps.LatLngBounds();
        path.forEach((pt) => bounds.extend(pt));
        map.fitBounds(bounds, 48);
      }
    } else if (originPoint && destinationPoint) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(originPoint);
      bounds.extend(destinationPoint);
      map.fitBounds(bounds, 48);
    }

    return () => {
      if (polyRef.current) {
        polyRef.current.setMap(null);
        polyRef.current = null;
      }
      sdkPolylines.forEach((p) => p.setMap(null));
    };
  }, [map, routeSummary, originPoint, destinationPoint, sdkPolylines]);

  return null;
}

interface CameraTarget {
  point: LatLngPoint;
  zoom?: number;
  nonce: number;
}

function MapCameraFocus({ target }: { target: CameraTarget | null }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !target) return;
    map.panTo(target.point);
    if (typeof target.zoom === 'number') {
      map.setZoom(target.zoom);
    } else if ((map.getZoom() ?? 0) < 15) {
      map.setZoom(15);
    }
  }, [map, target]);

  return null;
}

function UserAccuracyCircleOverlay({
  center,
  radiusMeters,
}: {
  center: LatLngPoint | null;
  radiusMeters: number | null;
}) {
  const map = useMap();
  const circleRef = useRef<google.maps.Circle | null>(null);

  useEffect(() => {
    if (!map) return;

    if (!center || !radiusMeters || radiusMeters <= 0) {
      if (circleRef.current) {
        circleRef.current.setMap(null);
        circleRef.current = null;
      }
      return;
    }

    const clampedRadius = Math.min(radiusMeters, 50_000);
    if (!circleRef.current) {
      circleRef.current = new google.maps.Circle({
        strokeColor: '#0E7490',
        strokeOpacity: 0.45,
        strokeWeight: 1.5,
        fillColor: '#0E7490',
        fillOpacity: 0.1,
        clickable: false,
        center,
        radius: clampedRadius,
        map,
      });
    } else {
      circleRef.current.setCenter(center);
      circleRef.current.setRadius(clampedRadius);
      circleRef.current.setMap(map);
    }

    return () => {
      if (circleRef.current) {
        circleRef.current.setMap(null);
        circleRef.current = null;
      }
    };
  }, [map, center, radiusMeters]);

  return null;
}

function BicyclingLayerOverlay({ enabled }: { enabled: boolean }) {
  const map = useMap();
  const layerRef = useRef<google.maps.BicyclingLayer | null>(null);

  useEffect(() => {
    if (!map) return;

    if (!layerRef.current) {
      layerRef.current = new google.maps.BicyclingLayer();
    }

    layerRef.current.setMap(enabled ? map : null);

    return () => {
      if (layerRef.current) {
        layerRef.current.setMap(null);
      }
    };
  }, [map, enabled]);

  return null;
}

function getTrailStrokeColor(
  category: InternalTrailCategory,
  selected: boolean
): string {
  switch (category) {
    case 'main-cycling-track':
      return selected ? '#0A586E' : '#0E7490';
    case 'official-trail':
      return selected ? '#9A3412' : '#C2592A';
    case 'osm-internal-trail':
      return selected ? '#1B4332' : '#2D6A4F';
  }
}

function getTrailCategoryLabel(category: InternalTrailCategory): string {
  switch (category) {
    case 'main-cycling-track':
      return 'Pista principal (~4 km)';
    case 'official-trail':
      return 'Trilha oficial (IDEFLOR-Bio)';
    case 'osm-internal-trail':
      return 'Trilha interna (OpenStreetMap)';
  }
}

function InternalTrailsOverlay({
  enabled,
  selectedTrailId,
  isPickingOriginOnMap,
  onSelectTrail,
}: {
  enabled: boolean;
  selectedTrailId: string | null;
  isPickingOriginOnMap: boolean;
  onSelectTrail: (trail: InternalTrailGeometry) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !enabled) return;

    const polylines: google.maps.Polyline[] = [];
    const listeners: google.maps.MapsEventListener[] = [];

    const boundaryPolygon = new google.maps.Polygon({
      paths: PARK_BOUNDARY_RING,
      strokeColor: '#1B4332',
      strokeOpacity: 0.45,
      strokeWeight: 1.5,
      fillColor: '#2D6A4F',
      fillOpacity: 0.05,
      clickable: false,
      zIndex: 1,
      map,
    });

    for (const trail of INTERNAL_TRAIL_GEOMETRIES) {
      const selected = selectedTrailId === trail.id;
      const strokeColor = getTrailStrokeColor(trail.category, selected);
      const strokeOpacity = selected ? 0.98 : selectedTrailId ? 0.52 : 0.88;
      const baseWeight =
        trail.category === 'main-cycling-track'
          ? 4.5
          : trail.category === 'official-trail'
            ? 3.5
            : 3;
      const strokeWeight = selected ? 6 : baseWeight;
      const zIndex = selected
        ? 45
        : trail.category === 'main-cycling-track'
          ? 30
          : trail.category === 'official-trail'
            ? 22
            : 16;

      for (const segment of trail.segments) {
        if (segment.length < 2) continue;
        const poly = new google.maps.Polyline({
          path: segment,
          geodesic: true,
          strokeColor,
          strokeOpacity,
          strokeWeight,
          clickable: !isPickingOriginOnMap,
          zIndex,
          map,
        });

        const listener = poly.addListener('click', () => {
          onSelectTrail(trail);
        });
        polylines.push(poly);
        listeners.push(listener);
      }
    }

    return () => {
      for (const listener of listeners) {
        listener.remove();
      }
      for (const poly of polylines) {
        poly.setMap(null);
      }
      boundaryPolygon.setMap(null);
    };
  }, [map, enabled, selectedTrailId, isPickingOriginOnMap, onSelectTrail]);

  return null;
}

const SUPPORT_CATEGORIES: Array<{
  id: SupportPoiCategory;
  label: string;
}> = [
  { id: 'bicycle_store', label: 'Bicicletarias' },
  { id: 'parking', label: 'Estacionamentos' },
  { id: 'bus_station', label: 'Ônibus / Acesso' },
];

function SupportCategoryIcon({ category }: { category: SupportPoiCategory }) {
  switch (category) {
    case 'bicycle_store':
      return <Wrench className="w-3.5 h-3.5" aria-hidden="true" />;
    case 'parking':
      return <ParkingCircle className="w-3.5 h-3.5" aria-hidden="true" />;
    case 'bus_station':
      return <Bus className="w-3.5 h-3.5" aria-hidden="true" />;
  }
}

export function ParkMapWorkspace({
  mapId,
  park,
  pois,
  placesLoading,
  placesError,
  onRetryPlaces,
  preferredTravelMode,
  focusedInternalTrailId,
  onClearFocusedInternalTrail,
  onOpenCyclingMode,
  onOpenTrailExplorer,
}: ParkMapWorkspaceProps) {
  const map = useMap();
  const placesLib = useMapsLibrary('places');
  const routesLib = useMapsLibrary('routes');
  const apiLoadingStatus = useApiLoadingStatus();

  const [viewMode, setViewMode] = useState<'mapa' | 'lista'>('mapa');
  const [selectedPoi, setSelectedPoi] = useState<ValidatedPlace | null>(null);
  const [focusTarget, setFocusTarget] = useState<CameraTarget | null>(null);
  const focusNonceRef = useRef(0);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const focusOnPoint = useCallback((point: LatLngPoint, zoom?: number) => {
    focusNonceRef.current += 1;
    setFocusTarget({ point, zoom, nonce: focusNonceRef.current });
  }, []);

  const [showBicyclingLayer, setShowBicyclingLayer] = useState<boolean>(
    preferredTravelMode === 'BICYCLE'
  );
  const [showInternalTrails, setShowInternalTrails] = useState<boolean>(true);
  const [selectedInternalTrailId, setSelectedInternalTrailId] = useState<
    string | null
  >(null);
  const [internalTrailFilter, setInternalTrailFilter] = useState<
    'all' | 'official' | 'ramais'
  >('all');

  // On-demand surrounding support POIs (cached in session state to preserve Demo Key quota)
  const [activeSupportCategory, setActiveSupportCategory] =
    useState<SupportPoiCategory | null>(null);
  const [supportCache, setSupportCache] = useState<
    Partial<Record<SupportPoiCategory, ValidatedPlace[]>>
  >({});
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportError, setSupportError] = useState<string | null>(null);

  // Explicit geolocation consent state & progressive high-accuracy refinement
  const [locationConsent, setLocationConsent] = useState<
    'idle' | 'prompting' | 'granted' | 'denied' | 'error'
  >('idle');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<LatLngPoint | null>(null);
  const [userLocationAccuracy, setUserLocationAccuracy] = useState<number | null>(null);
  const [locationRefining, setLocationRefining] = useState(false);
  const [isPickingOriginOnMap, setIsPickingOriginOnMap] = useState(false);

  const geoWatchRef = useRef<number | null>(null);
  const geoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bestAccuracyRef = useRef<number>(Infinity);
  const manualOverrideRef = useRef<boolean>(false);

  // Origin search via Places AutocompleteSuggestion
  const [originQuery, setOriginQuery] = useState('');
  const [originSuggestions, setOriginSuggestions] = useState<
    google.maps.places.AutocompleteSuggestion[]
  >([]);
  const [originLabel, setOriginLabel] = useState<string>('');
  const [customOrigin, setCustomOrigin] = useState<LatLngPoint | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(
    null
  );

  // Destination & routing
  const [destinationId, setDestinationId] = useState<string>('');
  const [travelMode, setTravelMode] = useState<TravelModeOption>(
    preferredTravelMode || 'DRIVE'
  );
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeSummary, setRouteSummary] = useState<ComputedRouteSummary | null>(null);
  const [sdkPolylines, setSdkPolylines] = useState<google.maps.Polyline[]>([]);

  useEffect(() => {
    if (preferredTravelMode) {
      setTravelMode(preferredTravelMode);
      if (preferredTravelMode === 'BICYCLE') {
        setShowBicyclingLayer(true);
      }
    }
  }, [preferredTravelMode]);

  useEffect(() => {
    if (park && !destinationId) {
      setDestinationId(park.id);
    }
  }, [park, destinationId]);

  const internalTrailSummary = useMemo(
    () => summarizeInternalTrails(INTERNAL_TRAIL_GEOMETRIES),
    []
  );

  const filteredInternalTrails = useMemo(() => {
    if (internalTrailFilter === 'official') {
      return INTERNAL_TRAIL_GEOMETRIES.filter(
        (t) =>
          t.category === 'main-cycling-track' || t.category === 'official-trail'
      );
    }
    if (internalTrailFilter === 'ramais') {
      return INTERNAL_TRAIL_GEOMETRIES.filter(
        (t) => t.category === 'osm-internal-trail'
      );
    }
    return INTERNAL_TRAIL_GEOMETRIES;
  }, [internalTrailFilter]);

  const fallbackEntrance = useMemo(
    () => getParkEntranceFallbackPoint(INTERNAL_TRAIL_GEOMETRIES),
    []
  );
  const fallbackCenter = useMemo(
    () => computeRingCentroid(PARK_BOUNDARY_RING) || fallbackEntrance,
    [fallbackEntrance]
  );
  const mapCenter = park?.location || fallbackCenter;
  const fallbackDestinationPoint = park?.location || fallbackEntrance;

  const selectedInternalTrail = useMemo(
    () =>
      getInternalTrailById(INTERNAL_TRAIL_GEOMETRIES, selectedInternalTrailId),
    [selectedInternalTrailId]
  );

  const fitMapToInternalTrail = useCallback(
    (trail: InternalTrailGeometry) => {
      if (!map || typeof google === 'undefined') return;
      const pts = getTrailPointsFlat(trail);
      if (pts.length === 0) return;
      const bounds = new google.maps.LatLngBounds();
      for (const pt of pts) {
        bounds.extend(pt);
      }
      map.fitBounds(bounds, 56);
    },
    [map]
  );

  const handleSelectInternalTrail = useCallback(
    (trail: InternalTrailGeometry) => {
      setShowInternalTrails(true);
      setSelectedInternalTrailId(trail.id);
      setViewMode('mapa');
      fitMapToInternalTrail(trail);
    },
    [fitMapToInternalTrail]
  );

  const handleFocusTrailFromBelow = useCallback(
    (trail: InternalTrailGeometry) => {
      handleSelectInternalTrail(trail);
      mapContainerRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    },
    [handleSelectInternalTrail]
  );

  useEffect(() => {
    if (!focusedInternalTrailId) return;
    const found = getInternalTrailById(
      INTERNAL_TRAIL_GEOMETRIES,
      focusedInternalTrailId
    );
    if (!found) {
      onClearFocusedInternalTrail?.();
      return;
    }
    setShowInternalTrails(true);
    setSelectedInternalTrailId(found.id);
    setViewMode('mapa');
    if (map) {
      fitMapToInternalTrail(found);
      onClearFocusedInternalTrail?.();
    }
  }, [
    focusedInternalTrailId,
    map,
    fitMapToInternalTrail,
    onClearFocusedInternalTrail,
  ]);

  const handleToggleSupportCategory = async (category: SupportPoiCategory) => {
    if (!mapCenter) return;
    if (activeSupportCategory === category) {
      setActiveSupportCategory(null);
      setSupportError(null);
      return;
    }

    setActiveSupportCategory(category);
    setSupportError(null);

    if (supportCache[category]) {
      return;
    }

    setSupportLoading(true);
    try {
      const res = await fetch(
        `/api/places/support?lat=${mapCenter.lat}&lng=${mapCenter.lng}&category=${category}`
      );
      if (res.status === 429) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      const data = await res.json();
      if (!res.ok) {
        if (data?.code === 'QUOTA_EXCEEDED') {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        setSupportError(data?.error || 'Não foi possível carregar pontos de apoio.');
        return;
      }
      setSupportCache((prev) => ({
        ...prev,
        [category]: Array.isArray(data.pois) ? data.pois : [],
      }));
    } catch {
      setSupportError('Erro de conexão ao consultar pontos de apoio no entorno.');
    } finally {
      setSupportLoading(false);
    }
  };

  const displayedPois = useMemo(() => {
    if (!activeSupportCategory) return pois;
    const extras = supportCache[activeSupportCategory] || [];
    const baseIds = new Set(pois.map((p) => p.id));
    return [...pois, ...extras.filter((p) => !baseIds.has(p.id))];
  }, [pois, activeSupportCategory, supportCache]);

  // Places Autocomplete suggestions for custom origin (debounced & min 4 chars to save quota)
  useEffect(() => {
    if (!placesLib || originQuery.trim().length < 4) {
      setOriginSuggestions([]);
      return;
    }

    const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new AutocompleteSessionToken();
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: originQuery,
          sessionToken: sessionTokenRef.current!,
          includedRegionCodes: ['br'],
          language: 'pt-BR',
          locationBias: mapCenter
            ? {
                center: mapCenter,
                radius: 25000,
              }
            : undefined,
        });
        if (!cancelled) {
          setOriginSuggestions(res.suggestions || []);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setOriginSuggestions([]);
          const msg = String(err);
          if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('OVER_QUERY_LIMIT')) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          }
        }
      }
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [placesLib, originQuery, mapCenter]);

  const stopLocationWatch = useCallback(() => {
    if (geoWatchRef.current !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(geoWatchRef.current);
      geoWatchRef.current = null;
    }
    if (geoStopTimerRef.current !== null) {
      clearTimeout(geoStopTimerRef.current);
      geoStopTimerRef.current = null;
    }
    setLocationRefining(false);
  }, []);

  useEffect(() => {
    return () => {
      stopLocationWatch();
    };
  }, [stopLocationWatch]);

  const handleManualOriginSelect = useCallback(
    (
      coords: LatLngPoint,
      label = 'Localização ajustada manualmente no mapa'
    ) => {
      stopLocationWatch();
      manualOverrideRef.current = true;
      setCustomOrigin(coords);
      setOriginLabel(label);
      setIsPickingOriginOnMap(false);
      setLocationError(null);
      setRouteError(null);
    },
    [stopLocationWatch]
  );

  const handleSelectSuggestion = async (
    suggestion: google.maps.places.AutocompleteSuggestion
  ) => {
    if (!suggestion.placePrediction) return;
    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location'],
      });
      if (place.location) {
        const lat = place.location.lat();
        const lng = place.location.lng();
        handleManualOriginSelect(
          { lat, lng },
          place.displayName || place.formattedAddress || originQuery
        );
        setOriginQuery('');
        setOriginSuggestions([]);
        sessionTokenRef.current = null;
        focusOnPoint({ lat, lng }, 15);
      }
    } catch (err: unknown) {
      const msg = String(err);
      if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('OVER_QUERY_LIMIT')) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      setRouteError('Não foi possível obter as coordenadas deste ponto de partida.');
    }
  };

  const handleRequestLocation = () => {
    if (!('geolocation' in navigator)) {
      setLocationConsent('error');
      setLocationError(
        'Geolocalização não é suportada neste navegador. Informe um ponto de partida na busca ou marque no mapa.'
      );
      return;
    }

    stopLocationWatch();
    manualOverrideRef.current = false;
    bestAccuracyRef.current = Infinity;
    setLocationConsent('prompting');
    setLocationError(null);
    setLocationRefining(true);
    setIsPickingOriginOnMap(false);

    let receivedFirstFix = false;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (manualOverrideRef.current) return;

        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        const accuracy =
          typeof pos.coords.accuracy === 'number' && Number.isFinite(pos.coords.accuracy)
            ? pos.coords.accuracy
            : null;

        const isBetterOrFirst =
          !receivedFirstFix ||
          (accuracy !== null && accuracy <= bestAccuracyRef.current);

        if (!isBetterOrFirst) return;

        const wasFirst = !receivedFirstFix;
        receivedFirstFix = true;
        if (accuracy !== null) {
          bestAccuracyRef.current = accuracy;
        }

        setUserLocation(coords);
        setUserLocationAccuracy(accuracy);
        setCustomOrigin(coords);
        setOriginLabel('Minha localização atual (navegador)');
        setLocationConsent('granted');

        const assessment = assessLocationFix(
          coords,
          accuracy,
          mapCenter || null
        );

        if (wasFirst || (accuracy !== null && accuracy <= 100)) {
          // Only auto-pan when the coordinate is plausible near Belém / reasonable precision
          if (!assessment.isFarFromPark && (accuracy === null || accuracy <= 3000)) {
            focusOnPoint(coords, accuracy !== null && accuracy > 400 ? 13 : 15);
          }
        }

        if (accuracy !== null && accuracy <= 35) {
          stopLocationWatch();
        }
      },
      (err) => {
        if (receivedFirstFix) {
          stopLocationWatch();
          return;
        }
        stopLocationWatch();
        if (err.code === err.PERMISSION_DENIED) {
          setLocationConsent('denied');
          setLocationError(
            'Permissão de localização recusada. Você pode buscar um endereço ou marcar seu ponto direto no mapa.'
          );
        } else {
          setLocationConsent('error');
          setLocationError(
            'Não foi possível obter sua localização atual. Tente novamente, busque um endereço ou marque no mapa.'
          );
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );

    geoWatchRef.current = watchId;
    geoStopTimerRef.current = setTimeout(() => {
      stopLocationWatch();
    }, 8500);
  };

  const handleRevokeLocation = () => {
    stopLocationWatch();
    manualOverrideRef.current = false;
    bestAccuracyRef.current = Infinity;
    setUserLocation(null);
    setUserLocationAccuracy(null);
    setCustomOrigin(null);
    setOriginLabel('');
    setLocationConsent('idle');
    setLocationError(null);
    setIsPickingOriginOnMap(false);
    setRouteSummary(null);
    sdkPolylines.forEach((p) => p.setMap(null));
    setSdkPolylines([]);
  };

  const destinationPlace =
    displayedPois.find((p) => p.id === destinationId) || park || null;
  const activeDestinationLocation =
    destinationPlace?.location || fallbackDestinationPoint;
  const activeDestinationName =
    destinationPlace?.name ||
    'Entrada do Parque Estadual do Utinga (referência OSM)';

  const activeOrigin = customOrigin || userLocation;
  const isBrowserOriginActive = Boolean(
    userLocation &&
      customOrigin &&
      customOrigin.lat === userLocation.lat &&
      customOrigin.lng === userLocation.lng
  );
  const locationAssessment = useMemo(() => {
    if (!isBrowserOriginActive || !userLocation) return null;
    return assessLocationFix(
      userLocation,
      userLocationAccuracy,
      mapCenter || null
    );
  }, [isBrowserOriginActive, userLocation, userLocationAccuracy, mapCenter]);

  const computeAccessRoute = useCallback(
    async (targetPlace?: ValidatedPlace) => {
      const targetLocation =
        targetPlace?.location || activeDestinationLocation;
      const targetName = targetPlace?.name || activeDestinationName;
      if (!targetLocation) {
        setRouteError('Aguarde o carregamento da localização do parque.');
        return;
      }
      if (!activeOrigin) {
        setRouteError(
          'Autorize sua localização ou escolha um endereço de partida antes de calcular a rota.'
        );
        return;
      }

      if (targetPlace) {
        setDestinationId(targetPlace.id);
      }

      setRouteLoading(true);
      setRouteError(null);
      sdkPolylines.forEach((p) => p.setMap(null));
      setSdkPolylines([]);

      const selectedMode =
        TRAVEL_MODES.find((m) => m.id === travelMode) || TRAVEL_MODES[0];

      // Primary: Maps JS SDK Route.computeRoutes (bypasses CORS natively)
      if (routesLib && map && (routesLib as any).Route?.computeRoutes) {
        try {
          const { routes } = await (routesLib as any).Route.computeRoutes({
            origin: activeOrigin,
            destination: targetLocation,
            travelMode: selectedMode.sdkMode,
            fields: ['path', 'distanceMeters', 'durationMillis', 'viewport', 'legs'],
          });

          if (routes && routes.length > 0) {
            const primary = routes[0];
            const polylines: google.maps.Polyline[] =
              typeof primary.createPolylines === 'function'
                ? primary.createPolylines()
                : [];

            if (primary.viewport) {
              map.fitBounds(primary.viewport, 48);
            }

            const steps: RouteStepSummary[] = Array.isArray(primary.legs?.[0]?.steps)
              ? primary.legs[0].steps.map((s: any) => ({
                  instruction: String(
                    s.instructions ||
                      s.navigationInstruction?.instructions ||
                      'Siga pela via indicada'
                  ),
                  distanceMeters: Number(s.distanceMeters || 0),
                  durationText: s.durationMillis
                    ? formatRouteDuration(s.durationMillis / 1000)
                    : '',
                }))
              : [];

            setSdkPolylines(polylines);
            setRouteSummary({
              distanceMeters: Number(primary.distanceMeters || 0),
              durationSeconds: Math.round(Number(primary.durationMillis || 0) / 1000),
              travelMode,
              destinationName: targetName,
              steps,
              source: 'js-sdk',
            });
            setRouteLoading(false);
            return;
          }
        } catch (sdkErr: unknown) {
          const msg = String(sdkErr);
          if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('OVER_QUERY_LIMIT')) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          }
          // Fall through to REST proxy fallback below
        }
      }

      // Fallback: Server-side proxy to Routes REST API
      try {
        const res = await fetch('/api/routes/compute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            origin: activeOrigin,
            destination: targetLocation,
            travelMode,
          }),
        });

        if (res.status === 429) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }

        const data = await res.json();
        if (!res.ok) {
          if (data?.code === 'QUOTA_EXCEEDED') {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          }
          setRouteError(data?.error || 'Não foi possível calcular a rota.');
          setRouteLoading(false);
          return;
        }

        setRouteSummary({
          distanceMeters: data.distanceMeters,
          durationSeconds: data.durationSeconds,
          travelMode,
          destinationName: targetName,
          encodedPolyline: data.encodedPolyline,
          steps: data.steps || [],
          source: 'rest-proxy',
        });
      } catch {
        setRouteError('Erro de conexão ao calcular a rota de acesso.');
      } finally {
        setRouteLoading(false);
      }
    },
    [
      activeOrigin,
      activeDestinationLocation,
      activeDestinationName,
      map,
      routesLib,
      sdkPolylines,
      travelMode,
    ]
  );

  const handleClearRoute = () => {
    sdkPolylines.forEach((p) => p.setMap(null));
    setSdkPolylines([]);
    setRouteSummary(null);
    setRouteError(null);
  };

  const mapLoadFailed =
    apiLoadingStatus === APILoadingStatus.FAILED ||
    apiLoadingStatus === APILoadingStatus.AUTH_FAILURE;

  return (
    <section aria-labelledby="mapa-heading" className="space-y-4">
      {/* Toolbar */}
      <div className="bg-[#FFFDF9] border border-[#DDD3C1] rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 id="mapa-heading" className="text-lg sm:text-xl font-semibold text-[#1C241E]">
              Mapa Inteligente do Parque
            </h2>
            <p className="text-xs text-[#5E584D] mt-0.5">
              {park
                ? `${park.name} · ${displayedPois.length} ponto(s) validado(s) via Google Places`
                : placesLoading
                  ? 'Localizando Parque Estadual do Utinga via Google Places API...'
                  : 'Trilhas e perímetro OpenStreetMap ativos · Places em contingência'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
            <div
              role="group"
              aria-label="Alternar visualização entre mapa e lista"
              className="inline-flex p-1 bg-[#EFE8DA] border border-[#DDD3C1] rounded-xl"
            >
              <button
                type="button"
                onClick={() => setViewMode('mapa')}
                className={`inline-flex items-center gap-1.5 min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  viewMode === 'mapa'
                    ? 'bg-[#FFFDF9] text-[#1B4332] shadow-xs'
                    : 'text-[#5E584D] hover:text-[#1C241E]'
                }`}
              >
                <MapIcon className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Mapa</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('lista')}
                className={`inline-flex items-center gap-1.5 min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  viewMode === 'lista'
                    ? 'bg-[#FFFDF9] text-[#1B4332] shadow-xs'
                    : 'text-[#5E584D] hover:text-[#1C241E]'
                }`}
              >
                <List className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Lista ({displayedPois.length})</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowInternalTrails((v) => !v)}
              aria-pressed={showInternalTrails}
              data-testid="toggle-internal-trails"
              className={`inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 text-xs font-medium rounded-xl border transition-colors whitespace-nowrap cursor-pointer ${
                showInternalTrails
                  ? 'bg-[#1B4332] text-white border-[#1B4332]'
                  : 'bg-[#FFFDF9] text-[#3B4239] border-[#DDD3C1] hover:bg-[#F8F4EC]'
              }`}
            >
              <Route className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Trilhas internas</span>
            </button>

            <button
              type="button"
              onClick={() => setShowBicyclingLayer((v) => !v)}
              aria-pressed={showBicyclingLayer}
              className={`inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 text-xs font-medium rounded-xl border transition-colors whitespace-nowrap cursor-pointer ${
                showBicyclingLayer
                  ? 'bg-[#1B4332] text-white border-[#1B4332]'
                  : 'bg-[#FFFDF9] text-[#3B4239] border-[#DDD3C1] hover:bg-[#F8F4EC]'
              }`}
            >
              <Bike className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Ciclovias</span>
            </button>

            {!activeOrigin ? (
              <button
                type="button"
                onClick={handleRequestLocation}
                disabled={locationConsent === 'prompting'}
                className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 text-xs font-medium text-[#1B4332] bg-[#EFE8DA] hover:bg-[#E4DAC7] rounded-xl transition-colors whitespace-nowrap cursor-pointer"
              >
                <Crosshair className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {locationConsent === 'prompting'
                    ? 'Localizando...'
                    : 'Minha localização'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleRevokeLocation}
                className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 text-xs font-medium text-[#1C241E] bg-[#EFE8DA] hover:bg-[#E4DAC7] rounded-xl transition-colors whitespace-nowrap cursor-pointer"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Remover partida</span>
              </button>
            )}

            {mapCenter && (
              <button
                type="button"
                onClick={() => {
                  setIsPickingOriginOnMap((prev) => !prev);
                  setViewMode('mapa');
                }}
                aria-pressed={isPickingOriginOnMap}
                className={`inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 text-xs font-medium rounded-xl border transition-colors whitespace-nowrap cursor-pointer ${
                  isPickingOriginOnMap
                    ? 'bg-[#B44B1E] text-white border-[#B44B1E]'
                    : 'bg-[#FFFDF9] text-[#3B4239] border-[#DDD3C1] hover:bg-[#F8F4EC]'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {isPickingOriginOnMap ? 'Cancelar ponto' : 'Marcar ponto'}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* On-Demand Support POI Filters */}
        {mapCenter && (
          <div className="pt-3 border-t border-[#E7DFCE] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto sm:flex-wrap pb-1 sm:pb-0">
              <span className="text-xs font-medium text-[#5E584D] mr-1 whitespace-nowrap shrink-0">
                Apoio (sob demanda):
              </span>
              {SUPPORT_CATEGORIES.map((cat) => {
                const active = activeSupportCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => void handleToggleSupportCategory(cat.id)}
                    aria-pressed={active}
                    disabled={supportLoading && active}
                    className={`inline-flex items-center gap-1.5 min-h-[34px] px-3 py-1 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-[#0E7490] text-white border-[#0E7490]'
                        : 'bg-[#F8F4EC] text-[#3B4239] border-[#DDD3C1] hover:bg-[#EFE8DA]'
                    }`}
                  >
                    <SupportCategoryIcon category={cat.id} />
                    <span>{cat.label}</span>
                  </button>
                );
              })}
              {supportLoading && (
                <span className="text-xs text-[#5E584D] whitespace-nowrap shrink-0">
                  Buscando pontos...
                </span>
              )}
              {supportError && (
                <span className="text-xs text-[#991B1B] whitespace-nowrap shrink-0" role="alert">
                  {supportError}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setViewMode('mapa');
                focusOnPoint(mapCenter, 14);
              }}
              className="text-xs font-medium text-[#1B4332] hover:underline whitespace-nowrap shrink-0 self-start sm:self-center cursor-pointer"
            >
              Centralizar no Parque
            </button>
          </div>
        )}
      </div>

      {isPickingOriginOnMap && (
        <div
          role="status"
          data-testid="manual-pin-banner"
          className="p-3.5 rounded-xl bg-[#FBF0EA] border border-[#E8C5B4] text-xs text-[#7C2D12] flex flex-wrap items-center justify-between gap-3"
        >
          <span className="font-medium">
            Modo de ajuste ativo: clique no local exato onde você está no mapa para corrigir seu ponto de partida.
          </span>
          <button
            type="button"
            onClick={() => setIsPickingOriginOnMap(false)}
            className="px-2.5 py-1 text-xs font-medium bg-[#FFFDF9] border border-[#E8C5B4] rounded-lg hover:bg-[#F3DFD4] cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      )}

      {locationAssessment && locationAssessment.needsAttention && (
        <div
          role="status"
          data-testid="low-accuracy-warning"
          className="p-4 rounded-xl bg-[#FBF0EA] border border-[#E8C5B4] text-xs text-[#7C2D12] space-y-2.5"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-[#B44B1E] shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-semibold">
                Localização do navegador com baixa precisão
                {locationAssessment.accuracyLabel
                  ? ` (${locationAssessment.accuracyLabel})`
                  : ''}
                {locationAssessment.isFarFromPark && locationAssessment.distanceToParkLabel
                  ? ` — marcada a ${locationAssessment.distanceToParkLabel} do Parque do Utinga`
                  : ''}
              </p>
              <p className="text-[#8A3411] leading-relaxed">
                Em computadores sem GPS ou redes com IP roteado para outro servidor, o navegador
                costuma estimar a posição pelo provedor de internet, ficando longe da sua posição real.
                Você pode arrastar o pino azul no mapa, marcar sua posição clicando no mapa ou digitar
                seu endereço na busca.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pl-6">
            <button
              type="button"
              onClick={() => {
                setIsPickingOriginOnMap(true);
                setViewMode('mapa');
                if (mapCenter) focusOnPoint(mapCenter, 13);
              }}
              className="px-3 py-1.5 text-xs font-medium text-white bg-[#B44B1E] hover:bg-[#943C16] rounded-lg cursor-pointer"
            >
              Marcar meu ponto no mapa
            </button>
            <button
              type="button"
              onClick={handleRequestLocation}
              className="px-3 py-1.5 text-xs font-medium text-[#7C2D12] bg-[#FFFDF9] border border-[#E8C5B4] hover:bg-[#F3DFD4] rounded-lg cursor-pointer"
            >
              Recalibrar GPS
            </button>
            {userLocation && (
              <button
                type="button"
                onClick={() => {
                  setViewMode('mapa');
                  focusOnPoint(userLocation, 13);
                }}
                className="px-3 py-1.5 text-xs font-medium text-[#7C2D12] bg-[#FFFDF9] border border-[#E8C5B4] hover:bg-[#F3DFD4] rounded-lg cursor-pointer"
              >
                Ver marcação do navegador
              </button>
            )}
            {mapCenter && (
              <button
                type="button"
                onClick={() => {
                  setViewMode('mapa');
                  focusOnPoint(mapCenter, 14);
                }}
                className="px-3 py-1.5 text-xs font-medium text-[#7C2D12] bg-[#FFFDF9] border border-[#E8C5B4] hover:bg-[#F3DFD4] rounded-lg cursor-pointer"
              >
                Voltar ao Parque
              </button>
            )}
          </div>
        </div>
      )}

      {locationError && (
        <div
          role="status"
          className="p-3.5 rounded-xl bg-[#FBF0EA] border border-[#E8C5B4] text-xs text-[#7C2D12] flex items-center justify-between gap-3"
        >
          <span>{locationError}</span>
          <button
            type="button"
            onClick={() => setLocationError(null)}
            aria-label="Fechar aviso de localização"
            className="min-h-[32px] min-w-[32px] inline-flex items-center justify-center rounded-lg hover:bg-[#F3DFD4] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {placesError && (
        <div
          role="alert"
          data-testid="places-fallback-banner"
          className="p-3.5 rounded-xl bg-[#FBF0EA] border border-[#E8C5B4] text-xs text-[#7C2D12] flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertCircle
              className="w-4 h-4 text-[#B44B1E] shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="space-y-0.5">
              <p className="font-semibold">
                Pontos oficiais do Google Places em contingência
              </p>
              <p className="text-[#8A3411] leading-relaxed">
                {placesError} O mapa interativo e todas as 12 trilhas internas do OpenStreetMap
                continuam disponíveis normalmente.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRetryPlaces}
            disabled={placesLoading}
            className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-medium text-[#7C2D12] bg-[#FFFDF9] border border-[#E8C5B4] hover:bg-[#F3DFD4] rounded-lg transition-colors shrink-0 cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${placesLoading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Tentar novamente</span>
          </button>
        </div>
      )}

      {/* Main Split Area: Equal-Height Map + Route Calculator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Left: Map or List */}
        <div ref={mapContainerRef} className="lg:col-span-8 flex flex-col">
          {placesLoading && !mapCenter ? (
            <div
              aria-busy="true"
              className="h-[420px] lg:h-full lg:min-h-[580px] bg-[#FFFDF9] border border-[#DDD3C1] rounded-2xl flex flex-col items-center justify-center p-6 text-center space-y-3"
            >
              <div className="w-10 h-10 rounded-full border-2 border-[#1B4332] border-t-transparent animate-spin" />
              <p className="text-sm font-medium text-[#1C241E]">
                Validando localização do Parque Estadual do Utinga...
              </p>
              <p className="text-xs text-[#5E584D]">
                Consultando coordenadas reais via Google Places API (New).
              </p>
            </div>
          ) : viewMode === 'mapa' && mapCenter ? (
            <div
              data-testid="google-map-container"
              className="h-[420px] lg:h-full lg:min-h-[580px] w-full bg-[#EFE8DA] border border-[#DDD3C1] rounded-2xl overflow-hidden relative"
            >
              {mapLoadFailed ? (
                <div className="h-full flex flex-col items-center justify-center p-6 text-center bg-[#FFFDF9]">
                  <AlertCircle className="w-8 h-8 text-[#B44B1E] mb-2" aria-hidden="true" />
                  <p className="text-sm font-semibold text-[#1C241E]">
                    Mapa interativo temporariamente indisponível
                  </p>
                  <p className="text-xs text-[#5E584D] mt-1 max-w-sm">
                    Você pode alternar para a visualização em Lista para consultar os
                    pontos validados e calcular rotas.
                  </p>
                </div>
              ) : (
                <GoogleMap
                  mapId={mapId || 'DEMO_MAP_ID'}
                  defaultCenter={mapCenter}
                  defaultZoom={14}
                  gestureHandling="greedy"
                  draggableCursor={isPickingOriginOnMap ? 'crosshair' : undefined}
                  mapTypeControl={true}
                  streetViewControl={false}
                  fullscreenControl={true}
                  internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                  style={{ width: '100%', height: '100%' }}
                  onClick={(e) => {
                    if (isPickingOriginOnMap && e.detail.latLng) {
                      handleManualOriginSelect(e.detail.latLng);
                    }
                  }}
                >
                  <MapCameraFocus target={focusTarget} />
                  <BicyclingLayerOverlay enabled={showBicyclingLayer} />
                  <InternalTrailsOverlay
                    enabled={showInternalTrails}
                    selectedTrailId={selectedInternalTrailId}
                    isPickingOriginOnMap={isPickingOriginOnMap}
                    onSelectTrail={handleSelectInternalTrail}
                  />
                  <UserAccuracyCircleOverlay
                    center={isBrowserOriginActive ? userLocation : null}
                    radiusMeters={isBrowserOriginActive ? userLocationAccuracy : null}
                  />

                  {displayedPois.map((poi) => (
                    <PoiMarkerWithInfo
                      key={poi.id}
                      place={poi}
                      selected={selectedPoi?.id === poi.id}
                      onSelect={(p) => {
                        setSelectedPoi(p);
                        focusOnPoint(p.location, 15);
                      }}
                      onCloseInfo={() => setSelectedPoi(null)}
                      onRouteToPlace={(p) => {
                        setDestinationId(p.id);
                        if (activeOrigin) {
                          void computeAccessRoute(p);
                        }
                      }}
                    />
                  ))}

                  {isBrowserOriginActive && userLocation && (
                    <AdvancedMarker
                      position={userLocation}
                      draggable={true}
                      title="Sua localização informada pelo navegador (arraste para ajustar)"
                      onDragEnd={(e) => {
                        if (e.latLng) {
                          handleManualOriginSelect({
                            lat: e.latLng.lat(),
                            lng: e.latLng.lng(),
                          });
                        }
                      }}
                    >
                      <Pin
                        background="#0E7490"
                        borderColor="#FFFFFF"
                        glyphColor="#FFFFFF"
                        scale={1.0}
                      />
                    </AdvancedMarker>
                  )}

                  {customOrigin && !isBrowserOriginActive && (
                    <AdvancedMarker
                      position={customOrigin}
                      draggable={true}
                      title={`${originLabel || 'Ponto de partida'} (arraste para ajustar)`}
                      onDragEnd={(e) => {
                        if (e.latLng) {
                          handleManualOriginSelect({
                            lat: e.latLng.lat(),
                            lng: e.latLng.lng(),
                          });
                        }
                      }}
                    >
                      <Pin
                        background="#B44B1E"
                        borderColor="#FFFFFF"
                        glyphColor="#FFFFFF"
                        scale={1.0}
                      />
                    </AdvancedMarker>
                  )}

                  <RoutePolylineOverlay
                    routeSummary={routeSummary}
                    originPoint={activeOrigin}
                    destinationPoint={activeDestinationLocation}
                    travelMode={travelMode}
                    sdkPolylines={sdkPolylines}
                  />
                </GoogleMap>
              )}
            </div>
          ) : (
            /* List View of Places-validated POIs */
            <div
              data-testid="poi-list-view"
              className="flex-1 bg-[#FFFDF9] border border-[#DDD3C1] rounded-2xl divide-y divide-[#E7DFCE]"
            >
              {displayedPois.length === 0 ? (
                <div className="p-6 text-center space-y-2">
                  <p className="text-sm font-medium text-[#1C241E]">
                    Nenhum ponto do Google Places carregado no momento
                  </p>
                  <p className="text-xs text-[#5E584D]">
                    Você pode explorar as trilhas internas do OpenStreetMap logo abaixo ou tentar atualizar os pontos oficiais.
                  </p>
                </div>
              ) : (
                displayedPois.map((poi) => (
                  <div
                    key={poi.id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-[#1C241E]">
                          {poi.name}
                        </h3>
                        {poi.isParkMain && (
                          <span className="text-xs font-medium text-[#1B4332]">
                            · Entrada / Unidade principal
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#5E584D]">
                        {poi.primaryTypeLabel || 'Ponto de interesse'} ·{' '}
                        {poi.formattedAddress}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-[#5E584D] font-mono tabular-nums">
                        <span>
                          {poi.location.lat.toFixed(5)}, {poi.location.lng.toFixed(5)}
                        </span>
                        {typeof poi.rating === 'number' && (
                          <span>
                            Nota {poi.rating.toFixed(1)}
                            {poi.userRatingCount ? ` (${poi.userRatingCount})` : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPoi(poi);
                          focusOnPoint(poi.location, 15);
                          setViewMode('mapa');
                        }}
                        className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-[#1B4332] bg-[#EFE8DA] hover:bg-[#E4DAC7] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                      >
                        Ver no mapa
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDestinationId(poi.id);
                          setViewMode('mapa');
                          if (activeOrigin) {
                            void computeAccessRoute(poi);
                          }
                        }}
                        className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-white bg-[#1B4332] hover:bg-[#133124] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                      >
                        Traçar rota
                      </button>
                      {poi.googleMapsUri && (
                        <a
                          href={poi.googleMapsUri}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Abrir ${poi.name} no Google Maps`}
                          className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center text-[#5E584D] hover:text-[#1B4332] border border-[#DDD3C1] rounded-lg"
                        >
                          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Right: Route Calculator ONLY (Balanced height with Map) */}
        <aside className="lg:col-span-4 flex flex-col">
          <div className="flex-1 bg-[#FFFDF9] border border-[#DDD3C1] rounded-2xl p-5 flex flex-col justify-between gap-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Navigation className="w-4 h-4 text-[#B44B1E]" aria-hidden="true" />
                <h3 className="text-base font-semibold text-[#1C241E]">
                  Rota de Acesso ao Parque
                </h3>
              </div>

              {/* Origin Picker */}
              <div className="space-y-2">
                <label
                  htmlFor="origin-autocomplete"
                  className="block text-xs font-medium text-[#3B4239]"
                >
                  Ponto de partida
                </label>

                {originLabel && (
                  <div
                    data-testid="active-origin-card"
                    className="px-3 py-2.5 rounded-xl bg-[#EAF3EE] border border-[#C5DBC9] text-xs text-[#1C241E] space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{originLabel}</span>
                      <button
                        type="button"
                        onClick={handleRevokeLocation}
                        aria-label="Limpar ponto de partida"
                        className="shrink-0 text-[#5E584D] hover:text-[#1C241E] cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {activeOrigin && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#3B4239] font-mono tabular-nums">
                        <span>
                          {activeOrigin.lat.toFixed(5)}, {activeOrigin.lng.toFixed(5)}
                        </span>
                        {locationAssessment?.accuracyLabel && (
                          <span>Precisão: {locationAssessment.accuracyLabel}</span>
                        )}
                        {locationAssessment?.distanceToParkLabel && (
                          <span>Distância ao parque: {locationAssessment.distanceToParkLabel}</span>
                        )}
                        {!locationAssessment && park?.location && (
                          <span>
                            Distância ao parque:{' '}
                            {formatDistancePtBr(
                              assessLocationFix(activeOrigin, null, park.location)
                                .distanceToParkMeters || 0
                            )}
                          </span>
                        )}
                      </div>
                    )}

                    {locationRefining && (
                      <p className="text-[11px] text-[#1B4332]">
                        Refinando precisão do GPS...
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setIsPickingOriginOnMap(true);
                          setViewMode('mapa');
                        }}
                        className="text-[11px] font-medium text-[#1B4332] underline cursor-pointer"
                      >
                        Ajustar pino no mapa
                      </button>
                      {isBrowserOriginActive && (
                        <button
                          type="button"
                          onClick={handleRequestLocation}
                          className="text-[11px] font-medium text-[#1B4332] underline cursor-pointer"
                        >
                          Recalibrar GPS
                        </button>
                      )}
                      {activeOrigin && (
                        <button
                          type="button"
                          onClick={() => {
                            setViewMode('mapa');
                            focusOnPoint(activeOrigin, 15);
                          }}
                          className="text-[11px] font-medium text-[#5E584D] underline cursor-pointer"
                        >
                          Focar partida
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="relative">
                  <Search
                    className="w-4 h-4 text-[#5E584D] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id="origin-autocomplete"
                    type="text"
                    value={originQuery}
                    onChange={(e) => setOriginQuery(e.target.value)}
                    placeholder="Buscar endereço ou bairro em Belém..."
                    className="w-full min-h-[42px] pl-9 pr-3 py-2 text-sm bg-[#FFFDF9] border border-[#DDD3C1] rounded-xl text-[#1C241E] placeholder:text-[#7A7265] focus:outline-none focus:ring-2 focus:ring-[#B44B1E]/25 focus:border-[#B44B1E]"
                  />
                </div>

                {originSuggestions.length > 0 && (
                  <ul className="border border-[#DDD3C1] rounded-xl bg-[#FFFDF9] divide-y divide-[#E7DFCE] max-h-48 overflow-y-auto">
                    {originSuggestions.map((s, idx) => (
                      <li key={s.placePrediction?.placeId || idx}>
                        <button
                          type="button"
                          onClick={() => void handleSelectSuggestion(s)}
                          className="w-full text-left px-3 py-2.5 text-xs text-[#1C241E] hover:bg-[#F8F4EC] transition-colors cursor-pointer"
                        >
                          {s.placePrediction?.text.text}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {!activeOrigin && (
                  <p className="text-xs text-[#5E584D] leading-relaxed">
                    Sua localização só é acessada se você clicar em{' '}
                    <button
                      type="button"
                      onClick={handleRequestLocation}
                      className="underline font-medium text-[#1B4332] cursor-pointer"
                    >
                      Permitir minha localização
                    </button>
                    , ou clique em{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setIsPickingOriginOnMap(true);
                        setViewMode('mapa');
                      }}
                      className="underline font-medium text-[#1B4332] cursor-pointer"
                    >
                      Marcar meu ponto no mapa
                    </button>
                    .
                  </p>
                )}
              </div>

              {/* Destination */}
              <div className="space-y-1.5">
                <label
                  htmlFor="route-destination"
                  className="block text-xs font-medium text-[#3B4239]"
                >
                  Destino validado
                </label>
                <select
                  id="route-destination"
                  value={destinationId}
                  onChange={(e) => setDestinationId(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm bg-[#FFFDF9] border border-[#DDD3C1] rounded-xl text-[#1C241E] focus:outline-none focus:ring-2 focus:ring-[#B44B1E]/25 focus:border-[#B44B1E]"
                >
                  {displayedPois.length > 0 ? (
                    displayedPois.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))
                  ) : (
                    <option value="__osm_entrance__">
                      Portaria Principal — Utinga (OSM)
                    </option>
                  )}
                </select>
              </div>

              {/* Travel Mode */}
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-[#3B4239]">
                  Modo de deslocamento
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {TRAVEL_MODES.map((m) => {
                    const active = travelMode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setTravelMode(m.id)}
                        className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-2 text-xs font-medium rounded-xl border transition-colors whitespace-nowrap cursor-pointer ${
                          active
                            ? 'bg-[#1B4332] text-white border-[#1B4332]'
                            : 'bg-[#FFFDF9] text-[#3B4239] border-[#DDD3C1] hover:bg-[#F8F4EC]'
                        }`}
                      >
                        <TravelModeIcon mode={m.id} />
                        <span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void computeAccessRoute()}
                  disabled={routeLoading || !activeDestinationLocation}
                  className="flex-1 min-h-[44px] px-4 py-2 text-sm font-medium text-white bg-[#1B4332] hover:bg-[#133124] disabled:opacity-50 rounded-xl transition-colors cursor-pointer"
                >
                  {routeLoading ? 'Calculando rota...' : 'Calcular rota'}
                </button>
                {routeSummary && (
                  <button
                    type="button"
                    onClick={handleClearRoute}
                    className="min-h-[44px] px-3.5 py-2 text-xs font-medium text-[#3B4239] bg-[#EFE8DA] hover:bg-[#E4DAC7] rounded-xl transition-colors cursor-pointer"
                  >
                    Limpar
                  </button>
                )}
              </div>

              {routeError && (
                <p className="text-xs text-[#991B1B] leading-relaxed" role="alert">
                  {routeError}
                </p>
              )}

              {/* Route Result */}
              {routeSummary && (
                <div
                  data-testid="route-summary"
                  className="pt-3 border-t border-[#E7DFCE] space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#1B4332]">
                      Resumo do trajeto
                    </span>
                    <span className="text-xs text-[#5E584D]">Google Routes API</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-[#F8F4EC]">
                      <div className="text-xs text-[#5E584D]">Distância</div>
                      <div className="text-base font-semibold font-mono tabular-nums text-[#1C241E]">
                        {formatRouteDistance(routeSummary.distanceMeters)}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F8F4EC]">
                      <div className="text-xs text-[#5E584D]">Tempo estimado</div>
                      <div className="text-base font-semibold font-mono tabular-nums text-[#1C241E]">
                        {formatRouteDuration(routeSummary.durationSeconds)}
                      </div>
                    </div>
                  </div>
                  {routeSummary.steps.length > 0 && (
                    <details className="text-xs text-[#3B4239]">
                      <summary className="cursor-pointer font-medium text-[#1B4332] py-1">
                        Ver instruções passo a passo ({routeSummary.steps.length})
                      </summary>
                      <ol className="mt-2 space-y-1.5 max-h-40 overflow-y-auto pl-4 list-decimal">
                        {routeSummary.steps.map((step, i) => (
                          <li key={i} className="leading-relaxed">
                            {step.instruction}{' '}
                            <span className="font-mono text-[#5E584D]">
                              ({formatRouteDistance(step.distanceMeters)})
                            </span>
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Selected Trail Spotlight (Full-Width under Map + Route Split) */}
      {viewMode === 'mapa' && selectedInternalTrail && (
        <div
          data-testid="selected-internal-trail-card"
          className="bg-[#FFFDF9] border border-[#DDD3C1] rounded-2xl p-4 sm:p-5 space-y-2.5"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#5E584D]">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{
                    backgroundColor: getTrailStrokeColor(
                      selectedInternalTrail.category,
                      true
                    ),
                  }}
                  aria-hidden="true"
                />
                <span className="font-semibold text-[#1B4332]">
                  {getTrailCategoryLabel(selectedInternalTrail.category)}
                </span>
                {selectedInternalTrail.coverageStatus === 'partial' && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-medium text-[#8A3411]">
                      Traçado parcial no OSM
                    </span>
                  </>
                )}
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-[#1C241E]">
                {selectedInternalTrail.name}
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleFocusTrailFromBelow(selectedInternalTrail)}
                className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-[#1B4332] bg-[#EFE8DA] hover:bg-[#E4DAC7] rounded-lg transition-colors cursor-pointer"
              >
                Centralizar no mapa
              </button>
              <button
                type="button"
                onClick={() => setSelectedInternalTrailId(null)}
                aria-label="Fechar detalhes da trilha interna"
                className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg border border-[#DDD3C1] text-[#5E584D] hover:text-[#1C241E] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#3B4239]">
            <span>
              Traçado OSM:{' '}
              <strong className="font-mono tabular-nums text-[#1C241E]">
                {formatMetersPtBr(selectedInternalTrail.osmLengthMeters)}
              </strong>
            </span>
            {typeof selectedInternalTrail.officialMeters === 'number' && (
              <span>
                Referência oficial:{' '}
                <strong className="font-mono tabular-nums text-[#1C241E]">
                  {formatMetersPtBr(selectedInternalTrail.officialMeters)}
                </strong>
              </span>
            )}
            <span>Superfície: {selectedInternalTrail.surfaceLabel}</span>
            <span>Geometria: {OSM_ATTRIBUTION_LABEL}</span>
          </div>

          <p className="text-xs text-[#5E584D] leading-relaxed">
            {selectedInternalTrail.note}
          </p>
        </div>
      )}

      {/* Full-Width Section: Pista de Pedal & Trilhas Internas (OSM) */}
      <div
        data-testid="internal-trails-panel"
        className="bg-[#FFFDF9] border border-[#DDD3C1] rounded-2xl p-5 sm:p-6 space-y-5"
      >
        {/* Header + Filter Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#1B4332] shrink-0" aria-hidden="true" />
              <h3 className="text-base sm:text-lg font-semibold text-[#1C241E]">
                Pista de Pedal &amp; Trilhas Internas no Mapa (OSM)
              </h3>
            </div>
            <p className="text-xs text-[#5E584D]">
              {internalTrailSummary.count} traçados mapeados (
              <span className="font-mono tabular-nums font-semibold text-[#1C241E]">
                {formatDistancePtBr(internalTrailSummary.totalOsmMeters)}
              </span>{' '}
              no OpenStreetMap). Selecione qualquer percurso para destacar no mapa acima.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div
              role="group"
              aria-label="Filtrar traçados internos do mapa"
              className="inline-flex gap-1 p-1 bg-[#EFE8DA] rounded-xl text-xs font-medium"
            >
              {(
                [
                  { id: 'all', label: `Todas (${INTERNAL_TRAIL_GEOMETRIES.length})` },
                  { id: 'official', label: 'Oficiais (6)' },
                  { id: 'ramais', label: 'Ramais (6)' },
                ] as const
              ).map((tab) => {
                const active = internalTrailFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setInternalTrailFilter(tab.id)}
                    className={`min-h-[34px] px-3 py-1 rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-[#FFFDF9] text-[#1B4332] font-semibold shadow-xs'
                        : 'text-[#5E584D] hover:text-[#1C241E]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setShowInternalTrails((v) => !v)}
              className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-[#1B4332] bg-[#F8F4EC] border border-[#DDD3C1] hover:bg-[#EFE8DA] rounded-xl transition-colors whitespace-nowrap cursor-pointer"
            >
              {showInternalTrails ? 'Ocultar traçados' : 'Mostrar traçados'}
            </button>
          </div>
        </div>

        {/* Bike & Trails Featured Showcase Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl bg-[#F8F4EC] overflow-hidden grid grid-cols-1 sm:grid-cols-5 items-stretch">
            <div className="sm:col-span-2 relative min-h-[120px] bg-[#1B4332]">
              <img
                src="/assets/images/utinga_canopy_hero_1794596576600.jpg"
                alt="Ciclistas na pista principal asfaltada do Parque do Utinga"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="sm:col-span-3 p-4 flex flex-col justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0E7490]">
                  <Bike className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Ciclismo · Via principal (~4 km)</span>
                </div>
                <h4 className="text-sm font-semibold text-[#1C241E]">
                  Pedal sob a copa da floresta
                </h4>
                <p className="text-xs text-[#4B473F] leading-relaxed">
                  Trajeto pavimentado ligando a portaria ao Lago Bolonha, compartilhado com pedestres.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const mainTrack = getInternalTrailById(
                      INTERNAL_TRAIL_GEOMETRIES,
                      'pista-principal'
                    );
                    if (mainTrack) handleFocusTrailFromBelow(mainTrack);
                  }}
                  className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-white bg-[#1B4332] hover:bg-[#133124] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  Focar pista no mapa
                </button>
                {onOpenCyclingMode && (
                  <button
                    type="button"
                    onClick={onOpenCyclingMode}
                    className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-[#0E7490] bg-[#FFFDF9] border border-[#DDD3C1] hover:bg-[#EFE8DA] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Abrir Modo Ciclista
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-[#F8F4EC] overflow-hidden grid grid-cols-1 sm:grid-cols-5 items-stretch">
            <div className="sm:col-span-2 relative min-h-[120px] bg-[#1B4332]">
              <img
                src="/assets/images/utinga_trail_walk_1794596576881.jpg"
                alt="Trilha de chão batido em meio às árvores do Parque do Utinga"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="sm:col-span-3 p-4 flex flex-col justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#B44B1E]">
                  <Compass className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Trilhas · IDEFLOR-Bio &amp; OSM</span>
                </div>
                <h4 className="text-sm font-semibold text-[#1C241E]">
                  Trilhas ecológicas e ramais internos
                </h4>
                <p className="text-xs text-[#4B473F] leading-relaxed">
                  Explore percursos de terra batida, castanheiras, igarapés e mirantes dos mananciais.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setInternalTrailFilter('official')}
                  className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-white bg-[#B44B1E] hover:bg-[#943C16] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  Filtrar oficiais
                </button>
                {onOpenTrailExplorer && (
                  <button
                    type="button"
                    onClick={onOpenTrailExplorer}
                    className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-[#1B4332] bg-[#FFFDF9] border border-[#DDD3C1] hover:bg-[#EFE8DA] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Guia completo de trilhas
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Horizontal Color Legend */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs text-[#3B4239] bg-[#F8F4EC] rounded-xl p-3">
          <div className="flex items-center gap-2">
            <span className="w-4 h-1 rounded-full bg-[#0E7490] shrink-0" aria-hidden="true" />
            <span>Pista Principal (~4 km asfaltada)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-1 rounded-full bg-[#C2592A] shrink-0" aria-hidden="true" />
            <span>Trilhas oficiais IDEFLOR-Bio (5 no OSM)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-1 rounded-full bg-[#2D6A4F] shrink-0" aria-hidden="true" />
            <span>Outros ramais internos (OSM)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-2 border border-[#1B4332] bg-[#2D6A4F]/15 rounded-xs shrink-0" aria-hidden="true" />
            <span>Limite aproximado do parque</span>
          </div>
        </div>

        {/* Balanced 3-Column Grid of All Filtered Internal Trails */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredInternalTrails.map((trail) => {
            const isSelected = selectedInternalTrailId === trail.id;
            return (
              <button
                key={trail.id}
                type="button"
                onClick={() => handleFocusTrailFromBelow(trail)}
                className={`text-left p-3.5 rounded-xl border transition-colors flex flex-col justify-between gap-2 cursor-pointer ${
                  isSelected
                    ? 'bg-[#EAF3EE] border-[#1B4332]'
                    : 'bg-[#FFFDF9] border-[#E7DFCE] hover:bg-[#F8F4EC]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full mt-1 shrink-0"
                      style={{
                        backgroundColor: getTrailStrokeColor(
                          trail.category,
                          isSelected
                        ),
                      }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[#1C241E] leading-snug">
                        {trail.name}
                      </div>
                      <div className="text-[11px] text-[#5E584D] mt-0.5">
                        {trail.surfaceLabel}
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] font-medium text-[#1B4332] shrink-0">
                    {isSelected ? 'Ativa' : 'Focar'}
                  </span>
                </div>

                <div className="text-xs text-[#5E584D] font-mono tabular-nums pl-4">
                  {formatMetersPtBr(trail.osmLengthMeters)} (OSM)
                  {typeof trail.officialMeters === 'number'
                    ? ` · Oficial: ${formatMetersPtBr(trail.officialMeters)}`
                    : ''}
                  {trail.coverageStatus === 'partial' ? ' · Parcial' : ''}
                </div>
              </button>
            );
          })}
        </div>

        <p className="text-[11px] text-[#5E584D] leading-relaxed">
          A Trilha da Água Preta (1.761 m) não possui traçado nominal no OpenStreetMap e permanece apenas como dado oficial na aba Trilhas. Fonte: {OSM_ATTRIBUTION_LABEL}.
        </p>
      </div>

      {/* Full-Width Section: Park Hours, Accessibility & Validated POIs (when Places loaded) */}
      {(displayedPois.length > 0 ||
        (park &&
          ((park.weekdayDescriptions && park.weekdayDescriptions.length > 0) ||
            park.accessibility?.wheelchairAccessibleEntrance ||
            park.accessibility?.wheelchairAccessibleParking))) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {displayedPois.length > 0 && (
            <div className="lg:col-span-8 bg-[#FFFDF9] border border-[#DDD3C1] rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#1B4332]" aria-hidden="true" />
                <h3 className="text-sm sm:text-base font-semibold text-[#1C241E]">
                  Pontos validados no Google Places
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {displayedPois.slice(0, 12).map((poi) => (
                  <button
                    key={poi.id}
                    type="button"
                    onClick={() => {
                      setSelectedPoi(poi);
                      focusOnPoint(poi.location, 15);
                      setViewMode('mapa');
                      mapContainerRef.current?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                      });
                    }}
                    className="text-left p-3 rounded-xl bg-[#F8F4EC] hover:bg-[#EFE8DA] flex items-start justify-between gap-2 transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#1C241E] truncate">
                        {poi.name}
                      </div>
                      <div className="text-[11px] text-[#5E584D] truncate">
                        {poi.primaryTypeLabel || poi.formattedAddress}
                      </div>
                    </div>
                    <span className="text-[11px] font-medium text-[#1B4332] shrink-0">
                      Focar
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {park &&
            ((park.weekdayDescriptions && park.weekdayDescriptions.length > 0) ||
              park.accessibility?.wheelchairAccessibleEntrance ||
              park.accessibility?.wheelchairAccessibleParking) && (
              <div
                className={`${
                  displayedPois.length > 0 ? 'lg:col-span-4' : 'lg:col-span-12'
                } bg-[#FFFDF9] border border-[#DDD3C1] rounded-2xl p-5 space-y-3`}
              >
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#1B4332]" aria-hidden="true" />
                  <h3 className="text-sm sm:text-base font-semibold text-[#1C241E]">
                    Horários e Acessibilidade (Places)
                  </h3>
                </div>
                {(park.accessibility?.wheelchairAccessibleEntrance ||
                  park.accessibility?.wheelchairAccessibleParking ||
                  park.accessibility?.wheelchairAccessibleRestroom) && (
                  <div className="flex items-start gap-2 text-xs text-[#1B4332] bg-[#EAF3EE] p-3 rounded-xl">
                    <Accessibility className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      {[
                        park.accessibility.wheelchairAccessibleEntrance &&
                          'Entrada acessível',
                        park.accessibility.wheelchairAccessibleParking &&
                          'Estacionamento acessível',
                        park.accessibility.wheelchairAccessibleRestroom &&
                          'Banheiro acessível',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                )}
                {park.weekdayDescriptions && park.weekdayDescriptions.length > 0 && (
                  <details className="text-xs text-[#3B4239]">
                    <summary className="cursor-pointer font-medium text-[#1B4332]">
                      Ver horários informados no Google Places
                    </summary>
                    <ul className="mt-2 space-y-1 text-[11px] text-[#5E584D]">
                      {park.weekdayDescriptions.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
        </div>
      )}
    </section>
  );
}
