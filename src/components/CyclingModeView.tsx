import { useState } from 'react';
import { Bike, Footprints, Info, Map as MapIcon, MessageSquare, ShieldCheck } from 'lucide-react';
import { CYCLING_MODE_INFO, OFFICIAL_SOURCE_URL } from '../data/parkData.ts';

interface CyclingModeViewProps {
  onAskGuideCycling: () => void;
  onGoToMapRoute: () => void;
  onViewMainTrackOnMap?: () => void;
}

export function CyclingModeView({
  onAskGuideCycling,
  onGoToMapRoute,
  onViewMainTrackOnMap,
}: CyclingModeViewProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <section aria-labelledby="ciclista-heading" className="space-y-6">
      {/* Hero Card */}
      <div className="bg-[#FFFDF9] border border-[#DDD3C1] rounded-2xl overflow-hidden">
        <div className="relative h-52 sm:h-64 bg-[#1B4332]">
          {!imgError ? (
            <img
              src="/assets/images/utinga_canopy_hero_1794596576600.jpg"
              alt="Ciclistas pedalando pela pista asfaltada cercada por floresta no Parque Estadual do Utinga"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#EFE8DA]">
              <Bike className="w-10 h-10 opacity-80" aria-hidden="true" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6 text-white">
            <p className="text-xs font-medium text-[#F5D0BC]">
              Modo Ciclista · {CYCLING_MODE_INFO.approximateTrackLengthLabel}
            </p>
            <h2
              id="ciclista-heading"
              className="text-2xl sm:text-3xl font-semibold tracking-tight mt-1"
            >
              {CYCLING_MODE_INFO.title}
            </h2>
          </div>
        </div>

        <div className="p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1 max-w-2xl">
              <div className="flex items-center gap-2 text-xs text-[#5E584D]">
                <span className="font-mono font-semibold tabular-nums text-[#1C241E]">
                  ~4 km (extensão aproximada)
                </span>
                <span aria-hidden="true">·</span>
                <span>Via principal pavimentada</span>
                <span aria-hidden="true">·</span>
                <span>Convivência com pedestres</span>
              </div>
              <p className="text-sm text-[#3B4239] leading-relaxed">
                {CYCLING_MODE_INFO.publishedOverview}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              {onViewMainTrackOnMap && (
                <button
                  type="button"
                  onClick={onViewMainTrackOnMap}
                  className="inline-flex items-center gap-1.5 min-h-[42px] px-4 py-2 text-xs font-semibold text-white bg-[#1B4332] hover:bg-[#133124] rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                >
                  <MapIcon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Ver pista de ~4 km no mapa</span>
                </button>
              )}
              <button
                type="button"
                onClick={onGoToMapRoute}
                className="min-h-[42px] px-4 py-2 text-xs font-medium text-[#0E7490] bg-[#FFFDF9] border border-[#0E7490]/40 hover:bg-[#F8F4EC] rounded-xl transition-colors whitespace-nowrap cursor-pointer"
              >
                Rota de bike até o parque
              </button>
              <button
                type="button"
                onClick={onAskGuideCycling}
                className="inline-flex items-center gap-1.5 min-h-[42px] px-4 py-2 text-xs font-medium text-[#1B4332] bg-[#EFE8DA] hover:bg-[#E4DAC7] rounded-xl transition-colors whitespace-nowrap cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Planejar pedal com Guia</span>
              </button>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#F8F4EC] flex items-start gap-2.5">
            <Info className="w-4 h-4 text-[#B44B1E] shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-[#3B4239] leading-relaxed">
              {CYCLING_MODE_INFO.nonGeoreferencedNotice}
            </p>
          </div>
        </div>
      </div>

      {/* Pedestrian vs Cyclist Differentiation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CYCLING_MODE_INFO.circulationRules.map((item, idx) => {
          const isCyclist = idx === 0;
          return (
            <div
              key={item.audience}
              className="bg-[#FFFDF9] border border-[#DDD3C1] rounded-2xl p-5 space-y-2.5"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-[#1C241E]">
                {isCyclist ? (
                  <Bike className="w-4 h-4 text-[#0E7490]" aria-hidden="true" />
                ) : (
                  <Footprints className="w-4 h-4 text-[#B44B1E]" aria-hidden="true" />
                )}
                <span>Circulação: {item.audience}</span>
              </div>
              <p className="text-xs font-semibold text-[#1B4332]">{item.rule}</p>
              <p className="text-sm text-[#3B4239] leading-relaxed">{item.detail}</p>
            </div>
          );
        })}
      </div>

      {/* Cycling Options & Safety */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#FFFDF9] border border-[#DDD3C1] rounded-2xl p-5 space-y-4">
          <h3 className="text-base font-semibold text-[#1C241E]">
            Opções de pedal no parque
          </h3>
          <div className="divide-y divide-[#E7DFCE]">
            {CYCLING_MODE_INFO.cyclingOptions.map((opt) => (
              <div key={opt.title} className="py-3 first:pt-0 last:pb-0 space-y-1">
                <div className="text-sm font-semibold text-[#1C241E]">{opt.title}</div>
                <p className="text-sm text-[#3B4239] leading-relaxed">
                  {opt.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#FFFDF9] border border-[#DDD3C1] rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#1B4332]" aria-hidden="true" />
            <h3 className="text-base font-semibold text-[#1C241E]">
              Recomendações de segurança
            </h3>
          </div>
          <ul className="space-y-2.5 text-sm text-[#3B4239]">
            {CYCLING_MODE_INFO.safetyRecommendations.map((tip) => (
              <li key={tip} className="flex items-start gap-2.5 leading-relaxed">
                <span
                  aria-hidden="true"
                  className="mt-2 w-1.5 h-1.5 rounded-full bg-[#B44B1E] shrink-0"
                />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
          <div className="pt-2 border-t border-[#E7DFCE]">
            <a
              href={OFFICIAL_SOURCE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-[#1B4332] underline underline-offset-2"
            >
              Consultar orientações institucionais no portal do IDEFLOR-Bio
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
