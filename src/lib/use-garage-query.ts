"use client";

// Hook fetch + cache-invalidation untuk Garage OS. Membungkus `garageApi`
// (envelope { data } / { error: { code, message } }) dan auto-refetch saat
// tag terkait di-invalidate via invalidateGarageCache().
//
// Lihat garage-cache.ts untuk pola pemakaian end-to-end.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  getGarageCacheVersion,
  subscribeGarageCache,
  type GarageTag,
} from "@/lib/garage-cache";

export type GarageQueryResult<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  refetch: () => void;
};

type GarageQueryOptions = {
  // Tag yang memicu auto-refetch saat di-invalidate.
  tags: GarageTag | GarageTag[];
  // Set false untuk menunda fetch (mis. menunggu param siap). Default true.
  enabled?: boolean;
  // Identitas query berbasis input (mis. filter/param). Saat key berubah,
  // hook refetch dengan closure fetcher terbaru. Pakai ini kalau fetcher
  // bergantung pada state (search, tanggal, dll).
  key?: string;
};

export function useGarageQuery<T>(
  fetcher: () => Promise<T>,
  options: GarageQueryOptions,
): GarageQueryResult<T> {
  const { tags, enabled = true, key } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);

  // Simpan fetcher di ref agar identitas fungsi yang berubah tiap render
  // (inline arrow) tidak memicu refetch loop. Refetch dikontrol oleh
  // `enabled`, `version` (invalidasi), `key`, dan refetch() manual.
  // Ref di-update di effect (bukan saat render) supaya lint refs aman.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  // Snapshot versi tag — berubah tiap invalidateGarageCache(tag) dipanggil.
  const subscribe = useCallback(
    (cb: () => void) => subscribeGarageCache(tags, cb),
    // tags bisa array literal inline; serialize agar stabil.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [Array.isArray(tags) ? tags.join(",") : tags],
  );
  const version = useSyncExternalStore(
    subscribe,
    () => getGarageCacheVersion(tags),
    () => 0,
  );

  // Counter untuk refetch manual.
  const [manualTick, setManualTick] = useState(0);
  const refetch = useCallback(() => setManualTick((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mulai fetch (side-effect sah)
    setLoading(true);
    setError(null);

    fetcherRef
      .current()
      .then((result) => {
        if (cancelled) return;
        setData(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Gagal memuat data.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, version, manualTick, key]);

  // Saat disabled, loading di-derive false (tanpa setState di effect) supaya
  // konsumen tidak melihat spinner abadi.
  return { data, error, loading: enabled ? loading : false, refetch };
}
