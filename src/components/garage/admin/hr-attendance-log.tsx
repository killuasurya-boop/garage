"use client";

import { useCallback, useEffect, useState } from "react";
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
import { Clock, RefreshCw, LogIn, LogOut, MapPin } from "lucide-react";
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      <RefreshCw className="size-5 animate-spin mx-auto mb-2 opacity-50" />
                      Memuat data...
                    </TableCell>
                  </TableRow>
                ) : todayLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
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
                  <div className="min-w-0">
                    <div className="font-bold text-foreground text-sm truncate">{log.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{log.role}</div>
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
