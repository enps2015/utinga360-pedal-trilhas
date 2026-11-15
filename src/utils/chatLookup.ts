const PLACE_INTENT_RE =
  /\b(como\s+cheg(?:o|ar)|onde\s+fica|endere[cç]o|localiza[cç][aã]o|rota\s+para|caminho\s+para|ir\s+(?:de\s+(?:bike|bicicleta|carro|a\s+p[eé])\s+)?(?:ao|à|a|para|at[eé])|chegar\s+(?:ao|à|no|na|em|at[eé])|bar\s+do|restaurante|lanchonete|caf[eé]|a[cç]a[ií]|bicicletaria|oficina\s+de\s+bike|estacionamento|mirante|casa\s+da\s+mata|recanto\s+da\s+volta|ponto\s+de\s+[oô]nibus)\b/i;

const ROUTE_INTENT_RE =
  /\b(como\s+cheg(?:o|ar)|rota\s+para|caminho\s+para|trajeto\s+para|ir\s+(?:de\s+(?:bike|bicicleta|carro|a\s+p[eé])\s+)?(?:ao|à|a|para|at[eé])|dist[aâ]ncia\s+(?:at[eé]|para)|quanto\s+tempo\s+(?:de|at[eé]|para))\b/i;

const GENERIC_TRAIL_ONLY_RE =
  /\b(trilhas?\s+de\s+terra|qual\s+trilha|trilha\s+f[aá]cil|trilha\s+m[eé]dia|trilha\s+dif[ií]cil|pista\s+principal)\b/i;

function cleanExtractedTarget(raw: string): string {
  return raw
    .replace(/\b(saindo\s+(?:do|da|de)\b.*)$/i, '')
    .replace(/\b(partindo\s+(?:do|da|de)\b.*)$/i, '')
    .replace(/\b(perto\s+(?:do|da|de)\s+(?:parque|utinga)\b.*)$/i, '')
    .replace(/\b(no\s+parque\s+(?:do\s+utinga)?\b.*)$/i, '')
    .replace(/[?!.,;:]+$/g, '')
    .trim();
}

export function extractPlaceSearchQuery(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed || !PLACE_INTENT_RE.test(trimmed)) {
    return null;
  }

  // Named destination pattern after directional/location verbs
  const namedPatterns = [
    /(?:como\s+cheg(?:o|ar)|ir(?:\s+de\s+(?:bike|bicicleta|carro|a\s+p[eé]))?|rota|caminho|trajeto|dist[aâ]ncia)\s+(?:de\s+(?:bike|bicicleta|carro|a\s+p[eé])\s+)?(?:ao|à|a|para\s+o|para\s+a|para|at[eé]\s+o|at[eé]\s+a|at[eé]|no|na)\s+([^?!.\n]{3,80})/i,
    /(?:onde\s+fica|endere[cç]o\s+d[oa]|localiza[cç][aã]o\s+d[oa])\s+(?:o|a)?\s*([^?!.\n]{3,80})/i,
    /\b(bar\s+do\s+[a-zA-ZÀ-ÿ0-9\s]{2,40}|casa\s+da\s+mata|recanto\s+da\s+volta|mirante\s+d[oa]\s+[a-zA-ZÀ-ÿ0-9\s]{2,30})\b/i,
  ];

  for (const regex of namedPatterns) {
    const match = regex.exec(trimmed);
    if (match?.[1]) {
      const cleaned = cleanExtractedTarget(match[1]);
      if (cleaned.length >= 3 && !GENERIC_TRAIL_ONLY_RE.test(cleaned)) {
        return cleaned;
      }
    }
  }

  if (/\bbicicletaria|oficina\s+de\s+bike\b/i.test(trimmed)) {
    return 'bicicletaria';
  }
  if (/\bestacionamento\b/i.test(trimmed)) {
    return 'estacionamento';
  }
  if (/\bponto\s+de\s+[oô]nibus\b/i.test(trimmed)) {
    return 'ponto de ônibus';
  }
  if (/\b(restaurante|lanchonete|caf[eé]|a[cç]a[ií]|comer|almo[cç]ar)\b/i.test(trimmed)) {
    return 'restaurante lanchonete';
  }

  return null;
}

export function shouldComputeRouteForQuestion(message: string): boolean {
  return ROUTE_INTENT_RE.test(message);
}

export function inferChatTravelMode(message: string): 'BICYCLE' | 'WALK' | 'DRIVE' {
  if (/\b(carro|uber|t[aá]xi|estacionar)\b/i.test(message)) {
    return 'DRIVE';
  }
  if (/(?:^|\s)(?:a\s+p[eé]|caminhar|caminhada|correr)(?=\s|$|[?!.,;:])/i.test(message)) {
    return 'WALK';
  }
  return 'BICYCLE';
}
