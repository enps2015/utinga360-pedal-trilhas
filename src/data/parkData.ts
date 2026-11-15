import type { OfficialTrail } from '../types/app.ts';

export const OFFICIAL_SOURCE_URL =
  'https://ideflorbio.pa.gov.br/parque-estadual-do-utinga-camillo-vianna/';

export const OFFICIAL_SOURCE_ORG =
  'IDEFLOR-Bio (Instituto de Desenvolvimento Florestal e da Biodiversidade do Estado do Pará)';

export const PARK_OFFICIAL_NAME = 'Parque Estadual do Utinga Camillo Vianna';

export const OFFICIAL_TRAILS: OfficialTrail[] = [
  {
    id: 'amapa',
    name: 'Trilha da Amapá',
    distanceMeters: 336,
    difficulty: 'Fácil',
    publishedSummary:
      'Percurso curto de caminhada ecológica em ambiente florestal, indicado para visitantes que buscam contato inicial com a mata amazônica.',
    nonGeoreferencedNote:
      'Trecho inicial georreferenciado no mapa via OpenStreetMap (111 m mapeados de 336 m oficiais publicados pelo IDEFLOR-Bio); o restante do traçado na mata e altimetria não constam em base oficial pública.',
    sourceLabel: 'IDEFLOR-Bio — Dados oficiais publicados',
  },
  {
    id: 'patua',
    name: 'Trilha do Patuá',
    distanceMeters: 765,
    difficulty: 'Fácil',
    publishedSummary:
      'Caminhada de extensão moderada e nível fácil pela vegetação preservada do parque, adequada para visitas contemplativas e educação ambiental.',
    nonGeoreferencedNote:
      'Traçado interno georreferenciado exibido no mapa via OpenStreetMap (ODbL, registrado como Trilha do Patauá, ~791 m); condições momentâneas do piso dependem da gestão do parque.',
    sourceLabel: 'IDEFLOR-Bio — Dados oficiais publicados',
  },
  {
    id: 'bolonha',
    name: 'Trilha da Bolonha',
    distanceMeters: 776,
    difficulty: 'Fácil',
    publishedSummary:
      'Trilha ecológica de nível fácil com 776 metros de extensão oficial, associada ao entorno da área de proteção dos mananciais do parque.',
    nonGeoreferencedNote:
      'Traçado parcial exibido no mapa via OpenStreetMap (451 m mapeados de 776 m totais publicados pelo IDEFLOR-Bio); trechos complementares não constam em base vetorial oficial.',
    sourceLabel: 'IDEFLOR-Bio — Dados oficiais publicados',
  },
  {
    id: 'acapu',
    name: 'Trilha do Acapú',
    distanceMeters: 1142,
    difficulty: 'Média',
    publishedSummary:
      'Percurso intermediário com 1.142 metros em mata fechada, exigindo ritmo constante, calçado fechado e atenção ao terreno natural.',
    nonGeoreferencedNote:
      'Traçado parcial exibido no mapa via OpenStreetMap (459 m mapeados de 1.142 m totais publicados pelo IDEFLOR-Bio); desnível e restante do percurso não possuem publicação vetorial oficial.',
    sourceLabel: 'IDEFLOR-Bio — Dados oficiais publicados',
  },
  {
    id: 'castanheira',
    name: 'Trilha da Castanheira',
    distanceMeters: 1555,
    difficulty: 'Média',
    publishedSummary:
      'Caminhada de média dificuldade com 1.555 metros de extensão, ideal para quem dispõe de mais tempo para imersão na floresta amazônica urbana.',
    nonGeoreferencedNote:
      'Traçado georreferenciado exibido no mapa via OpenStreetMap (ODbL, ~1.771 m mapeados); altimetria detalhada e condições momentâneas do piso devem ser confirmadas no parque.',
    sourceLabel: 'IDEFLOR-Bio — Dados oficiais publicados',
  },
  {
    id: 'agua-preta',
    name: 'Trilha da Água Preta',
    distanceMeters: 1761,
    difficulty: 'Difícil',
    publishedSummary:
      'A trilha oficial mais extensa cadastrada (1.761 metros) e classificada como difícil, recomendada para visitantes com bom preparo físico e orientação local.',
    nonGeoreferencedNote:
      'Sem traçado nominal georreferenciado como "Trilha da Água Preta" nas bases públicas consultadas (extensão oficial de 1.761 m publicada pelo IDEFLOR-Bio); confirme no local a condução autorizada.',
    sourceLabel: 'IDEFLOR-Bio — Dados oficiais publicados',
  },
];

