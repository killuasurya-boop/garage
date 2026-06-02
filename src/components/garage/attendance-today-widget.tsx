"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Clock,
  ExternalLink,
  LogIn,
  LogOut,
  RefreshCw,
  UserCheck,
} from "lucide-react";

type AttendanceLog = {
  id: string;
  action: "in" | "out";
  timestamp: string;
  name: string;
  role: string;
  status?: string | null;
};

const timeFmt = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
});

export function AttendanceTodayWidget({
  onOpenAdminLog,
}: {
  onOpenAdminLog?: () => void;
} = {}) {
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [busy, setBusy] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/hr/attendance/logs", { cache: "no-store" });
      if (res.status === 401 || res.status === 403) {
        setForbidden(true);
        return;
      }
      const json = (await res.json()) as { logs?: AttendanceLog[] };
      setLogs(json.logs ?? []);
      setForbidden(false);
    } catch {
      // diamkan; UI tetap pakai data sebelumnya
    }
  }, []);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      await load();
    } finally {
      setBusy(false);
    }
  }, [load]);

  useEffect(() => {
    const id0 = window.setTimeout(() => void load(), 0);
    const id = window.setInterval(() => void load(), 60_000);
    return () => {
      window.clearTimeout(id0);
      window.clearInterval(id);
    };
  }, [load]);

  const stats = useMemo(() => {
    // Hari ini staff dianggap "hadir" jika punya minimal 1 punch (in atau out).
    const seenIds = new Map<string, AttendanceLog>(); // nama → last punch
    let lateCount = 0;
    let currentlyIn = 0;
    for (const log of logs) {
      const prev = seenIds.get(log.name);
      if (!prev || new Date(log.timestamp) > new Date(prev.timestamp)) {
        seenIds.set(log.name, log);
      }
      if (log.action === "in" && log.status === "late") lateCount += 1;
    }
    for (const last of seenIds.values()) {
      if (last.action === "in") currentlyIn += 1;
    }
    return {
      present: seenIds.size,
      currentlyIn,
      late: lateCount,
    };
  }, [logs]);

  if (forbidden) return null;

  return (
    <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
      <div className="flex items-center justify-between">
        <p className="garage-mono text-[10px] uppercase tracking-wide text-[#8f8f99]">
          <UserCheck className="mr-1 inline-block size-3" />
          Kehadiran Hari Ini
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={busy}
            className="rounded-md border border-[#34343c] bg-[#17171c] p-1 text-[#8f8f99] hover:text-white"
            title="Refresh"
          >
            <RefreshCw className={`size-3 ${busy ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <Stat label="Hadir" value={stats.present} tone="muted" />
        <Stat label="Sedang IN" value={stats.currentlyIn} tone="good" />
        <Stat
          label="Telat"
          value={stats.late}
          tone={stats.late > 0 ? "amber" : "muted"}
        />
      </div>

      {/* Punch terbaru */}
      <div className="garage-scroll mt-3 max-h-32 space-y-1 overflow-y-auto">
        {logs.length === 0 && !busy && (
          <p className="py-3 text-center text-[11px] text-[#8f8f99]">
            Belum ada absensi hari ini
          </p>
        )}
        {logs.slice(0, 5).map((log) => (
          <div
            key={log.id}
            className="flex items-center justify-between gap-2 rounded-md border border-[#23232a] bg-[#17171c] px-2 py-1.5"
          >
            <div className="flex min-w-0 items-center gap-2">
              {log.action === "in" ? (
                <LogIn className="size-3 shrink-0 text-emerald-400" />
              ) : (
                <LogOut className="size-3 shrink-0 text-orange-400" />
              )}
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold text-white">
                  {log.name}
                </p>
                <p className="truncate font-mono text-[10px] text-[#8f8f99]">
                  {log.role}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-mono text-[11px] text-[#d6d6dc]">
                {timeFmt.format(new Date(log.timestamp))}
              </p>
              {log.status === "late" && (
                <p className="font-mono text-[9px] text-amber-400">telat</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <Link
          href="/attendance"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-1 rounded-md border border-[#f5a742]/40 bg-[#f5a742]/10 px-2 py-1.5 text-[11px] font-semibold text-[#ffd79a] hover:bg-[#f5a742]/20"
        >
          <Clock className="size-3" />
          Terminal Kiosk
          <ExternalLink className="size-2.5 opacity-60" />
        </Link>
        {onOpenAdminLog ? (
          <button
            type="button"
            onClick={onOpenAdminLog}
            className="flex items-center justify-center gap-1 rounded-md border border-[#34343c] bg-[#17171c] px-2 py-1.5 text-[11px] font-semibold text-[#d6d6dc] hover:border-[#f5a742]/40 hover:text-white"
          >
            Log Lengkap
          </button>
        ) : (
          <span className="flex items-center justify-center gap-1 rounded-md border border-[#34343c] bg-[#17171c] px-2 py-1.5 text-[11px] text-[#8f8f99]">
            {logs.length} punch
          </span>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "good" | "amber" | "muted";
}) {
  const toneCls = {
    good: "border-[#22c55e]/40 bg-[#22c55e]/10 text-[#86efac]",
    amber: "border-[#f5a742]/40 bg-[#f5a742]/10 text-[#ffd79a]",
    muted: "border-[#34343c] bg-[#17171c] text-white",
  }[tone];
  return (
    <div className={`rounded-md border p-2 text-center ${toneCls}`}>
      <p className="garage-display text-base font-bold leading-none">{value}</p>
      <p className="mt-0.5 text-[9px] uppercase tracking-wide opacity-80">
        {label}
      </p>
    </div>
  );
}
