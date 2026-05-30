"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Eye,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDateFilterContext } from "@/components/garage/date-filter";

type AuditRow = {
  id: string;
  time: string;
  actor: string;
  action: string;
  object: string;
  device: string;
  status: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

type AuditListResponse = {
  rows: AuditRow[];
  total: number;
  hasMore: boolean;
};

type AuditStatsResponse = {
  eventsToday: number;
  criticalToday: number;
  warningsToday: number;
  totalEvents: number;
  topActors: Array<{ actor: string; count: number }>;
  topModules: Array<{ module: string; count: number }>;
};

const STATUS_TONE: Record<string, string> = {
  recorded: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-white",
  ok: "border-[#22c55e]/45 bg-[#22c55e]/12 text-[#86efac]",
  warning: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  flagged: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  critical: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  blocked: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
};

const STATUS_OPTIONS = [
  { value: "all", label: "Semua Status" },
  { value: "recorded", label: "Recorded" },
  { value: "warning", label: "Warning" },
  { value: "flagged", label: "Flagged" },
  { value: "critical", label: "Critical" },
  { value: "blocked", label: "Blocked" },
];

const dateTime = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "medium",
});

const PAGE_SIZE = 30;

export function AuditLogViewer() {
  const { predicate: dateFilterPredicate } = useDateFilterContext();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [stats, setStats] = useState<AuditStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [selectedRow, setSelectedRow] = useState<AuditRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (status && status !== "all") params.set("status", status);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (actorFilter) params.set("actor", actorFilter);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));

      const [listRes, statsRes] = await Promise.all([
        fetch(`/api/audit?${params.toString()}`),
        fetch("/api/audit/stats"),
      ]);
      const listJson = (await listRes.json().catch(() => ({}))) as {
        data?: AuditListResponse;
        error?: { message?: string };
      };
      const statsJson = (await statsRes.json().catch(() => ({}))) as {
        data?: AuditStatsResponse;
      };
      if (!listRes.ok || !listJson.data) {
        throw new Error(listJson.error?.message || "Gagal memuat audit log");
      }
      setRows(listJson.data.rows);
      setTotal(listJson.data.total);
      setHasMore(listJson.data.hasMore);
      if (statsRes.ok && statsJson.data) setStats(statsJson.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat audit log");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search, status, dateFrom, dateTo, actorFilter, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on filter change
    void load();
  }, [load]);

  function applySearch() {
    setPage(0);
    setSearch(searchInput.trim());
  }

  function resetFilters() {
    setSearchInput("");
    setSearch("");
    setStatus("all");
    setDateFrom("");
    setDateTo("");
    setActorFilter("");
    setPage(0);
  }

  const visibleRows = rows.filter((row) => dateFilterPredicate(row.createdAt));
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showingFrom = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const showingTo = Math.min(total, (page + 1) * PAGE_SIZE);

  // Auto-poll setiap 15 detik supaya audit baru muncul tanpa refresh manual
  useEffect(() => {
    const id = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <section className="space-y-4">
      {/* Header + stats */}
      <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="garage-mono text-[11px] uppercase tracking-[0.14em] text-[#f5a742]">
              Audit Log
            </p>
            <h1 className="mt-1 text-xl font-black text-white sm:text-2xl">
              Immutable Activity Trail
            </h1>
            <p className="mt-1 text-xs text-[#b8b8bf]">
              Semua aktivitas kritis: POS, KDS, approval, finance, inventory.
              Klik baris untuk detail metadata.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="garage-press h-10 border-[#4a4a54] text-white"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <StatCard
            label="Events Today"
            value={String(stats?.eventsToday ?? 0)}
            icon={<Activity className="size-3.5" />}
          />
          <StatCard
            label="Critical Today"
            value={String(stats?.criticalToday ?? 0)}
            icon={<ShieldAlert className="size-3.5" />}
            tone={stats?.criticalToday ? "danger" : "muted"}
          />
          <StatCard
            label="Warnings Today"
            value={String(stats?.warningsToday ?? 0)}
            icon={<AlertTriangle className="size-3.5" />}
            tone={stats?.warningsToday ? "amber" : "muted"}
          />
          <StatCard
            label="Total Events"
            value={
              stats?.totalEvents
                ? stats.totalEvents.toLocaleString("id-ID")
                : "0"
            }
            sub="sejak rilis"
            icon={<ShieldCheck className="size-3.5" />}
          />
        </div>

        {stats?.topActors && stats.topActors.length > 0 && (
          <div className="mt-3 grid gap-3 border-t border-[#34343c] pt-3 sm:grid-cols-2">
            <div>
              <p className="garage-mono mb-1 text-[10px] uppercase tracking-wide text-[#8f8f99]">
                <TrendingUp className="mr-1 inline-block size-3" />
                Top Actor Hari Ini
              </p>
              <div className="flex flex-wrap gap-1">
                {stats.topActors.map((a) => (
                  <button
                    key={a.actor}
                    type="button"
                    onClick={() => {
                      setActorFilter(a.actor.split(" / ")[0]);
                      setPage(0);
                    }}
                    className="rounded-md border border-[#34343c] bg-white/[0.03] px-2 py-0.5 text-[10px] text-[#d6d6dc] hover:border-[#f5a742]/45 hover:text-[#ffd79a]"
                  >
                    {a.actor.split(" / ")[0]} <span className="font-mono text-[#ffd79a]">{a.count}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="garage-mono mb-1 text-[10px] uppercase tracking-wide text-[#8f8f99]">
                Top Module Hari Ini
              </p>
              <div className="flex flex-wrap gap-1">
                {stats.topModules.map((m) => (
                  <span
                    key={m.module}
                    className="rounded-md border border-[#34343c] bg-white/[0.03] px-2 py-0.5 text-[10px] text-[#d6d6dc]"
                  >
                    {m.module} <span className="font-mono text-[#ffd79a]">{m.count}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="grid gap-2 rounded-lg border border-[#34343c] bg-[#111116] p-3 sm:grid-cols-[1fr_160px_140px_140px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8f8f99]" />
          <Input
            type="search"
            placeholder="Cari actor, action, object, device..."
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") applySearch();
            }}
            className="h-10 border-[#34343c] bg-white/[0.06] pl-9"
          />
        </div>
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(0);
          }}
          className="h-10 rounded-md border border-[#34343c] bg-white/[0.06] px-3 text-sm text-white"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-[#15151b]">
              {opt.label}
            </option>
          ))}
        </select>
        <div className="relative">
          <Calendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8f8f99]" />
          <Input
            type="date"
            value={dateFrom}
            onChange={(event) => {
              setDateFrom(event.target.value);
              setPage(0);
            }}
            className="h-10 border-[#34343c] bg-white/[0.06] pl-9"
          />
        </div>
        <div className="relative">
          <Calendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8f8f99]" />
          <Input
            type="date"
            value={dateTo}
            onChange={(event) => {
              setDateTo(event.target.value);
              setPage(0);
            }}
            className="h-10 border-[#34343c] bg-white/[0.06] pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button type="button" className="garage-press h-10 px-4" onClick={applySearch}>
            Cari
          </Button>
          <Button
            type="button"
            variant="outline"
            className="garage-press h-10 border-[#4a4a54]"
            onClick={resetFilters}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Actor filter chip */}
      {actorFilter && (
        <div className="flex items-center gap-2 rounded-md border border-[#f5a742]/45 bg-[#f5a742]/8 px-3 py-2">
          <p className="text-xs text-[#ffd79a]">
            Filter actor: <span className="font-mono font-bold">{actorFilter}</span>
          </p>
          <button
            type="button"
            onClick={() => setActorFilter("")}
            className="ml-auto text-xs text-[#f5a742] underline hover:text-[#ffba5a]"
          >
            Clear
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 p-3 text-sm text-[#ffc2c8]">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-[#34343c] bg-[#111116]">
        <div className="garage-scroll overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead className="bg-[#17171c]">
              <tr className="border-b border-[#34343c] font-mono text-[10px] uppercase tracking-wider text-[#8f8f99]">
                <th className="px-3 py-2.5 text-left font-normal">Waktu</th>
                <th className="px-3 py-2.5 text-left font-normal">Actor</th>
                <th className="px-3 py-2.5 text-left font-normal">Action</th>
                <th className="px-3 py-2.5 text-left font-normal">Object</th>
                <th className="px-3 py-2.5 text-left font-normal">Device</th>
                <th className="px-3 py-2.5 text-center font-normal">Status</th>
                <th className="px-3 py-2.5 text-center font-normal">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center text-sm text-[#8f8f99]">
                    <RefreshCw className="mx-auto mb-2 size-5 animate-spin text-[#f5a742]" />
                    Memuat audit log…
                  </td>
                </tr>
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center text-sm text-[#8f8f99]">
                    <ShieldCheck className="mx-auto mb-2 size-6 text-[#4a4a54]" />
                    Tidak ada audit log di filter ini.
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-b border-[#23232a] transition-colors hover:bg-white/[0.04]"
                    onClick={() => setSelectedRow(row)}
                  >
                    <td className="px-3 py-2.5">
                      <p className="font-mono text-[11px] text-[#d6d6dc]">
                        {dateTime.format(new Date(row.createdAt))}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-xs font-semibold text-white">{row.actor}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-xs text-[#d6d6dc]">{row.action}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-mono text-[11px] text-[#b8b8bf]">{row.object}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-mono text-[10px] text-[#8f8f99]">{row.device}</p>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <Badge
                        className={`text-[10px] ${STATUS_TONE[row.status] ?? "border-[#34343c] bg-white/[0.04] text-[#d6d6dc]"}`}
                      >
                        {row.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="garage-press h-8 border-[#4a4a54] px-2 text-xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedRow(row);
                        }}
                      >
                        <Eye className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className="flex items-center justify-between border-t border-[#34343c] px-3 py-2">
            <p className="text-xs text-[#8f8f99]">
              {showingFrom}–{showingTo} dari {total} event
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="garage-press h-8 border-[#4a4a54] px-2"
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="font-mono text-xs text-[#d6d6dc]">
                Hal {page + 1} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="garage-press h-8 border-[#4a4a54] px-2"
                disabled={!hasMore || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <AuditDetailModal
        key={selectedRow?.id ?? "none"}
        row={selectedRow}
        onClose={() => setSelectedRow(null)}
        onActorFilter={(actor) => {
          setActorFilter(actor.split(" / ")[0]);
          setPage(0);
          setSelectedRow(null);
        }}
      />
    </section>
  );
}

function AuditDetailModal({
  row,
  onClose,
  onActorFilter,
}: {
  row: AuditRow | null;
  onClose: () => void;
  onActorFilter: (actor: string) => void;
}) {
  const metadataString = useMemo(() => {
    if (!row?.metadata) return null;
    try {
      return JSON.stringify(row.metadata, null, 2);
    } catch {
      return String(row.metadata);
    }
  }, [row]);

  if (!row) return null;

  return (
    <Dialog open={Boolean(row)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-hidden border-[#34343c] bg-[#111116] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="size-5 text-[#f5a742]" />
            Audit Event Detail
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {dateTime.format(new Date(row.createdAt))} ·{" "}
            <Badge className={`text-[10px] ${STATUS_TONE[row.status] ?? ""}`}>
              {row.status}
            </Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="garage-scroll min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          <div className="grid gap-2 sm:grid-cols-2">
            <DetailField label="Actor" value={row.actor} mono />
            <DetailField label="Device" value={row.device} mono />
            <DetailField label="Action" value={row.action} />
            <DetailField label="Object" value={row.object} mono />
            <DetailField label="Waktu (display)" value={row.time} mono />
            <DetailField
              label="Timestamp DB"
              value={dateTime.format(new Date(row.createdAt))}
              mono
            />
          </div>

          {metadataString && (
            <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3">
              <p className="garage-mono mb-2 text-[10px] uppercase tracking-wide text-[#f5a742]">
                Metadata
              </p>
              <pre className="garage-scroll max-h-64 overflow-auto rounded-md border border-[#34343c] bg-black/40 p-2 font-mono text-[11px] leading-relaxed text-[#d6d6dc]">
                {metadataString}
              </pre>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="garage-press h-10 flex-1 border-[#4a4a54]"
              onClick={() => onActorFilter(row.actor)}
            >
              Filter event lain dari actor ini
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "muted",
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  tone?: "amber" | "danger" | "muted";
}) {
  const toneCls =
    tone === "amber"
      ? "border-[#f5a742]/45 bg-[#f5a742]/10"
      : tone === "danger"
        ? "border-[#d11a2a]/45 bg-[#d11a2a]/10"
        : "border-[#34343c] bg-[#17171c]";
  const valueCls =
    tone === "amber"
      ? "text-[#ffd79a]"
      : tone === "danger"
        ? "text-[#ffc2c8]"
        : "text-white";
  return (
    <div className={`rounded-md border p-3 ${toneCls}`}>
      <div className="flex items-center gap-1.5">
        {icon}
        <p className="font-mono text-[10px] uppercase tracking-wide text-[#b8b8bf]">
          {label}
        </p>
      </div>
      <p className={`mt-1 garage-display text-2xl font-bold ${valueCls}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-[#8f8f99]">{sub}</p>}
    </div>
  );
}

function DetailField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3">
      <p className="font-mono text-[10px] uppercase tracking-wide text-[#8f8f99]">
        {label}
      </p>
      <p
        className={`mt-1 break-words text-sm font-semibold text-white ${mono ? "font-mono text-xs" : ""}`}
      >
        {value || "—"}
      </p>
    </div>
  );
}