export interface CyclingModeInfo {
  title: string;
  approximateTrackLengthLabel: string;
  approximateTrackKm: number;
  publishedOverview: string;
  nonGeoreferencedNotice: string;
  circulationRules: Array<{
    audience: string;
    rule: string;
    detail: string;
  }>;
  cyclingOptions: Array<{
    title: string;
    description: string;
  }>;
  safetyRecommendations: string[];
}

export const CYCLING_MODE_INFO: CyclingModeInfo = {
  title: 'Pista Principal do Parque Estadual do Utinga',
  approximateTrackLengthLabel: 'Aproximadamente 4 km',
  approximateTrackKm: 4,
  publishedOverview:
    'A via principal asfaltada interna possui extensão aproximada de 4 km (sentido único/ida e volta dependendo da programação local), conectando a área de acolhimento ao interior da unidade de conservação em meio à floresta.',
  nonGeoreferencedNotice:
    'A extensão de aproximadamente 4 km é uma referência institucional do IDEFLOR-Bio. O percurso pavimentado correspondente (Rua do Utinga, ~3,92 km) está representado no mapa a partir do mapeamento colaborativo do OpenStreetMap (ODbL).',
  circulationRules: [
    {
      audience: 'Ciclistas',
      rule: 'Circulação autorizada na pista principal pavimentada (~4 km)',
      detail:
        'Mantenha velocidade moderada, respeite a sinalização interna e reduza o ritmo próximo ao Centro de Acolhimento e travessias de fauna. Bicicletas não devem ingressar nas trilhas de terra em mata fechada.',
    },
    {
      audience: 'Pedestres e caminhantes',
      rule: 'Prioridade de passagem e uso exclusivo das trilhas ecológicas',
      detail:
        'Na via principal compartilhada, caminhe preferencialmente nas laterais sinalizadas mantendo atenção ao fluxo de bicicletas. As seis trilhas oficiais (Amapá, Patuá, Bolonha, Acapú, Castanheira e Água Preta) são voltadas à caminhada.',
    },
  ],
  cyclingOptions: [
    {
      title: 'Pedal recreativo com bicicleta própria',
      description:
        'Acesso pela portaria principal conforme regras e horários vigentes do parque, utilizando a pista pavimentada de aproximadamente 4 km.',
    },
    {
      title: 'Locação e apoio local na entrada',
      description:
        'O parque conta tradicionalmente com serviços de apoio ao visitante na área de entrada; confirme disponibilidade, valores e horários diretamente no local ou canais oficiais do IDEFLOR-Bio.',
    },
    {
      title: 'Treino leve e pedal em família',
      description:
        'Por ser via pavimentada sombreada pela copa das árvores, permite ajustar a distância entre passeios curtos próximos à entrada e percursos completos de ida e volta.',
    },
  ],
  safetyRecommendations: [
    'Use capacete afivelado, luvas e calçado fechado durante todo o percurso de bicicleta.',
    'Leve água para hidratação contínua: o clima quente e úmido de Belém exige reposição frequente mesmo sob sombra.',
    'Reduza a velocidade em curvas e trechos úmidos após chuvas amazônicas para evitar derrapagens.',
    'Respeite a fauna silvestre (preguiças, macacos, quatis e aves): nunca alimente os animais e ceda passagem se cruzarem a pista.',
    'Verifique os horários de abertura e fechamento do parque antes de iniciar um segundo trecho de pedal.',
  ],
};
