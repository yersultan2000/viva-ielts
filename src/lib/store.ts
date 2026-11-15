import { useSyncExternalStore } from 'react';
import type { AppState, Settings } from './types';

const KEY = 'viva:v1';

const defaultSettings: Settings = {
  name: '',
  target: 7,
  theme: 'system',
  backendUrl: (import.meta.env.VIVA_API_URL || '').trim(),
  voiceURI: '',
  rate: 1,
  analyseAudio: true,
  autoAdvance: true,
};

const empty = (): AppState => ({
  settings: { ...defaultSettings },
  exams: [],
  vocab: [],
  saved: [],
  bookmarks: [],
  practice: [],
  challenges: {},
});

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const base = empty();
    return {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...(parsed.settings || {}) },
    };
  } catch {
    return empty();
  }
}

let state: AppState = load();
let storageOk = true;
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    storageOk = true;
  } catch {
    storageOk = false; // private mode or quota: keep working in memory
  }
}

export const getState = () => state;
export const isStorageOk = () => storageOk;

export function update(fn: (s: AppState) => AppState) {
  state = fn(state);
  persist();
  listeners.forEach((l) => l());
}

export function resetAll() {
  state = empty();
  persist();
  listeners.forEach((l) => l());
}

export function replaceAll(next: Partial<AppState>) {
  const base = empty();
  state = { ...base, ...next, settings: { ...base.settings, ...(next.settings || {}) } };
  persist();
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useStore(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export function applyTheme(theme: Settings['theme']) {
  const resolved =
    theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
  document.documentElement.dataset.theme = resolved;
}

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* Audio recordings are too large for localStorage, so they live in IndexedDB. */
const DB = 'viva-audio';
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('clips');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function saveClip(id: string, blob: Blob): Promise<boolean> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('clips', 'readwrite');
      tx.objectStore('clips').put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}
export async function loadClip(id: string): Promise<Blob | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const req = db.transaction('clips').objectStore('clips').get(id);
      req.onsuccess = () => resolve((req.result as Blob) || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}
export async function clearClips() {
  try {
    const db = await openDb();
    db.transaction('clips', 'readwrite').objectStore('clips').clear();
  } catch {
    /* nothing to clear */
  }
}
