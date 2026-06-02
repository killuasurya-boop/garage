"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  RefreshCw,
  LogIn,
  LogOut,
  MapPin,
  ExternalLink,
  UserCheck,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type AttendanceLog = {
  id: string;
  action: "in" | "out";
  timestamp: string;
  name: string;
  role: string;
  status?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  distanceMeters?: number | null;
  photoUrl?: string | null;
};

function statusBadge(status?: string | null) {
  if (status === "late") {
    return (
      <Badge variant="outline" className="gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">
        Telat
      </Badge>
    );
  }
  if (status === "early_leave") {
    return (
      <Badge variant="outline" className="gap-1 bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30">
        Pulang Cepat
      </Badge>
    );
  }
  if (status === "on_time") {
    return (
      <Badge variant="outline" className="gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
        Tepat
      </Badge>
    );
  }
  return null;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function HrAttendanceLog() {
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hr/attendance/logs");
      if (!res.ok) throw new Error("Gagal memuat log absensi");
      const data = await res.json();
      setLogs(data.logs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat log absensi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLogs();
  }, [fetchLogs]);

  // Server sudah memfilter ke "hari ini" zona WIB; tampilkan apa adanya.
  const todayLogs = logs;

  // Ringkasan: unique staff, sedang IN, telat — derived dari logs.
  const summary = useMemo(() => {
    const lastByName = new Map<string, AttendanceLog>();
    let lateCount = 0;
    for (const log of logs) {
      if (log.action === "in" && log.status === "late") lateCount += 1;
      const prev = lastByName.get(log.name);
      if (!prev || new Date(log.timestamp) > new Date(prev.timestamp)) {
        lastByName.set(log.name, log);
      }
    }
    let currentlyIn = 0;
    for (const last of lastByName.values()) {
      if (last.action === "in") currentlyIn += 1;
    }
    return {
      totalPunch: logs.length,
      present: lastByName.size,
      currentlyIn,
      late: lateCount,
    };
  }, [logs]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Clock className="size-5 text-primary" />
            Log Kehadiran Staf
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Catatan Clock In / Clock Out dari terminal absensi (PIN + GPS).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/attendance"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/20"
          >
            <Clock className="size-4" />
            Buka Terminal Kiosk
            <ExternalLink className="size-3 opacity-70" />
          </Link>
          <Button
            onClick={fetchLogs}
            disabled={loading}
            variant="outline"
            className="gap-2 shadow-sm bg-card"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Segarkan
          </Button>
        </div>
      </div>

      {/* Ringkasan hari ini */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryStat
          icon={<UserCheck className="size-4" />}
          label="Staf Hadir"
          value={summary.present}
          hint="punya minimal 1 punch"
        />
        <SummaryStat
          icon={<LogIn className="size-4" />}
          label="Sedang IN"
          value={summary.currentlyIn}
          tone="good"
        />
        <SummaryStat
          icon={<AlertTriangle className="size-4" />}
          label="Telat"
          value={summary.late}
          tone={summary.late > 0 ? "warn" : "muted"}
        />
        <SummaryStat
          icon={<Clock className="size-4" />}
          label="Total Punch"
          value={summary.totalPunch}
          hint="in + out"
        />
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card className="border shadow-sm overflow-hidden">
        <CardHeader className="bg-muted/20 border-b">
          <CardTitle className="text-base text-foreground">
            Aktivitas Hari Ini ({formatDate(new Date().toISOString())})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden md:block">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="font-bold">Waktu</TableHead>
                  <TableHead className="font-bold">Nama Staf</TableHead>
                  <TableHead className="font-bold">Peran</TableHead>
                  <TableHead className="font-bold">Aksi</TableHead>
                  <TableHead className="font-bold">Status</TableHead>
                  <TableHead className="font-bold">Lokasi</TableHead>
                  <TableHead className="font-bold">Foto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      <RefreshCw className="size-5 animate-spin mx-auto mb-2 opacity-50" />
                      Memuat data...
                    </TableCell>
                  </TableRow>
                ) : todayLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      Belum ada absensi tercatat hari ini.
                    </TableCell>
                  </TableRow>
                ) : (
                  todayLogs.map((log) => (
                    <TableRow key={log.id} className="border-border">
                      <TableCell className="font-mono text-sm">{formatTime(log.timestamp)}</TableCell>
                      <TableCell className="font-semibold text-foreground">{log.name}</TableCell>
                      <TableCell className="text-muted-foreground">{log.role}</TableCell>
                      <TableCell>
                        {log.action === "in" ? (
                          <Badge
                            variant="outline"
                            className="gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 border-emerald-500/30"
                          >
                            <LogIn className="size-3" /> Clock In
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="gap-1 bg-blue-500/10 text-blue-600 dark:text-blue-500 border-blue-500/30"
                          >
                            <LogOut className="size-3" /> Clock Out
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{statusBadge(log.status) ?? <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        {log.latitude != null && log.longitude != null ? (
                          <a
                            href={`https://www.google.com/maps?q=${log.latitude},${log.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            title={log.distanceMeters != null ? `±${Math.round(log.distanceMeters)}m dari titik presensi` : "Lihat di peta"}
                          >
                            <MapPin className="size-3" />
                            {log.distanceMeters != null ? `${Math.round(log.distanceMeters)}m` : "Peta"}
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {log.photoUrl ? (
                          <a href={log.photoUrl} target="_blank" rel="noopener noreferrer" title="Lihat selfie">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={log.photoUrl}
                              alt={`Selfie ${log.name}`}
                              className="size-9 rounded-md object-cover ring-1 ring-border transition hover:ring-2 hover:ring-primary"
                            />
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="block md:hidden divide-y divide-border">
            {loading ? (
              <div className="py-12 text-center text-muted-foreground">
                <RefreshCw className="size-5 animate-spin mx-auto mb-2 opacity-50" />
                Memuat data...
              </div>
            ) : todayLogs.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                Belum ada absensi tercatat hari ini.
              </div>
            ) : (
              todayLogs.map((log) => (
                <div key={log.id} className="p-4 bg-card flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {log.photoUrl ? (
                      <a href={log.photoUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={log.photoUrl}
                          alt={`Selfie ${log.name}`}
                          className="size-10 rounded-full object-cover ring-1 ring-border"
                        />
                      </a>
                    ) : null}
                    <div className="min-w-0">
                      <div className="font-bold text-foreground text-sm truncate">{log.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{log.role}</div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-mono text-sm text-foreground">{formatTime(log.timestamp)}</div>
                    <div className="mt-1 flex flex-wrap items-center justify-end gap-1">
                      {log.action === "in" ? (
                        <Badge
                          variant="outline"
                          className="gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 border-emerald-500/30"
                        >
                          <LogIn className="size-3" /> In
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="gap-1 bg-blue-500/10 text-blue-600 dark:text-blue-500 border-blue-500/30"
                        >
                          <LogOut className="size-3" /> Out
                        </Badge>
                      )}
                      {statusBadge(log.status)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryStat({
  icon,
  label,
  value,
  hint,
  tone = "muted",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint?: string;
  tone?: "good" | "warn" | "muted";
}) {
  const toneCls = {
    good: "border-emerald-500/30 bg-emerald-500/10",
    warn: "border-amber-500/30 bg-amber-500/10",
    muted: "border-border bg-card",
  }[tone];
  const valueCls = {
    good: "text-emerald-600 dark:text-emerald-400",
    warn: "text-amber-600 dark:text-amber-400",
    muted: "text-foreground",
  }[tone];
  return (
    <div className={`rounded-lg border p-3 shadow-sm ${toneCls}`}>
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide">
        {icon}
        <span className="font-semibold">{label}</span>
      </div>
      <p className={`mt-1 text-2xl font-bold ${valueCls}`}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}
