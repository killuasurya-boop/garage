"use client";

// =============================================================================
// PUSAT NOTIFIKASI STAF (header global — tampil di SEMUA modul, bukan hanya POS).
// Sumber: /api/notifications (feed per peran) + SSE produksi sebagai pemicu
// realtime; poll cadangan 30 dtk dan berhenti saat tab disembunyikan.
// Suara: ding + suara skenario yang PATUH mute (tanpa force); notifikasi
// mendesak diulang tiap 45 dtk (maks 5×) sampai dibaca. Ada tombol aktifkan
// notifikasi HP (web push) untuk saat layar terkunci.
// =============================================================================

import {
  Bell,
  BellRing,
  Bike,
  CheckCheck,
  Clock3,
  Loader2,
  MessageCircle,
  Package,
  ShoppingBag,
  Smartphone,
  TriangleAlert,
  UtensilsCrossed,
  Volume2,
  VolumeX,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { emitGarageToast } from "@/components/garage/garage-toast";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { garageApi } from "@/lib/api-client";
import { voice, type VoiceScenario } from "@/lib/garage-voice";
import { createPushSubscription, ensureServiceWorker, pushSupport } from "@/lib/push-client";
import { claimSound } from "@/lib/sound-claim";
import { useProductionStream } from "@/lib/use-production-stream";

type NotificationItem = {
  id: string;
  kind: string;
  severity: "info" | "warning" | "urgent";
  title: string;
  body: string | null;
  url: string | null;
  orderId: string | null;
  createdAt: string;
  read: boolean;
  dedupKey?: string | null;
  resolvedAt?: string | null;
  resolvedReason?: string | null;
};

type Feed = { items: NotificationItem[]; unreadCount: number };

const KIND_META: Record<string, { icon: LucideIcon; voice?: VoiceScenario }> = {
  qr_new: { icon: ShoppingBag, voice: "airport_qr" },
  chat: { icon: MessageCircle },
  courier_assigned: { icon: Bike, voice: "delivery_pickup" },
  delivery_arrived: { icon: CheckCheck },
  takeaway_ready: { icon: ShoppingBag, voice: "order_ready" },
  auto_rejected: { icon: XCircle },
  unpaid_expiring: { icon: Clock3 },
  service_call: { icon: BellRing, voice: "waiter_call" },
  service_bill: { icon: BellRing, voice: "waiter_bill_request" },
  service_water: { icon: UtensilsCrossed, voice: "waiter_refill" },
  service_other: { icon: BellRing, voice: "waiter_call" },
  ready_to_deliver: { icon: UtensilsCrossed, voice: "order_ready_deliver" },
  cash_variance: { icon: TriangleAlert, voice: "cash_anomaly" },
  material_request: { icon: Package },
};

/** Kunci bunyi bersama: event yang sama dari lonceng & layar lain (mis. waiter-view) cukup sekali. */
export function notificationSoundKey(item: Pick<NotificationItem, "id" | "dedupKey">) {
  return `notif:${item.dedupKey ?? item.id}`;
}

type FeedFilter = "action" | "read" | "resolved";
const FILTER_LABEL: Record<FeedFilter, string> = { action: "Perlu aksi", read: "Dibaca", resolved: "Selesai" };

function filterOf(item: NotificationItem): FeedFilter {
  if (item.resolvedAt) return "resolved";
  return item.read ? "read" : "action";
}

const REPEAT_MS = 45_000;
const MAX_REPEATS = 5;

function timeAgo(iso: string, now: number) {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} mnt lalu`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} jam lalu` : `${Math.floor(hours / 24)} hari lalu`;
}

const DEVICE_SOUND_KEY = "garage:device:notif-sound";

