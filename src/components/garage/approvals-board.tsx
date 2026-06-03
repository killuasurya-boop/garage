"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  History,
  MessageCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
  X,
} from "lucide-react";

import type { ModuleId, Role } from "@/lib/garage-data";
import { GarageConnectedNav } from "@/components/garage/garage-connected-nav";
import { GarageEmpty } from "@/components/garage/garage-state-display";
import { useDateFilterContext } from "@/components/garage/date-filter";

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

// ─── TYPES ───────────────────────────────────────────────────

type ApprovalRow = {
  id: string;
  type: string;
  requester: string;
  requesterPhone: string | null;
  amount: string;
  reason: string;
  risk: string;
  age: string;
  status: string;
  decidedAt: string | null;
  decidedByName: string | null;
  reasonDecided: string | null;
  createdAt: string;
};

type ApprovalStats = {
  pending: number;
  pendingHighRisk: number;
  decidedToday: number;
  approvedToday: number;
  rejectedToday: number;
  avgDecideMinutes: number;
  pendingByType: Array<{ type: string; count: number }>;
};

// ─── CONSTANTS ───────────────────────────────────────────────

const SAVED_REJECT_REASONS = [
  "Nominal terlalu besar — perlu bukti tambahan",
  "Bukti transaksi tidak lengkap",
  "Diluar policy outlet",
  "Customer belum konfirmasi",
  "Voucher / diskon tidak sesuai SOP",
];

const SAVED_APPROVE_REASONS = [
  "Sesuai SOP",
  "Sudah diverifikasi by manager",
  "Customer urgent, dampak minor",
  "Refund layak (ada bukti)",
];

const RISK_TONE: Record<string, string> = {
  high: "border-[#d11a2a]/55 bg-[#d11a2a]/14 text-[#ffc2c8]",
  High: "border-[#d11a2a]/55 bg-[#d11a2a]/14 text-[#ffc2c8]",
  medium: "border-[#f5a742]/55 bg-[#f5a742]/14 text-[#ffd79a]",
  Medium: "border-[#f5a742]/55 bg-[#f5a742]/14 text-[#ffd79a]",
  low: "border-[#22c55e]/45 bg-[#22c55e]/12 text-[#86efac]",
  Low: "border-[#22c55e]/45 bg-[#22c55e]/12 text-[#86efac]",
};

const STATUS_TONE: Record<string, string> = {
  pending: "border-[#f5a742]/45 bg-[#f5a742]/12 text-[#ffd79a]",
  approved: "border-[#22c55e]/45 bg-[#22c55e]/12 text-[#86efac]",
  rejected: "border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#ffc2c8]",
};

const dateTime = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
});

type CategoryFilter = "all" | "pos" | "finance" | "inventory";

const APPROVAL_CATEGORIES: Record<
  CategoryFilter,
  { label: string; types: string[] | null }
> = {
  all: { label: "Semua", types: null },
  pos: {
    label: "Kasir & POS",
    types: ["Void transaksi", "Refund", "Diskon manual"],
  },
  finance: { label: "Finance", types: ["Expense", "Refund"] },
  inventory: { label: "Inventory", types: ["Stock adjustment"] },
};

function riskRank(risk: string) {
  const normalized = risk.toLowerCase();
  if (normalized === "high") return 0;
  if (normalized === "medium") return 1;
  return 2;
}

function parseAgeMinutes(age: string, createdAt: string) {
  const fromCreated = Math.floor(
    (Date.now() - new Date(createdAt).getTime()) / 60_000,
  );
  if (fromCreated >= 0) return fromCreated;
  const match = age.trim().match(/^(\d+)\s*([mjh])$/i);
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === "m") return value;
  if (unit === "j") return value * 60;
  return value * 60 * 24;
}

