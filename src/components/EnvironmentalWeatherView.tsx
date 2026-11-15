import { useState } from 'react';
import {
  AlertTriangle,
  CloudRain,
  RefreshCw,
  Sun,
  Thermometer,
  Wind,
} from 'lucide-react';
import type { LatLngPoint, WeatherResponseData } from '../types/app.ts';
import {
  buildWeatherReferenceNotes,
  findBestWeatherWindows,
  formatAlertSeverityPt,
  formatBelemTimestamp,
  formatWeatherConditionPt,
  formatWindCardinalPt,
} from '../utils/weatherFormat.ts';

interface EnvironmentalWeatherViewProps {
  weather: WeatherResponseData | null;
  loading: boolean;
  error: string | null;
  parkCoordinates: LatLngPoint | null;
  onRefresh: () => void;
}

export function EnvironmentalWeatherView({
  weather,
  loading,
  error,
  parkCoordinates,
  onRefresh,
}: EnvironmentalWeatherViewProps) {
  const [imgError, setImgError] = useState(false);

  const notes = weather
    ? buildWeatherReferenceNotes({
        precipitationProbability: weather.precipitationProbability,
        thunderstormProbability: weather.thunderstormProbability,
        temperatureC: weather.temperatureC,
        uvIndex: weather.uvIndex,
      })
    : [];

  const bestWindows = weather?.hourlyForecast
    ? findBestWeatherWindows(weather.hourlyForecast, 3)
    : [];

  return (
    <section aria-labelledby="clima-heading" className="space-y-6">
      {/* Visual Header */}
      <div className="bg-[#FFFDF9] border border-[#DDD3C1] rounded-2xl overflow-hidden">
        <div className="relative h-44 sm:h-52 bg-[#1B4332]">
          {!imgError ? (
            <img
              src="/assets/images/utinga_lake_view_1794596577825.jpg"
              alt="Manancial amazônico cercado por mata no Parque Estadual do Utinga"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#EFE8DA]">
              <CloudRain className="w-10 h-10 opacity-80" aria-hidden="true" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-end justify-between gap-3 text-white">
            <div>
              <p className="text-xs font-medium text-[#B8E3EE]">
                Google Maps Platform · Weather API
              </p>
              <h2
                id="clima-heading"
                className="text-2xl font-semibold tracking-tight mt-0.5"
              >
                Informações Ambientais
              </h2>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading || !parkCoordinates}
              className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 text-xs font-medium text-[#1C241E] bg-[#FFFDF9] hover:bg-[#EFE8DA] disabled:opacity-60 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{loading ? 'Atualizando...' : 'Atualizar leitura'}</span>
            </button>
          </div>
        </div>

        {/* Non-guarantee disclaimer */}
        <div className="p-4 sm:p-5 bg-[#FBF0EA] border-t border-[#E8C5B4] flex items-start gap-3">
          <AlertTriangle
            className="w-4 h-4 text-[#B44B1E] shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <p className="text-xs text-[#6B280D] leading-relaxed">
            <strong>Aviso importante:</strong> Os dados meteorológicos abaixo são apenas
            uma referência informativa obtida via Google Maps Weather API e{' '}
            <strong>não constituem garantia de segurança</strong>. Na região amazônica,
            pancadas de chuva e ventos podem surgir rapidamente; avalie o céu, o piso e
            as orientações da gestão do parque no local.
          </p>
        </div>
      </div>

      {/* Loading State */}
      {loading && !weather && (
        <div
          aria-busy="true"
          className="bg-[#FFFDF9] border border-[#DDD3C1] rounded-2xl p-6 space-y-4"
        >
          <div className="h-5 w-48 bg-[#EFE8DA] rounded animate-pulse" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((k) => (
              <div key={k} className="h-20 bg-[#F8F4EC] rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div
          role="alert"
          className="bg-[#FFFDF9] border border-red-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div>
            <p className="text-sm font-semibold text-red-900">
              Não foi possível carregar os dados meteorológicos
            </p>
            <p className="text-xs text-red-800 mt-1">{error}</p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={!parkCoordinates || loading}
            className="min-h-[40px] px-4 py-2 text-xs font-medium text-white bg-red-800 hover:bg-red-900 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Populated Weather */}
      {weather && (
        <>
          {/* Update timestamp & Coordinates */}
          <div className="bg-[#FFFDF9] border border-[#DDD3C1] rounded-2xl p-5 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#E7DFCE]">
              <div>
                <div className="text-xs text-[#5E584D]">Condição atual no parque</div>
                <div className="text-lg font-semibold text-[#1C241E] mt-0.5 flex items-center gap-2">
                  {weather.iconBaseUri && (
                    <img
                      src={`${weather.iconBaseUri}.png`}
                      alt=""
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                      className="w-6 h-6"
                    />
                  )}
                  <span>
                    {formatWeatherConditionPt(weather.conditionType, weather.conditionText)}
                  </span>
                </div>
              </div>
              <div className="text-xs text-[#5E584D] font-mono tabular-nums space-y-0.5 sm:text-right">
                <div>
                  Atualizado em: {formatBelemTimestamp(weather.observationTime || weather.fetchedAt)}{' '}
                  (Belém)
                </div>
                <div>
                  Coord. consultadas: {weather.coordinatesUsed.lat.toFixed(4)},{' '}
                  {weather.coordinatesUsed.lng.toFixed(4)}
                </div>
              </div>
            </div>

            {/* Key Telemetry */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-3.5 rounded-xl bg-[#F8F4EC] border border-[#DDD3C1]">
                <div className="flex items-center gap-1.5 text-xs text-[#5E584D]">
                  <Thermometer className="w-3.5 h-3.5 text-[#B44B1E]" aria-hidden="true" />
                  <span>Temperatura</span>
                </div>
                <div className="text-2xl font-semibold font-mono tabular-nums text-[#1C241E] mt-1">
                  {weather.temperatureC !== null
                    ? `${weather.temperatureC.toFixed(1)} °C`
                    : '—'}
                </div>
                <div className="text-xs text-[#5E584D] font-mono tabular-nums mt-0.5">
                  Sensação:{' '}
                  {weather.feelsLikeC !== null
                    ? `${weather.feelsLikeC.toFixed(1)} °C`
                    : '—'}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F8F4EC] border border-[#DDD3C1]">
                <div className="flex items-center gap-1.5 text-xs text-[#5E584D]">
                  <CloudRain className="w-3.5 h-3.5 text-[#0E7490]" aria-hidden="true" />
                  <span>Chuva &amp; Umidade</span>
                </div>
                <div className="text-2xl font-semibold font-mono tabular-nums text-[#1C241E] mt-1">
                  {weather.precipitationProbability !== null
                    ? `${weather.precipitationProbability}%`
                    : '—'}
                </div>
                <div className="text-xs text-[#5E584D] font-mono tabular-nums mt-0.5">
                  Umidade:{' '}
                  {weather.relativeHumidity !== null
                    ? `${weather.relativeHumidity}%`
                    : '—'}
                  {weather.precipitationMm !== null
                    ? ` · ${weather.precipitationMm} mm`
                    : ''}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F8F4EC] border border-[#DDD3C1]">
                <div className="flex items-center gap-1.5 text-xs text-[#5E584D]">
                  <Wind className="w-3.5 h-3.5 text-[#1B4332]" aria-hidden="true" />
                  <span>Vento &amp; Trovoada</span>
                </div>
                <div className="text-2xl font-semibold font-mono tabular-nums text-[#1C241E] mt-1">
                  {weather.windSpeedKmh !== null
                    ? `${weather.windSpeedKmh} km/h`
                    : '—'}
                </div>
                <div className="text-xs text-[#5E584D] mt-0.5">
                  {formatWindCardinalPt(weather.windCardinal)}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F8F4EC] border border-[#DDD3C1]">
                <div className="flex items-center gap-1.5 text-xs text-[#5E584D]">
                  <Sun className="w-3.5 h-3.5 text-[#B44B1E]" aria-hidden="true" />
                  <span>Índice UV &amp; Visibilidade</span>
                </div>
                <div className="text-2xl font-semibold font-mono tabular-nums text-[#1C241E] mt-1">
                  {weather.uvIndex !== null ? `UV ${weather.uvIndex}` : '—'}
                </div>
                <div className="text-xs text-[#5E584D] font-mono tabular-nums mt-0.5">
                  Trovoadas:{' '}
                  {weather.thunderstormProbability !== null
                    ? `${weather.thunderstormProbability}%`
                    : '—'}
                </div>
              </div>
            </div>

            {/* Contextual Notes */}
            <div className="space-y-2 pt-2">
              <h3 className="text-sm font-semibold text-[#1C241E]">
                Leitura contextual para trilha e pedal
              </h3>
              <ul className="space-y-1.5 text-sm text-[#3B4239]">
                {notes.map((n) => (
                  <li key={n} className="leading-relaxed">
                    • {n}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Active Alerts */}
          <div className="bg-[#FFFDF9] border border-[#DDD3C1] rounded-2xl p-5 space-y-3">
            <h3 className="text-base font-semibold text-[#1C241E]">
              Alertas meteorológicos ativos
            </h3>
            {weather.alerts.length === 0 ? (
              <p className="text-sm text-[#3B4239]">
                Nenhum alerta meteorológico público ativo retornado neste momento pela
                Weather API para esta área.
              </p>
            ) : (
              <div className="space-y-3">
                {weather.alerts.map((alert) => (
                  <div
                    key={alert.alertId}
                    className="p-4 rounded-xl bg-red-50 border border-red-200 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-red-950">
                        {alert.title}
                      </span>
                      <span className="text-xs font-medium text-red-900">
                        {formatAlertSeverityPt(alert.severity)}
                      </span>
                    </div>
                    {alert.areaName && (
                      <p className="text-xs text-red-900">Área: {alert.areaName}</p>
                    )}
                    {alert.description && (
                      <p className="text-sm text-red-950 leading-relaxed">
                        {alert.description}
                      </p>
                    )}
                    {alert.instructions.length > 0 && (
                      <ul className="text-xs text-red-900 space-y-1">
                        {alert.instructions.map((inst) => (
                          <li key={inst}>• {inst}</li>
                        ))}
                      </ul>
                    )}
                    <p className="text-xs text-red-900 pt-1">
                      Fonte:{' '}
                      {alert.dataSource.authorityUri ? (
                        <a
                          href={alert.dataSource.authorityUri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline font-medium"
                        >
                          {alert.dataSource.name}
                        </a>
                      ) : (
                        alert.dataSource.name
                      )}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Hourly 12h Forecast */}
          {weather.hourlyForecast && weather.hourlyForecast.length > 0 && (
            <div
              data-testid="hourly-weather-forecast"
              className="bg-[#FFFDF9] border border-[#DDD3C1] rounded-2xl p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-[#1C241E]">
                  Previsão hora a hora (próximas {weather.hourlyForecast.length}h)
                </h3>
                <span className="text-xs text-[#5E584D]">
                  Horário local de Belém · Escolha a janela com menor chance de chuva
                </span>
              </div>
              {bestWindows.length > 0 && (
                <div className="px-3.5 py-2.5 rounded-xl bg-[#EAF3EE] text-xs text-[#1B4332] flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold">Menores chances de chuva:</span>
                  <span className="font-mono tabular-nums text-[#1C241E]">
                    {bestWindows
                      .map(
                        (w) =>
                          `${w.hourLabel} (${w.precipitationProbability ?? 0}%${
                            w.tempC !== null ? ` · ${Math.round(w.tempC)}°C` : ''
                          })`
                      )
                      .join(' · ')}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
                {weather.hourlyForecast.map((hour, idx) => (
                  <div
                    key={`${hour.hourLabel}-${idx}`}
                    className="p-3 rounded-xl bg-[#F8F4EC] border border-[#DDD3C1] space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold font-mono tabular-nums text-[#0E7490]">
                        {hour.hourLabel}
                      </span>
                      {hour.iconBaseUri && (
                        <img
                          src={`${hour.iconBaseUri}.png`}
                          alt=""
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                          className="w-5 h-5"
                        />
                      )}
                    </div>
                    <div className="text-base font-semibold font-mono tabular-nums text-[#1C241E]">
                      {hour.tempC !== null ? `${Math.round(hour.tempC)}°C` : '—'}
                    </div>
                    <div className="text-[11px] text-[#3B4239] leading-snug line-clamp-2">
                      {formatWeatherConditionPt(hour.conditionType, hour.conditionText)}
                    </div>
                    <div className="text-[11px] text-[#5E584D] font-mono tabular-nums">
                      Chuva:{' '}
                      {hour.precipitationProbability !== null
                        ? `${hour.precipitationProbability}%`
                        : '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3-day outlook */}
          {weather.dailyForecast.length > 0 && (
            <div className="bg-[#FFFDF9] border border-[#DDD3C1] rounded-2xl p-5 space-y-4">
              <h3 className="text-base font-semibold text-[#1C241E]">
                Tendência para os próximos dias
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {weather.dailyForecast.map((day) => (
                  <div
                    key={day.dateLabel}
                    className="p-4 rounded-xl bg-[#F8F4EC] border border-[#DDD3C1] space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold font-mono tabular-nums text-[#1C241E]">
                        {day.dateLabel}
                      </span>
                      <span className="text-xs font-mono tabular-nums text-[#5E584D]">
                        {day.minTempC !== null ? `${Math.round(day.minTempC)}°` : '—'} /{' '}
                        {day.maxTempC !== null ? `${Math.round(day.maxTempC)}°` : '—'}
                      </span>
                    </div>
                    <div className="text-sm text-[#1C241E]">
                      {formatWeatherConditionPt(null, day.dayCondition)}
                    </div>
                    <div className="text-xs text-[#5E584D] font-mono tabular-nums">
                      Chuva:{' '}
                      {day.precipitationProbability !== null
                        ? `${day.precipitationProbability}%`
                        : '—'}
                      {day.thunderstormProbability !== null
                        ? ` · Trovoada: ${day.thunderstormProbability}%`
                        : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
