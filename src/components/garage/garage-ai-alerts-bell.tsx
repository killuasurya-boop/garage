"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Check, MessageCircle, RefreshCw } from "lucide-react";

import {
  alertInstruction,
  alertShortTitle,
  priorityLabel,
  supervisionKindMeta,
} from "@/components/garage/garage-ai-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { garageApi } from "@/lib/api-client";
import type {
  AiAlertsResponse,
  AiAutopilotStatusResponse,
  AiOperationalAlert,
} from "@/lib/garage-api-types";
import type { ModuleId, Role } from "@/lib/garage-data";
import { canAccessModule } from "@/lib/role-access";
import { voice } from "@/lib/garage-voice";

const POLL_MS = 45_000;
const AUTOPILOT_TRIGGER_ROLES: Role[] = [
  "Owner / CEO",
  "Admin",
  "Manager Operasional",
  "Supervisor Shift",
];
const AUTOPILOT_STALE_MS = 15 * 60 * 1000;
const AUTOPILOT_TRIGGER_GUARD_KEY = "garage:ai:autopilot-trigger-at";

function canTriggerAutopilot(role: Role) {
  return AUTOPILOT_TRIGGER_ROLES.includes(role);
}

function shouldTriggerAutopilot(lastAutopilotAt: string | null) {
  if (typeof window === "undefined") {
    return false;
  }

  const guardRaw = window.sessionStorage.getItem(AUTOPILOT_TRIGGER_GUARD_KEY);
  if (guardRaw) {
    const guardAt = Number(guardRaw);
    if (Number.isFinite(guardAt) && Date.now() - guardAt < AUTOPILOT_STALE_MS) {
      return false;
    }
  }

  if (!lastAutopilotAt) {
    return true;
  }

  const lastAt = Date.parse(lastAutopilotAt);
  return !Number.isFinite(lastAt) || Date.now() - lastAt > AUTOPILOT_STALE_MS;
}

type GarageAiAlertsBellProps = {
  role: Role;
  onOpenAiModule?: () => void;
};

