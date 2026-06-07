"use client";

// Waiter Offline Queue — IndexedDB wrapper untuk simpan action waiter
// (deliver ticket) yang gagal sync. Pattern mirror dari pos-offline-queue.
//
// Saat WiFi cafe drop, waiter tetap bisa tap "Antar" — action masuk queue,
// UI optimistic update, lalu auto-retry saat online. Backend deliver
// natural-idempotent (response 422 INVALID_TRANSITION = sudah delivered →
// treat as success).

const DB_NAME = "garage-waiter-offline";
const DB_VERSION = 1;
const STORE = "actionQueue";

export const QUEUE_MAX_SIZE = 100;

export type WaiterActionStatus = "pending" | "syncing" | "synced" | "failed";

export type WaiterAction = "deliver";

export type QueuedWaiterAction = {
  /** Idempotency key (UUID) untuk dedup di client. */
  id: string;
  /** Jenis action. Saat ini hanya "deliver", siap untuk extend. */
  action: WaiterAction;
  /** Target object id (ticketNo untuk deliver). */
  target: string;
  status: WaiterActionStatus;
  errorMessage?: string;
  summary?: {
    ticketNo?: string;
    tableLabel?: string;
    itemCount?: number;
  };
  createdAt: number;
  updatedAt: number;
  attempts: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB hanya tersedia di browser."));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("createdAt", "createdAt", { unique: false });
          store.createIndex("status", "status", { unique: false });
          store.createIndex("target", "target", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("IDB open failed"));
    });
  }
  return dbPromise;
}

function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        Promise.resolve(fn(store))
          .then((value) => {
            t.oncomplete = () => resolve(value);
            t.onerror = () => reject(t.error);
            t.onabort = () => reject(t.error ?? new Error("tx aborted"));
          })
          .catch(reject);
      }),
  );
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function enqueueAction(
  id: string,
  action: WaiterAction,
  target: string,
  summary?: QueuedWaiterAction["summary"],
): Promise<void> {
  const list = await listQueue();
  if (list.length >= QUEUE_MAX_SIZE) {
    throw new Error(
      `Antrian offline penuh (${QUEUE_MAX_SIZE} action). Sync dulu.`,
    );
  }
  // Dedup: skip kalau sudah ada pending action sama untuk target sama.
  const dup = list.find(
    (q) =>
      q.action === action &&
      q.target === target &&
      (q.status === "pending" || q.status === "syncing"),
  );
  if (dup) return;

  const now = Date.now();
  const item: QueuedWaiterAction = {
    id,
    action,
    target,
    status: "pending",
    summary,
    createdAt: now,
    updatedAt: now,
    attempts: 0,
  };
  await tx("readwrite", (store) => req(store.put(item)));
}

export async function listQueue(): Promise<QueuedWaiterAction[]> {
  return tx("readonly", (store) => req(store.getAll())).then((rows) =>
    (rows as QueuedWaiterAction[]).sort((a, b) => a.createdAt - b.createdAt),
  );
}

export async function countPending(): Promise<number> {
  const list = await listQueue();
  return list.filter((q) => q.status !== "synced").length;
}

export async function listPendingTargets(action: WaiterAction): Promise<Set<string>> {
  const list = await listQueue();
  return new Set(
    list
      .filter(
        (q) =>
          q.action === action &&
          (q.status === "pending" || q.status === "syncing" || q.status === "failed"),
      )
      .map((q) => q.target),
  );
}

export async function markSyncing(id: string): Promise<void> {
  await tx("readwrite", async (store) => {
    const row = (await req(store.get(id))) as QueuedWaiterAction | undefined;
    if (!row) return;
    row.status = "syncing";
    row.attempts += 1;
    row.updatedAt = Date.now();
    await req(store.put(row));
  });
}

export async function markSynced(id: string): Promise<void> {
  await tx("readwrite", (store) => req(store.delete(id)));
}

export async function markFailed(id: string, errorMessage: string): Promise<void> {
  await tx("readwrite", async (store) => {
    const row = (await req(store.get(id))) as QueuedWaiterAction | undefined;
    if (!row) return;
    row.status = "failed";
    row.errorMessage = errorMessage.slice(0, 240);
    row.updatedAt = Date.now();
    await req(store.put(row));
  });
}

export async function removeAction(id: string): Promise<void> {
  await tx("readwrite", (store) => req(store.delete(id)));
}

export async function clearQueue(): Promise<void> {
  await tx("readwrite", (store) => req(store.clear()));
}
