import type { ReaderSettings } from './types';

const SETTINGS_KEY = 'pressroom:settings';
const settingsKeyFor = (workId: string) => `pressroom:settings:${workId}`;
const progressKeyFor = (workId: string) => `pressroom:progress:${workId}`;

function readJson<T>(key: string): Partial<T> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Partial<T>) : null;
  } catch {
    return null;
  }
}

/** Author defaults ← global reader prefs ← per-work overrides. */
export function loadSettings(workId: string, defaults: ReaderSettings): ReaderSettings {
  return {
    ...defaults,
    ...readJson<ReaderSettings>(SETTINGS_KEY),
    ...readJson<ReaderSettings>(settingsKeyFor(workId)),
  };
}

export function saveSettings(workId: string, settings: ReaderSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    localStorage.setItem(settingsKeyFor(workId), JSON.stringify(settings));
  } catch {
    /* storage full / private mode — reading still works */
  }
}

/** Progress is a pageId, not an index — it survives the author reordering pages. */
export function loadProgress(workId: string): string | null {
  try {
    return localStorage.getItem(progressKeyFor(workId));
  } catch {
    return null;
  }
}

export function saveProgress(workId: string, pageId: string): void {
  try {
    localStorage.setItem(progressKeyFor(workId), pageId);
  } catch {
    /* ignore */
  }
}
