export interface CacheLookupResult<T> {
  value: T;
  fetchedAtMs: number;
  expiresAtMs: number;
  stale: boolean;
}

interface CacheRecord<T> {
  value: T;
  fetchedAtMs: number;
  expiresAtMs: number;
}

export class TtlCache<T> {
  private readonly store = new Map<string, CacheRecord<T>>();
  private readonly inFlight = new Map<string, Promise<CacheLookupResult<T>>>();
  private readonly maxEntries: number;

  constructor(maxEntries = 100) {
    this.maxEntries = Math.max(1, maxEntries);
  }

  getFresh(key: string, nowMs: number = Date.now()): CacheLookupResult<T> | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (nowMs >= entry.expiresAtMs) return null;
    return {
      value: entry.value,
      fetchedAtMs: entry.fetchedAtMs,
      expiresAtMs: entry.expiresAtMs,
      stale: false,
    };
  }

  getStale(key: string, nowMs: number = Date.now()): CacheLookupResult<T> | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    return {
      value: entry.value,
      fetchedAtMs: entry.fetchedAtMs,
      expiresAtMs: entry.expiresAtMs,
      stale: nowMs >= entry.expiresAtMs,
    };
  }

  set(key: string, value: T, ttlMs: number, nowMs: number = Date.now()): CacheLookupResult<T> {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }

    const record: CacheRecord<T> = {
      value,
      fetchedAtMs: nowMs,
      expiresAtMs: nowMs + Math.max(0, ttlMs),
    };
    this.store.set(key, record);
    return {
      ...record,
      stale: false,
    };
  }

  async runDeduplicated(
    key: string,
    ttlMs: number,
    loader: () => Promise<T>,
    options: {
      forceRefresh?: boolean;
      nowMs?: () => number;
      allowStaleOnError?: (err: unknown) => boolean;
    } = {}
  ): Promise<CacheLookupResult<T>> {
    const getNow = options.nowMs || Date.now;
    const now = getNow();

    if (!options.forceRefresh) {
      const fresh = this.getFresh(key, now);
      if (fresh) {
        return fresh;
      }
    }

    const existingFlight = this.inFlight.get(key);
    if (existingFlight) {
      return existingFlight;
    }

    const flight = (async () => {
      try {
        const value = await loader();
        return this.set(key, value, ttlMs, getNow());
      } catch (err) {
        const canUseStale = options.allowStaleOnError
          ? options.allowStaleOnError(err)
          : false;
        if (canUseStale) {
          const stale = this.getStale(key, getNow());
          if (stale) {
            return { ...stale, stale: true };
          }
        }
        throw err;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, flight);
    return flight;
  }

  clear(): void {
    this.store.clear();
    this.inFlight.clear();
  }

  size(): number {
    return this.store.size;
  }
}

export function readBrowserTtlCache<T>(
  storage: Pick<Storage, 'getItem'> | null | undefined,
  key: string,
  nowMs: number = Date.now()
): T | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheRecord<T>;
    if (
      !parsed ||
      typeof parsed.expiresAtMs !== 'number' ||
      nowMs >= parsed.expiresAtMs ||
      parsed.value === undefined
    ) {
      return null;
    }
    return parsed.value;
  } catch {
    return null;
  }
}

export function writeBrowserTtlCache<T>(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  key: string,
  value: T,
  ttlMs: number,
  nowMs: number = Date.now()
): void {
  if (!storage) return;
  try {
    const record: CacheRecord<T> = {
      value,
      fetchedAtMs: nowMs,
      expiresAtMs: nowMs + Math.max(0, ttlMs),
    };
    storage.setItem(key, JSON.stringify(record));
  } catch {
    // Ignore quota/private-mode storage failures silently
  }
}
