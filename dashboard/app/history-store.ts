import { snapshotSchema, type Snapshot } from "./validation";

const DB_NAME = "garmin-lab";
const STORE = "activities";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
      if (!request.result.objectStoreNames.contains("snapshots")) request.result.createObjectStore("snapshots");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Tutup tab Garmin Lab lain, lalu muat ulang."));
  });
}

export async function saveHistory(snapshot: Snapshot) {
  const validated = snapshotSchema.parse(snapshot);
  const db = await openDb();
  try { await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("snapshots", "readwrite");
    transaction.objectStore("snapshots").put(validated, "current");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  }); } finally { db.close(); }
}

export async function loadHistory(): Promise<Snapshot | null> {
  const db = await openDb();
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction("snapshots", "readonly").objectStore("snapshots").get("current");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return value === undefined ? null : snapshotSchema.parse(value);
  } finally { db.close(); }
}

export async function clearHistory() {
  const db = await openDb();
  try { await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([STORE, "snapshots"], "readwrite");
    transaction.objectStore(STORE).clear();
    transaction.objectStore("snapshots").clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  }); } finally { db.close(); }
}
