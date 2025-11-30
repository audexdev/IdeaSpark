const STORAGE_KEY = 'ideaspark_rate';
const LIMIT = 20;
const WINDOW_MS = 60 * 60 * 1000;

const getStorage = () => {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return window.localStorage;
};

const loadTimestamps = (now: number) => {
  const storage = getStorage();
  if (!storage) return [];

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const cutoff = now - WINDOW_MS;
    return parsed
      .map((value) => Number(value))
      .filter((timestamp) => Number.isFinite(timestamp) && timestamp >= cutoff)
      .sort((a, b) => a - b);
  } catch (error) {
    console.warn('Failed to load rate limit data', error);
    return [];
  }
};

const saveTimestamps = (timestamps: number[]) => {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(timestamps));
};

const minutesUntilReset = (timestamps: number[], now: number) => {
  if (timestamps.length < LIMIT) return 0;
  const oldest = timestamps[0];
  const remainingMs = WINDOW_MS - (now - oldest);
  if (remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / (60 * 1000));
};

export function canGenerateIdea(): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const timestamps = loadTimestamps(now);
  const allowed = timestamps.length < LIMIT;
  const remaining = allowed ? 0 : minutesUntilReset(timestamps, now);

  return { allowed, remaining };
}

export function recordGenerateIdea(): void {
  const now = Date.now();
  const timestamps = loadTimestamps(now);
  const updated = [...timestamps, now].sort((a, b) => a - b);
  saveTimestamps(updated);
}
