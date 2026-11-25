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

/** Batas keras = batas Owner (Fase 4): maks 50 penjualan offline tertunda. */
export const QUEUE_MAX_SIZE = 50;

/** Jenis kiriman: penjualan tunai (POST /api/orders) atau QRIS statis offline (POST /api/orders/open-bill). */
export type QueuedOrderKind = "order" | "open-bill";

export type QueuedOrderStatus = "pending" | "syncing" | "synced" | "failed";

export type QueuedOrder = {
  /** Idempotency key (UUID) — sama yg dikirim ke /api/orders */
  id: string;
  /** Payload mentah untuk endpoint sesuai `kind` */
  payload: unknown;
  /** Default "order" (data lama tanpa field ini). */
  kind?: QueuedOrderKind;
  /** Nomor sementara di struk (OFF-…). */
  offlineNo?: string;
  /** Status sync. "synced" segera hapus dari queue. */
  status: QueuedOrderStatus;
  /** Pesan error terakhir kalau status=failed. */
  errorMessage?: string;
  /** Ditolak server secara permanen (mis. data tidak valid) — tidak dicoba otomatis lagi. */
  permanent?: boolean;
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

/**
 * Tambah order ke queue. Throws kalau queue penuh (≥ QUEUE_MAX_SIZE).
 * Cek ukuran + tulis dalam SATU transaksi (dulu terpisah → dua klik cepat bisa melewati batas).
 * Kunci yang sama ditulis ulang (bukan item baru), sehingga retry tidak pernah menggandakan.
 */
export async function enqueueOrder(
  id: string,
  payload: unknown,
  summary?: QueuedOrder["summary"],
  options: { kind?: QueuedOrderKind; offlineNo?: string } = {},
): Promise<void> {
  const now = Date.now();
  await tx("readwrite", async (store) => {
    const existing = (await req(store.get(id))) as QueuedOrder | undefined;
    if (!existing) {
      const size = await req(store.count());
      if (size >= QUEUE_MAX_SIZE) {
        throw new Error(`Antrean offline penuh (${QUEUE_MAX_SIZE} penjualan). Tunggu koneksi kembali dan sinkron dulu.`);
      }
    }
    const item: QueuedOrder = {
      id,
      payload,
      kind: options.kind ?? "order",
      offlineNo: options.offlineNo,
      status: "pending",
      summary,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      attempts: existing?.attempts ?? 0,
    };
    await req(store.put(item));
  });
}

/** Setelah reload/crash saat sinkron: item "syncing" yatim dikembalikan ke "pending" (dulu tertahan selamanya). */
export async function resetStuckSyncing(): Promise<void> {
  await tx("readwrite", async (store) => {
    const rows = (await req(store.getAll())) as QueuedOrder[];
    for (const row of rows) {
      if (row.status !== "syncing") continue;
      row.status = "pending";
      row.updatedAt = Date.now();
      await req(store.put(row));
    }
  });
}

/** Semua order di queue (urut createdAt asc). */
export async function listQueue(): Promise<QueuedOrder[]> {
  return tx("readonly", (store) => req(store.getAll())).then((rows) =>
    (rows as QueuedOrder[]).sort((a, b) => a.createdAt - b.createdAt),
  );
}

/** Hitung saja (untuk badge). Termasuk yang ditolak permanen (masih perlu ditinjau). */
export async function countPending(): Promise<number> {
  const list = await listQueue();
  return list.filter((q) => q.status !== "synced").length;
}

/** Penjualan offline yang ditolak server permanen — tampil di "Perlu ditinjau", tidak pernah dibuang otomatis. */
export async function listNeedsReview(): Promise<QueuedOrder[]> {
  const list = await listQueue();
  return list.filter((q) => q.status === "failed" && q.permanent);
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
export async function markFailed(id: string, errorMessage: string, permanent = false): Promise<void> {
  await tx("readwrite", async (store) => {
    const row = (await req(store.get(id))) as QueuedOrder | undefined;
    if (!row) return;
    row.status = "failed";
    row.permanent = permanent;
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