function deviceSoundOn() {
  try {
    return window.localStorage.getItem(DEVICE_SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function StaffNotificationCenter({
  onNavigate,
  newOrderSound,
}: {
  onNavigate?: (url: string) => void;
  /** Pengaturan outlet "Sound order baru" (silent = tanpa bunyi untuk order QR). */
  newOrderSound?: string;
}) {
  const [feed, setFeed] = useState<Feed>({ items: [], unreadCount: 0 });
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<FeedFilter>("action");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [pushState, setPushState] = useState<"unknown" | "on" | "off" | "busy" | "unsupported" | "ios" | "denied">("unknown");
  const knownRef = useRef<Set<string> | null>(null);
  const repeatsRef = useRef<Map<string, number>>(new Map());

  const [deviceSound, setDeviceSound] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preferensi perangkat dari localStorage
    setDeviceSound(deviceSoundOn());
  }, []);

  const alertFor = useCallback(
    (item: NotificationItem) => {
      // "Perangkat ini bersuara" mati → hanya visual (cegah semua HP/tablet berbunyi bersamaan).
      if (!deviceSoundOn()) return;
      if (item.kind === "qr_new") {
        // Layar POS punya bunyi QR sendiri; pengaturan outlet "Silent" = tanpa bunyi.
        if (document.body.dataset.posQrSound === "1" || newOrderSound === "silent") return;
      }
      const meta = KIND_META[item.kind];
      // V2: satu event = satu bunyi per perangkat (tab lain / layar lain / refresh tidak mengulang).
      void claimSound(notificationSoundKey(item)).then((ok) => {
        if (!ok) return;
        if (meta?.voice) void voice.announce(meta.voice, { force: false });
        else voice.playDing(item.severity === "info" ? "soft" : "alert");
      });
    },
    [newOrderSound],
  );

  const load = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    try {
      const next = await garageApi.get<Feed>("/api/notifications", { cache: "no-store" });
      setError(null);
      setLoaded(true);
      setFeed(next);
      const known = knownRef.current;
      const fresh = known ? next.items.filter((item) => !item.read && !item.resolvedAt && !known.has(item.id)) : [];
      knownRef.current = new Set(next.items.map((item) => item.id));
      // Muat pertama: hanya menyimpan (tidak berbunyi untuk notifikasi lama).
      for (const item of fresh.slice(0, 3)) {
        alertFor(item);
        emitGarageToast({
          tone: item.severity === "info" ? "info" : "error",
          title: item.title,
          body: item.body ?? undefined,
          ttl: item.severity === "urgent" ? 9000 : 6000,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Notifikasi gagal dimuat.");
    }
  }, [alertFor]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- muat awal feed notifikasi
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    // Klik notifikasi HP saat tab sudah terbuka → service worker kirim pesan.
    const onSwMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null;
      if (data?.type === "garage:navigate" && data.url) {
        window.dispatchEvent(new CustomEvent("garage:navigate", { detail: data.url }));
      }
    };
    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    // Browser memblokir suara sebelum ada sentuhan: buka kunci di sentuhan pertama.
    const unlock = () => voice.unlock();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pointerdown", unlock);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    };
  }, [load]);
  useProductionStream(load);

  // Ulangi bunyi untuk notifikasi MENDESAK yang belum dibaca (maks 5×).
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === "hidden") return;
      // Kejadian yang sudah selesai (order diterima, panggilan diselesaikan) tidak diulang.
      const pending = feed.items.filter(
        (item) =>
          !item.read && !item.resolvedAt && item.severity === "urgent" && Date.now() - new Date(item.createdAt).getTime() > REPEAT_MS / 2,
      );
      const due = pending.find((item) => (repeatsRef.current.get(item.id) ?? 0) < MAX_REPEATS);
      if (!due) return;
      const round = (repeatsRef.current.get(due.id) ?? 0) + 1;
      repeatsRef.current.set(due.id, round);
      if (!deviceSoundOn()) return;
      void claimSound(`${notificationSoundKey(due)}:repeat:${round}`).then((ok) => {
        if (ok) voice.playDing("alert");
      });
    }, REPEAT_MS);
    return () => window.clearInterval(id);
  }, [feed.items]);

  // Badge di judul tab supaya kelihatan walau pindah tab.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = feed.unreadCount > 0 ? `(${feed.unreadCount}) ${base}` : base;
  }, [feed.unreadCount]);

  // Status web push perangkat ini.
  useEffect(() => {
    const support = pushSupport();
    if (support === "ios-needs-install") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- deteksi kemampuan browser
      setPushState("ios");
      return;
    }
    if (support !== "supported") {
      setPushState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setPushState("denied");
      return;
    }
    void ensureServiceWorker()
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => setPushState(subscription ? "on" : "off"))
      .catch(() => setPushState("off"));
  }, []);

  async function enablePush() {
    setPushState("busy");
    try {
      const subscription = await createPushSubscription();
      if (!subscription?.endpoint || !subscription.keys) {
        setPushState(Notification.permission === "denied" ? "denied" : "off");
        return;
      }
      await garageApi.post("/api/push/subscribe", {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        userAgent: navigator.userAgent,
      });
      setPushState("on");
      emitGarageToast({ tone: "success", title: "Notifikasi HP aktif", body: "Perangkat ini menerima notifikasi walau layar terkunci." });
    } catch (err) {
      setPushState("off");
      emitGarageToast({ tone: "error", title: "Gagal mengaktifkan notifikasi HP", body: err instanceof Error ? err.message : undefined });
    }
  }

  async function markRead(ids: string[]) {
    if (!ids.length) return;
    setFeed((prev) => ({
      items: prev.items.map((item) => (ids.includes(item.id) ? { ...item, read: true } : item)),
      unreadCount: Math.max(0, prev.unreadCount - prev.items.filter((item) => ids.includes(item.id) && !item.read).length),
    }));
    try {
      await garageApi.post("/api/notifications", { ids });
    } catch {
      void load();
    }
  }

  const unreadIds = useMemo(() => feed.items.filter((item) => !item.read).map((item) => item.id), [feed.items]);
  const urgentUnread = feed.items.some((item) => !item.read && !item.resolvedAt && item.severity === "urgent");
  const counts = useMemo(() => {
    const out: Record<FeedFilter, number> = { action: 0, read: 0, resolved: 0 };
    for (const item of feed.items) out[filterOf(item)] += 1;
    return out;
  }, [feed.items]);
  const visibleItems = useMemo(() => feed.items.filter((item) => filterOf(item) === filter), [feed.items, filter]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label={feed.unreadCount ? `Notifikasi, ${feed.unreadCount} belum dibaca` : "Notifikasi"}
        className={`garage-press relative size-10 border-garage-line-2 bg-garage-bg-2 text-white ${urgentUnread ? "border-garage-red/70" : ""}`}
      >
        {feed.unreadCount ? <BellRing className={`size-5 ${urgentUnread ? "text-[#ffb3b3] motion-safe:animate-pulse" : ""}`} /> : <Bell className="size-5" />}
        {feed.unreadCount ? (
          <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-garage-red px-1.5 py-0.5 text-center text-xs font-black leading-none text-white">
            {feed.unreadCount > 99 ? "99+" : feed.unreadCount}
          </span>
        ) : null}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 border-garage-line bg-garage-bg-1 p-0 text-white sm:max-w-md">
          <SheetHeader className="border-b border-garage-line p-4 text-left">
            <SheetTitle className="flex items-center gap-2 font-sans text-white">
              <Bell className="size-4 text-garage-amber" aria-hidden /> Notifikasi
            </SheetTitle>
            <SheetDescription className="text-sm text-[#d0d0d6]">
              {feed.unreadCount ? `${feed.unreadCount} belum dibaca` : "Semua sudah dibaca"} · 48 jam terakhir
            </SheetDescription>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 border-garage-line-2"
                disabled={!unreadIds.length}
                onClick={() => void markRead(unreadIds)}
              >
                <CheckCheck className="size-4" aria-hidden /> Tandai semua dibaca
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-pressed={deviceSound}
                className="h-9 border-garage-line-2"
                onClick={() => {
                  const next = !deviceSound;
                  setDeviceSound(next);
                  try {
                    window.localStorage.setItem(DEVICE_SOUND_KEY, next ? "on" : "off");
                  } catch {
                    /* ignore */
                  }
                }}
              >
                {deviceSound ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
                {deviceSound ? "Perangkat ini bersuara" : "Perangkat ini senyap"}
              </Button>
              {pushState === "off" || pushState === "busy" ? (
                <Button type="button" size="sm" className="h-9" disabled={pushState === "busy"} onClick={() => void enablePush()}>
                  {pushState === "busy" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Smartphone className="size-4" aria-hidden />}
                  Aktifkan notifikasi HP
                </Button>
              ) : pushState === "on" ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#e7e9ee]">
                  <Smartphone className="size-3.5" aria-hidden /> Notifikasi HP aktif
                </span>
              ) : null}
            </div>
            {pushState === "ios" ? (
              <p className="text-xs leading-5 text-[#d0d0d6]">
                iPhone: buka menu <strong className="text-white">Bagikan → Tambahkan ke Layar Utama</strong>, lalu login dari ikon
                Garage untuk menerima notifikasi saat layar terkunci.
              </p>
            ) : pushState === "denied" ? (
              <p className="text-xs leading-5 text-[#fca5a5]">Izin notifikasi diblokir di browser — aktifkan lewat pengaturan situs.</p>
            ) : null}
            <div role="tablist" aria-label="Saring notifikasi" className="grid grid-cols-3 gap-1 pt-1">
              {(Object.keys(FILTER_LABEL) as FeedFilter[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={filter === key}
                  onClick={() => setFilter(key)}
                  className={`h-9 rounded-md border px-2 text-xs font-bold ${
                    filter === key ? "border-garage-amber bg-garage-amber/15 text-white" : "border-garage-line-2 text-[#d0d0d6] hover:bg-garage-bg-3"
                  }`}
                >
                  {FILTER_LABEL[key]} ({counts[key]})
                </button>
              ))}
            </div>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto" role="log" aria-live="polite" aria-label="Daftar notifikasi">
            {error && !loaded ? (
              <p className="m-4 flex items-center gap-2 rounded-md border border-garage-red/50 bg-garage-red/10 p-3 text-sm text-[#ffc9c9]">
                <TriangleAlert className="size-4" aria-hidden /> {error}
              </p>
            ) : !loaded ? (
              <p className="p-6 text-center text-sm text-[#d0d0d6]">Memuat…</p>
            ) : visibleItems.length === 0 ? (
              <p className="p-8 text-center text-sm text-[#d0d0d6]">
                {filter === "action" ? "Tidak ada yang perlu ditindak." : "Belum ada notifikasi."}
              </p>
            ) : (
              <ul className="divide-y divide-garage-line">
                {visibleItems.map((item) => {
                  const Icon = KIND_META[item.kind]?.icon ?? Bell;
                  const tone =
                    item.severity === "urgent" ? "text-[#ffb3b3]" : item.severity === "warning" ? "text-[#ffd79a]" : "text-[#e7e9ee]";
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          void markRead([item.id]);
                          // V2: notifikasi yang sudah selesai tidak membuka aksi (cegah aksi basi).
                          if (item.url && !item.resolvedAt) {
                            setOpen(false);
                            if (onNavigate) onNavigate(item.url);
                            else window.dispatchEvent(new CustomEvent("garage:navigate", { detail: item.url }));
                          }
                        }}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-garage-bg-3 ${
                          item.read ? "opacity-75" : "bg-white/[0.03]"
                        }`}
                      >
                        <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-current/30 ${tone}`}>
                          <Icon className="size-4" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className={`text-sm ${item.read ? "font-semibold text-[#e7e9ee]" : "font-black text-white"}`}>{item.title}</span>
                            {!item.read ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-garage-red" aria-label="Belum dibaca" /> : null}
                          </span>
                          {item.body ? <span className="mt-0.5 block break-words text-sm text-[#d0d0d6]">{item.body}</span> : null}
                          <span className="mt-1 block text-xs text-[#b8b8bf]">
                            {timeAgo(item.createdAt, now)}
                            {item.resolvedAt ? (
                              <span className="ml-2 inline-flex items-center gap-1 font-semibold text-[#e7e9ee]">
                                <CheckCheck className="size-3" aria-hidden /> Selesai{item.resolvedReason ? ` · ${item.resolvedReason}` : ""}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
