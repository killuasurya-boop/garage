"use client";

// Hook status online/offline + jumlah action pending untuk waiter.

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { countPending } from "@/lib/waiter-offline-queue";

export type WaiterOfflineStatus = {
  online: boolean;
  pendingCount: number;
  refresh: () => void;
};

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
  return true;
}

export function useWaiterOfflineStatus(): WaiterOfflineStatus {
  const online = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerSnapshot);
  const [pendingCount, setPendingCount] = useState<number>(0);

  const refresh = useCallback(() => {
    countPending()
      .then((n) => setPendingCount(n))
      .catch(() => {
        /* IDB belum siap — abaikan */
      });
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  return { online, pendingCount, refresh };
}
