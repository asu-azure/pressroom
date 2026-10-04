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

// --- Reading lock: the unlocked password, per work, per TAB SESSION ---
// The unlock_pages RPC is stateless (RLS has no session), so the password is
// re-sent on each fetch; sessionStorage keeps it for the tab only — closing
// the tab re-asks. Never mirrored to localStorage.
const unlockKeyFor = (workId: string) => `pressroom:unlock:${workId}`;

export function loadUnlock(workId: string): string | null {
  try {
    return sessionStorage.getItem(unlockKeyFor(workId));
  } catch {
    return null;
  }
}

export function saveUnlock(workId: string, password: string): void {
  try {
    sessionStorage.setItem(unlockKeyFor(workId), password);
  } catch {
    /* private mode — the gate will just re-ask */
  }
}

export function clearUnlock(workId: string): void {
  try {
    sessionStorage.removeItem(unlockKeyFor(workId));
  } catch {
    /* ignore */
  }
}

// --- "ここすき" favourite pages, per work (pageIds, in the order they were added) ---
// Same reasoning as progress: pageIds survive the author reordering pages.
const favoritesKeyFor = (workId: string) => `pressroom:favorites:${workId}`;

export function loadFavorites(workId: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(favoritesKeyFor(workId)) ?? '[]');
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** Returns false when the browser would not keep them (private mode, storage full). */
export function saveFavorites(workId: string, pageIds: string[]): boolean {
  try {
    localStorage.setItem(favoritesKeyFor(workId), JSON.stringify(pageIds));
    return true;
  } catch {
    return false;
  }
}

// --- One-time hints: the reading guide, the page-corner peel, the toolbar that
//     stays up until the first page turn, the "saved in this browser" toast ---
const hintKeyFor = (name: string) => `pressroom:hint:${name}`;

/** Shows once: true the first time, false ever after. */
export function takeHint(name: string): boolean {
  if (seenHint(name)) return false;
  markHint(name);
  return seenHint(name); // still false if the browser wouldn't keep it
}

/** Whether a hint was already used, without using it up. */
export function seenHint(name: string): boolean {
  try {
    return Boolean(localStorage.getItem(hintKeyFor(name)));
  } catch {
    return true; // can't remember it — better never than every time
  }
}

export function markHint(name: string): void {
  try {
    localStorage.setItem(hintKeyFor(name), '1');
  } catch {
    /* ignore */
  }
}
