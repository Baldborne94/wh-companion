const DB_NAME = 'wh40k_ebooks';
const STORE = 'files';

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(STORE);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheGet(userId, bookId) {
  try {
    const db = await openIDB();
    return new Promise(resolve => {
      const req = db.transaction(STORE).objectStore(STORE).get(`${userId}_${bookId}`);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

export async function cachePut(userId, bookId, arrayBuffer) {
  try {
    const db = await openIDB();
    return new Promise(resolve => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(arrayBuffer, `${userId}_${bookId}`);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch { return false; }
}

export async function cacheRemove(userId, bookId) {
  try {
    const db = await openIDB();
    return new Promise(resolve => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(`${userId}_${bookId}`);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch { return false; }
}

export async function cacheHas(userId, bookId) {
  try {
    const db = await openIDB();
    return new Promise(resolve => {
      const req = db.transaction(STORE).objectStore(STORE).getKey(`${userId}_${bookId}`);
      req.onsuccess = () => resolve(req.result != null);
      req.onerror = () => resolve(false);
    });
  } catch { return false; }
}

// Returns a Set of book ids (numbers) cached for offline for this user.
export async function cacheListIds(userId) {
  try {
    const db = await openIDB();
    return new Promise(resolve => {
      const req = db.transaction(STORE).objectStore(STORE).getAllKeys();
      req.onsuccess = () => {
        const prefix = `${userId}_`;
        const ids = new Set();
        for (const k of req.result || []) {
          if (typeof k === 'string' && k.startsWith(prefix)) {
            const n = Number(k.slice(prefix.length));
            if (!Number.isNaN(n)) ids.add(n);
          }
        }
        resolve(ids);
      };
      req.onerror = () => resolve(new Set());
    });
  } catch { return new Set(); }
}
