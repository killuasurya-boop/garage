"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Award,
  Check,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  CreditCard,
  Download,
  Eye,
  Gift,
  Heart,
  MessageCircle,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  User,
  X,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export type CrmCustomerRow = {
  id: string;
  name: string;
  phone: string;
  tier: string;
  memberCode: string | null;
  cardTier: string | null;
  membershipSince: string | null;
  ultraCandidate: boolean;
  ultraApprovedAt: string | null;
  ultraApprovedBy: string | null;
  points: number;
  visits: number;
  flag: string;
  staffNote: string | null;
  lastOrderAt: string | null;
  daysSinceVisit: number | null;
  totalSpend: number;
  paidOrderCount: number;
  averageTicket: number;
};

type CustomerListResponse = {
  rows: CrmCustomerRow[];
  total: number;
  hasMore: boolean;
};

const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const dateTime = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
});

const PAGE_SIZE = 20;
const TIER_OPTIONS = [
  { value: "all", label: "Semua Tier" },
  { value: "Silver", label: "Silver" },
  { value: "Gold", label: "Gold" },
  { value: "Platinum", label: "Platinum" },
  { value: "Ultra", label: "Ultra" },
];
const MEMBER_TIERS = ["Silver", "Gold", "Platinum", "Ultra"] as const;
const SORT_OPTIONS = [
  { value: "recent", label: "Terbaru" },
  { value: "spend", label: "Spend Tertinggi" },
  { value: "visits", label: "Kunjungan Terbanyak" },
  { value: "points", label: "Poin Tertinggi" },
  { value: "name", label: "Nama A-Z" },
];

