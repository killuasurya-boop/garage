"use client";

// Hook untuk status online/offline dan badge antrian offline POS.
//
// Gunakan di komponen POS:
//   const { online, pendingCount, refresh } = usePosOfflineStatus();
//   ...
//   {!online && <Banner>Offline · {pendingCount} order pending sync</Banner>}

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { listQueue, type QueuedOrder } from "@/lib/pos-offline-queue";

export type PosOfflineStatus = {
  online: boolean;
  pendingCount: number;
  /** Isi antrean (untuk batas 50 penjualan / 8 jam & daftar "Perlu ditinjau"). */
  queue: QueuedOrder[];
  refresh: () => void;
};

// Subscribe ke event online/offline tanpa setState dlm effect body.
function subscribeOnline(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}
function getOnlineSnapshot() {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}
function getServerSnapshot() {
  return true; // SSR default: anggap online (cegah hydration jitter)
}

export function usePosOfflineStatus(): PosOfflineStatus {
  // useSyncExternalStore — pola legal untuk subscribe ke browser API,
  // tidak memicu lint set-state-in-effect.
  const online = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerSnapshot);

  const [queue, setQueue] = useState<QueuedOrder[]>([]);

  const refresh = useCallback(() => {
    listQueue()
      .then((rows) =>
        // Referensi lama dipertahankan bila isinya sama (polling 5 dtk tidak me-render ulang POS).
        setQueue((previous) =>
          previous.length === rows.length &&
          previous.every((row, index) => row.id === rows[index].id && row.status === rows[index].status && row.updatedAt === rows[index].updatedAt)
            ? previous
            : rows,
        ),
      )
      .catch(() => {
        /* IDB belum siap atau bukan browser — abaikan */
      });
  }, []);
  const pendingCount = queue.filter((row) => row.status !== "synced").length;

  useEffect(() => {
    // Tick polling pertama via setInterval (bukan setState langsung)
    refresh();
    const id = window.setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  return { online, pendingCount, queue, refresh };
}
