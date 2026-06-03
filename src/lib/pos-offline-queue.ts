"use client";

// POS Offline Queue — IndexedDB wrapper untuk simpan order yang gagal sync
// (kasir tetap bisa lanjut saat koneksi putus). Saat kembali online, retry
// otomatis. Idempotency key disimpan di queue → backend pasti tidak buat
// order ganda (anti double-submit dilapis dgn /api/orders idempotency).
//
// Tidak menyentuh path uang createOrder — pure client persistence layer.
//
// Pola: enqueue(payload, key) → list/peek → markSyncing → markSynced/markFailed.

const DB_NAME = "garage-pos-offline";
const DB_VERSION = 1;
const STORE = "orderQueue";

/** Batas keras untuk cegah memory blow up & user confusion */
export const QUEUE_MAX_SIZE = 50;

export type QueuedOrderStatus = "pending" | "syncing" | "synced" | "failed";

export type QueuedOrder = {
  /** Idempotency key (UUID) — sama yg dikirim ke /api/orders */
  id: string;
  /** Payload mentah untuk POST /api/orders */
  payload: unknown;
  /** Status sync. "synced" segera hapus dari queue. */
  status: QueuedOrderStatus;
  /** Pesan error terakhir kalau status=failed. */
  errorMessage?: string;
  /** Ringkasan untuk UI (total, customerName, dll). Optional. */
  summary?: {
    total?: number;
    customerName?: string;
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

/** Tambah order ke queue. Throws kalau queue penuh (≥ QUEUE_MAX_SIZE). */
export async function enqueueOrder(
  id: string,
  payload: unknown,
  summary?: QueuedOrder["summary"],
): Promise<void> {
  const list = await listQueue();
  if (list.length >= QUEUE_MAX_SIZE) {
    throw new Error(
      `Antrian offline penuh (${QUEUE_MAX_SIZE} order). Sync dulu sebelum tambah.`,
    );
  }
  const now = Date.now();
  const item: QueuedOrder = {
    id,
    payload,
    status: "pending",
    summary,
    createdAt: now,
    updatedAt: now,
    attempts: 0,
  };
  await tx("readwrite", (store) => req(store.put(item)));
}

/** Semua order di queue (urut createdAt asc). */
export async function listQueue(): Promise<QueuedOrder[]> {
  return tx("readonly", (store) => req(store.getAll())).then((rows) =>
    (rows as QueuedOrder[]).sort((a, b) => a.createdAt - b.createdAt),
  );
}

/** Hitung saja (untuk badge). */
export async function countPending(): Promise<number> {
  const list = await listQueue();
  return list.filter((q) => q.status !== "synced").length;
}

/** Ambil 1 order tertua yang belum sync. */
export async function peekNext(): Promise<QueuedOrder | null> {
  const list = await listQueue();
  return list.find((q) => q.status === "pending" || q.status === "failed") ?? null;
}

/** Tandai sedang di-sync (untuk cegah retry paralel ganda). */
export async function markSyncing(id: string): Promise<void> {
  await tx("readwrite", async (store) => {
    const row = (await req(store.get(id))) as QueuedOrder | undefined;
    if (!row) return;
    row.status = "syncing";
    row.attempts += 1;
    row.updatedAt = Date.now();
    await req(store.put(row));
  });
}

/** Sukses sync → hapus dari queue. */
export async function markSynced(id: string): Promise<void> {
  await tx("readwrite", (store) => req(store.delete(id)));
}

/** Gagal sync → kembalikan ke pending dgn pesan error. */
export async function markFailed(id: string, errorMessage: string): Promise<void> {
  await tx("readwrite", async (store) => {
    const row = (await req(store.get(id))) as QueuedOrder | undefined;
    if (!row) return;
    row.status = "failed";
    row.errorMessage = errorMessage.slice(0, 240);
    row.updatedAt = Date.now();
    await req(store.put(row));
  });
}

/** Hapus order (mis. user batal). */
export async function removeOrder(id: string): Promise<void> {
  await tx("readwrite", (store) => req(store.delete(id)));
}

/** Bersihkan semua. Hati-hati: data hilang. */
export async function clearQueue(): Promise<void> {
  await tx("readwrite", (store) => req(store.clear()));
}
