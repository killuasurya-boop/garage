// Helper anti double-submit berbasis in-memory cache (per-proses).
// Cocok untuk POS/payment/closing yang sering kena klik dobel atau network retry.
// Window pendek (default 60s); kalau request kedua datang dengan key sama → return
// hasil cache, JANGAN eksekusi ulang.

type Entry<T> = {
  expiresAt: number;
  status: "pending" | "done";
  result?: T;
};

const stores = new Map<string, Map<string, Entry<unknown>>>();

function getStore(namespace: string): Map<string, Entry<unknown>> {
  let store = stores.get(namespace);
  if (!store) {
    store = new Map();
    stores.set(namespace, store);
  }
  // Lazy cleanup biar Map tidak tumbuh terus.
  const now = Date.now();
  if (store.size > 256) {
    for (const [k, v] of store.entries()) {
      if (v.expiresAt <= now) store.delete(k);
    }
  }
  return store;
}

export function readIdempotencyKey(request: Request): string | null {
  const raw = request.headers.get("x-idempotency-key");
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length < 8 || trimmed.length > 128) return null;
  return trimmed;
}

export type IdempotencyHit<T> =
  | { kind: "miss"; commit: (result: T) => void; abandon: () => void }
  | { kind: "pending" }
  | { kind: "hit"; result: T };

export function checkIdempotency<T>(
  namespace: string,
  key: string,
  windowMs = 60_000,
): IdempotencyHit<T> {
  const store = getStore(namespace);
  const now = Date.now();
  const existing = store.get(key);
  if (existing && existing.expiresAt > now) {
    if (existing.status === "done") {
      return { kind: "hit", result: existing.result as T };
    }
    return { kind: "pending" };
  }

  const entry: Entry<unknown> = { expiresAt: now + windowMs, status: "pending" };
  store.set(key, entry);
  return {
    kind: "miss",
    commit: (result: T) => {
      entry.status = "done";
      entry.result = result as unknown;
      entry.expiresAt = Date.now() + windowMs;
    },
    abandon: () => {
      store.delete(key);
    },
  };
}
