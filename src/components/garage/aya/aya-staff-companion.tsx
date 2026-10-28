"use client";

// Aya untuk staf (keputusan Owner D-07): pet melayang di Garage OS yang mengingatkan tiap
// divisi pekerjaan yang perlu dikontrol (antrean lewat target, pesanan siap belum diantar,
// stok menipis). Data dari /api/ops-center (tanpa nominal uang), disaring per peran/stasiun.
// Tidak tampil sebelum login; di layar kasir (/pos) mulai di kiri dan tidak terbang sendiri.
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Info, X } from "lucide-react";

import { AyaFloatingPet } from "@/components/garage/aya/aya-floating-pet";
import { ayaMoodFor, ayaRemindersFor, type AyaReminder } from "@/lib/aya-reminders";
import { AYA_NAME } from "@/lib/garage-ai-persona";
import type { Role } from "@/lib/garage-data";
import type { OpsCenterData } from "@/lib/ops-center-types";

const POLL_MS = 60_000;

type Viewer = { name: string; role: Role; workstation: string | null };

/** Shell Garage OS menangani perpindahan modul tanpa muat ulang (preventDefault); `false` = belum ditangani. */
function requestModule(module: NonNullable<AyaReminder["module"]>) {
  const event = new CustomEvent("garage:navigate-module", { detail: { module }, cancelable: true });
  return !window.dispatchEvent(event);
}

const severityStyle: Record<AyaReminder["severity"], { Icon: typeof Info; className: string; label: string }> = {
  critical: { Icon: AlertTriangle, className: "text-garage-red-bright", label: "Genting" },
  warning: { Icon: AlertTriangle, className: "text-garage-amber", label: "Perlu dicek" },
  info: { Icon: Info, className: "text-garage-dim", label: "Info" },
};

export function AyaStaffCompanion() {
  const pathname = usePathname();
  const router = useRouter();
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [ops, setOps] = useState<Pick<OpsCenterData, "alerts" | "canOperate"> | null>(null);
  const [openSignal, setOpenSignal] = useState(0);
  const etag = useRef<string | null>(null);
  const seenCritical = useRef<Set<string>>(new Set());

  // Siapa yang login (tanpa sesi = Aya tidak tampil; dicoba lagi tiap menit).
  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const load = async () => {
      try {
        // get-session selalu 200 (null bila belum login) → tidak menambah error 401 di layar login.
        const session = await fetch("/api/auth/get-session", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
        if (!session) throw new Error("belum login");
        const res = await fetch("/api/me", { cache: "no-store" });
        if (res.ok) {
          const body = (await res.json()) as { data?: { user?: { name?: string }; role?: Role; workstation?: string | null } };
          if (!cancelled && body.data?.role) {
            setViewer({ name: body.data.user?.name ?? "", role: body.data.role, workstation: body.data.workstation ?? null });
            return;
          }
        }
      } catch {
        // jaringan putus: coba lagi nanti
      }
      if (!cancelled) timer = window.setTimeout(load, POLL_MS);
    };
    void load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  // Pengingat: polling ringan, hanya saat tab terlihat, memakai ETag.
  useEffect(() => {
    if (!viewer) return;
    let cancelled = false;
    let timer = 0;
    const load = async () => {
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch("/api/ops-center", {
            cache: "no-store",
            headers: etag.current ? { "if-none-match": etag.current } : undefined,
          });
          if (res.status === 200) {
            etag.current = res.headers.get("etag");
            const body = (await res.json()) as { data?: OpsCenterData };
            if (!cancelled && body.data) setOps({ alerts: body.data.alerts, canOperate: body.data.canOperate });
          }
        } catch {
          // biarkan data terakhir
        }
      }
      if (!cancelled) timer = window.setTimeout(load, POLL_MS);
    };
    void load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [viewer]);

  const reminders = useMemo(() => (viewer && ops ? ayaRemindersFor(viewer, ops) : []), [viewer, ops]);

  // Peringatan genting yang baru muncul → Aya membuka balon sendiri (sekali per peringatan).
  useEffect(() => {
    const fresh = reminders.filter((r) => r.severity === "critical" && !seenCritical.current.has(r.id));
    if (!fresh.length) return;
    for (const r of fresh) seenCritical.current.add(r.id);
    setOpenSignal((n) => n + 1);
  }, [reminders]);

  if (!viewer) return null;
  const onPos = pathname?.startsWith("/pos") ?? false;
  const firstName = viewer.name.trim().split(/\s+/)[0];

  return (
    <AyaFloatingPet
      // Kasir: kanan dipakai keranjang & tombol bayar → mulai di kiri, tidak terbang sendiri.
      scope={onPos ? "staff-pos" : "staff"}
      greetingOnce={false}
      corner={onPos ? "bottom-left" : "bottom-right"}
      roam={!onPos}
      mood={ops ? ayaMoodFor(reminders) : "default"}
      openSignal={openSignal}
    >
      {({ close, hide }) => (
        <div>
          <div className="flex items-start justify-between gap-2">
            <p className="text-base font-bold text-white">
              {reminders.length ? `${firstName ? `${firstName}, ` : ""}ada yang perlu dicek!` : `Hai${firstName ? ` ${firstName}` : ""}! Aku ${AYA_NAME}.`}
            </p>
            <button
              type="button"
              onClick={close}
              className="-mr-1 -mt-1 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-garage-dim transition-colors hover:bg-garage-bg-3 hover:text-white"
              aria-label={`Tutup pengingat ${AYA_NAME}`}
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          {reminders.length ? (
            <ul className="mt-2 grid max-h-[50vh] gap-2 overflow-y-auto">
              {reminders.map((r) => {
                const { Icon, className, label } = severityStyle[r.severity];
                return (
                  <li key={r.id} className="rounded-md border border-garage-line bg-garage-bg-1 p-2.5">
                    <div className="flex items-start gap-2">
                      <Icon className={`mt-0.5 size-4 shrink-0 ${className}`} aria-label={label} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-white">{r.title}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-garage-dim">{r.description}</p>
                        {r.module && r.actionLabel ? (
                          <button
                            type="button"
                            onClick={() => {
                              close();
                              if (!requestModule(r.module!)) router.push(`/os?module=${r.module}`);
                            }}
                            className="garage-press mt-2 flex h-9 cursor-pointer items-center gap-1 rounded-md border border-garage-line-2 px-2.5 text-xs font-bold text-white transition-colors hover:bg-garage-bg-3"
                          >
                            {r.actionLabel}
                            <ArrowRight className="size-3.5" aria-hidden />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-1 flex items-start gap-2 text-sm leading-relaxed text-garage-dim">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-garage-amber" aria-hidden />
              {ops ? "Antrean, pesanan siap, dan stok aman. Aku pantau terus ya!" : "Aku lagi cek antrean & stok…"}
            </p>
          )}
          <button
            type="button"
            onClick={hide}
            className="mt-2 cursor-pointer text-xs font-semibold text-garage-mute underline-offset-2 hover:text-white hover:underline"
          >
            Sembunyikan {AYA_NAME} untuk sesi ini
          </button>
        </div>
      )}
    </AyaFloatingPet>
  );
}
