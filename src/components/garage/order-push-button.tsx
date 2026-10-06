"use client";

import { BellRing, Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { createPushSubscription, pushSupport, type PushSupport } from "@/lib/push-client";

const doneKey = (orderId: string) => `garage:orderPush:${orderId}`;

/**
 * "Kabari saya" — pelanggan menerima notifikasi HP saat status pesanan berubah
 * (siap diambil, kurir berangkat, sampai), walau layar terkunci.
 */
export function OrderPushButton({ orderId, orderToken }: { orderId: string | null; orderToken: string | null }) {
  const [support, setSupport] = useState<PushSupport>("unsupported");
  const [state, setState] = useState<"idle" | "busy" | "on" | "denied" | "error">("idle");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deteksi kemampuan browser (khusus klien)
    setSupport(pushSupport());
    if (!orderId) return;
    try {
      if (window.localStorage.getItem(doneKey(orderId))) setState("on");
    } catch {
      /* ignore */
    }
  }, [orderId]);

  if (!orderId || !orderToken) return null;
  if (support === "ios-needs-install") {
    return (
      <p className="mt-2 rounded-md border border-garage-line bg-garage-bg-2 px-3 py-2 text-xs leading-5 text-[#d0d0d6]">
        Ingin notifikasi saat pesanan siap di iPhone? Ketuk <strong className="text-white">Bagikan → Tambahkan ke Layar Utama</strong>, lalu buka
        Garage dari ikon tersebut.
      </p>
    );
  }
  if (support !== "supported") return null;

  async function enable() {
    setState("busy");
    try {
      const subscription = await createPushSubscription();
      if (!subscription?.endpoint || !subscription.keys) {
        setState(Notification.permission === "denied" ? "denied" : "error");
        return;
      }
      const response = await fetch(`/api/customer/orders/${orderId}/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderToken, endpoint: subscription.endpoint, keys: subscription.keys }),
      });
      if (!response.ok) throw new Error("gagal");
      try {
        window.localStorage.setItem(doneKey(orderId as string), "1");
      } catch {
        /* ignore */
      }
      setState("on");
    } catch {
      setState("error");
    }
  }

  if (state === "on") {
    return (
      <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#e7e9ee]">
        <Check className="size-3.5" aria-hidden /> Notifikasi HP aktif untuk pesanan ini
      </p>
    );
  }
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => void enable()}
        disabled={state === "busy"}
        className="garage-press flex w-full items-center justify-center gap-2 rounded-md border border-garage-amber/50 bg-garage-amber/10 px-3 py-2.5 text-sm font-bold text-[#ffd79a] disabled:opacity-60"
      >
        {state === "busy" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <BellRing className="size-4" aria-hidden />}
        Kabari saya saat pesanan siap
      </button>
      {state === "denied" ? (
        <p className="mt-1 text-xs text-[#fca5a5]">Izin notifikasi ditolak. Aktifkan lewat pengaturan situs di browser.</p>
      ) : state === "error" ? (
        <p className="mt-1 text-xs text-[#fca5a5]">Notifikasi belum bisa diaktifkan. Coba lagi.</p>
      ) : null}
    </div>
  );
}
