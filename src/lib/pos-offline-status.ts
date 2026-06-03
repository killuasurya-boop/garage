"use client";

// Hook untuk status online/offline dan badge antrian offline POS.
//
// Gunakan di komponen POS:
//   const { online, pendingCount, refresh } = usePosOfflineStatus();
//   ...
//   {!online && <Banner>Offline · {pendingCount} order pending sync</Banner>}

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { countPending } from "@/lib/pos-offline-queue";

export type PosOfflineStatus = {
  online: boolean;
  pendingCount: number;
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

  const [pendingCount, setPendingCount] = useState<number>(0);

  const refresh = useCallback(() => {
    countPending()
      .then((n) => setPendingCount(n))
      .catch(() => {
        /* IDB belum siap atau bukan browser — abaikan */
      });
  }, []);

  useEffect(() => {
    // Tick polling pertama via setInterval (bukan setState langsung)
    refresh();
    const id = window.setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  return { online, pendingCount, refresh };
}
