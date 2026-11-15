import { useEffect, useState } from 'react';
import { ExternalLink, MapPin, X, ZoomIn } from 'lucide-react';
import { OFFICIAL_SOURCE_ORG, OFFICIAL_SOURCE_URL } from '../data/parkData.ts';
import { UtingaLogo } from './UtingaLogo.tsx';

const AUTHOR_IMAGE_SRC = '/assets/aistudio/image_5e143993.png';

const AUTHOR_LINKS = [
  {
    id: 'linkedin',
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/in/ericpimentel-dados/',
    ariaLabel: 'LinkedIn de Eric Pimentel (abre em nova aba)',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    href: 'https://www.instagram.com/eric.n.pimentel/',
    ariaLabel: 'Instagram de Eric Pimentel (abre em nova aba)',
  },
  {
    id: 'github',
    label: 'github.com/enps2015',
    href: 'https://github.com/enps2015',
    ariaLabel: 'GitHub de Eric Pimentel: github.com/enps2015 (abre em nova aba)',
  },
] as const;

function SocialIcon({ id }: { id: 'linkedin' | 'instagram' | 'github' }) {
  if (id === 'linkedin') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-3.5 h-3.5 shrink-0"
        aria-hidden="true"
      >
        <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
      </svg>
    );
  }
  if (id === 'instagram') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-3.5 h-3.5 shrink-0"
        aria-hidden="true"
      >
        <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="w-3.5 h-3.5 shrink-0"
      aria-hidden="true"
    >
      <path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2z" />
    </svg>
  );
}

export function SourcesFooter() {
  const [imageModalOpen, setImageModalOpen] = useState(false);

  useEffect(() => {
    if (!imageModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setImageModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [imageModalOpen]);

  return (
    <footer className="mt-10 border-t border-[#DDD3C1] bg-[#FFFDF9]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-7 space-y-6">
        {/* Author Section */}
        <section
          aria-labelledby="author-heading"
          className="flex flex-col sm:flex-row sm:items-center gap-5"
        >
          <button
            type="button"
            onClick={() => setImageModalOpen(true)}
            aria-label="Ampliar ilustração do autor do projeto Eric Pimentel"
            className="group relative w-28 h-28 sm:w-32 sm:h-32 rounded-2xl overflow-hidden border border-[#DDD3C1] bg-[#F8F4EC] shrink-0 self-start sm:self-center cursor-pointer focus-visible:outline-offset-2"
          >
            <img
              src={AUTHOR_IMAGE_SRC}
              alt="Ilustração temática de Eric Pimentel em Belém-PA com bicicleta, mapa georreferenciado e ciência de dados"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <span className="absolute right-1.5 bottom-1.5 inline-flex items-center justify-center w-7 h-7 rounded-lg bg-black/65 text-white opacity-90 group-hover:opacity-100 transition-opacity">
              <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
            </span>
          </button>

          <div className="space-y-2 flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
              <span className="font-semibold text-[#9A3B15]">
                Autor do Projeto
              </span>
              <span aria-hidden="true" className="text-[#DDD3C1]">
                ·
              </span>
              <span className="inline-flex items-center gap-1 font-medium text-[#5E584D]">
                <MapPin className="w-3.5 h-3.5 text-[#1B4332]" aria-hidden="true" />
                Belém-PA 2026
              </span>
            </div>

            <h2
              id="author-heading"
              className="text-lg sm:text-xl font-semibold text-[#1C241E] tracking-tight"
            >
              Eric Pimentel
            </h2>

            <p className="text-xs sm:text-sm text-[#3B4239] leading-relaxed max-w-2xl">
              Idealização e desenvolvimento do Utinga360 - Pedal &amp; Natureza, conectando
              ciclismo, georreferenciamento, dados públicos e tecnologia sustentável no Parque
              Estadual do Utinga.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {AUTHOR_LINKS.map((link) => (
                <a
                  key={link.id}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={link.ariaLabel}
                  className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 text-xs font-medium text-[#1B4332] bg-[#F8F4EC] border border-[#DDD3C1] hover:border-[#1B4332] hover:bg-[#EFE8DA] rounded-xl transition-colors whitespace-nowrap"
                >
                  <SocialIcon id={link.id} />
                  <span>{link.label}</span>
                  <ExternalLink className="w-3 h-3 opacity-75" aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* Data Sources & Transparency */}
        <div className="pt-6 border-t border-[#E7DFCE] flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs text-[#5E584D]">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <UtingaLogo size="sm" />
              <span aria-hidden="true" className="text-[#DDD3C1]">
                ·
              </span>
              <span className="font-medium text-[#1C241E]">
                Pedal &amp; Natureza · Fontes e Transparência
              </span>
            </div>
            <p className="leading-relaxed max-w-3xl">
              Extensões e dificuldades das trilhas baseadas nos dados publicados pelo{' '}
              {OFFICIAL_SOURCE_ORG}. Traçados vetoriais das trilhas internas, via principal e
              limites do parque via OpenStreetMap (© contribuidores do OpenStreetMap, licença
              ODbL). Mapas, locais validados, rotas de acesso e meteorologia via Google Maps
              Platform. Registros do diário ficam salvos apenas no armazenamento local do seu
              navegador.
            </p>
          </div>

          <a
            href={OFFICIAL_SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 text-xs font-medium text-[#1B4332] bg-[#EFE8DA] hover:bg-[#E4DAC7] rounded-xl transition-colors whitespace-nowrap shrink-0 self-start md:self-center"
          >
            <span>Fonte oficial IDEFLOR-Bio</span>
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>

      {/* Author Illustration Zoom Modal */}
      {imageModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="author-modal-title"
          onClick={() => setImageModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-[2px]"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[#FFFDF9] border border-[#DDD3C1] rounded-2xl overflow-hidden shadow-2xl"
          >
            <div className="px-4 py-3 border-b border-[#E7DFCE] flex items-center justify-between gap-3">
              <div>
                <h3
                  id="author-modal-title"
                  className="text-sm font-semibold text-[#1C241E]"
                >
                  Eric Pimentel — Autor do Projeto
                </h3>
                <p className="text-xs text-[#5E584D]">Belém-PA 2026 · Utinga360</p>
              </div>
              <button
                type="button"
                onClick={() => setImageModalOpen(false)}
                aria-label="Fechar imagem do autor"
                className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl text-[#5E584D] hover:text-[#1C241E] hover:bg-[#F8F4EC] cursor-pointer"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            <div className="bg-[#F8F4EC] p-3">
              <img
                src={AUTHOR_IMAGE_SRC}
                alt="Ilustração completa de Eric Pimentel em Belém-PA"
                className="w-full aspect-square object-contain rounded-xl"
              />
            </div>
          </div>
        </div>
      )}
    </footer>
  );
}

