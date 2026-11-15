export function formatBelemTimestamp(isoString: string | null | undefined): string {
  if (!isoString) return 'Horário não informado pela fonte';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'Horário indisponível';

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Belem',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

const WIND_CARDINAL_PT: Record<string, string> = {
  NORTH: 'Norte (N)',
  NORTH_NORTHEAST: 'Norte-Nordeste (NNE)',
  NORTHEAST: 'Nordeste (NE)',
  EAST_NORTHEAST: 'Leste-Nordeste (ENE)',
  EAST: 'Leste (E)',
  EAST_SOUTHEAST: 'Leste-Sudeste (ESE)',
  SOUTHEAST: 'Sudeste (SE)',
  SOUTH_SOUTHEAST: 'Sul-Sudeste (SSE)',
  SOUTH: 'Sul (S)',
  SOUTH_SOUTHWEST: 'Sul-Sudoeste (SSO)',
  SOUTHWEST: 'Sudoeste (SO)',
  WEST_SOUTHWEST: 'Oeste-Sudoeste (OSO)',
  WEST: 'Oeste (O)',
  WEST_NORTHWEST: 'Oeste-Noroeste (ONO)',
  NORTHWEST: 'Noroeste (NO)',
  NORTH_NORTHWEST: 'Norte-Noroeste (NNO)',
};

export function formatWindCardinalPt(cardinal: string | null | undefined): string {
  if (!cardinal) return 'Não informado';
  return WIND_CARDINAL_PT[cardinal] || cardinal;
}

const SEVERITY_LABEL_PT: Record<string, string> = {
  EXTREME: 'Severidade Extrema',
  SEVERE: 'Severidade Alta',
  MODERATE: 'Severidade Moderada',
  MINOR: 'Severidade Leve',
  UNKNOWN: 'Severidade Não Classificada',
};

export function formatAlertSeverityPt(severity: string | undefined): string {
  if (!severity) return 'Aviso Meteorológico';
  return SEVERITY_LABEL_PT[severity] || severity;
}

export function buildWeatherReferenceNotes(params: {
  precipitationProbability: number | null;
  thunderstormProbability: number | null;
  temperatureC: number | null;
  uvIndex: number | null;
}): string[] {
  const notes: string[] = [];

  if (params.thunderstormProbability !== null && params.thunderstormProbability >= 30) {
    notes.push(
      `Probabilidade de trovoadas em ${params.thunderstormProbability}%: avalie adiar áreas abertas próximas aos lagos e redobre a atenção sob árvores.`
    );
  }

  if (params.precipitationProbability !== null && params.precipitationProbability >= 40) {
    notes.push(
      `Chance de chuva em ${params.precipitationProbability}%: o asfalto da pista principal e o solo das trilhas podem ficar escorregadios.`
    );
  }

  if (params.temperatureC !== null && params.temperatureC >= 31) {
    notes.push(
      `Temperatura de ${params.temperatureC.toFixed(1)} °C: leve hidratação extra e prefira horários com menor incidência solar.`
    );
  }

  if (params.uvIndex !== null && params.uvIndex >= 6) {
    notes.push(
      `Índice UV ${params.uvIndex}: utilize proteção solar, óculos e vestuário adequado em trechos sem cobertura de copa.`
    );
  }

  if (notes.length === 0) {
    notes.push(
      'Mesmo sem parâmetros elevados nesta leitura pontual, condições climáticas amazônicas mudam rapidamente e esta consulta não garante segurança no parque.'
    );
  }

  return notes;
}

const WEATHER_TYPE_PT: Record<string, string> = {
  CLEAR: 'Céu limpo',
  MOSTLY_CLEAR: 'Predomínio de sol',
  PARTLY_CLOUDY: 'Parcialmente nublado',
  MOSTLY_CLOUDY: 'Muitas nuvens',
  CLOUDY: 'Nublado',
  WINDY: 'Ventania',
  WIND_AND_RAIN: 'Chuva com vento',
  LIGHT_RAIN_SHOWERS: 'Pancadas leves de chuva',
  CHANCE_OF_SHOWERS: 'Possibilidade de pancadas',
  SCATTERED_SHOWERS: 'Pancadas isoladas de chuva',
  RAIN_SHOWERS: 'Pancadas de chuva',
  HEAVY_RAIN_SHOWERS: 'Pancadas fortes de chuva',
  LIGHT_TO_MODERATE_RAIN: 'Chuva leve a moderada',
  MODERATE_TO_HEAVY_RAIN: 'Chuva moderada a forte',
  RAIN: 'Chuva',
  LIGHT_RAIN: 'Chuva leve',
  HEAVY_RAIN: 'Chuva forte',
  RAIN_PERIODICALLY_HEAVY: 'Chuva com períodos intensos',
  THUNDERSTORM: 'Trovoada',
  THUNDERSHOWER: 'Pancada com trovoada',
  LIGHT_THUNDERSTORM_RAIN: 'Chuva leve com trovoadas',
  SCATTERED_THUNDERSTORMS: 'Trovoadas isoladas',
  HEAVY_THUNDERSTORM: 'Trovoada forte',
  FOG: 'Neblina',
  HAZE: 'Névoa seca',
};

const ENGLISH_CONDITION_PT: Record<string, string> = {
  sunny: 'Ensolarado',
  'mostly sunny': 'Predomínio de sol',
  'partly sunny': 'Parcialmente ensolarado',
  clear: 'Céu limpo',
  'mostly clear': 'Céu quase limpo',
  'partly cloudy': 'Parcialmente nublado',
  'mostly cloudy': 'Muitas nuvens',
  cloudy: 'Nublado',
  overcast: 'Encoberto',
  rain: 'Chuva',
  'light rain': 'Chuva leve',
  'heavy rain': 'Chuva forte',
  showers: 'Pancadas de chuva',
  'scattered showers': 'Pancadas isoladas',
  'isolated thunderstorms': 'Trovoadas isoladas',
  'scattered thunderstorms': 'Trovoadas isoladas',
  thunderstorm: 'Trovoada',
  thunderstorms: 'Trovoadas',
  fog: 'Neblina',
  mist: 'Névoa úmida',
};

export function formatWeatherConditionPt(
  conditionType?: string | null,
  rawText?: string | null
): string {
  const normalizedText = rawText?.trim().toLowerCase() || '';
  if (normalizedText && ENGLISH_CONDITION_PT[normalizedText]) {
    return ENGLISH_CONDITION_PT[normalizedText];
  }
  const normalizedType = conditionType?.trim().toUpperCase() || '';
  if (normalizedType && WEATHER_TYPE_PT[normalizedType]) {
    return WEATHER_TYPE_PT[normalizedType];
  }
  return rawText?.trim() || 'Condição atual';
}

export interface HourlyWindowCandidate {
  hourLabel: string;
  precipitationProbability: number | null;
  tempC: number | null;
}

export function findBestWeatherWindows(
  hourly: HourlyWindowCandidate[],
  limit = 3
): HourlyWindowCandidate[] {
  const valid = hourly.filter((h) => h.precipitationProbability !== null);
  if (valid.length === 0) return [];

  return [...valid]
    .sort((a, b) => {
      const diff = (a.precipitationProbability ?? 100) - (b.precipitationProbability ?? 100);
      if (diff !== 0) return diff;
      return (a.tempC ?? 99) - (b.tempC ?? 99);
    })
    .slice(0, limit);
}
