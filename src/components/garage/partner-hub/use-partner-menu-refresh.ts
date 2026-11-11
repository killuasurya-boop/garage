"use client";

// Sinkron status produk mitra di layar yang sudah terbuka (menu digital pelanggan, POS kasir/waiter).
// Jalan hanya bila daftar berisi produk mitra; cek tiap 30 detik saat layar terlihat + segera saat layar
// kembali aktif (tablet bangun / tab dibuka lagi). Hanya status mitra yang diperbarui (mergePartnerStatus).

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";

import { mergePartnerStatus, PARTNER_MENU_REFRESH_MS } from "@/lib/partner-menu-refresh";

type PartnerAware = { id: string; stock?: string | null; partner?: { name: string; label: string | null } | null };

export function usePartnerMenuRefresh<T extends PartnerAware>(
  enabled: boolean,
  fetchFresh: () => Promise<PartnerAware[]>,
  setItems: Dispatch<SetStateAction<T[]>>,
) {
  // Fungsi terbaru tanpa memicu ulang efek (fetcher sering dibuat ulang tiap render).
  const fetchRef = useRef(fetchFresh);
  const setRef = useRef(setItems);
  useEffect(() => {
    fetchRef.current = fetchFresh;
    setRef.current = setItems;
  });

  useEffect(() => {
    if (!enabled) return;
    let busy = false;
    let alive = true;
    const refresh = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const fresh = await fetchRef.current();
        if (alive) setRef.current((current) => mergePartnerStatus(current, fresh));
      } catch {
        /* jaringan putus: pakai status terakhir; server tetap menolak pesanan mitra yang tidak tersedia */
      } finally {
        busy = false;
      }
    };
    const id = window.setInterval(() => void refresh(), PARTNER_MENU_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [enabled]);
}