function parseAmountValue(amount: string) {
  const digits = amount.replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

function sortApprovalRows(rows: ApprovalRow[]) {
  return [...rows].sort((a, b) => {
    const riskDiff = riskRank(a.risk) - riskRank(b.risk);
    if (riskDiff !== 0) return riskDiff;
    const ageDiff =
      parseAgeMinutes(b.age, b.createdAt) - parseAgeMinutes(a.age, a.createdAt);
    if (ageDiff !== 0) return ageDiff;
    return parseAmountValue(b.amount) - parseAmountValue(a.amount);
  });
}

function ageSlaClass(age: string, createdAt: string) {
  const mins = parseAgeMinutes(age, createdAt);
  if (mins >= 30) return "font-semibold text-[#ffc2c8]";
  if (mins >= 15) return "font-semibold text-[#ffd79a]";
  return "text-[#b8b8bf]";
}

function isHighRisk(risk: string) {
  return risk.toLowerCase() === "high";
}

// ─── MAIN COMPONENT ──────────────────────────────────────────

export function ApprovalsBoard({
  onOpenModule,
  role,
}: {
  onOpenModule?: (module: ModuleId) => void;
  role?: Role;
} = {}) {
  const { predicate: dateFilterPredicate } = useDateFilterContext();
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [stats, setStats] = useState<ApprovalStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "approved" | "rejected" | "all">(
    "pending",
  );
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [groupByType, setGroupByType] = useState(false);
  const autoRiskHighlightDone = useRef(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<ApprovalRow | null>(null);
  const [bulkDialog, setBulkDialog] = useState<"approve" | "reject" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (tab !== "all") params.set("status", tab);
      const [listRes, statsRes] = await Promise.all([
        fetch(`/api/approvals?${params.toString()}`),
        fetch("/api/approvals/stats"),
      ]);
      const listJson = (await listRes.json().catch(() => ({}))) as {
        data?: ApprovalRow[];
        error?: { message?: string };
      };
      const statsJson = (await statsRes.json().catch(() => ({}))) as {
        data?: ApprovalStats;
      };
      if (!listRes.ok || !listJson.data) {
        throw new Error(listJson.error?.message || "Gagal memuat approvals");
      }
      setRows(listJson.data);
      if (statsRes.ok && statsJson.data) setStats(statsJson.data);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat approvals");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on tab change
    void load();
  }, [load]);

  useEffect(() => {
    if (
      !autoRiskHighlightDone.current &&
      stats &&
      stats.pendingHighRisk > 0 &&
      tab === "pending"
    ) {
      autoRiskHighlightDone.current = true;
      setRiskFilter("high");
    }
  }, [stats, tab]);

  const categoryTypes = APPROVAL_CATEGORIES[categoryFilter].types;

  // Filter rows in-memory (search/risk/type/category)
  const filteredRows = useMemo(() => {
    const lower = search.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (!dateFilterPredicate(r.createdAt)) return false;
      if (categoryTypes && !categoryTypes.includes(r.type)) return false;
      if (riskFilter !== "all" && r.risk.toLowerCase() !== riskFilter) return false;
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (lower) {
        const haystack = `${r.requester} ${r.type} ${r.reason} ${r.amount} ${r.id}`.toLowerCase();
        if (!haystack.includes(lower)) return false;
      }
      return true;
    });
    return sortApprovalRows(filtered);
  }, [rows, search, riskFilter, typeFilter, categoryTypes, dateFilterPredicate]);

  const bulkEligibleRows = useMemo(
    () => filteredRows.filter((r) => !isHighRisk(r.risk)),
    [filteredRows],
  );

  const selectedHighRiskCount = useMemo(() => {
    return filteredRows.filter((r) => selected.has(r.id) && isHighRisk(r.risk)).length;
  }, [filteredRows, selected]);

  // Group by type if enabled
  const groupedRows = useMemo(() => {
    if (!groupByType) return null;
    const map = new Map<string, ApprovalRow[]>();
    for (const r of filteredRows) {
      const list = map.get(r.type) ?? [];
      list.push(r);
      map.set(r.type, list);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filteredRows, groupByType]);

  const uniqueTypes = useMemo(() => {
    const source = categoryTypes
      ? rows.filter((r) => categoryTypes.includes(r.type))
      : rows;
    return Array.from(new Set(source.map((r) => r.type))).sort();
  }, [rows, categoryTypes]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const eligibleIds = bulkEligibleRows.map((r) => r.id);
    const allEligibleSelected =
      eligibleIds.length > 0 && eligibleIds.every((id) => selected.has(id));
    if (allEligibleSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(eligibleIds));
    }
  };

  const handleDecide = async (
    id: string,
    status: "approved" | "rejected",
    reasonDecided?: string,
  ) => {
    const res = await fetch(`/api/approvals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reasonDecided }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      throw new Error(json.error?.message || "Gagal decide approval");
    }
    // Try WA notify if requester has phone
    const row = rows.find((r) => r.id === id);
    if (row?.requesterPhone) {
      openWaNotify(row, status, reasonDecided);
    }
    await load();
  };

  const handleBulkDecide = async (
    status: "approved" | "rejected",
    reasonDecided?: string,
  ) => {
    const ids = Array.from(selected).filter((id) => {
      const row = rows.find((r) => r.id === id);
      return row && !isHighRisk(row.risk);
    });
    if (!ids.length) return;
    const decidedRows = rows.filter((r) => ids.includes(r.id));
    const res = await fetch("/api/approvals/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, status, reasonDecided }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      throw new Error(json.error?.message || "Bulk decide gagal");
    }

    // WA notify: open tab pertama, salin sisanya ke clipboard.
    // Sama pattern dengan CRM bulk WA — hindari popup blocker untuk multi-tab.
    const rowsWithPhone = decidedRows.filter((r) => r.requesterPhone);
    if (rowsWithPhone.length > 0) {
      openWaNotify(rowsWithPhone[0], status, reasonDecided);
      if (rowsWithPhone.length > 1) {
        const remaining = rowsWithPhone
          .slice(1)
          .map((r) => `${r.requester} (${r.requesterPhone})`)
          .join("\n");
        try {
          await navigator.clipboard.writeText(remaining);
          window.alert(
            `WA tab pertama dibuka untuk ${rowsWithPhone[0].requester}.\n\n` +
              `${rowsWithPhone.length - 1} requester berikutnya disalin ke clipboard untuk follow-up manual.`,
          );
        } catch {
          // clipboard gagal → tetap kasih info user
          window.alert(
            `WA pertama dibuka. ${rowsWithPhone.length - 1} requester lain butuh follow-up manual.`,
          );
        }
      }
    }

    await load();
  };

  return (
    <section className="min-w-0 space-y-4">
      {role && onOpenModule ? (
        <GarageConnectedNav
          role={role}
          preset="approvals"
          activeModule="approvals"
          onNavigate={onOpenModule}
        />
      ) : null}
      {/* HEADER + STATS */}
      <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="garage-mono text-[11px] uppercase tracking-[0.14em] text-[#f5a742]">
              Approvals
            </p>
            <h1 className="mt-1 text-xl font-black text-white sm:text-2xl">Risk Gate</h1>
            <p className="mt-1 text-xs text-[#b8b8bf]">
              Refund, void, discount, expense — semua di sini. Klik baris untuk
              detail + decide.
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
            label="Pending"
            value={String(stats?.pending ?? 0)}
            icon={<Clock className="size-3.5" />}
            tone="amber"
          />
          <StatCard
            label="High Risk Pending"
            value={String(stats?.pendingHighRisk ?? 0)}
            icon={<AlertTriangle className="size-3.5" />}
            tone={stats?.pendingHighRisk ? "danger" : "muted"}
          />
          <StatCard
            label="Avg Decide Time"
            value={
              stats?.avgDecideMinutes
                ? `${stats.avgDecideMinutes}m`
                : "—"
            }
            sub="hari ini"
            icon={<TrendingUp className="size-3.5" />}
          />
          <StatCard
            label="Decided Today"
            value={String(stats?.decidedToday ?? 0)}
            sub={
              stats
                ? `${stats.approvedToday} approved · ${stats.rejectedToday} rejected`
                : ""
            }
            icon={<ShieldCheck className="size-3.5" />}
          />
        </div>

        {stats && stats.pendingByType.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-[#34343c] pt-3">
            <p className="garage-mono text-[10px] uppercase tracking-wide text-[#8f8f99]">
              Pending breakdown:
            </p>
            {stats.pendingByType.map((p) => (
              <span
                key={p.type}
                className="rounded-md border border-[#34343c] bg-white/[0.03] px-2 py-0.5 text-[10px] text-[#d6d6dc]"
              >
                {p.type} <span className="font-mono text-[#ffd79a]">{p.count}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* TAB STRIP */}
      <div className="flex items-center gap-1 rounded-lg border border-[#34343c] bg-[#111116] p-1">
        {(["pending", "approved", "rejected", "all"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`garage-press flex-1 rounded-md px-3 py-2 text-sm font-semibold capitalize transition-colors ${
              tab === value
                ? "bg-[#f5a742] text-black"
                : "text-[#d6d6dc] hover:bg-white/[0.04]"
            }`}
          >
            {value === "pending"
              ? `Pending (${stats?.pending ?? 0})`
              : value === "approved"
                ? "Approved"
                : value === "rejected"
                  ? "Rejected"
                  : "All"}
          </button>
        ))}
      </div>

      {/* CATEGORY CHIPS */}
      <div className="garage-scroll flex gap-2 overflow-x-auto rounded-lg border border-[#34343c] bg-[#111116] p-2">
        {(Object.keys(APPROVAL_CATEGORIES) as CategoryFilter[]).map((key) => {
          const active = categoryFilter === key;
          const label = APPROVAL_CATEGORIES[key].label;
          const count =
            key === "all"
              ? stats?.pending
              : rows.filter(
                  (r) =>
                    r.status === "pending" &&
                    APPROVAL_CATEGORIES[key].types?.includes(r.type),
                ).length;
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setCategoryFilter(key);
                setTypeFilter("all");
              }}
              className={`garage-press shrink-0 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                active
                  ? "bg-[#f5a742] text-black"
                  : "border border-[#34343c] bg-white/[0.04] text-[#d6d6dc] hover:border-[#4a4a54]"
              }`}
            >
              {label}
              {tab === "pending" && count != null && count > 0 ? (
                <span className="ml-1.5 font-mono text-[10px] opacity-80">
                  ({count})
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* FILTERS */}
      <div className="grid gap-2 rounded-lg border border-[#34343c] bg-[#111116] p-3 sm:grid-cols-[1fr_160px_160px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8f8f99]" />
          <Input
            type="search"
            placeholder="Cari requester, type, ID, alasan..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-10 border-[#34343c] bg-white/[0.06] pl-9"
          />
        </div>
        <select
          value={riskFilter}
          onChange={(event) => setRiskFilter(event.target.value)}
          className="h-10 rounded-md border border-[#34343c] bg-white/[0.06] px-3 text-sm text-white"
        >
          <option value="all" className="bg-[#15151b]">Semua Risk</option>
          <option value="high" className="bg-[#15151b]">High Risk</option>
          <option value="medium" className="bg-[#15151b]">Medium Risk</option>
          <option value="low" className="bg-[#15151b]">Low Risk</option>
        </select>
        <select
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
          className="hidden h-10 rounded-md border border-[#34343c] bg-white/[0.06] px-3 text-sm text-white sm:block"
        >
          <option value="all" className="bg-[#15151b]">Semua Type</option>
          {uniqueTypes.map((t) => (
            <option key={t} value={t} className="bg-[#15151b]">
              {t}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          className="garage-press h-10 gap-2 border-[#4a4a54]"
          onClick={() => setGroupByType((v) => !v)}
        >
          {groupByType ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          {groupByType ? "Flat" : "Group"}
        </Button>
      </div>

      {uniqueTypes.length > 1 && (
        <div className="garage-scroll flex gap-1.5 overflow-x-auto sm:hidden">
          <button
            type="button"
            onClick={() => setTypeFilter("all")}
            className={`garage-press shrink-0 rounded-md px-2.5 py-1.5 text-[11px] font-semibold ${
              typeFilter === "all"
                ? "bg-[#f5a742] text-black"
                : "border border-[#34343c] text-[#d6d6dc]"
            }`}
          >
            Semua type
          </button>
          {uniqueTypes.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`garage-press shrink-0 rounded-md px-2.5 py-1.5 text-[11px] font-semibold ${
                typeFilter === t
                  ? "bg-[#f5a742] text-black"
                  : "border border-[#34343c] text-[#d6d6dc]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* ERROR */}
      {error && (
        <div className="rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 p-3 text-sm text-[#ffc2c8]">
          {error}
        </div>
      )}

      {/* BULK BAR */}
      {selected.size > 0 && tab === "pending" && (
        <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#f5a742]/55 bg-[#1a1a20] p-3 shadow-lg">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="garage-mono text-[11px] uppercase tracking-wide text-[#ffd79a]">
              {selected.size} dipilih
              {selectedHighRiskCount > 0
                ? ` · ${selectedHighRiskCount} high risk dikecualikan bulk`
                : ""}
            </span>
            {selectedHighRiskCount > 0 ? (
              <span className="text-[10px] text-[#ffc2c8]">
                High risk wajib decide satu per satu lewat detail.
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs text-[#8f8f99] underline hover:text-[#d6d6dc]"
            >
              Clear
            </button>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              className="garage-press h-9 gap-1.5 bg-[#22c55e] text-black hover:bg-[#34d76b]"
              disabled={selected.size - selectedHighRiskCount === 0}
              onClick={() => setBulkDialog("approve")}
            >
              <Check className="size-4" />
              Approve {selected.size}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="garage-press h-9 gap-1.5 border-[#d11a2a]/55 bg-[#d11a2a]/12 text-[#ffc2c8] hover:bg-[#d11a2a]/20"
              disabled={selected.size - selectedHighRiskCount === 0}
              onClick={() => setBulkDialog("reject")}
            >
              <X className="size-4" />
              Reject {selected.size}
            </Button>
          </div>
        </div>
      )}

      {/* LIST */}
      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border border-[#34343c] bg-[#111116] py-12 text-sm text-[#8f8f99]">
          <RefreshCw className="mr-2 size-5 animate-spin text-[#f5a742]" />
          Memuat approvals…
        </div>
      ) : filteredRows.length === 0 ? (
        <GarageEmpty
          icon={ShieldCheck}
          title="Tidak ada approval"
          description="Ubah filter status atau periode untuk lihat approval yang lain. Semua approval kritis langsung muncul di sini."
        />
      ) : groupedRows ? (
        <div className="space-y-3">
          {groupedRows.map(([type, list]) => (
            <div key={type} className="rounded-lg border border-[#34343c] bg-[#111116] p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="garage-mono text-[11px] uppercase tracking-wide text-[#f5a742]">
                  {type} ({list.length})
                </p>
              </div>
              <div className="space-y-2">
                {list.map((row) => (
                  <ApprovalRowCard
                    key={row.id}
                    row={row}
                    selectable={tab === "pending"}
                    selected={selected.has(row.id)}
                    onSelect={() => toggleSelect(row.id)}
                    onOpen={() => setDetail(row)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[#34343c] bg-[#111116]">
          {tab === "pending" && filteredRows.length > 0 && (
            <div className="flex items-center justify-between border-b border-[#34343c] px-3 py-2 text-xs">
              <label className="flex cursor-pointer items-center gap-2 text-[#d6d6dc]">
                <input
                  type="checkbox"
                  checked={
                    bulkEligibleRows.length > 0 &&
                    bulkEligibleRows.every((r) => selected.has(r.id))
                  }
                  onChange={toggleSelectAll}
                  className="size-4 accent-[#f5a742]"
                />
                Pilih semua ({bulkEligibleRows.length}
                {bulkEligibleRows.length < filteredRows.length
                  ? ` / ${filteredRows.length}`
                  : ""}
                )
              </label>
              <span className="font-mono text-[10px] text-[#8f8f99]">
                {selected.size} / {filteredRows.length}
              </span>
            </div>
          )}
          <div className="garage-scroll max-h-[calc(100vh-360px)] space-y-1 overflow-y-auto p-2">
            {filteredRows.map((row) => (
              <ApprovalRowCard
                key={row.id}
                row={row}
                selectable={tab === "pending"}
                selected={selected.has(row.id)}
                onSelect={() => toggleSelect(row.id)}
                onOpen={() => setDetail(row)}
              />
            ))}
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      <ApprovalDetailModal
        key={detail?.id ?? "none"}
        row={detail}
        onClose={() => setDetail(null)}
        onDecide={handleDecide}
        onOpenAudit={
          onOpenModule ? () => onOpenModule("audit") : undefined
        }
      />

      {/* BULK DECIDE DIALOG */}
      <BulkDecideDialog
        action={bulkDialog}
        count={selected.size}
        onClose={() => setBulkDialog(null)}
        onConfirm={async (status, reason) => {
          await handleBulkDecide(status, reason);
          setBulkDialog(null);
        }}
      />
    </section>
  );
}

// ─── ROW CARD ────────────────────────────────────────────────

function ApprovalRowCard({
  row,
  selectable,
  selected,
  onSelect,
  onOpen,
}: {
  row: ApprovalRow;
  selectable: boolean;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen();
      }}
      className="flex cursor-pointer items-start gap-3 rounded-md border border-[#34343c] bg-[#17171c] p-3 transition-colors hover:border-[#4a4a54] hover:bg-white/[0.04]"
    >
      {selectable && (
        <input
          type="checkbox"
          checked={selected}
          disabled={isHighRisk(row.risk)}
          title={
            isHighRisk(row.risk)
              ? "High risk — buka detail untuk decide"
              : undefined
          }
          onClick={(event) => event.stopPropagation()}
          onChange={onSelect}
          className="mt-1 size-4 shrink-0 accent-[#f5a742] disabled:opacity-40"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-mono text-xs font-semibold text-white">{row.id}</p>
          <span className="text-sm font-bold text-white">·</span>
          <p className="text-sm font-semibold text-white">{row.type}</p>
          <Badge className={`text-[10px] ${RISK_TONE[row.risk] ?? ""}`}>
            {row.risk}
          </Badge>
          <Badge className={`text-[10px] ${STATUS_TONE[row.status] ?? ""}`}>
            {row.status}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-[#b8b8bf]">
          {row.requester} ·{" "}
          <span className={ageSlaClass(row.age, row.createdAt)}>{row.age}</span> ·{" "}
          <span className="font-mono text-[#ffd79a]">{row.amount}</span>
        </p>
        <p className="mt-1 line-clamp-1 text-[11px] italic text-[#8f8f99]">
          {row.reason}
        </p>
        {row.decidedByName && (
          <p className="mt-1 font-mono text-[10px] text-[#8f8f99]">
            Diputus {row.decidedByName}
            {row.decidedAt && ` · ${dateTime.format(new Date(row.decidedAt))}`}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── DETAIL MODAL ────────────────────────────────────────────

function ApprovalDetailModal({
  row,
  onClose,
  onDecide,
  onOpenAudit,
}: {
  row: ApprovalRow | null;
  onClose: () => void;
  onDecide: (id: string, status: "approved" | "rejected", reason?: string) => Promise<void>;
  onOpenAudit?: () => void;
}) {
  const [mode, setMode] = useState<"view" | "approve" | "reject">("view");
  const [reasonInput, setReasonInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!row) return null;
  const isPending = row.status === "pending";

  const handleSubmit = async () => {
    if (!row) return;
    const status = mode === "approve" ? "approved" : "rejected";
    const trimmed = reasonInput.trim();
    if (status === "rejected" && trimmed.length < 5) {
      setError("Alasan reject wajib minimal 5 karakter.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onDecide(row.id, status, trimmed || undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal decide");
    } finally {
      setSubmitting(false);
    }
  };

  const handleManualWa = () => {
    if (!row.requesterPhone) return;
    openWaNotify(row, row.status as "approved" | "rejected", row.reasonDecided || undefined);
  };

  const templates = mode === "approve" ? SAVED_APPROVE_REASONS : SAVED_REJECT_REASONS;

  return (
    <Dialog open={Boolean(row)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-hidden border-[#34343c] bg-[#111116] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-[#f5a742]" />
            {row.type}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {row.id} · diajukan {row.requester} ·{" "}
            <span className={ageSlaClass(row.age, row.createdAt)}>{row.age}</span>
          </DialogDescription>
        </DialogHeader>

        {onOpenAudit ? (
          <Button
            type="button"
            variant="outline"
            className="garage-press h-9 w-full gap-2 border-[#4a4a54] text-[#d6d6dc]"
            onClick={() => {
              onClose();
              onOpenAudit();
            }}
          >
            <History className="size-4" />
            Buka Audit Log
          </Button>
        ) : null}

        <div className="garage-scroll min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {/* Top stats */}
          <div className="grid gap-2 sm:grid-cols-3">
            <DetailBox label="Amount / Impact" value={row.amount} tone="amber" />
            <DetailBox label="Risk Level" value={row.risk} />
            <DetailBox
              label="Status"
              value={row.status}
              valueClass={STATUS_TONE[row.status] ?? "text-white"}
            />
          </div>

          {/* Reason from requester */}
          <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3">
            <p className="garage-mono text-[10px] uppercase tracking-wide text-[#8f8f99]">
              Alasan Pengajuan
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[#d6d6dc]">{row.reason}</p>
          </div>

          {/* Decided audit */}
          {!isPending && (
            <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3">
              <p className="garage-mono text-[10px] uppercase tracking-wide text-[#8f8f99]">
                Audit Keputusan
              </p>
              <p className="mt-1 text-sm text-white">
                <strong>{row.status === "approved" ? "Disetujui" : "Ditolak"}</strong>{" "}
                oleh {row.decidedByName || "Unknown"}
              </p>
              {row.decidedAt && (
                <p className="font-mono text-[11px] text-[#8f8f99]">
                  {dateTime.format(new Date(row.decidedAt))}
                </p>
              )}
              {row.reasonDecided && (
                <p className="mt-2 rounded-md border border-[#34343c] bg-black/30 p-2 text-sm italic text-[#d6d6dc]">
                  “{row.reasonDecided}”
                </p>
              )}
            </div>
          )}

          {/* Requester info */}
          <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3">
            <p className="garage-mono text-[10px] uppercase tracking-wide text-[#8f8f99]">
              Requester
            </p>
            <p className="mt-1 text-sm font-semibold text-white">{row.requester}</p>
            {row.requesterPhone ? (
              <p className="font-mono text-[11px] text-[#8f8f99]">
                {row.requesterPhone}
              </p>
            ) : (
              <p className="text-[10px] text-[#8f8f99]">
                No phone (WA notify tidak tersedia)
              </p>
            )}
            <p className="mt-1 font-mono text-[10px] text-[#8f8f99]">
              Dibuat {dateTime.format(new Date(row.createdAt))}
            </p>
          </div>

          {/* Decide form */}
          {isPending && mode !== "view" && (
            <div
              className={`rounded-md border p-3 ${
                mode === "approve"
                  ? "border-[#22c55e]/45 bg-[#22c55e]/8"
                  : "border-[#d11a2a]/45 bg-[#d11a2a]/8"
              }`}
            >
              <p
                className={`garage-mono text-[11px] font-bold uppercase tracking-wide ${
                  mode === "approve" ? "text-[#86efac]" : "text-[#ffc2c8]"
                }`}
              >
                {mode === "approve" ? "Approve Approval" : "Reject Approval"}
              </p>
              <p className="mt-1 text-xs text-[#d6d6dc]">
                {mode === "approve"
                  ? "Alasan opsional (untuk audit trail)."
                  : "Alasan WAJIB diisi minimal 5 karakter."}
              </p>

              {/* Saved templates */}
              <div className="mt-2 flex flex-wrap gap-1">
                {templates.map((tpl) => (
                  <button
                    key={tpl}
                    type="button"
                    onClick={() => setReasonInput(tpl)}
                    className="rounded-md border border-[#34343c] bg-white/[0.04] px-2 py-0.5 text-[10px] text-[#d6d6dc] transition-colors hover:border-[#f5a742]/55 hover:text-[#ffd79a]"
                  >
                    {tpl}
                  </button>
                ))}
              </div>

              <textarea
                value={reasonInput}
                onChange={(event) => setReasonInput(event.target.value)}
                rows={3}
                maxLength={500}
                placeholder={
                  mode === "approve"
                    ? "Catatan opsional..."
                    : "Wajib: alasan menolak..."
                }
                className="mt-2 w-full rounded-md border border-[#34343c] bg-white/[0.06] p-2 text-sm text-white"
              />
              <p className="mt-1 text-[10px] text-[#8f8f99]">
                {reasonInput.length}/500 karakter
              </p>

              {error && (
                <p className="mt-2 text-xs text-[#ffc2c8]">{error}</p>
              )}

              <div className="mt-3 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-9 border-[#4a4a54]"
                  onClick={() => {
                    setMode("view");
                    setReasonInput("");
                    setError(null);
                  }}
                  disabled={submitting}
                >
                  Batal
                </Button>
                <Button
                  type="button"
                  className={`garage-press h-9 ${
                    mode === "approve"
                      ? "bg-[#22c55e] text-black hover:bg-[#34d76b]"
                      : "bg-[#d11a2a] text-white hover:bg-[#e72c3c]"
                  }`}
                  onClick={() => void handleSubmit()}
                  disabled={submitting}
                >
                  {submitting ? (
                    <RefreshCw className="size-3.5 animate-spin" />
                  ) : mode === "approve" ? (
                    <Check className="size-3.5" />
                  ) : (
                    <X className="size-3.5" />
                  )}
                  Konfirmasi {mode === "approve" ? "Approve" : "Reject"}
                </Button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {isPending && mode === "view" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                className="garage-press h-11 gap-2 bg-[#22c55e] text-black hover:bg-[#34d76b]"
                onClick={() => {
                  setMode("approve");
                  setReasonInput("");
                }}
              >
                <Check className="size-4" />
                Approve
              </Button>
              <Button
                type="button"
                className="garage-press h-11 gap-2 bg-[#d11a2a] text-white hover:bg-[#e72c3c]"
                onClick={() => {
                  setMode("reject");
                  setReasonInput("");
                }}
              >
                <X className="size-4" />
                Reject
              </Button>
            </div>
          )}

          {!isPending && row.requesterPhone && (
            <Button
              type="button"
              variant="outline"
              className="garage-press h-10 w-full gap-2 border-[#25d366]/55 bg-[#25d366]/8 text-[#86efac] hover:bg-[#25d366]/15"
              onClick={handleManualWa}
            >
              <MessageCircle className="size-4" />
              Kirim ulang notifikasi via WA
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── BULK DECIDE DIALOG ──────────────────────────────────────

function BulkDecideDialog({
  action,
  count,
  onClose,
  onConfirm,
}: {
  action: "approve" | "reject" | null;
  count: number;
  onClose: () => void;
  onConfirm: (status: "approved" | "rejected", reason?: string) => Promise<void>;
}) {
  const [reasonInput, setReasonInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!action) return null;
  const isApprove = action === "approve";
  const templates = isApprove ? SAVED_APPROVE_REASONS : SAVED_REJECT_REASONS;

  const handle = async () => {
    const trimmed = reasonInput.trim();
    if (!isApprove && trimmed.length < 5) {
      setError("Alasan reject wajib minimal 5 karakter.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(isApprove ? "approved" : "rejected", trimmed || undefined);
      setReasonInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={Boolean(action)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-[#34343c] bg-[#111116] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isApprove ? "Approve" : "Reject"} {count} Approval Sekaligus?
          </DialogTitle>
          <DialogDescription>
            Alasan akan disimpan di audit log untuk semua {count} approval ini.
            {!isApprove && " Wajib isi (min 5 char)."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {templates.map((tpl) => (
              <button
                key={tpl}
                type="button"
                onClick={() => setReasonInput(tpl)}
                className="rounded-md border border-[#34343c] bg-white/[0.04] px-2 py-0.5 text-[10px] text-[#d6d6dc] hover:border-[#f5a742]/55 hover:text-[#ffd79a]"
              >
                {tpl}
              </button>
            ))}
          </div>
          <textarea
            value={reasonInput}
            onChange={(event) => setReasonInput(event.target.value)}
            rows={3}
            maxLength={500}
            placeholder={isApprove ? "Catatan opsional..." : "Wajib: alasan menolak..."}
            className="w-full rounded-md border border-[#34343c] bg-white/[0.06] p-2 text-sm text-white"
          />
          {error && <p className="text-xs text-[#ffc2c8]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="garage-press h-9 border-[#4a4a54]"
              onClick={onClose}
              disabled={submitting}
            >
              Batal
            </Button>
            <Button
              type="button"
              className={`garage-press h-9 gap-1.5 ${
                isApprove
                  ? "bg-[#22c55e] text-black hover:bg-[#34d76b]"
                  : "bg-[#d11a2a] text-white hover:bg-[#e72c3c]"
              }`}
              onClick={() => void handle()}
              disabled={submitting}
            >
              {submitting ? (
                <RefreshCw className="size-3.5 animate-spin" />
              ) : isApprove ? (
                <Check className="size-3.5" />
              ) : (
                <X className="size-3.5" />
              )}
              Konfirmasi {count} {isApprove ? "Approve" : "Reject"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── HELPERS ─────────────────────────────────────────────────

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

function DetailBox({
  label,
  value,
  tone,
  valueClass,
}: {
  label: string;
  value: string;
  tone?: "amber";
  valueClass?: string;
}) {
  return (
    <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3">
      <p className="font-mono text-[10px] uppercase tracking-wide text-[#8f8f99]">
        {label}
      </p>
      <p
        className={`mt-1 text-base font-bold ${valueClass ?? (tone === "amber" ? "text-[#ffd79a]" : "text-white")}`}
      >
        {value}
      </p>
    </div>
  );
}

function openWaNotify(
  row: ApprovalRow,
  status: "approved" | "rejected",
  reasonDecided?: string,
) {
  if (!row.requesterPhone) return;
  const phone = normalizeWaNumber(row.requesterPhone);
  const decision = status === "approved" ? "DISETUJUI ✅" : "DITOLAK ❌";
  const firstName = row.requester.split(/\s+/)[0] || "Tim";
  const reasonLine = reasonDecided ? `\nAlasan: ${reasonDecided}` : "";
  const message =
    `Halo ${firstName},\n\n` +
    `Approval kamu sudah diputuskan.\n\n` +
    `ID: ${row.id}\n` +
    `Tipe: ${row.type}\n` +
    `Status: ${decision}` +
    reasonLine +
    `\n\nSilakan cek modul Approvals di app untuk detail.`;
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function normalizeWaNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("8")) return `62${digits}`;
  return digits;
}