export function CrmCustomerList({
  initialSearch = "",
  initialTier = "all",
  hideHeader = false,
}: {
  initialSearch?: string;
  initialTier?: string;
  hideHeader?: boolean;
}) {
  const [rows, setRows] = useState<CrmCustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState(initialSearch);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [tier, setTier] = useState(initialTier);
  const [sort, setSort] = useState("recent");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState("");
  // Seleksi massal untuk export aman (NAV_ACTION_AUDIT §1.7, non-destruktif).
  const [bulkIds, setBulkIds] = useState<Set<string>>(new Set());

  function toggleBulk(id: string) {
    setBulkIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleBulkAll(ids: string[]) {
    setBulkIds((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  }

  function exportSelectedCsv() {
    const picked = rows.filter((r) => bulkIds.has(r.id));
    if (picked.length === 0) return;
    const head = ["Nama", "Telepon", "Tier", "Total Spend", "Kunjungan", "Poin", "Kunjungan Terakhir"];
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const body = picked.map((r) =>
      [r.name, r.phone, r.tier, r.totalSpend, r.visits, r.points, r.lastOrderAt ?? "-"].map(esc).join(","),
    );
    const csv = [head.map(esc).join(","), ...body].join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `customer-terpilih-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (tier && tier !== "all") params.set("tier", tier);
      if (selectedTag) params.set("tag", selectedTag);
      if (sort) params.set("sort", sort);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));
      const res = await fetch(`/api/crm/customers?${params.toString()}`);
      const data = (await res.json().catch(() => ({}))) as {
        data?: CustomerListResponse;
        error?: { message?: string };
      };
      if (!res.ok || !data.data) {
        throw new Error(data.error?.message || "Gagal memuat customer");
      }
      setRows(data.data.rows);
      setTotal(data.data.total);
      setHasMore(data.data.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat customer");
      setRows([]);
      setTotal(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [search, tier, sort, page, selectedTag]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch when filters change
    void load();
  }, [load]);

  useEffect(() => {
    fetch("/api/crm/tags")
      .then((r) => r.json())
      .then((j: { data?: { tags: string[] } }) => setAllTags(j.data?.tags ?? []))
      .catch(() => {});
  }, []);

  function applySearch() {
    setPage(0);
    setSearch(searchInput.trim());
  }

  function resetFilters() {
    setSearchInput("");
    setSearch("");
    setTier("all");
    setSort("recent");
    setSelectedTag("");
    setPage(0);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showingFrom = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const showingTo = Math.min(total, (page + 1) * PAGE_SIZE);

  return (
    <section className="space-y-4">
      {!hideHeader && (
        <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="garage-mono text-[11px] uppercase tracking-[0.14em] text-[#f5a742]">
                Membership Master Pro
              </p>
              <h2 className="mt-1 text-xl font-black text-white">Daftar Member</h2>
              <p className="mt-1 text-xs text-[#b8b8bf]">
                Kelola Silver, Gold, Platinum, Ultra, kartu member, voucher, dan catatan CRM.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="garage-press h-10 gap-2"
                onClick={() => setAddOpen(true)}
              >
                <Plus className="size-4" />
                Add Member
              </Button>
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
              <Button
                type="button"
                variant="outline"
                className="garage-press h-10 border-[#4a4a54] gap-2 text-white"
                onClick={() => {
                  const params = new URLSearchParams();
                  if (search) params.set("search", search);
                  if (tier && tier !== "all") params.set("tier", tier);
                  window.open(`/api/crm/export?${params.toString()}`, "_blank");
                }}
              >
                <Download className="size-3.5" />
                Export CSV
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_160px_180px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8f8f99]" />
              <Input
                type="search"
                placeholder="Cari nama atau no HP..."
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") applySearch();
                }}
                className="h-10 border-[#34343c] bg-white/[0.06] pl-9"
              />
            </div>
            <select
              value={tier}
              onChange={(event) => {
                setTier(event.target.value);
                setPage(0);
              }}
              className="h-10 rounded-md border border-[#34343c] bg-white/[0.06] px-3 text-sm text-white"
            >
              {TIER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-[#15151b]">
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value);
                setPage(0);
              }}
              className="h-10 rounded-md border border-[#34343c] bg-white/[0.06] px-3 text-sm text-white"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-[#15151b]">
                  Urut: {opt.label}
                </option>
              ))}
            </select>
            {allTags.length > 0 && (
              <select
                value={selectedTag}
                onChange={(event) => {
                  setSelectedTag(event.target.value);
                  setPage(0);
                }}
                className="h-10 rounded-md border border-[#34343c] bg-white/[0.06] px-3 text-sm text-white"
              >
                <option value="" className="bg-[#15151b]">Semua Tag</option>
                {allTags.map((t) => (
                  <option key={t} value={t} className="bg-[#15151b]">
                    #{t}
                  </option>
                ))}
              </select>
            )}
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
        </div>
      )}

      {error && (
        <div className="rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 p-3 text-sm text-[#ffc2c8]">
          {error}
        </div>
      )}

      {/* Bar aksi massal aman — export customer terpilih (NAV_ACTION_AUDIT §1.7). */}
      {bulkIds.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-[#d11a2a]/40 bg-[#d11a2a]/10 px-3 py-2">
          <span className="text-sm font-semibold text-white">{bulkIds.size} terpilih</span>
          <button
            type="button"
            onClick={exportSelectedCsv}
            className="inline-flex items-center gap-1.5 rounded border border-[#f5a742]/40 bg-[#f5a742]/10 px-2.5 py-1 text-xs font-semibold text-[#ffd79a] hover:border-[#f5a742]/70 hover:text-white"
          >
            <Download size={13} /> Export CSV terpilih
          </button>
          <button
            type="button"
            onClick={() => setBulkIds(new Set())}
            className="ml-auto rounded border border-white/15 px-2.5 py-1 text-xs text-[#d0d0d6] hover:border-white/40 hover:text-white"
          >
            Batal pilih
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-[#34343c] bg-[#111116]">
        <div className="garage-scroll overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead className="bg-[#17171c]">
              <tr className="border-b border-[#34343c] font-mono text-[10px] uppercase tracking-wider text-[#8f8f99]">
                <th className="px-3 py-2.5 text-center font-normal w-9">
                  <input
                    type="checkbox"
                    aria-label="Pilih semua customer"
                    className="size-4 cursor-pointer accent-[#d11a2a]"
                    checked={rows.length > 0 && rows.every((r) => bulkIds.has(r.id))}
                    onChange={() => toggleBulkAll(rows.map((r) => r.id))}
                  />
                </th>
                <th className="px-3 py-2.5 text-left font-normal">Customer</th>
                <th className="px-3 py-2.5 text-center font-normal">Tier</th>
                <th className="px-3 py-2.5 text-right font-normal">Total Spend</th>
                <th className="px-3 py-2.5 text-center font-normal">Visits</th>
                <th className="px-3 py-2.5 text-center font-normal">Poin</th>
                <th className="px-3 py-2.5 text-left font-normal">Last Visit</th>
                <th className="px-3 py-2.5 text-center font-normal">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-12 text-center text-sm text-[#8f8f99]">
                    <RefreshCw className="mx-auto mb-2 size-5 animate-spin text-[#f5a742]" />
                    Memuat customer…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#23232a]">
                        <User className="size-6 text-[#4a4a54]" />
                      </div>
                      <p className="text-sm font-semibold text-[#d6d6dc]">Belum ada member</p>
                      <p className="text-xs text-[#8f8f99]">Tambah member baru atau ubah filter pencarian.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`cursor-pointer border-b border-[#23232a] transition-colors hover:bg-white/[0.04] ${bulkIds.has(row.id) ? "bg-[#d11a2a]/10" : ""}`}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Pilih ${row.name}`}
                        className="size-4 cursor-pointer accent-[#d11a2a]"
                        checked={bulkIds.has(row.id)}
                        onChange={() => toggleBulk(row.id)}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-white">{row.name}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-[#8f8f99]">
                        {row.phone}
                      </p>
                      {row.memberCode && (
                        <p className="mt-0.5 font-mono text-[10px] text-[#ffd79a]">
                          {row.memberCode}
                        </p>
                      )}
                      {row.staffNote && (
                        <p className="mt-1 line-clamp-1 text-[10px] italic text-[#ffd79a]">
                          “{row.staffNote}”
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <TierBadge tier={row.tier} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <p className="font-mono text-sm font-bold text-[#ffd79a]">
                        {currency.format(row.totalSpend)}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-[#8f8f99]">
                        avg {currency.format(row.averageTicket)}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-center font-mono text-sm text-white">
                      {row.visits}
                    </td>
                    <td className="px-3 py-3 text-center font-mono text-sm text-white">
                      {row.points}
                    </td>
                    <td className="px-3 py-3">
                      {row.lastOrderAt ? (
                        <>
                          <p className="text-xs text-[#d6d6dc]">
                            {dateTime.format(new Date(row.lastOrderAt))}
                          </p>
                          {row.daysSinceVisit !== null && (
                            <p className="mt-0.5 flex items-center gap-1 font-mono text-[10px] text-[#8f8f99]">
                              {row.daysSinceVisit === 0
                                ? "Hari ini"
                                : `${row.daysSinceVisit} hari lalu`}
                              {row.daysSinceVisit > 60 ? (
                                <span className="rounded-sm border border-[#d11a2a]/45 bg-[#d11a2a]/14 px-1 text-[9px] text-[#ffc2c8]">high</span>
                              ) : row.daysSinceVisit > 30 ? (
                                <span className="rounded-sm border border-[#f5a742]/45 bg-[#f5a742]/14 px-1 text-[9px] text-[#ffd79a]">med</span>
                              ) : null}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="flex items-center gap-1 text-xs text-[#8f8f99]">
                          -
                          <span className="rounded-sm border border-[#d11a2a]/45 bg-[#d11a2a]/14 px-1 text-[9px] text-[#ffc2c8]">high</span>
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="garage-press h-8 border-[#4a4a54] px-2 text-xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedId(row.id);
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
              Menampilkan {showingFrom}–{showingTo} dari {total} customer
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

      <CustomerDetailModal
        key={selectedId ?? "none"}
        customerId={selectedId}
        onClose={() => setSelectedId(null)}
        onUpdated={() => void load()}
      />
      <AddMemberModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          setAddOpen(false);
          setPage(0);
          void load();
        }}
      />
    </section>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const map: Record<string, string> = {
    Silver: "border-[#c0c0c0]/45 bg-[#c0c0c0]/14 text-[#e5e5e5]",
    Gold: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd79a]",
    Platinum: "border-[#70b8ee]/55 bg-[#70b8ee]/16 text-[#d8f0ff]",
    Ultra: "border-[#9060f0]/55 bg-[#9060f0]/16 text-[#d9c8ff]",
  };
  return (
    <Badge className={`text-[10px] ${map[tier] || "border-[#34343c] bg-white/[0.04] text-[#d6d6dc]"}`}>
      {tier}
    </Badge>
  );
}

// ─── DETAIL MODAL ───────────────────────────────────────────

type CustomerDetail = {
  id: string;
  name: string;
  phone: string;
  tier: string;
  memberCode: string | null;
  cardTier: string | null;
  membershipSince: string | null;
  ultraCandidate: boolean;
  ultraApprovedAt: string | null;
  ultraApprovedBy: string | null;
  points: number;
  visits: number;
  flag: string;
  staffNote: string | null;
  birthday: string | null;
  referralCode: string | null;
  referredByCode: string | null;
  createdAt: string;
  stats: {
    totalSpend: number;
    annualSpend: number;
    paidOrderCount: number;
    averageTicket: number;
    lastOrderAt: string | null;
    daysSinceVisit: number | null;
  };
  orders: Array<{
    id: string;
    orderNo: string;
    invoiceWebUrl: string | null;
    status: string;
    total: number;
    tableLabel: string;
    channel: string;
    createdAt: string;
  }>;
  favoriteItems: Array<{ name: string; variant: string; qty: number }>;
};

function CustomerDetailModal({
  customerId,
  onClose,
  onUpdated,
}: {
  customerId: string | null;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState("");
  const [noteEditing, setNoteEditing] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileBirthday, setProfileBirthday] = useState("");
  const [profileReferral, setProfileReferral] = useState("");
  const [profileMemberCode, setProfileMemberCode] = useState("");
  const [profileTier, setProfileTier] = useState("Silver");
  const [profileSaving, setProfileSaving] = useState(false);
  const [voucherHistory, setVoucherHistory] = useState<Array<{
    id: string; code: string; type: string; value: number;
    status: string; validUntil: string; createdAt: string;
  }>>([]);
  const [voucherHistoryLoading, setVoucherHistoryLoading] = useState(false);
  const [tukarPoinOpen, setTukarPoinOpen] = useState(false);
  const [, setTukarPoinResult] = useState<{
    pointsRedeemed: number;
    discountAmount: number;
    remainingPoints: number;
  } | null>(null);
  const [, setTukarPoinError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [tags, setTags] = useState<Array<{ id: string; tag: string; createdAt: string }>>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [allAvailableTags, setAllAvailableTags] = useState<string[]>([]);
  const [tagSaving, setTagSaving] = useState(false);

  useEffect(() => {
    if (!customerId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch detail saat customer dipilih
    setLoading(true);
    setError(null);
    setVoucherHistory([]);
    fetch(`/api/crm/customers/${customerId}`)
      .then((res) => res.json().then((j) => ({ ok: res.ok, j })))
      .then(({ ok, j }) => {
        if (!ok || !j.data) throw new Error(j.error?.message || "Gagal memuat detail");
        setDetail(j.data);
        setNoteInput(j.data.staffNote || "");
        setProfileBirthday(j.data.birthday || "");
        setProfileReferral(j.data.referralCode || "");
        setProfileMemberCode(j.data.memberCode || "");
        setProfileTier(j.data.cardTier || j.data.tier || "Silver");
        // fetch voucher history in parallel
        setVoucherHistoryLoading(true);
        fetch(`/api/crm/customers/${customerId}/vouchers`)
          .then((r) => r.json())
          .then((v) => { if (v.data?.vouchers) setVoucherHistory(v.data.vouchers); })
          .catch(() => {})
          .finally(() => setVoucherHistoryLoading(false));
      })
      .then(() => {
        // Fetch tags for this customer
        fetch(`/api/crm/customers/${customerId}/tags`)
          .then((r) => r.json())
          .then((j) => { if (j.data?.tags) setTags(j.data.tags); })
          .catch(() => {});
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [customerId]);

  const handleSaveNote = async () => {
    if (!detail) return;
    setNoteSaving(true);
    try {
      const res = await fetch(`/api/crm/customers/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffNote: noteInput }),
      });
      if (!res.ok) throw new Error("Gagal simpan catatan");
      setDetail((d) => (d ? { ...d, staffNote: noteInput.trim() || null } : d));
      setNoteEditing(false);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal simpan");
    } finally {
      setNoteSaving(false);
    }
  };

  const handleSendWa = () => {
    if (!detail) return;
    const message = `Halo ${detail.name.split(/\s+/)[0] || "Kak"},\n\nTerima kasih sudah jadi customer GARAGE Coffee & Motor. Ada yang bisa kami bantu?`;
    const url = `https://wa.me/${normalizeWaNumber(detail.phone)}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleTagInputChange = (value: string) => {
    setTagInput(value);
    if (value.trim().length === 0) {
      setTagSuggestions([]);
      return;
    }
    const q = value.toLowerCase();
    setTagSuggestions(allAvailableTags.filter((t) => t.startsWith(q) && !tags.some((tg) => tg.tag === t)).slice(0, 5));
  };

  const handleAddTag = async () => {
    if (!detail || !tagInput.trim()) return;
    setTagSaving(true);
    try {
      const res = await fetch(`/api/crm/customers/${detail.id}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: tagInput.trim() }),
      });
      const j = await res.json();
      if (!res.ok || !j.data) throw new Error(j.error?.message || "Gagal tambah tag");
      setTags((prev) => [...prev, j.data]);
      setTagInput("");
      setTagSuggestions([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal tambah tag");
    } finally {
      setTagSaving(false);
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!detail) return;
    try {
      const res = await fetch(`/api/crm/customers/${detail.id}/tags`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error?.message || "Gagal hapus tag");
      }
      setTags((prev) => prev.filter((t) => t.id !== tagId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal hapus tag");
    }
  };

  useEffect(() => {
    fetch("/api/crm/tags")
      .then((r) => r.json())
      .then((j: { data?: { tags: string[] } }) => setAllAvailableTags(j.data?.tags ?? []))
      .catch(() => {});
  }, []);

  const handleSaveProfile = async () => {
    if (!detail) return;
    setProfileSaving(true);
    try {
      const birthdayPayload = profileBirthday.trim() || null;
      const referralPayload = profileReferral.trim() || null;
      const memberCodePayload = profileMemberCode.trim() || null;
      const res = await fetch(`/api/crm/customers/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          birthday: birthdayPayload,
          referralCode: referralPayload,
          memberCode: memberCodePayload,
          cardTier: profileTier,
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(json.error?.message || "Gagal simpan profile");
      }
      setDetail((d) =>
        d
          ? {
              ...d,
              birthday: birthdayPayload,
              tier: profileTier,
              cardTier: profileTier,
              memberCode: memberCodePayload?.toUpperCase().replace(/\s+/g, "") || null,
              referralCode:
                referralPayload?.toUpperCase().replace(/\s+/g, "") || null,
            }
          : d,
      );
      setProfileEditing(false);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal simpan profile");
    } finally {
      setProfileSaving(false);
    }
  };

  if (!customerId) return null;

  return (
    <>
      <Dialog open={Boolean(customerId)} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-h-[92svh] overflow-hidden border-[#34343c] bg-[#111116] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="size-5 text-[#f5a742]" />
              {detail?.name ?? "Detail Customer"}
            </DialogTitle>
            <DialogDescription>
              {detail ? (
                <span className="flex items-center gap-2 font-mono text-xs">
                  <Phone className="size-3" />
                  {detail.phone}
                  <span className="text-[#8f8f99]">·</span>
                  <TierBadge tier={detail.tier} />
                </span>
              ) : (
                "Memuat profil customer…"
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="garage-scroll min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {/* Loading skeleton */}
            {loading && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-20 rounded-md bg-[#23232a]" />)}
                </div>
                <Skeleton className="h-11 w-full rounded-md bg-[#23232a]" />
                <Skeleton className="h-24 w-full rounded-md bg-[#23232a]" />
              </div>
            )}

            {error && (
              <div className="rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 p-3 text-sm text-[#ffc2c8]">
                {error}
              </div>
            )}

            {detail && (
              <>
                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <StatBox label="Total Spend" value={currency.format(detail.stats.totalSpend)} tone="amber" />
                  <StatBox label="Spend 12 Bulan" value={currency.format(detail.stats.annualSpend)} />
                  <StatBox label="Order Paid" value={String(detail.stats.paidOrderCount)} />
                  <StatBox
                    label="Avg Ticket"
                    value={currency.format(detail.stats.averageTicket)}
                  />
                  <StatBox label="Poin" value={String(detail.points)} icon={<Award className="size-3.5" />} />
                </div>

                <div className="grid gap-2 sm:grid-cols-4">
                  <StatBox label="Member Code" value={detail.memberCode || "-"} />
                  <StatBox label="Birthday" value={detail.birthday || "-"} />
                  <StatBox label="Referral" value={detail.referralCode || "-"} />
                </div>

                {/* Action buttons */}
                <div className="grid gap-2 sm:grid-cols-3">
                  <Button
                    type="button"
                    className="garage-press h-11 gap-2 bg-[#25d366] text-black hover:bg-[#34e377]"
                    onClick={handleSendWa}
                  >
                    <MessageCircle className="size-4" />
                    Kirim WA
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-11 gap-2 border-[#f5a742]/55 bg-[#f5a742]/8 text-[#ffd79a] hover:bg-[#f5a742]/15"
                    onClick={() => setVoucherOpen(true)}
                  >
                    <Gift className="size-4" />
                    Beri Voucher
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-11 gap-2 border-[#4a4a54]"
                    onClick={() => setNoteEditing(true)}
                  >
                    <Heart className="size-4" />
                    Edit Catatan
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-11 gap-2 border-[#9060f0]/55 bg-[#9060f0]/8 text-[#d9c8ff]"
                    onClick={() => window.open(`/api/crm/customers/${detail.id}/card.pdf`, "_blank", "noopener,noreferrer")}
                  >
                    <Download className="size-4" />
                    Export Card PDF
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-11 gap-2 border-[#22c55e]/45 bg-[#22c55e]/8 text-[#86efac] hover:bg-[#22c55e]/15"
                    onClick={() => setTukarPoinOpen(true)}
                  >
                    <Award className="size-4" />
                    Tukar Poin
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-11 gap-2 border-[#d11a2a]/45 bg-[#d11a2a]/8 text-[#ffc2c8] hover:bg-[#d11a2a]/15"
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    <Trash2 className="size-4" />
                    Hapus
                  </Button>
                </div>

                {/* Profile (birthday + referral) */}
                <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="garage-mono text-[11px] uppercase tracking-wide text-[#f5a742]">
                      Profile Customer
                    </p>
                    {!profileEditing && (
                      <button
                        type="button"
                        onClick={() => setProfileEditing(true)}
                        className="text-xs text-[#f5a742] underline hover:text-[#ffba5a]"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  {profileEditing ? (
                    <div className="space-y-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-[#8f8f99]">
                          Tier Kartu
                        </p>
                        <select
                          value={profileTier}
                          onChange={(event) => setProfileTier(event.target.value)}
                          className="mt-1 h-10 w-full rounded-md border border-[#34343c] bg-white/[0.06] px-3 text-sm text-white"
                        >
                          {MEMBER_TIERS.map((tierOption) => (
                            <option key={tierOption} value={tierOption} className="bg-[#15151b]">
                              {tierOption}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-[10px] text-[#8f8f99]">
                          Ultra akan ditolak API kecuali login sebagai Owner / CEO.
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-[#8f8f99]">
                          Member Code
                        </p>
                        <Input
                          type="text"
                          value={profileMemberCode}
                          onChange={(event) =>
                            setProfileMemberCode(event.target.value.replace(/\s+/g, "").toUpperCase())
                          }
                          placeholder="GRG-SLV-KTC-001"
                          maxLength={32}
                          className="mt-1 h-10 border-[#34343c] bg-white/[0.06] font-mono uppercase"
                        />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-[#8f8f99]">
                          Tanggal Lahir
                        </p>
                        <Input
                          type="date"
                          value={profileBirthday}
                          onChange={(event) => setProfileBirthday(event.target.value)}
                          className="mt-1 h-10 border-[#34343c] bg-white/[0.06]"
                        />
                        <p className="mt-1 text-[10px] text-[#8f8f99]">
                          Untuk segmen Birthday Week — kirim ucapan + voucher otomatis.
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-[#8f8f99]">
                          Kode Referral (huruf besar, tanpa spasi)
                        </p>
                        <Input
                          type="text"
                          value={profileReferral}
                          onChange={(event) =>
                            setProfileReferral(
                              event.target.value.replace(/\s+/g, "").toUpperCase(),
                            )
                          }
                          placeholder="BUDI2026"
                          maxLength={24}
                          className="mt-1 h-10 border-[#34343c] bg-white/[0.06] font-mono uppercase"
                        />
                        <p className="mt-1 text-[10px] text-[#8f8f99]">
                          Kode unik untuk dibagikan ke teman customer. Auto-uppercase.
                        </p>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="garage-press h-8 border-[#4a4a54] px-3 text-xs"
                          onClick={() => {
                            setProfileEditing(false);
                            setProfileBirthday(detail.birthday || "");
                            setProfileReferral(detail.referralCode || "");
                            setProfileMemberCode(detail.memberCode || "");
                            setProfileTier(detail.cardTier || detail.tier || "Silver");
                          }}
                          disabled={profileSaving}
                        >
                          Batal
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="garage-press h-8 px-3 text-xs"
                          onClick={() => void handleSaveProfile()}
                          disabled={profileSaving}
                        >
                          {profileSaving ? (
                            <RefreshCw className="size-3 animate-spin" />
                          ) : (
                            <Check className="size-3" />
                          )}
                          Simpan
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-[#8f8f99]">
                          Tier Kartu
                        </p>
                        <div className="mt-1">
                          <TierBadge tier={detail.cardTier || detail.tier} />
                        </div>
                        {detail.ultraCandidate && detail.cardTier !== "Ultra" && (
                          <p className="mt-1 text-[10px] text-[#d9c8ff]">
                            Kandidat Ultra, menunggu Owner approval.
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-[#8f8f99]">
                          Member Code
                        </p>
                        <p className="mt-0.5 font-mono text-sm font-semibold text-[#ffd79a]">
                          {detail.memberCode || "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-[#8f8f99]">
                          Tanggal Lahir
                        </p>
                        <p className="mt-0.5 text-sm font-semibold text-white">
                          {detail.birthday
                            ? new Date(detail.birthday).toLocaleDateString("id-ID", {
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                              })
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-[#8f8f99]">
                          Kode Referral
                        </p>
                        <p className="mt-0.5 font-mono text-sm font-semibold text-[#ffd79a]">
                          {detail.referralCode || "—"}
                        </p>
                        {detail.referredByCode && (
                          <p className="mt-0.5 text-[10px] text-[#8f8f99]">
                            Diajak oleh{" "}
                            <span className="font-mono text-[#d6d6dc]">
                              {detail.referredByCode}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Staff note */}
                <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="garage-mono text-[11px] uppercase tracking-wide text-[#f5a742]">
                      Catatan Staff
                    </p>
                    {!noteEditing && detail.staffNote && (
                      <button
                        type="button"
                        onClick={() => setNoteEditing(true)}
                        className="text-xs text-[#f5a742] underline hover:text-[#ffba5a]"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  {noteEditing ? (
                    <div className="space-y-2">
                      <textarea
                        value={noteInput}
                        onChange={(event) => setNoteInput(event.target.value)}
                        rows={3}
                        maxLength={500}
                        placeholder="Misal: alergi udang, suka kopi extra panas, langganan setiap Selasa..."
                        className="w-full rounded-md border border-[#34343c] bg-white/[0.06] p-2 text-sm text-white"
                      />
                      <div className="flex justify-between gap-2">
                        <p className="text-[10px] text-[#8f8f99]">
                          {noteInput.length}/500 karakter
                        </p>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="garage-press h-8 border-[#4a4a54] px-3 text-xs"
                            onClick={() => {
                              setNoteEditing(false);
                              setNoteInput(detail.staffNote || "");
                            }}
                            disabled={noteSaving}
                          >
                            Batal
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="garage-press h-8 px-3 text-xs"
                            onClick={() => void handleSaveNote()}
                            disabled={noteSaving}
                          >
                            {noteSaving ? (
                              <RefreshCw className="size-3 animate-spin" />
                            ) : (
                              <Check className="size-3" />
                            )}
                            Simpan
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : detail.staffNote ? (
                    <p className="text-sm italic text-[#d6d6dc]">
                      “{detail.staffNote}”
                    </p>
                  ) : (
                    <p className="text-xs text-[#8f8f99]">
                      Belum ada catatan. Tambahkan info preference customer ini.
                    </p>
                  )}
                </div>

                {/* Tags */}
                <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3">
                  <p className="garage-mono mb-2 text-[11px] uppercase tracking-wide text-[#f5a742]">
                    Tag
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.length === 0 && !tagInput && (
                      <p className="text-xs text-[#8f8f99]">Belum ada tag.</p>
                    )}
                    {tags.map((t) => (
                      <span
                        key={t.id}
                        className="flex items-center gap-1 rounded-full border border-[#f5a742]/40 bg-[#f5a742]/10 px-2.5 py-0.5 text-xs text-[#ffd79a]"
                      >
                        #{t.tag}
                        <button
                          type="button"
                          onClick={() => void handleRemoveTag(t.id)}
                          className="ml-0.5 size-3 rounded-full leading-none text-[#ffd79a]/60 hover:text-[#ffc2c8]"
                          title="Hapus tag"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={tagInput}
                        onChange={(e) => handleTagInputChange(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") void handleAddTag(); }}
                        placeholder="Ketik tag baru atau pilih..."
                        className="h-8 w-full rounded border border-[#34343c] bg-white/[0.06] px-3 pr-8 text-sm text-white placeholder:text-[#8f8f99]"
                      />
                      {tagSuggestions.length > 0 && (
                        <ul className="absolute top-full left-0 z-10 mt-1 max-h-40 w-full overflow-auto rounded border border-[#34343c] bg-[#17171c] shadow-lg">
                          {tagSuggestions.map((s) => (
                            <li key={s}>
                              <button
                                type="button"
                                className="w-full px-3 py-1.5 text-left text-sm text-[#d6d6dc] hover:bg-white/[0.06]"
                                onClick={() => {
                                  setTagInput(s);
                                  setTagSuggestions([]);
                                  void handleAddTag();
                                }}
                              >
                                #{s}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="garage-press h-8 px-3 text-xs"
                      onClick={() => void handleAddTag()}
                      disabled={tagSaving || !tagInput.trim()}
                    >
                      {tagSaving ? <RefreshCw className="size-3 animate-spin" /> : <Plus className="size-3" />}
                      Tambah
                    </Button>
                  </div>
                </div>

                {/* Favorites */}
                {detail.favoriteItems.length > 0 && (
                  <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3">
                    <p className="garage-mono mb-2 text-[11px] uppercase tracking-wide text-[#f5a742]">
                      Favorit (Top 5)
                    </p>
                    <ul className="space-y-1.5">
                      {detail.favoriteItems.map((item, idx) => (
                        <li
                          key={`${item.name}-${item.variant}`}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-base">
                              {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "·"}
                            </span>
                            <span className="text-white">{item.name}</span>
                            <span className="text-xs text-[#8f8f99]">{item.variant}</span>
                          </div>
                          <span className="font-mono text-xs text-[#ffd79a]">{item.qty}x</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Order history */}
                <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3">
                  <p className="garage-mono mb-2 text-[11px] uppercase tracking-wide text-[#f5a742]">
                    Riwayat Order ({detail.orders.length})
                  </p>
                  {detail.orders.length === 0 ? (
                    <p className="text-xs text-[#8f8f99]">Belum ada order.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {detail.orders.map((o) => (
                        <li
                          key={o.id}
                          className="flex items-center justify-between gap-2 rounded-md border border-[#23232a] bg-black/20 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="font-mono text-xs font-semibold text-white">
                              {o.orderNo}
                            </p>
                            <p className="mt-0.5 font-mono text-[10px] text-[#8f8f99]">
                              {dateTime.format(new Date(o.createdAt))} · {o.tableLabel}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold text-[#ffd79a]">
                              {currency.format(o.total)}
                            </span>
                            {o.invoiceWebUrl && (
                              <a
                                href={o.invoiceWebUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-md border border-[#4a4a54] px-2 py-1 text-[10px] text-[#d6d6dc] hover:border-[#8f8f99] hover:text-white"
                              >
                                Lihat
                              </a>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Voucher History */}
                <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3">
                  <p className="garage-mono mb-2 text-[11px] uppercase tracking-wide text-[#f5a742]">
                    Voucher History ({voucherHistory.length})
                  </p>
                  {voucherHistoryLoading ? (
                    <p className="text-xs text-[#8f8f99]">Memuat voucher...</p>
                  ) : voucherHistory.length === 0 ? (
                    <p className="text-xs text-[#8f8f99]">Belum ada voucher.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {voucherHistory.map((v) => (
                        <li
                          key={v.id}
                          className="flex items-center justify-between gap-2 rounded-md border border-[#23232a] bg-black/20 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="font-mono text-xs font-semibold text-white">
                              {v.code}
                            </p>
                            <p className="mt-0.5 text-[10px] text-[#8f8f99]">
                              {v.type === 'percent' ? `${v.value}%` : `Rp${v.value.toLocaleString('id-ID')}`} · {v.status}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-mono text-[10px] text-[#ffd79a]">
                              {new Date(v.validUntil).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {detail && (
        <VoucherDialog
          open={voucherOpen}
          onClose={() => setVoucherOpen(false)}
          customer={detail}
        />
      )}

      {detail && (
        <TukarPoinDialog
          open={tukarPoinOpen}
          onClose={() => {
            setTukarPoinOpen(false);
            setTukarPoinResult(null);
            setTukarPoinError(null);
          }}
          customer={detail}
          onRedeemed={(result) => {
            setTukarPoinResult(result);
            setDetail((d) => d ? { ...d, points: result.remainingPoints } : d);
            onUpdated();
          }}
        />
      )}

      {detail && (
        <DeleteCustomerConfirmDialog
          open={deleteConfirmOpen}
          onClose={() => setDeleteConfirmOpen(false)}
          customer={detail}
          onDeleted={() => {
            setDeleteConfirmOpen(false);
            onClose();
            onUpdated();
          }}
        />
      )}
    </>
  );
}

function StatBox({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone?: "amber";
  icon?: React.ReactNode;
}) {
  const valueClass = tone === "amber" ? "text-[#ffd79a]" : "text-white";
  return (
    <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3">
      <div className="flex items-center gap-1.5">
        {icon}
        <p className="text-[10px] uppercase tracking-wide text-[#8f8f99]">{label}</p>
      </div>
      <p className={`mt-1 garage-mono text-lg font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}

// ─── VOUCHER DIALOG ─────────────────────────────────────────

function VoucherDialog({
  open,
  onClose,
  customer,
}: {
  open: boolean;
  onClose: () => void;
  customer: { id: string; name: string; phone: string };
}) {
  const [voucherType, setVoucherType] = useState<"percent" | "fixed">("percent");
  const [value, setValue] = useState("10");
  const [validDays, setValidDays] = useState("30");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    code: string;
    validUntil: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleIssue = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/customers/${customer.id}/voucher`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: voucherType,
          value: Number(value),
          validDays: Number(validDays),
          reason: reason.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        data?: { code: string; validUntil: string };
        error?: { message?: string };
      };
      if (!res.ok || !data.data) {
        throw new Error(data.error?.message || "Gagal generate voucher");
      }
      setResult(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal generate voucher");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendVoucherWa = () => {
    if (!result) return;
    const valueLabel = voucherType === "fixed"
      ? `Rp ${Number(value).toLocaleString("id-ID")}`
      : `${value}%`;
    const expiry = new Date(result.validUntil).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const message = `Halo ${customer.name.split(/\s+/)[0] || "Kak"}!\n\nTerima kasih sudah jadi customer setia GARAGE. Ini hadiah spesial buat kamu:\n\n🎁 VOUCHER ${valueLabel}\nKode: *${result.code}*\nBerlaku sampai: ${expiry}\n\nTinggal tunjukkan kode ini ke kasir atau ketik saat order online ya!`;
    const url = `https://wa.me/${normalizeWaNumber(customer.phone)}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setTimeout(() => {
            setResult(null);
            setError(null);
          }, 200);
        }
      }}
    >
      <DialogContent className="border-[#34343c] bg-[#111116] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="size-5 text-[#f5a742]" />
            Beri Voucher untuk {customer.name}
          </DialogTitle>
          <DialogDescription>
            Generate kode voucher unik untuk customer ini.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-3">
            {/* Type toggle */}
            <div className="flex rounded-md border border-[#34343c] bg-[#17171c] p-0.5">
              <button
                type="button"
                onClick={() => { setVoucherType("percent"); setValue("10"); }}
                className={`flex-1 rounded py-1.5 text-xs font-medium transition-colors ${
                  voucherType === "percent"
                    ? "bg-[#f5a742] text-black"
                    : "text-[#8f8f99] hover:text-white"
                }`}
              >
                Persen (%)
              </button>
              <button
                type="button"
                onClick={() => { setVoucherType("fixed"); setValue("5000"); }}
                className={`flex-1 rounded py-1.5 text-xs font-medium transition-colors ${
                  voucherType === "fixed"
                    ? "bg-[#f5a742] text-black"
                    : "text-[#8f8f99] hover:text-white"
                }`}
              >
                Nominal (Rp)
              </button>
            </div>

            <div>
              <p className="mb-1 text-xs text-[#b8b8bf]">
                {voucherType === "percent" ? "Potongan voucher (%)" : "Potongan voucher (Rp)"}
              </p>
              {voucherType === "percent" ? (
                <Input
                  type="number"
                  min={5}
                  max={50}
                  step={5}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder="10"
                  className="h-10 border-[#34343c] bg-white/[0.06]"
                />
              ) : (
                <Input
                  type="number"
                  min={1000}
                  step={1000}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder="5000"
                  className="h-10 border-[#34343c] bg-white/[0.06]"
                />
              )}
              <p className="mt-1 text-[10px] text-[#8f8f99]">
                {voucherType === "percent"
                  ? "Batas sehat CRM: 5%-50%, bisa digunakan siapa pun."
                  : "Minimum Rp 1.000."}
              </p>
            </div>

            <div>
              <p className="mb-1 text-xs text-[#b8b8bf]">Berlaku berapa hari?</p>
              <Input
                type="number"
                value={validDays}
                onChange={(event) => setValidDays(event.target.value)}
                placeholder="30"
                className="h-10 border-[#34343c] bg-white/[0.06]"
              />
            </div>

            <div>
              <p className="mb-1 text-xs text-[#b8b8bf]">Alasan (opsional, internal)</p>
              <Input
                type="text"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Birthday gift, customer kecewa, dll"
                className="h-10 border-[#34343c] bg-white/[0.06]"
              />
            </div>

            {error && (
              <p className="text-xs text-[#ffc2c8]">{error}</p>
            )}

            <Button
              type="button"
              className="garage-press h-11 w-full gap-2"
              onClick={() => void handleIssue()}
              disabled={submitting || !value || (voucherType === "percent" ? Number(value) < 5 || Number(value) > 50 : Number(value) < 1000)}
            >
              {submitting ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Gift className="size-4" />
              )}
              Generate Voucher
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border border-[#22c55e]/45 bg-[#22c55e]/12 p-4 text-center">
              <p className="garage-mono text-[10px] uppercase tracking-wide text-[#86efac]">
                Voucher Code
              </p>
              <p className="mt-2 garage-display select-all text-2xl font-bold text-white">
                {result.code}
              </p>
              <div className="mt-2 flex items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="garage-press h-8 border-[#4a4a54] px-2 text-xs"
                  onClick={() => void navigator.clipboard.writeText(result.code)}
                >
                  <Clipboard className="size-3.5" />
                  Copy
                </Button>
              </div>
              <p className="mt-2 text-[10px] text-[#86efac]">
                Berlaku sampai {new Date(result.validUntil).toLocaleDateString("id-ID")}
              </p>
            </div>

            <Button
              type="button"
              className="garage-press h-11 w-full gap-2 bg-[#25d366] text-black hover:bg-[#34e377]"
              onClick={handleSendVoucherWa}
            >
              <MessageCircle className="size-4" />
              Kirim Voucher via WA
            </Button>

            <Button
              type="button"
              variant="outline"
              className="garage-press h-10 w-full border-[#4a4a54]"
              onClick={onClose}
            >
              Tutup
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddMemberModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("member12345");
  const [birthday, setBirthday] = useState("");
  const [memberCode, setMemberCode] = useState("");
  const [cardTier, setCardTier] = useState("Silver");
  const [staffNote, setStaffNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/crm/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, email, password, birthday, memberCode, cardTier, staffNote }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) throw new Error(json.error?.message || "Gagal tambah member.");
      setName("");
      setPhone("");
      setEmail("");
      setPassword("member12345");
      setBirthday("");
      setMemberCode("");
      setCardTier("Silver");
      setStaffNote("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal tambah member.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto border-[#34343c] bg-[#111116] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="size-5 text-[#f5a742]" />
            Add Member Master Pro
          </DialogTitle>
          <DialogDescription>
            Buat akun member aktif dan pilih tier kartu. Ultra hanya diterima saat login sebagai Owner / CEO.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-xs text-[#b8b8bf]">Nama Member</span>
              <Input value={name} onChange={(event) => setName(event.target.value)} className="h-10 border-[#34343c] bg-white/[0.06]" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs text-[#b8b8bf]">Nomor HP</span>
              <Input value={phone} onChange={(event) => setPhone(event.target.value)} className="h-10 border-[#34343c] bg-white/[0.06]" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs text-[#b8b8bf]">Email Opsional</span>
              <Input value={email} onChange={(event) => setEmail(event.target.value)} className="h-10 border-[#34343c] bg-white/[0.06]" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs text-[#b8b8bf]">PIN Sementara</span>
              <Input value={password} onChange={(event) => setPassword(event.target.value)} className="h-10 border-[#34343c] bg-white/[0.06]" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs text-[#b8b8bf]">Member Code</span>
              <Input
                value={memberCode}
                onChange={(event) => setMemberCode(event.target.value.replace(/\s+/g, "").toUpperCase())}
                placeholder="GRG-SLV-KTC-001"
                className="h-10 border-[#34343c] bg-white/[0.06] font-mono uppercase"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs text-[#b8b8bf]">Tanggal Lahir</span>
              <Input type="date" value={birthday} onChange={(event) => setBirthday(event.target.value)} className="h-10 border-[#34343c] bg-white/[0.06]" />
            </label>
          </div>
          <div>
            <p className="mb-2 text-xs text-[#b8b8bf]">Pilih Tier Kartu</p>
            <div className="grid gap-2 sm:grid-cols-4">
              {MEMBER_TIERS.map((tierOption) => (
                <button
                  key={tierOption}
                  type="button"
                  onClick={() => setCardTier(tierOption)}
                  className={`garage-press rounded-md border p-3 text-left transition ${
                    cardTier === tierOption ? "border-[#f5a742] bg-[#f5a742]/14" : "border-[#34343c] bg-white/[0.04] hover:bg-white/[0.07]"
                  }`}
                >
                  <p className="garage-mono text-[10px] text-[#8f8f99]">Tier</p>
                  <p className="mt-1 text-lg font-black text-white">{tierOption}</p>
                  <TierBadge tier={tierOption} />
                </button>
              ))}
            </div>
          </div>
          <label className="grid gap-1.5">
            <span className="text-xs text-[#b8b8bf]">Catatan Staff</span>
            <textarea
              value={staffNote}
              onChange={(event) => setStaffNote(event.target.value)}
              rows={3}
              className="rounded-md border border-[#34343c] bg-white/[0.06] p-3 text-sm text-white"
            />
          </label>
          {error && <p className="text-sm text-[#ffc2c8]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="garage-press border-[#4a4a54]" onClick={onClose} disabled={submitting}>
              Batal
            </Button>
            <Button type="button" className="garage-press gap-2" onClick={() => void handleCreate()} disabled={submitting || !name || !phone || password.length < 6}>
              {submitting ? <RefreshCw className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Simpan Member
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function normalizeWaNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("8")) return `62${digits}`;
  return digits;
}

// ─── TUKAR POIN DIALOG ────────────────────────────────────────

function TukarPoinDialog({
  open,
  onClose,
  customer,
  onRedeemed,
}: {
  open: boolean;
  onClose: () => void;
  customer: CustomerDetail;
  onRedeemed: (result: { pointsRedeemed: number; discountAmount: number; remainingPoints: number }) => void;
}) {
  const POINTS_PER_UNIT = 100;
  const DISCOUNT_PER_UNIT = 10_000;
  const eligibleUnits = Math.floor(customer.points / POINTS_PER_UNIT);
  const maxDiscount = eligibleUnits * DISCOUNT_PER_UNIT;

  const handleRedeem = async () => {
    try {
      const res = await fetch(`/api/crm/customers/${customer.id}/redeem`, { method: "POST" });
      const json = await res.json().catch(() => ({})) as { data?: { pointsRedeemed: number; discountAmount: number; remainingPoints: number }; error?: { message?: string } };
      if (!res.ok || !json.data) throw new Error(json.error?.message || "Gagal tukar poin");
      onRedeemed(json.data);
    } catch (_err) {
      // handled via parent error state
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-[#34343c] bg-[#111116] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="size-5 text-[#22c55e]" />
            Tukar Poin
          </DialogTitle>
          <DialogDescription>
            Konversi poin jadi voucher diskon langsung.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3">
            <p className="text-xs text-[#8f8f99]">Poin tersedia</p>
            <p className="font-mono text-2xl font-black text-[#86efac]">{customer.points.toLocaleString("id-ID")}</p>
          </div>
          <div className="rounded-md border border-[#22c55e]/45 bg-[#22c55e]/12 p-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-[#86efac]">Konversi</p>
            <p className="mt-1 font-mono text-lg font-bold text-white">
              {POINTS_PER_UNIT} poin = {currency.format(DISCOUNT_PER_UNIT)}
            </p>
            <p className="mt-1 text-xs text-[#b8b8bf]">
              {eligibleUnits} unit terpakai &rarr; potensi diskon {currency.format(maxDiscount)}
            </p>
          </div>
          <Button
            type="button"
            className="garage-press h-11 w-full gap-2 bg-[#22c55e] text-black hover:bg-[#34e377]"
            onClick={() => void handleRedeem()}
            disabled={eligibleUnits === 0}
          >
            <Award className="size-4" />
            Tukar Semua Poin
          </Button>
          <Button
            type="button"
            variant="outline"
            className="garage-press h-9 w-full border-[#4a4a54]"
            onClick={onClose}
          >
            Batal
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── DELETE CONFIRM DIALOG ────────────────────────────────────

function DeleteCustomerConfirmDialog({
  open,
  onClose,
  customer,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  customer: CustomerDetail;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/crm/customers/${customer.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(json.error?.message || "Gagal hapus customer");
      }
      onDeleted();
    } catch {
      // Silently handle — parent can show error via state
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="border-[#d11a2a]/45 bg-[#111116]">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-[#ffc2c8]">
            <Trash2 className="size-4" />
            Hapus Customer?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[#d6d6dc]">
            Hapus <span className="font-semibold text-white">{customer.name}</span> ({customer.phone})?
            Order dan histori tidak akan dihapus, tapi customer tidak bisa login lagi.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel className="border-[#4a4a54] bg-transparent text-[#d6d6dc] hover:bg-white/[0.04]">
            Batal
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-[#d11a2a] text-white hover:bg-[#f71a2a]"
            onClick={() => void handleDelete()}
          >
            {deleting ? <RefreshCw className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
            Ya, Hapus
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
