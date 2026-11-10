// =============================================================================
// SATU EVENT = SATU BUNYI PER PERANGKAT (Smart Notification V2, temuan F-06).
// Semua tab Garage di satu browser berbagi "buku bunyi" di localStorage. Tab yang
// pertama mengklaim kunci event memutar suara; tab lain, re-render, reconnect SSE,
// dan refresh halaman (dalam TTL) tidak memutar ulang. Web Locks membuat klaim
// atomik antar tab; tanpa Web Locks tetap cek-lalu-tulis (best effort).
// =============================================================================

export const SOUND_LEDGER_KEY = "garage:sound-ledger:v1";
export const SOUND_CLAIM_TTL_MS = 30 * 60_000;
const MAX_ENTRIES = 400;

type Ledger = Record<string, number>;
type StorageLike = Pick<Storage, "getItem" | "setItem">;

const memoryLedger = new Map<string, number>();

function storage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readLedger(store: StorageLike): Ledger {
  try {
    const parsed = JSON.parse(store.getItem(SOUND_LEDGER_KEY) ?? "{}") as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Ledger) : {};
  } catch {
    return {};
  }
}

/**
 * Inti klaim (sinkron, dipanggil di dalam lock). true = kunci belum pernah
 * dibunyikan dalam TTL → catat & boleh bunyi.
 */
export function claimInLedger(store: StorageLike | null, key: string, now: number, ttlMs = SOUND_CLAIM_TTL_MS): boolean {
  if (!store) {
    const last = memoryLedger.get(key);
    if (last !== undefined && now - last < ttlMs) return false;
    memoryLedger.set(key, now);
    return true;
  }
  const ledger = readLedger(store);
  const last = ledger[key];
  if (typeof last === "number" && now - last < ttlMs) return false;
  const next: Ledger = {};
  const fresh = Object.entries(ledger)
    .filter(([, at]) => typeof at === "number" && now - at < SOUND_CLAIM_TTL_MS)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_ENTRIES - 1);
  for (const [k, at] of fresh) next[k] = at;
  next[key] = now;
  try {
    store.setItem(SOUND_LEDGER_KEY, JSON.stringify(next));
  } catch {
    memoryLedger.set(key, now);
  }
  return true;
}

type LockManagerLike = {
  request: (name: string, options: { mode: "exclusive" }, cb: () => Promise<boolean> | boolean) => Promise<boolean>;
};

function lockManager(): LockManagerLike | null {
  if (typeof navigator === "undefined") return null;
  const locks = (navigator as Navigator & { locks?: LockManagerLike }).locks;
  return locks && typeof locks.request === "function" ? locks : null;
}

/** Klaim bunyi untuk satu event. Kunci kosong = selalu boleh (bunyi uji/preview). */
export async function claimSound(key: string | null | undefined, ttlMs = SOUND_CLAIM_TTL_MS): Promise<boolean> {
  if (!key) return true;
  const run = () => claimInLedger(storage(), key, Date.now(), ttlMs);
  const locks = lockManager();
  if (!locks) return run();
  try {
    return await locks.request("garage:sound-ledger", { mode: "exclusive" }, run);
  } catch {
    return run();
  }
}

/** Untuk test: kosongkan ledger memori. */
export function resetSoundClaimsForTest() {
  memoryLedger.clear();
}
