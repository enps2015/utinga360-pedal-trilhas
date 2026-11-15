export type GeminiToolMode = 'maps' | 'search' | 'none';

export interface GeminiAttemptConfig {
  model: string;
  delayMs: number;
  toolMode: GeminiToolMode;
}

const DEFAULT_MODEL_PRIORITY = [
  'gemini-4-hydrogen',
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
] as const;

export function buildGeminiAttemptConfigs(
  preferredModel?: string
): GeminiAttemptConfig[] {
  const custom = typeof preferredModel === 'string' ? preferredModel.trim() : '';
  const orderedModels = custom
    ? [custom, ...DEFAULT_MODEL_PRIORITY.filter((m) => m !== custom)]
    : [...DEFAULT_MODEL_PRIORITY];

  const primaryModel = orderedModels[0];
  const secondaryModel = orderedModels[1] || primaryModel;
  const liteModel = orderedModels[2] || secondaryModel;
  const fallbackLiteModel = orderedModels[3] || liteModel;

  const raw: GeminiAttemptConfig[] = [
    { model: primaryModel, delayMs: 0, toolMode: 'maps' },
    { model: primaryModel, delayMs: 500, toolMode: 'maps' },
    { model: secondaryModel, delayMs: 0, toolMode: 'maps' },
    { model: secondaryModel, delayMs: 0, toolMode: 'search' },
    { model: liteModel, delayMs: 200, toolMode: 'none' },
    { model: fallbackLiteModel, delayMs: 0, toolMode: 'none' },
  ];

  const seen = new Set<string>();
  const deduped: GeminiAttemptConfig[] = [];
  for (const item of raw) {
    // Allow at most 1 delayed transient retry on the primary maps call; dedupe later exact repeats
    const key = `${item.model}:${item.toolMode}:${item.delayMs > 0 ? 'retry' : 'first'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

export interface GeminiFailureClassification {
  isTransient: boolean;
  isToolUnsupported: boolean;
  isModelUnavailable: boolean;
  shouldTryNext: boolean;
}

export function classifyGeminiAttemptError(
  err: unknown,
  toolMode: GeminiToolMode
): GeminiFailureClassification {
  const status =
    typeof (err as any)?.status === 'number' ? (err as any).status : 0;
  const msg = String((err as any)?.message || err || '');
  const lower = msg.toLowerCase();

  const isTransient =
    status === 503 ||
    status === 429 ||
    status === 500 ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('resource_exhausted');

  const isModelUnavailable =
    status === 404 ||
    lower.includes('not_found') ||
    lower.includes('is not found') ||
    lower.includes('model not found') ||
    (lower.includes('model') && lower.includes('not supported'));

  const isToolUnsupported =
    toolMode !== 'none' &&
    !isModelUnavailable &&
    (status === 400 ||
      status === 403 ||
      lower.includes('google_maps') ||
      lower.includes('googlemaps') ||
      lower.includes('tool') ||
      lower.includes('not supported'));

  return {
    isTransient,
    isToolUnsupported,
    isModelUnavailable,
    shouldTryNext: isTransient || isToolUnsupported || isModelUnavailable,
  };
}
