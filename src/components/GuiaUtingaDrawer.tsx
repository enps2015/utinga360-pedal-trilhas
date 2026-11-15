import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Compass, ExternalLink, MapPin, Send, X } from 'lucide-react';
import { INTERNAL_TRAIL_GEOMETRIES } from '../data/internalTrailsGeo.ts';
import type { ChatMessage, LatLngPoint, ValidatedPlace } from '../types/app.ts';
import { getInternalTrailById } from '../utils/trails.ts';
import { MarkdownMessage } from './MarkdownMessage.tsx';
import { UtingaLogoMark } from './UtingaLogo.tsx';

interface GuiaUtingaDrawerProps {
  open: boolean;
  onClose: () => void;
  initialPrompt?: string | null;
  onConsumeInitialPrompt: () => void;
  weatherContext: string | null;
  parkAddress: string | null;
  mapPois?: ValidatedPlace[];
  parkCoordinates?: LatLngPoint | null;
  onFocusTrailOnMap?: (internalTrailId: string) => void;
}

const TIME_OPTIONS = ['30 minutos', '1 hora', '2 horas', 'Meio período'];
const MODE_OPTIONS = ['Caminhar em trilha', 'Pedalar na pista principal'];
const DIFFICULTY_OPTIONS = ['Fácil', 'Média', 'Difícil'];
const STARTER_PROMPTS = [
  'Como chegar de bike ao Bar do Lulu?',
  'Qual trilha fácil fazer em 1 hora?',
  'Posso pedalar nas trilhas de terra?',
];

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    'Olá! Eu sou o **Guia Utinga**. Consulto os dados oficiais do **IDEFLOR-Bio**, os **12 traçados do OpenStreetMap** no mapa do app e o **Google Maps** para pontos e rotas no entorno do parque.\n\nVocê pode pedir recomendações por tempo, modalidade e dificuldade ou perguntar como chegar a pontos de ciclistas e trilhas.',
  timestamp: new Date().toISOString(),
};

