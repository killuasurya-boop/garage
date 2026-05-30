"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  Check,
  ClipboardList,
  RefreshCw,
  Wrench,
} from "lucide-react";

import {
  alertContextLine,
  alertInstruction,
  alertShortTitle,
  priorityLabel,
  supervisionKindMeta,
} from "@/components/garage/garage-ai-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { garageApi } from "@/lib/api-client";
import type { AiAlertsResponse, AiOperationalAlert } from "@/lib/garage-api-types";
import type { GarageMe } from "@/lib/garage-api-types";

const STEPS = [
  {
    title: "Baca pengingat",
    detail: "Lonceng di header juga menampilkan daftar yang sama.",
  },
  {
    title: "Perbaiki di modul",
    detail: "Kerjakan di POS, Kitchen, atau Inventory — bukan hanya di sini.",
  },
  {
    title: "Tandai selesai",
    detail: 'Klik "Sudah diperbaiki" setelah masalah beres.',
  },
] as const;

type GarageAiSimpleViewProps = {
  me: GarageMe;
};

export function GarageAiSimpleView({ me }: GarageAiSimpleViewProps) {
  const [alerts, setAlerts] = useState<AiOperationalAlert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ackPending, setAckPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAlerts = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }

    setError(null);

    try {
      const payload = await garageApi.get<AiAlertsResponse>("/api/ai/alerts", {
        cache: "no-store",
      });
      const active = (payload.alerts ?? []).filter((alert) => !alert.acknowledged);
      setAlerts(active);
      setUnreadCount(payload.unreadCount ?? active.length);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Pengingat belum bisa dimuat.",
      );
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      await loadAlerts();
      if (cancelled) {
        return;
      }
    };

    void bootstrap();
    const timer = window.setInterval(() => {
      void loadAlerts({ silent: true });
    }, 45_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function acknowledgeAlert(alertId: string) {
    setAckPending(alertId);
    setError(null);

    try {
      await garageApi.post(`/api/ai/alerts/${alertId}/ack`, {});
      await loadAlerts({ silent: true });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Gagal menandai selesai.",
      );
    } finally {
      setAckPending(null);
    }
  }

  const urgentCount = alerts.filter((alert) => alert.priority === "high").length;

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <div className="garage-panel rounded-lg p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full border border-[#f5a742]/35 bg-[#f5a742]/12">
            <Bell className="size-5 text-[#ffd08a]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-[#b8b8bf]">Untuk {me.role}</p>
            <h2 className="garage-display text-2xl leading-tight text-white">
              Pengingat Kerja
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#d6d6dc]">
              Sistem mengawasi operasi shift dan memberi tahu apa yang perlu segera
              diperbaiki.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge className="border-[#4a4a54] bg-white/[0.06] text-xs text-[#f4f4f5]">
            {unreadCount} aktif
          </Badge>
          {urgentCount > 0 ? (
            <Badge className="border-[#d11a2a]/45 bg-[#d11a2a]/14 text-xs text-[#ffc2c8]">
              {urgentCount} segera
            </Badge>
          ) : (
            <Badge className="border-emerald-400/35 bg-emerald-400/10 text-xs text-emerald-100">
              Aman
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <div
            key={step.title}
            className="rounded-lg border border-[#34343c] bg-[#1a1a22]/90 px-3 py-3"
          >
            <p className="garage-mono text-[10px] text-[#8f8f99]">Langkah {index + 1}</p>
            <p className="mt-1 text-sm font-semibold text-white">{step.title}</p>
            <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">{step.detail}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-white">Daftar pengingat</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="garage-press h-9 border-[#4a4a54] text-xs"
          disabled={refreshing}
          onClick={() => {
            setRefreshing(true);
            void loadAlerts({ silent: true }).finally(() => setRefreshing(false));
          }}
        >
          <RefreshCw className={`mr-1.5 size-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Perbarui
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-[#d11a2a]/40 bg-[#d11a2a]/10 px-4 py-3 text-sm text-[#ffc2c8]">
          {error}
        </div>
      ) : null}

      {loading && alerts.length === 0 ? (
        <div className="rounded-lg border border-[#34343c] bg-[#15151b]/80 px-4 py-8 text-center text-sm text-[#b8b8bf]">
          Memuat pengingat…
        </div>
      ) : null}

      {!loading && alerts.length === 0 ? (
        <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/8 px-4 py-8 text-center">
          <p className="text-base font-semibold text-emerald-100">Semua aman</p>
          <p className="mt-2 text-sm leading-6 text-[#b8b8bf]">
            Tidak ada kesalahan yang perlu diperbaiki saat ini. Tetap cek lonceng di
            header saat shift ramai.
          </p>
        </div>
      ) : null}

      <div className="space-y-3">
        {alerts.map((alert) => {
          const kind = supervisionKindMeta(alert.supervisionKind);
          const context = alertContextLine(alert);

          return (
            <article
              key={alert.id}
              className="rounded-lg border border-[#3f3f48] bg-[#1c1c24] p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={`text-[11px] ${kind.className}`}>{kind.label}</Badge>
                <Badge className="garage-mono border-[#4a4a54] bg-white/[0.05] text-[10px] text-[#c8c8cc]">
                  {priorityLabel(alert.priority)}
                </Badge>
              </div>

              <h3 className="mt-3 text-base font-semibold leading-snug text-white">
                {alertShortTitle(alert)}
              </h3>

              {context ? (
                <p className="mt-2 text-sm leading-6 text-[#b8b8bf]">{context}</p>
              ) : null}

              <div className="mt-3 rounded-md border border-[#f5a742]/25 bg-[#f5a742]/8 px-3 py-2.5">
                <p className="flex items-center gap-2 text-xs font-semibold text-[#ffd08a]">
                  <Wrench className="size-3.5 shrink-0" />
                  Yang harus dilakukan
                </p>
                <p className="mt-1.5 text-sm leading-6 text-[#f4f4f5]">
                  {alertInstruction(alert)}
                </p>
              </div>

              <Button
                type="button"
                className="garage-press mt-4 h-11 w-full text-sm font-semibold"
                disabled={ackPending === alert.id}
                onClick={() => void acknowledgeAlert(alert.id)}
              >
                <Check className="mr-2 size-4" />
                {ackPending === alert.id ? "Menyimpan…" : "Sudah diperbaiki"}
              </Button>
            </article>
          );
        })}
      </div>

      <div className="rounded-lg border border-[#34343c] bg-[#15151b]/70 px-4 py-3">
        <p className="flex items-center gap-2 text-xs font-semibold text-[#d6d6dc]">
          <ClipboardList className="size-4 text-[#b8b8bf]" />
          Tips
        </p>
        <p className="mt-2 text-xs leading-5 text-[#b8b8bf]">
          Gunakan lonceng di pojok kanan atas saat Anda di POS atau modul lain. Pengingat
          yang sama akan muncul di sana.
        </p>
      </div>
    </section>
  );
}
