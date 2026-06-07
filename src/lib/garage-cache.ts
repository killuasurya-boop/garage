"use client";

// Cache-invalidation event bus untuk Garage OS.
//
// Masalah yang dipecahkan: 25+ komponen fetch via `garageApi` di useEffect
// tanpa cache bersama. Setelah mutation di satu modul (mis. void order di POS),
// view lain (mis. Sales History, Dashboard) tetap menampilkan data basi sampai
// reload manual. Tanpa nambah dependency berat (SWR/React Query), kita pakai
// event-bus tag-based ringan + hook `useGarageQuery`.
//
// Pemakaian:
//   // di view yang membaca data:
//   const { data, error, loading, refetch } = useGarageQuery(
//     () => garageApi.get<T>("/api/orders/history"),
//     { tags: GARAGE_TAGS.orders },
//   );
//
//   // setelah mutation yang mengubah orders (di mana saja):
//   invalidateGarageCache(GARAGE_TAGS.orders);
//   // -> semua useGarageQuery yang subscribe tag itu auto-refetch.

// Tag standar per domain. Pakai konstanta ini, jangan string lepas, supaya
// invalidasi konsisten lintas modul.
export const GARAGE_TAGS = {
  orders: "orders",
  kitchen: "kitchen",
  inventory: "inventory",
  finance: "finance",
  cashSessions: "cash-sessions",
  crm: "crm",
  customers: "customers",
  approvals: "approvals",
  audit: "audit",
  menu: "menu",
  staff: "staff",
  dashboard: "dashboard",
} as const;

export type GarageTag = string;

// version[tag] dinaikkan tiap invalidate. Snapshot gabungan dipakai
// useSyncExternalStore untuk deteksi perubahan tanpa set-state-in-effect.
const versions = new Map<GarageTag, number>();
const listeners = new Map<GarageTag, Set<() => void>>();

function normalizeTags(tags: GarageTag | GarageTag[]): GarageTag[] {
  return Array.isArray(tags) ? tags : [tags];
}

function bump(tag: GarageTag) {
  versions.set(tag, (versions.get(tag) ?? 0) + 1);
  const set = listeners.get(tag);
  if (set) {
    for (const cb of set) cb();
  }
}

// Naikkan versi satu/beberapa tag dan beri tahu subscriber. Panggil setelah
// mutation sukses (POST/PATCH/DELETE) yang mengubah domain terkait.
export function invalidateGarageCache(tags: GarageTag | GarageTag[]) {
  for (const tag of normalizeTags(tags)) bump(tag);
}

// Subscribe ke perubahan tag. Return unsubscribe. Dipakai internal oleh hook.
export function subscribeGarageCache(
  tags: GarageTag | GarageTag[],
  callback: () => void,
): () => void {
  const list = normalizeTags(tags);
  for (const tag of list) {
    let set = listeners.get(tag);
    if (!set) {
      set = new Set();
      listeners.set(tag, set);
    }
    set.add(callback);
  }
  return () => {
    for (const tag of list) {
      listeners.get(tag)?.delete(callback);
    }
  };
}

// Snapshot versi gabungan untuk daftar tag. Berubah nilainya tiap invalidate,
// jadi useSyncExternalStore tahu harus re-render lalu hook refetch.
export function getGarageCacheVersion(tags: GarageTag | GarageTag[]): number {
  let sum = 0;
  for (const tag of normalizeTags(tags)) sum += versions.get(tag) ?? 0;
  return sum;
}