export function GuiaUtingaDrawer({
  open,
  onClose,
  initialPrompt,
  onConsumeInitialPrompt,
  weatherContext,
  parkAddress,
  mapPois = [],
  parkCoordinates = null,
  onFocusTrailOnMap,
}: GuiaUtingaDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);

  const [selectedTime, setSelectedTime] = useState('1 hora');
  const [selectedMode, setSelectedMode] = useState('Caminhar em trilha');
  const [selectedDifficulty, setSelectedDifficulty] = useState('Fácil');

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      const timer = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 60);
      return () => window.clearTimeout(timer);
    }
  }, [messages, open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const sendMessageText = async (text: string, options?: { isRetry?: boolean }) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    let nextHistory = messages;
    if (!options?.isRetry) {
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: trimmed,
        timestamp: new Date().toISOString(),
      };
      nextHistory = [...messages, userMsg];
      setMessages(nextHistory);
      setInputValue('');
    }

    setLoading(true);
    setError(null);
    setLastFailedPrompt(null);

    try {
      const compactPois = mapPois.slice(0, 18).map((p) => ({
        id: p.id,
        name: p.name,
        formattedAddress: p.formattedAddress,
        primaryTypeLabel: p.primaryTypeLabel,
        lat: p.location?.lat,
        lng: p.location?.lng,
      }));

      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextHistory.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          weatherContext,
          parkAddress,
          mapPois: compactPois,
          parkCoordinates,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Não foi possível obter resposta do Guia Utinga.');
        setLastFailedPrompt(trimmed);
        setLoading(false);
        return;
      }

      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: data.reply,
        timestamp: new Date().toISOString(),
        groundingSources: Array.isArray(data.groundingSources)
          ? data.groundingSources
          : undefined,
        matchedTrailIds: Array.isArray(data.matchedTrailIds)
          ? data.matchedTrailIds
          : undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setError('Falha de rede ao consultar o Guia Utinga. Tente novamente.');
      setLastFailedPrompt(trimmed);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && initialPrompt) {
      const promptToSend = initialPrompt;
      onConsumeInitialPrompt();
      void sendMessageText(promptToSend);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPrompt]);

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendMessageText(inputValue);
  };

  const handleGuidedRecommendation = () => {
    const prompt = `Tenho ${selectedTime} disponíveis, pretendo ${selectedMode.toLowerCase()} e busco dificuldade ${selectedDifficulty}. O que você recomenda no Parque Estadual do Utinga e por quê?`;
    void sendMessageText(prompt);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="guia-utinga-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-[1px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-[#FFFDF9] h-full flex flex-col border-l border-[#DDD3C1] shadow-2xl"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E7DFCE] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <UtingaLogoMark className="w-9 h-9 shrink-0" />
            <div>
              <h2
                id="guia-utinga-title"
                className="text-base font-semibold text-[#1C241E]"
              >
                Guia Utinga
              </h2>
              <p className="text-xs text-[#5E584D]">
                Conectado ao mapa do parque, trilhas OSM e Google Maps
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar Guia Utinga"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl text-[#5E584D] hover:text-[#1C241E] hover:bg-[#F8F4EC] cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Guided Profile Builder */}
        <div className="px-5 py-3.5 bg-[#F8F4EC] border-b border-[#E7DFCE] space-y-2.5">
          <div className="text-xs font-semibold text-[#9A3B15]">
            Planejador rápido de recomendação
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label htmlFor="guia-time" className="sr-only">
                Tempo disponível
              </label>
              <select
                id="guia-time"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                className="w-full min-h-[38px] px-2.5 py-1 text-xs bg-[#FFFDF9] border border-[#DDD3C1] rounded-lg text-[#1C241E]"
              >
                {TIME_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    Tempo: {opt}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="guia-mode" className="sr-only">
                Modalidade
              </label>
              <select
                id="guia-mode"
                value={selectedMode}
                onChange={(e) => setSelectedMode(e.target.value)}
                className="w-full min-h-[38px] px-2.5 py-1 text-xs bg-[#FFFDF9] border border-[#DDD3C1] rounded-lg text-[#1C241E]"
              >
                {MODE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="guia-diff" className="sr-only">
                Dificuldade desejada
              </label>
              <select
                id="guia-diff"
                value={selectedDifficulty}
                onChange={(e) => setSelectedDifficulty(e.target.value)}
                className="w-full min-h-[38px] px-2.5 py-1 text-xs bg-[#FFFDF9] border border-[#DDD3C1] rounded-lg text-[#1C241E]"
              >
                {DIFFICULTY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    Nível: {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="button"
            onClick={handleGuidedRecommendation}
            disabled={loading}
            className="w-full min-h-[38px] px-3 py-1.5 text-xs font-medium text-[#1B4332] bg-[#FFFDF9] border border-[#DDD3C1] hover:bg-[#EFE8DA] rounded-lg transition-colors cursor-pointer"
          >
            Pedir recomendação com essas preferências
          </button>
        </div>

        {/* Messages */}
        <div
          data-testid="guia-messages"
          className="flex-1 overflow-y-auto p-5 space-y-4"
        >
          {messages.map((m) => {
            const matchedTrails =
              m.role === 'assistant' && m.matchedTrailIds?.length
                ? m.matchedTrailIds
                    .map((id) => getInternalTrailById(INTERNAL_TRAIL_GEOMETRIES, id))
                    .filter((t): t is NonNullable<typeof t> => Boolean(t))
                    .slice(0, 4)
                : [];
            const groundingSources =
              m.role === 'assistant' && m.groundingSources?.length
                ? m.groundingSources
                : [];

            return (
              <div
                key={m.id}
                className={`flex ${
                  m.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-[#1B4332] text-white whitespace-pre-wrap'
                      : 'bg-[#F8F4EC] border border-[#DDD3C1] text-[#1C241E]'
                  }`}
                >
                  {m.role === 'assistant' ? (
                    <div className="space-y-3">
                      <MarkdownMessage content={m.content} />

                      {matchedTrails.length > 0 && onFocusTrailOnMap && (
                        <div className="pt-2 border-t border-[#E5DEC9] space-y-1.5">
                          <div className="text-[11px] font-semibold text-[#5E584D]">
                            Abrir traçado citado no mapa
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {matchedTrails.map((trail) => (
                              <button
                                key={trail.id}
                                type="button"
                                onClick={() => onFocusTrailOnMap(trail.id)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#FFFDF9] border border-[#DDD3C1] hover:border-[#1B4332] text-[11px] font-medium text-[#1B4332] transition-colors cursor-pointer"
                              >
                                <Compass className="w-3 h-3 shrink-0" aria-hidden="true" />
                                <span>Ver no mapa: {trail.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {groundingSources.length > 0 && (
                        <div className="pt-2 border-t border-[#E5DEC9] space-y-1.5">
                          <div className="text-[11px] font-semibold text-[#5E584D]">
                            Locais e fontes consultados no Google Maps
                          </div>
                          <ul className="space-y-1">
                            {groundingSources.map((src) => (
                              <li key={src.uri}>
                                <a
                                  href={src.uri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0E7490] hover:text-[#1B4332] underline break-words"
                                >
                                  <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />
                                  <span>{src.title}</span>
                                  <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            );
          })}

          {messages.length === 1 && !loading && (
            <div className="space-y-2 pt-1">
              <div className="text-[11px] font-medium text-[#5E584D]">
                Perguntas rápidas para começar:
              </div>
              <div className="flex flex-wrap gap-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void sendMessageText(prompt)}
                    className="text-left text-xs font-medium text-[#1B4332] bg-[#EFE8DA] hover:bg-[#E4DAC7] px-3 py-2 rounded-xl transition-colors cursor-pointer"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-[#F8F4EC] border border-[#DDD3C1] rounded-2xl px-4 py-3 text-xs text-[#5E584D]">
                Consultando mapa do parque e Google Maps...
              </div>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900 space-y-2.5"
            >
              <p className="leading-relaxed">{error}</p>
              {lastFailedPrompt && (
                <button
                  type="button"
                  onClick={() => void sendMessageText(lastFailedPrompt, { isRetry: true })}
                  disabled={loading}
                  className="inline-flex items-center min-h-[34px] px-3 py-1 text-xs font-medium text-white bg-red-800 hover:bg-red-900 rounded-lg transition-colors cursor-pointer"
                >
                  Tentar novamente
                </button>
              )}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <form
          onSubmit={handleSubmit}
          className="p-4 border-t border-[#E7DFCE] bg-[#FFFDF9] flex items-center gap-2"
        >
          <label htmlFor="guia-input" className="sr-only">
            Escreva sua pergunta ao Guia Utinga
          </label>
          <input
            ref={inputRef}
            id="guia-input"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Pergunte sobre trilhas, pedal ou tempo disponível..."
            className="flex-1 min-h-[44px] px-3.5 py-2 text-sm bg-[#F8F4EC] border border-[#DDD3C1] rounded-xl text-[#1C241E] placeholder:text-[#7A7265] focus:outline-none focus:ring-2 focus:ring-[#B44B1E]/25 focus:border-[#B44B1E]"
          />
          <button
            type="submit"
            disabled={loading || !inputValue.trim()}
            aria-label="Enviar mensagem ao Guia Utinga"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center bg-[#B44B1E] hover:bg-[#943C16] disabled:opacity-50 text-white rounded-xl transition-colors cursor-pointer"
          >
            <Send className="w-4 h-4" aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  );
}
