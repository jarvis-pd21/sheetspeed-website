const DB_NAME = "datasniper";
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("documents")) {
        db.createObjectStore("documents", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("session")) {
        db.createObjectStore("session");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

function completion(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function createId() {
  if (globalThis.crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function saveDocument(record) {
  const db = await openDb();
  const store = db.transaction("documents", "readwrite").objectStore("documents");
  await completion(store.put({
    id: record.id,
    name: record.name,
    mime: record.mime,
    bytes: record.bytes,
  }));
}

export async function getDocument(id) {
  const db = await openDb();
  const store = db.transaction("documents", "readonly").objectStore("documents");
  return completion(store.get(id));
}

export async function saveSession(session) {
  const db = await openDb();
  const store = db.transaction("session", "readwrite").objectStore("session");
  await completion(store.put(session, "current"));
}

export async function loadSession() {
  const db = await openDb();
  const store = db.transaction("session", "readonly").objectStore("session");
  return completion(store.get("current"));
}

export async function clearStoredFiles() {
  const db = await openDb();
  const tx = db.transaction(["documents", "session"], "readwrite");
  tx.objectStore("documents").clear();
  tx.objectStore("session").clear();
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Could not clear stored files."));
  });
}
