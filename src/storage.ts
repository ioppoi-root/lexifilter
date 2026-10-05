import type { AppState } from './types';

const DB_NAME = 'lexifilter-db';
const STORE = 'state';
const KEY = 'main';

export const emptyState = (): AppState => ({
  version: 1,
  bookName: '我的词本',
  words: [],
  progress: {},
  plan: null,
  updatedAt: Date.now()
});

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadState(): Promise<AppState> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as AppState | undefined) ?? emptyState());
      req.onerror = () => reject(req.error);
    });
  } catch {
    const raw = localStorage.getItem('lexifilter-fallback');
    return raw ? JSON.parse(raw) as AppState : emptyState();
  }
}

export async function saveState(state: AppState): Promise<void> {
  state.updatedAt = Date.now();
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(state, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    localStorage.setItem('lexifilter-fallback', JSON.stringify(state));
  }
}