export function GarageAiAlertsBell({ role, onOpenAiModule }: GarageAiAlertsBellProps) {
  const [alerts, setAlerts] = useState<AiOperationalAlert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [ackPending, setAckPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autopilotStatus, setAutopilotStatus] =
    useState<AiAutopilotStatusResponse | null>(null);
  const knownAlertIdsRef = useRef<Set<string>>(new Set());
  const canOpenAi = canAccessModule(role, "ai-agent" satisfies ModuleId);

  const loadAutopilotStatus = useCallback(async () => {
    try {
      const status = await garageApi.get<AiAutopilotStatusResponse>(
        "/api/ai/autopilot-status",
        { cache: "no-store" },
      );
      setAutopilotStatus(status);
      return status;
    } catch {
      return null;
    }
  }, []);

  const loadAlerts = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }

    setError(null);

    try {
      const payload = await garageApi.get<AiAlertsResponse>("/api/ai/alerts", {
        cache: "no-store",
      });
      const nextUnread = payload.unreadCount ?? 0;
      const nextAlerts = (payload.alerts ?? []).filter((alert) => !alert.acknowledged);

      const previousIds = knownAlertIdsRef.current;
      const hasNewHigh = nextAlerts.some(
        (alert) =>
          alert.priority === "high" && !previousIds.has(alert.id),
      );

      knownAlertIdsRef.current = new Set(nextAlerts.map((alert) => alert.id));
      setAlerts(nextAlerts);
      setUnreadCount(nextUnread);

      if (hasNewHigh && typeof window !== "undefined") {
        // File MP3 statis di public/voice/scenarios/ai-alert-high.mp3 — voice
        // konsisten dengan announcement Smart Notification lainnya.
        void voice.announce("ai_alert_high", { force: true });
      }

      return payload;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gagal memuat pengingat.");
      return null;
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, []);

  const triggerAutopilot = useCallback(async () => {
    if (!canTriggerAutopilot(role)) {
      return;
    }

    const status = autopilotStatus ?? (await loadAutopilotStatus());
    if (status && !status.active) {
      setError(status.message);
      return;
    }

    try {
      window.sessionStorage.setItem(
        AUTOPILOT_TRIGGER_GUARD_KEY,
        String(Date.now()),
      );
      await garageApi.post("/api/ai/shift-copilot/run", {});
      await Promise.all([loadAlerts({ silent: true }), loadAutopilotStatus()]);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Scan gagal. Coba lagi.",
      );
    }
  }, [autopilotStatus, loadAlerts, loadAutopilotStatus, role]);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const [status, payload] = await Promise.all([
        loadAutopilotStatus(),
        loadAlerts(),
      ]);
      if (cancelled || !payload) {
        return;
      }

      if (
        status?.active &&
        canTriggerAutopilot(role) &&
        shouldTriggerAutopilot(payload.lastAutopilotAt)
      ) {
        try {
          window.sessionStorage.setItem(
            AUTOPILOT_TRIGGER_GUARD_KEY,
            String(Date.now()),
          );
          await garageApi.post("/api/ai/shift-copilot/run", {});
          if (!cancelled) {
            await Promise.all([loadAlerts({ silent: true }), loadAutopilotStatus()]);
          }
        } catch {
          // Best-effort bootstrap scan.
        }
      }
    };

    void bootstrap();
    const timer = window.setInterval(() => {
      void loadAlerts({ silent: true });
      void loadAutopilotStatus();
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  async function acknowledgeAlert(alertId: string) {
    setAckPending(alertId);
    setError(null);

    try {
      await garageApi.post(`/api/ai/alerts/${alertId}/ack`, {});
      await loadAlerts({ silent: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gagal menyimpan.");
    } finally {
      setAckPending(null);
    }
  }

  function openWhatsapp(url: string) {
    window.open(url, "garage-ai-whatsapp", "noopener,noreferrer");
  }

  const urgentCount = alerts.filter((alert) => alert.priority === "high").length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="garage-press relative h-11 w-11 shrink-0 border-[#4a4a54] bg-white/[0.08]"
          aria-label="Pengingat kerja"
        >
          <Bell className="size-4" />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#d11a2a] px-1 text-[10px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="garage-scroll w-[min(92vw,380px)] border-[#34343c] bg-[#15151b] p-0"
      >
        <div className="border-b border-[#34343c] px-4 py-3">
          <DropdownMenuLabel className="p-0 text-base font-semibold text-white">
            Pengingat Kerja
          </DropdownMenuLabel>
          <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
            {unreadCount > 0
              ? `${unreadCount} perlu ditangani${urgentCount > 0 ? ` · ${urgentCount} segera` : ""}`
              : "Tidak ada pekerjaan tertunda"}
          </p>
        </div>

        <div className="garage-scroll max-h-[min(65vh,440px)] space-y-2.5 p-2.5">
          {loading && alerts.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-[#b8b8bf]">Memuat…</p>
          ) : null}

          {!loading && alerts.length === 0 ? (
            <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/8 px-3 py-6 text-center">
              <p className="text-sm font-semibold text-emerald-100">Semua aman</p>
              <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                Tidak ada kesalahan yang perlu diperbaiki sekarang.
              </p>
            </div>
          ) : null}

          {alerts.map((alert) => {
            const kind = supervisionKindMeta(alert.supervisionKind);

            return (
              <div
                key={alert.id}
                className="rounded-lg border border-[#3f3f48] bg-[#1c1c24] p-3"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge className={`text-[10px] ${kind.className}`}>{kind.label}</Badge>
                  <Badge className="garage-mono border-[#4a4a54] bg-white/[0.05] text-[10px] text-[#c8c8cc]">
                    {priorityLabel(alert.priority)}
                  </Badge>
                </div>

                <p className="mt-2 text-sm font-semibold leading-snug text-white">
                  {alertShortTitle(alert)}
                </p>

                <p className="mt-2 text-xs leading-5 text-[#d0d0d6]">
                  {alertInstruction(alert)}
                </p>

                {alert.whatsappTargets.length > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="garage-press mt-2 h-8 w-full border-[#22c55e]/40 bg-[#22c55e]/10 text-xs text-[#bbf7d0]"
                    onClick={() => openWhatsapp(alert.whatsappTargets[0].url)}
                  >
                    <MessageCircle className="mr-1.5 size-3.5" />
                    Kirim ke WA
                  </Button>
                ) : null}

                <Button
                  type="button"
                  size="sm"
                  className="garage-press mt-2 h-9 w-full text-xs font-semibold"
                  disabled={ackPending === alert.id}
                  onClick={() => void acknowledgeAlert(alert.id)}
                >
                  <Check className="mr-1.5 size-3.5" />
                  {ackPending === alert.id ? "Menyimpan…" : "Sudah diperbaiki"}
                </Button>
              </div>
            );
          })}
        </div>

        {error ? (
          <p className="border-t border-[#34343c] px-3 py-2 text-xs text-[#ffc2c8]">{error}</p>
        ) : null}

        <DropdownMenuSeparator className="bg-[#34343c]" />
        <div className="flex flex-col gap-0.5 p-2">
          <DropdownMenuItem
            className="text-sm"
            disabled={refreshing}
            onClick={() => {
              setRefreshing(true);
              void loadAlerts({ silent: true }).finally(() => setRefreshing(false));
            }}
          >
            <RefreshCw className={`mr-2 size-4 ${refreshing ? "animate-spin" : ""}`} />
            Perbarui
          </DropdownMenuItem>
          {canTriggerAutopilot(role) ? (
            <DropdownMenuItem className="text-sm" onClick={() => void triggerAutopilot()}>
              <Bell className="mr-2 size-4" />
              Cek ulang sekarang
            </DropdownMenuItem>
          ) : null}
          {canOpenAi && onOpenAiModule ? (
            <DropdownMenuItem className="text-sm" onClick={onOpenAiModule}>
              Buka halaman pengingat
            </DropdownMenuItem>
          ) : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
