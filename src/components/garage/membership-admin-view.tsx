"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Crown,
  Download,
  Filter,
  History,
  MessageCircle,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  UserPlus,
  WalletCards,
  Wand2,
  X,
} from "lucide-react";

import { PremiumMembershipCard } from "@/components/garage/premium-membership-card";
import type { Customer } from "@/lib/garage-api-types";
import { normalizeMemberLevel, type MemberLevel } from "@/lib/member-types";

const tierOrder: MemberLevel[] = ["Silver", "Gold", "Platinum", "Ultra"];

const tierChipClass: Record<MemberLevel, string> = {
  Silver: "border-white/35 bg-white/[0.08] text-white",
  Gold: "border-[#f5a742]/55 bg-[#f5a742]/14 text-[#ffd79a]",
  Platinum: "border-[#70b8ee]/55 bg-[#70b8ee]/14 text-[#cfe6fa]",
  Ultra: "border-[#9060f0]/60 bg-[#9060f0]/16 text-[#dfd0ff]",
};

const numberFormat = new Intl.NumberFormat("id-ID");

type AddMemberForm = {
  name: string;
  phone: string;
  email: string;
  password: string;
  birthday: string;
  memberCode: string;
  cardTier: MemberLevel;
  staffNote: string;
};

type EditMemberForm = {
  name: string;
  phone: string;
  address: string;
  photoUrl: string;
  memberPassword: string;
  birthday: string;
  memberCode: string;
  cardTier: MemberLevel;
  staffNote: string;
};

type CrmCustomerDetail = Customer & {
  stats?: {
    totalSpend: number;
    annualSpend: number;
    paidOrderCount: number;
    averageTicket: number;
    lastOrderAt: string | null;
    daysSinceVisit: number | null;
  };
  orders?: Array<{
    id: string;
    orderNo: string;
    status: string;
    total: number;
    channel: string;
    createdAt: string;
  }>;
  favoriteItems?: Array<{ name: string; variant: string | null; qty: number }>;
};

type LastCreatedMember = {
  name: string;
  phone: string;
  password: string;
  memberCode: string;
  cardTier: MemberLevel;
} | null;

const emptyAddForm: AddMemberForm = {
  name: "",
  phone: "",
  email: "",
  password: "member12345",
  birthday: "",
  memberCode: "",
  cardTier: "Silver",
  staffNote: "",
};

const tierCode: Record<MemberLevel, string> = {
  Silver: "SLV",
  Gold: "GLD",
  Platinum: "PLT",
  Ultra: "ULT",
};

function generateMemberCode(tier: MemberLevel, count: number) {
  const next = String(count + 1).padStart(3, "0");
  return `GRG-${tierCode[tier]}-KTC-${next}`;
}

function normalizeWa(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("8")) return `62${digits}`;
  return digits;
}

function memberWhatsappUrl(input: {
  name: string;
  phone: string;
  password?: string;
  memberCode?: string | null;
  cardTier?: string | null;
}) {
  const loginUrl =
    typeof window === "undefined"
      ? "/member-login"
      : `${window.location.origin}/member-login`;
  const message = [
    `Halo ${input.name}, akun GARAGE Membership Master Pro kamu sudah aktif.`,
    `Tier: ${input.cardTier ?? "-"}`,
    `Member Code: ${input.memberCode ?? "-"}`,
    `Login: ${input.phone}`,
    input.password ? `PIN sementara: ${input.password}` : null,
    `Portal member: ${loginUrl}`,
  ]
    .filter(Boolean)
    .join("\n");
  return `https://wa.me/${normalizeWa(input.phone)}?text=${encodeURIComponent(message)}`;
}

function membershipStatus(customer: Customer) {
  const flag = customer.flag?.toLowerCase() ?? "";
  if (flag.includes("non") || flag.includes("inact")) return "inactive";
  if (customer.lastOrder && customer.lastOrder !== "-") return "active";
  if (customer.points > 0) return "active";
  return "dormant";
}

const SOON_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function expirationState(customer: Customer): "lifetime" | "expired" | "soon" | "valid" {
  if (!customer.expiresAt) return "lifetime";
  const expiry = new Date(customer.expiresAt).getTime();
  if (Number.isNaN(expiry)) return "lifetime";
  const now = Date.now();
  if (expiry < now) return "expired";
  if (expiry - now < SOON_WINDOW_MS) return "soon";
  return "valid";
}

export function MembershipAdminView({
  customers,
  role,
  onChanged,
}: {
  customers: Customer[];
  role?: string | null;
  onChanged?: () => Promise<void> | void;
}) {
  const [tierFilter, setTierFilter] = useState<MemberLevel | "all">("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "dormant" | "inactive"
  >("all");
  const [expirationFilter, setExpirationFilter] = useState<
    "all" | "expired" | "soon" | "lifetime"
  >("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewSide, setPreviewSide] = useState<"front" | "back">("front");
  // Seleksi massal member untuk export aman (NAV_ACTION_AUDIT §1.7, bulk non-destruktif).
  const [bulkIds, setBulkIds] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<AddMemberForm>(emptyAddForm);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditMemberForm>({
    name: "",
    phone: "",
    address: "",
    photoUrl: "",
    memberPassword: "",
    birthday: "",
    memberCode: "",
    cardTier: "Silver",
    staffNote: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [detail, setDetail] = useState<CrmCustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // Atur poin manual
  const [pointDelta, setPointDelta] = useState("");
  const [pointReason, setPointReason] = useState("");
  const [pointBusy, setPointBusy] = useState(false);
  const [pointMsg, setPointMsg] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [lastCreated, setLastCreated] = useState<LastCreatedMember>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [csvPreview, setCsvPreview] = useState<{ name: string; rows: number; sample: string[] } | null>(null);
  const isOwner = role === "Owner / CEO";
  const canChangeMemberPassword = role === "Owner / CEO" || role === "Admin";
  const canDeleteMember = role === "Owner / CEO" || role === "Admin";
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const enriched = useMemo(
    () =>
      customers
        .filter((customer) => customer.isMember)
        .map((customer) => ({
          ...customer,
          tierLevel: normalizeMemberLevel(customer.cardTier ?? customer.tier),
          status: membershipStatus(customer),
          expiration: expirationState(customer),
          identifier:
            customer.id ??
            customer.memberCode ??
            customer.referralCode ??
            customer.phone,
        })),
    [customers],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((customer) => {
      if (tierFilter !== "all" && customer.tierLevel !== tierFilter) return false;
      if (statusFilter !== "all" && customer.status !== statusFilter) return false;
      if (expirationFilter !== "all" && customer.expiration !== expirationFilter)
        return false;
      if (!q) return true;
      const haystack = `${customer.name} ${customer.phone} ${
        customer.memberCode ?? ""
      } ${customer.referralCode ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [enriched, tierFilter, statusFilter, expirationFilter, search]);

  const counts = useMemo(() => {
    const acc: Record<MemberLevel | "all" | "ultra-candidate", number> = {
      all: enriched.length,
      Silver: 0,
      Gold: 0,
      Platinum: 0,
      Ultra: 0,
      "ultra-candidate": 0,
    };
    enriched.forEach((customer) => {
      acc[customer.tierLevel] += 1;
      if (customer.ultraCandidate) acc["ultra-candidate"] += 1;
    });
    return acc;
  }, [enriched]);

  const selected = useMemo(
    () =>
      filtered.find((customer) => customer.identifier === selectedId) ??
      filtered[0] ??
      null,
    [filtered, selectedId],
  );

  const downloadDisabled = !selected?.id;
  const filtersActive =
    tierFilter !== "all" ||
    statusFilter !== "all" ||
    expirationFilter !== "all" ||
    search.trim().length > 0;

  useEffect(() => {
    if (!selected?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale detail when selection empties
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    fetch(`/api/crm/customers/${selected.id}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Detail member gagal dimuat.");
        const json = (await response.json()) as { data?: CrmCustomerDetail };
        if (!cancelled) setDetail(json.data ?? null);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.id]);

  function resetFilters() {
    setTierFilter("all");
    setStatusFilter("all");
    setExpirationFilter("all");
    setSearch("");
  }

  function updateAddForm<K extends keyof AddMemberForm>(
    key: K,
    value: AddMemberForm[K],
  ) {
    setAddForm((current) => ({ ...current, [key]: value }));
  }

  function updateEditForm<K extends keyof EditMemberForm>(
    key: K,
    value: EditMemberForm[K],
  ) {
    setEditForm((current) => ({ ...current, [key]: value }));
  }

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

  // Export member terpilih ke CSV (aksi massal aman, tanpa ubah data).
  function exportSelectedCsv() {
    const rows = filtered.filter((c) => bulkIds.has(c.identifier));
    if (rows.length === 0) return;
    const head = ["Nama", "Telepon", "Tier", "Poin", "Kunjungan", "Status"];
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const body = rows.map((c) =>
      [c.name, c.phone, c.tierLevel, c.points, c.visits, c.status].map(esc).join(","),
    );
    const csv = [head.map(esc).join(","), ...body].join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `member-terpilih-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openEditMember() {
    if (!selected) return;
    setEditError(null);
    setEditForm({
      name: selected.name,
      phone: selected.phone,
      address: selected.address ?? "",
      photoUrl: selected.photoUrl ?? "",
      memberPassword: "",
      birthday: selected.birthday ?? "",
      memberCode: selected.memberCode ?? selected.referralCode ?? "",
      cardTier: selected.tierLevel,
      staffNote: selected.staffNote ?? "",
    });
    setEditOpen(true);
  }

  async function handleCreateMember() {
    setCreating(true);
    setCreateError(null);
    try {
      const response = await fetch("/api/crm/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      const json = (await response.json().catch(() => ({}))) as {
        data?: { customerId?: string };
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(json.error?.message ?? "Gagal tambah member.");
      }
      const createdSnapshot = { ...addForm };
      setAddForm(emptyAddForm);
      setAddOpen(false);
      setLastCreated({
        name: createdSnapshot.name,
        phone: createdSnapshot.phone,
        password: createdSnapshot.password,
        memberCode: createdSnapshot.memberCode,
        cardTier: createdSnapshot.cardTier,
      });
      if (json.data?.customerId) setSelectedId(json.data.customerId);
      await onChanged?.();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Gagal tambah member.");
    } finally {
      setCreating(false);
    }
  }

  async function handleUltraRequest() {
    if (!selected?.id) return;
    setActionBusy(true);
    try {
      const response = await fetch(`/api/crm/customers/${selected.id}/ultra-request`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Gagal request Ultra.");
      await onChanged?.();
    } finally {
      setActionBusy(false);
    }
  }

  async function handleApproveUltra() {
    if (!selected?.id) return;
    setActionBusy(true);
    try {
      const response = await fetch(`/api/crm/customers/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardTier: "Ultra",
          memberCode:
            selected.memberCode ??
            generateMemberCode("Ultra", counts.Ultra),
          birthday: selected.birthday ?? null,
          staffNote: selected.staffNote ?? "",
        }),
      });
      if (!response.ok) throw new Error("Gagal approve Ultra.");
      await onChanged?.();
    } finally {
      setActionBusy(false);
    }
  }

  function handleBatchExport(format: "pdf" | "png") {
    const ids = filtered.map((customer) => customer.id).filter(Boolean).slice(0, 12);
    ids.forEach((id, index) => {
      window.setTimeout(() => {
        window.open(
          `/api/crm/customers/${id}/card.${format}${format === "png" ? `?side=${previewSide}` : ""}`,
          "_blank",
        );
      }, index * 140);
    });
  }

  async function handleCsvPreview(file: File | null) {
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    setCsvPreview({
      name: file.name,
      rows: Math.max(0, lines.length - 1),
      sample: lines.slice(0, 4),
    });
  }

  async function handleDeleteMember() {
    if (!selected?.id) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/crm/customers/${selected.id}`, {
        method: "DELETE",
      });
      const json = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(json.error?.message ?? "Gagal hapus member.");
      }
      setDeleteOpen(false);
      setSelectedId(null);
      await onChanged?.();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Gagal hapus member.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleSaveEdit() {
    if (!selected?.id) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      const response = await fetch(`/api/crm/customers/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim(),
          phone: editForm.phone.trim(),
          address: editForm.address.trim() || null,
          photoUrl: editForm.photoUrl.trim() || null,
          memberPassword: canChangeMemberPassword
            ? editForm.memberPassword.trim() || undefined
            : undefined,
          birthday: editForm.birthday || null,
          memberCode: editForm.memberCode.trim()
            ? editForm.memberCode.trim().replace(/\s+/g, "").toUpperCase()
            : null,
          cardTier: editForm.cardTier,
          staffNote: editForm.staffNote,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(json.error?.message ?? "Gagal simpan perubahan member.");
      }
      setEditOpen(false);
      await onChanged?.();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Gagal simpan perubahan member.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleAdjustPoints(sign: 1 | -1) {
    if (!selected?.id) return;
    const magnitude = Math.round(Math.abs(Number(pointDelta)));
    if (!magnitude || Number.isNaN(magnitude)) {
      setPointMsg("Isi jumlah poin dulu.");
      return;
    }
    if (!pointReason.trim()) {
      setPointMsg("Alasan wajib diisi.");
      return;
    }
    setPointBusy(true);
    setPointMsg(null);
    try {
      const response = await fetch(`/api/crm/customers/${selected.id}/points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta: sign * magnitude, reason: pointReason.trim() }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        data?: { points: number; delta: number };
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(json.error?.message ?? "Gagal mengatur poin.");
      }
      setPointMsg(
        `Poin ${json.data && json.data.delta >= 0 ? "+" : ""}${json.data?.delta ?? ""} diterapkan. Saldo: ${json.data?.points ?? "-"}.`,
      );
      setPointDelta("");
      setPointReason("");
      await onChanged?.();
    } catch (error) {
      setPointMsg(error instanceof Error ? error.message : "Gagal mengatur poin.");
    } finally {
      setPointBusy(false);
    }
  }

  return (
    <section className="garage-panel min-w-0 overflow-hidden p-0">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 p-4 pb-0 sm:p-6 sm:pb-0">
          <p className="garage-mono">Membership vault</p>
          <h1 className="garage-display text-3xl sm:text-4xl">Kartu &amp; tier control</h1>
          <p className="mt-1 max-w-xl text-sm text-[#d0d0d6]">
            Manage premium membership cards: filter tier, preview kartu 3D real-time, export
            PDF siap cetak. Data sinkron sama CRM & POS lookup.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 p-4 pb-0 text-xs sm:p-6 sm:pb-0">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex h-10 items-center gap-2 border border-[#d11a2a]/55 bg-[#d11a2a]/18 px-4 text-sm font-semibold text-white transition hover:border-[#ff4d5d] hover:bg-[#d11a2a]/28"
          >
            <UserPlus size={15} />
            Add Member
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex h-10 items-center gap-2 border border-white/12 bg-white/[0.04] px-3 text-sm font-semibold text-[#d0d0d6] transition hover:border-[#f5a742]/50 hover:text-white"
          >
            <Upload size={15} />
            Import CSV
          </button>
          <button
            type="button"
            onClick={() => handleBatchExport("pdf")}
            className="inline-flex h-10 items-center gap-2 border border-white/12 bg-white/[0.04] px-3 text-sm font-semibold text-[#d0d0d6] transition hover:border-[#f5a742]/50 hover:text-white"
          >
            <Printer size={15} />
            Batch PDF
          </button>
          <span className="border border-white/15 bg-white/[0.04] px-3 py-1.5 font-mono uppercase tracking-wider text-[#d0d0d6]">
            Total {counts.all}
          </span>
          {tierOrder.map((tier) => (
            <span
              key={tier}
              className={`border px-3 py-1.5 font-mono uppercase tracking-wider ${tierChipClass[tier]}`}
            >
              {tier} {counts[tier]}
            </span>
          ))}
          {counts["ultra-candidate"] > 0 ? (
            <span className="inline-flex items-center gap-1 border border-[#9060f0]/55 bg-[#9060f0]/14 px-3 py-1.5 font-mono uppercase tracking-wider text-[#dfd0ff]">
              <Crown size={11} />
              Ultra candidate {counts["ultra-candidate"]}
            </span>
          ) : null}
        </div>
      </header>

      <div className="mt-6 border-y border-white/8 bg-black/20 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 pr-2 text-xs font-semibold uppercase tracking-[0.24em] text-[#9696a1]">
            <SlidersHorizontal size={14} />
            Filter
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setTierFilter("all")}
              className={`border px-3 py-2 text-xs font-semibold uppercase tracking-wider transition ${
                tierFilter === "all"
                  ? "border-white/45 bg-white/12 text-white"
                  : "border-white/10 bg-white/[0.03] text-[#b8b8bf] hover:border-white/25"
              }`}
            >
              Semua
            </button>
            {tierOrder.map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => setTierFilter(tier)}
                className={`border px-3 py-2 text-xs font-semibold uppercase tracking-wider transition ${
                  tierFilter === tier
                    ? tierChipClass[tier]
                    : "border-white/10 bg-white/[0.03] text-[#b8b8bf] hover:border-white/25"
                }`}
              >
                {tier} {counts[tier]}
              </button>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9696a1]"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari nama / phone / kode"
                className="w-full border border-[#34343c] bg-white/[0.055] py-2.5 pl-9 pr-3 text-sm text-white outline-none transition focus:border-[#f5a742]"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Filter size={14} className="text-[#9696a1]" />
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(
                    event.target.value as "all" | "active" | "dormant" | "inactive",
                  )
                }
                className="border border-[#34343c] bg-white/[0.055] px-3 py-2.5 text-sm text-white outline-none focus:border-[#f5a742]"
              >
                <option value="all">Semua status</option>
                <option value="active">Aktif</option>
                <option value="dormant">Dormant</option>
                <option value="inactive">Nonaktif</option>
              </select>
              <select
                value={expirationFilter}
                onChange={(event) =>
                  setExpirationFilter(
                    event.target.value as "all" | "expired" | "soon" | "lifetime",
                  )
                }
                className="border border-[#34343c] bg-white/[0.055] px-3 py-2.5 text-sm text-white outline-none focus:border-[#f5a742]"
              >
                <option value="all">Semua expiry</option>
                <option value="soon">&lt; 30 hari</option>
                <option value="expired">Expired</option>
                  <option value="lifetime">Lifetime</option>
                </select>
                {filtersActive ? (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="inline-flex items-center gap-1 border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs font-semibold text-[#d0d0d6] hover:border-[#f5a742]/50 hover:text-white"
                  >
                    <X size={13} />
                    Reset
                  </button>
                ) : null}
              </div>
            </div>
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[minmax(0,1.42fr)_minmax(360px,0.88fr)]">
        <div className="min-w-0 p-4 sm:p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="garage-mono">Daftar member</p>
              <p className="text-sm text-[#9696a1]">
                Menampilkan {filtered.length} dari {counts.all} member aktif.
              </p>
            </div>
          </div>

          {/* Bar aksi massal aman — export member terpilih (NAV_ACTION_AUDIT §1.7). */}
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

          <div className="garage-scroll-x max-h-[620px] overflow-auto border border-white/8 bg-black/10">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-[#15151b] text-left">
                <tr className="border-b border-[#34343c] garage-mono">
                  <th className="px-3 py-3 w-9">
                    <input
                      type="checkbox"
                      aria-label="Pilih semua member"
                      className="size-4 cursor-pointer accent-[#d11a2a]"
                      checked={filtered.length > 0 && filtered.every((c) => bulkIds.has(c.identifier))}
                      onChange={() => toggleBulkAll(filtered.map((c) => c.identifier))}
                    />
                  </th>
                  <th className="px-3 py-3">Member</th>
                  <th className="px-3 py-3">Tier</th>
                  <th className="px-3 py-3">Points</th>
                  <th className="px-3 py-3">Visit</th>
                  <th className="px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-12 text-center text-sm text-[#9696a1]"
                    >
                      Tidak ada member yang cocok dengan filter sekarang.
                    </td>
                  </tr>
                ) : (
                  filtered.map((customer) => {
                    const isSelected =
                      (selected?.identifier ?? null) === customer.identifier;
                    return (
                      <tr
                        key={customer.identifier}
                        onClick={() => setSelectedId(customer.identifier)}
                        className={`cursor-pointer border-b border-white/5 transition hover:bg-white/[0.04] ${
                          isSelected ? "bg-[#d11a2a]/12" : ""
                        }`}
                      >
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Pilih ${customer.name}`}
                            className="size-4 cursor-pointer accent-[#d11a2a]"
                            checked={bulkIds.has(customer.identifier)}
                            onChange={() => toggleBulk(customer.identifier)}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-semibold text-white">{customer.name}</div>
                          <div className="text-xs text-[#9696a1]">{customer.phone}</div>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex items-center border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${tierChipClass[customer.tierLevel]}`}
                          >
                            {customer.tierLevel}
                          </span>
                        </td>
                        <td className="px-3 py-3 font-mono tabular-nums text-[#f0f0f5]">
                          {numberFormat.format(customer.points)}
                        </td>
                        <td className="px-3 py-3 font-mono tabular-nums text-[#d0d0d6]">
                          {numberFormat.format(customer.visits)}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex items-center gap-1 text-xs ${
                              customer.status === "active"
                                ? "text-[#86efac]"
                                : customer.status === "dormant"
                                  ? "text-[#fcd34d]"
                                  : "text-[#fca5a5]"
                            }`}
                          >
                            <BadgeCheck size={12} />
                            {customer.status === "active"
                              ? "Aktif"
                              : customer.status === "dormant"
                                ? "Dormant"
                                : "Nonaktif"}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="min-w-0 border border-white/8 bg-white/[0.025] p-4 sm:p-5">
          {selected ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="garage-mono">Preview kartu</p>
                  <h2 className="garage-display truncate text-2xl" title={selected.name}>
                    {selected.name}
                  </h2>
                  <p className="text-xs text-[#9696a1]">{selected.phone}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewSide((side) => (side === "front" ? "back" : "front"))
                    }
                    className="inline-flex items-center gap-1 border border-white/15 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-semibold text-[#d0d0d6] hover:border-[#f5a742]/60 hover:text-white"
                  >
                    <RotateCcw size={12} />
                    <span>Flip</span>
                  </button>
                  {selected.tierLevel === "Ultra" && !isOwner ? (
                    <span
                      title="Member tier Ultra hanya bisa diedit oleh Owner / CEO."
                      className="inline-flex items-center gap-1 border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-semibold text-[#5d5d66]"
                    >
                      <Pencil size={12} />
                      <span>Edit Ultra (Owner)</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={openEditMember}
                      className="inline-flex items-center gap-1 border border-[#f5a742]/35 bg-[#f5a742]/10 px-2.5 py-1.5 text-[11px] font-semibold text-[#ffd79a] hover:border-[#f5a742]/70 hover:text-white"
                    >
                      <Pencil size={12} />
                      <span>Edit</span>
                    </button>
                  )}
                  {canDeleteMember && !(selected.tierLevel === "Ultra" && !isOwner) ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setDeleteOpen(true);
                      }}
                      className="inline-flex items-center gap-1 border border-[#d11a2a]/45 bg-[#d11a2a]/12 px-2.5 py-1.5 text-[11px] font-semibold text-[#ffc2c8] hover:border-[#ff4d5d] hover:text-white"
                    >
                      <Trash2 size={12} />
                      <span>Hapus</span>
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 flex justify-center">
                <PremiumMembershipCard
                  className="w-full max-w-[400px]"
                  side={previewSide}
                  flippable
                  data={{
                    name: selected.name,
                    memberId:
                      selected.memberCode ??
                      selected.referralCode ??
                      selected.id ??
                      selected.phone,
                    phone: selected.phone,
                    address: selected.address ?? null,
                    tier: selected.tierLevel,
                    membershipSince: selected.membershipSince ?? null,
                    validThru:
                      typeof selected.expiresAt === "string" ||
                      selected.expiresAt instanceof Date
                        ? new Date(selected.expiresAt)
                            .toLocaleDateString("id-ID", {
                              month: "short",
                              year: "numeric",
                            })
                            .toUpperCase()
                        : null,
                    photoUrl: selected.photoUrl ?? null,
                  }}
                />
                {selected.expiration === "expired" ? (
                  <p className="mt-3 self-center border border-[#d11a2a]/45 bg-[#d11a2a]/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#ffc2c8]">
                    Expired
                  </p>
                ) : selected.expiration === "soon" ? (
                  <p className="mt-3 self-center border border-[#f5a742]/45 bg-[#f5a742]/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#ffd79a]">
                    Berlaku &lt; 30 hari
                  </p>
                ) : null}
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-3 text-xs">
                <div className="border border-white/8 bg-white/[0.03] p-3">
                  <dt className="garage-mono">Tier</dt>
                  <dd className="mt-1 font-semibold text-white">
                    {selected.tierLevel}
                  </dd>
                </div>
                <div className="border border-white/8 bg-white/[0.03] p-3">
                  <dt className="garage-mono">Points</dt>
                  <dd className="mt-1 font-mono tabular-nums font-semibold text-white">
                    {numberFormat.format(selected.points)}
                  </dd>
                </div>
                <div className="border border-white/8 bg-white/[0.03] p-3">
                  <dt className="garage-mono">Member code</dt>
                  <dd className="mt-1 font-mono text-[12px] text-[#ffd79a]">
                    {selected.memberCode ?? selected.referralCode ?? "-"}
                  </dd>
                </div>
                <div className="border border-white/8 bg-white/[0.03] p-3">
                  <dt className="garage-mono">Bergabung</dt>
                  <dd className="mt-1 text-white">
                    {selected.membershipSince
                      ? new Date(selected.membershipSince).toLocaleDateString("id-ID", {
                          month: "short",
                          year: "numeric",
                        })
                      : "Lifetime"}
                  </dd>
                </div>
              </dl>

              {/* Atur poin manual (kompensasi / koreksi / reward) */}
              <div className="mt-5 rounded-md border border-[#f5a742]/30 bg-[#f5a742]/[0.06] p-3">
                <p className="text-sm font-black text-white">Atur Poin Manual</p>
                <p className="mt-0.5 text-[11px] leading-4 text-[#b8b8bf]">
                  Tambah/kurangi poin member. Tercatat sebagai transaksi &amp; audit.
                </p>
                <div className="mt-3 grid gap-2">
                  <input
                    type="number"
                    min={1}
                    value={pointDelta}
                    onChange={(e) => setPointDelta(e.target.value)}
                    placeholder="Jumlah poin (mis. 50)"
                    className="h-10 w-full rounded-md border border-[#34343c] bg-[#111116] px-3 text-sm text-white outline-none transition focus:border-[#f5a742]"
                  />
                  <input
                    value={pointReason}
                    onChange={(e) => setPointReason(e.target.value)}
                    placeholder="Alasan (wajib): mis. kompensasi pesanan salah"
                    maxLength={240}
                    className="h-10 w-full rounded-md border border-[#34343c] bg-[#111116] px-3 text-sm text-white outline-none transition focus:border-[#f5a742]"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={pointBusy}
                      onClick={() => void handleAdjustPoints(1)}
                      className="garage-press flex h-10 items-center justify-center gap-1 rounded-md bg-[#22c55e] text-xs font-black uppercase tracking-wide text-[#04140a] transition hover:bg-[#34d77f] disabled:opacity-50"
                    >
                      + Tambah
                    </button>
                    <button
                      type="button"
                      disabled={pointBusy}
                      onClick={() => void handleAdjustPoints(-1)}
                      className="garage-press flex h-10 items-center justify-center gap-1 rounded-md bg-[#d11a2a] text-xs font-black uppercase tracking-wide text-white transition hover:bg-[#ff2a3a] disabled:opacity-50"
                    >
                      − Kurangi
                    </button>
                  </div>
                  {pointMsg ? (
                    <p className="text-xs font-semibold text-[#ffd79a]">{pointMsg}</p>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2">
                <a
                  href={
                    selected.id ? `/api/crm/customers/${selected.id}/card.pdf` : undefined
                  }
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={downloadDisabled}
                  className={`inline-flex items-center justify-center gap-1.5 border px-2 py-2.5 text-sm font-semibold transition ${
                    downloadDisabled
                      ? "pointer-events-none border-white/10 text-[#5d5d66]"
                      : "border-[#f5a742]/45 bg-[#f5a742]/12 text-[#ffd79a] hover:border-[#f5a742] hover:text-white"
                  }`}
                >
                  <Download size={14} />
                  <span>PDF</span>
                </a>
                <a
                  href={
                    selected.id
                      ? `/api/crm/customers/${selected.id}/card.png?side=${previewSide}`
                      : undefined
                  }
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={downloadDisabled}
                  className={`inline-flex items-center justify-center gap-1.5 border px-2 py-2.5 text-sm font-semibold transition ${
                    downloadDisabled
                      ? "pointer-events-none border-white/10 text-[#5d5d66]"
                      : "border-white/15 bg-white/[0.04] text-[#d0d0d6] hover:border-[#f5a742]/60 hover:text-white"
                  }`}
                >
                  <span>PNG</span>
                </a>
                <a
                  href={
                    selected.id
                      ? `/api/crm/customers/${selected.id}/card.jpg?side=${previewSide}`
                      : undefined
                  }
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={downloadDisabled}
                  className={`inline-flex items-center justify-center gap-1.5 border px-2 py-2.5 text-sm font-semibold transition ${
                    downloadDisabled
                      ? "pointer-events-none border-white/10 text-[#5d5d66]"
                      : "border-white/15 bg-white/[0.04] text-[#d0d0d6] hover:border-[#f5a742]/60 hover:text-white"
                  }`}
                >
                  <span>JPG</span>
                </a>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <a
                  href={memberWhatsappUrl({
                    name: selected.name,
                    phone: selected.phone,
                    memberCode: selected.memberCode ?? selected.referralCode,
                    cardTier: selected.tierLevel,
                  })}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 border border-[#22c55e]/35 bg-[#22c55e]/10 px-2 py-2.5 text-sm font-semibold text-[#bbf7d0] hover:border-[#22c55e]/70 hover:text-white"
                >
                  <MessageCircle size={14} />
                  WhatsApp
                </a>
                {isOwner && selected.ultraCandidate && selected.tierLevel !== "Ultra" ? (
                  <button
                    type="button"
                    onClick={() => void handleApproveUltra()}
                    disabled={actionBusy}
                    className="inline-flex items-center justify-center gap-1.5 border border-[#9060f0]/45 bg-[#9060f0]/14 px-2 py-2.5 text-sm font-semibold text-[#dfd0ff] hover:border-[#9060f0] hover:text-white disabled:opacity-50"
                  >
                    <Crown size={14} />
                    Approve Ultra
                  </button>
                ) : selected.tierLevel !== "Ultra" ? (
                  <button
                    type="button"
                    onClick={() => void handleUltraRequest()}
                    disabled={actionBusy || Boolean(selected.ultraCandidate)}
                    className="inline-flex items-center justify-center gap-1.5 border border-[#9060f0]/30 bg-[#9060f0]/8 px-2 py-2.5 text-sm font-semibold text-[#dfd0ff] hover:border-[#9060f0]/70 hover:text-white disabled:opacity-50"
                  >
                    <Crown size={14} />
                    {selected.ultraCandidate ? "Ultra Requested" : "Request Ultra"}
                  </button>
                ) : (
                  <span className="inline-flex items-center justify-center gap-1.5 border border-[#9060f0]/45 bg-[#9060f0]/14 px-2 py-2.5 text-sm font-semibold text-[#dfd0ff]">
                    <Crown size={14} />
                    Ultra Active
                  </span>
                )}
              </div>
              {downloadDisabled ? (
                <p className="mt-2 text-[11px] text-[#9696a1]">
                  ID member belum tersedia di response bootstrap. Refresh data atau buka
                  detail dari CRM dulu.
                </p>
              ) : null}
              <div className="mt-5 border-t border-white/10 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="garage-mono">Detail aktivitas</p>
                  {detailLoading ? (
                    <RotateCcw size={13} className="animate-spin text-[#9696a1]" />
                  ) : (
                    <History size={13} className="text-[#9696a1]" />
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="border border-white/8 bg-white/[0.03] p-3">
                    <p className="garage-mono">Total spend</p>
                    <p className="mt-1 font-semibold text-white">
                      Rp {numberFormat.format(detail?.stats?.totalSpend ?? 0)}
                    </p>
                  </div>
                  <div className="border border-white/8 bg-white/[0.03] p-3">
                    <p className="garage-mono">Paid order</p>
                    <p className="mt-1 font-semibold text-white">
                      {numberFormat.format(detail?.stats?.paidOrderCount ?? 0)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 max-h-44 overflow-auto border border-white/8">
                  {(detail?.orders ?? []).length ? (
                    detail?.orders?.slice(0, 6).map((order) => (
                      <div
                        key={order.id}
                        className="flex items-center justify-between gap-3 border-b border-white/5 px-3 py-2 text-xs"
                      >
                        <div>
                          <p className="font-mono text-white">{order.orderNo}</p>
                          <p className="text-[#9696a1]">
                            {new Date(order.createdAt).toLocaleDateString("id-ID")} · {order.status}
                          </p>
                        </div>
                        <p className="font-semibold text-[#ffd79a]">
                          Rp {numberFormat.format(order.total)}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="px-3 py-6 text-center text-xs text-[#9696a1]">
                      Belum ada riwayat order.
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="grid place-items-center py-16 text-center text-sm text-[#9696a1]">
              <WalletCards size={32} className="opacity-60" />
              <p className="mt-3">Pilih member dari tabel untuk preview kartu.</p>
            </div>
          )}
        </aside>
      </div>

      {addOpen ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/72 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[92svh] w-full max-w-3xl overflow-auto border border-white/12 bg-[#111116] shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-[#111116]/95 p-5 backdrop-blur">
              <div>
                <p className="garage-mono">Membership Master Pro</p>
                <h2 className="garage-display text-3xl">Add Member</h2>
                <p className="mt-1 max-w-xl text-sm text-[#9696a1]">
                  Buat akun member aktif, pilih tier kartu, dan siapkan PIN sementara.
                  Ultra hanya bisa dibuat oleh Owner / CEO.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="grid h-9 w-9 place-items-center border border-white/10 bg-white/[0.04] text-[#d0d0d6] hover:border-[#d11a2a]/55 hover:text-white"
                aria-label="Tutup add member"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid gap-5 p-5">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="garage-mono">Nama member</span>
                  <input
                    value={addForm.name}
                    onChange={(event) => updateAddForm("name", event.target.value)}
                    className="h-11 border border-[#34343c] bg-white/[0.055] px-3 text-sm text-white outline-none focus:border-[#f5a742]"
                    placeholder="Nama lengkap"
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="garage-mono">Nomor HP</span>
                  <input
                    value={addForm.phone}
                    onChange={(event) => updateAddForm("phone", event.target.value)}
                    className="h-11 border border-[#34343c] bg-white/[0.055] px-3 text-sm text-white outline-none focus:border-[#f5a742]"
                    placeholder="08..."
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="garage-mono">Email opsional</span>
                  <input
                    value={addForm.email}
                    onChange={(event) => updateAddForm("email", event.target.value)}
                    className="h-11 border border-[#34343c] bg-white/[0.055] px-3 text-sm text-white outline-none focus:border-[#f5a742]"
                    placeholder="member@email.com"
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="garage-mono">PIN sementara</span>
                  <input
                    value={addForm.password}
                    onChange={(event) => updateAddForm("password", event.target.value)}
                    className="h-11 border border-[#34343c] bg-white/[0.055] px-3 text-sm text-white outline-none focus:border-[#f5a742]"
                    placeholder="Minimal 6 karakter"
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="garage-mono">Member code</span>
                  <div className="flex gap-2">
                    <input
                      value={addForm.memberCode}
                      onChange={(event) =>
                        updateAddForm(
                          "memberCode",
                          event.target.value.replace(/\s+/g, "").toUpperCase(),
                        )
                      }
                      className="h-11 min-w-0 flex-1 border border-[#34343c] bg-white/[0.055] px-3 font-mono text-sm uppercase text-white outline-none focus:border-[#f5a742]"
                      placeholder="GRG-SLV-KTC-001"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateAddForm(
                          "memberCode",
                          generateMemberCode(addForm.cardTier, counts[addForm.cardTier]),
                        )
                      }
                      className="inline-flex h-11 items-center gap-1.5 border border-white/12 bg-white/[0.04] px-3 text-xs font-semibold text-[#d0d0d6] hover:border-[#f5a742]/50 hover:text-white"
                    >
                      <Wand2 size={13} />
                      Auto
                    </button>
                  </div>
                </label>
                <label className="grid gap-1.5">
                  <span className="garage-mono">Tanggal lahir</span>
                  <input
                    type="date"
                    value={addForm.birthday}
                    onChange={(event) => updateAddForm("birthday", event.target.value)}
                    className="h-11 border border-[#34343c] bg-white/[0.055] px-3 text-sm text-white outline-none focus:border-[#f5a742]"
                  />
                </label>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="garage-mono">Pilih tier kartu</p>
                  {!isOwner ? (
                    <p className="text-xs text-[#9696a1]">Ultra dikunci untuk Owner / CEO.</p>
                  ) : null}
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {tierOrder.map((tier) => {
                    const ultraLocked = tier === "Ultra" && !isOwner;
                    const selectedTier = addForm.cardTier === tier;
                    return (
                      <button
                        key={tier}
                        type="button"
                        disabled={ultraLocked}
                        onClick={() => {
                          updateAddForm("cardTier", tier);
                          if (!addForm.memberCode.trim()) {
                            updateAddForm("memberCode", generateMemberCode(tier, counts[tier]));
                          }
                        }}
                        className={`min-h-[96px] border p-3 text-left transition ${
                          selectedTier
                            ? "border-[#f5a742] bg-[#f5a742]/14"
                            : "border-white/10 bg-white/[0.035] hover:border-white/25"
                        } ${ultraLocked ? "cursor-not-allowed opacity-45" : ""}`}
                      >
                        <p className="garage-mono text-[10px] text-[#9696a1]">
                          {tier === "Ultra" ? "Owner tier" : "Active tier"}
                        </p>
                        <p className="mt-2 text-xl font-black uppercase tracking-wide text-white">
                          {tier}
                        </p>
                        <span
                          className={`mt-3 inline-flex border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${tierChipClass[tier]}`}
                        >
                          {tier === "Silver"
                            ? "Default"
                            : tier === "Gold"
                              ? "1.2x point"
                              : tier === "Platinum"
                                ? "1.5x point"
                                : "5x · 3 tahun · owner"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="grid gap-1.5">
                <span className="garage-mono">Catatan staff</span>
                <textarea
                  value={addForm.staffNote}
                  onChange={(event) => updateAddForm("staffNote", event.target.value)}
                  rows={3}
                  className="resize-none border border-[#34343c] bg-white/[0.055] p-3 text-sm text-white outline-none focus:border-[#f5a742]"
                  placeholder="Preferensi, asal data, atau catatan membership..."
                />
              </label>

              {createError ? (
                <p className="border border-[#d11a2a]/35 bg-[#d11a2a]/12 px-3 py-2 text-sm text-[#ffc2c8]">
                  {createError}
                </p>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  disabled={creating}
                  className="h-10 border border-white/12 bg-white/[0.03] px-4 text-sm font-semibold text-[#d0d0d6] hover:border-white/25 hover:text-white disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreateMember()}
                  disabled={
                    creating ||
                    addForm.name.trim().length < 2 ||
                    addForm.phone.trim().length < 8 ||
                    addForm.password.length < 6
                  }
                  className="inline-flex h-10 items-center gap-2 border border-[#d11a2a]/55 bg-[#d11a2a]/20 px-4 text-sm font-semibold text-white hover:border-[#ff4d5d] hover:bg-[#d11a2a]/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creating ? (
                    <RotateCcw size={15} className="animate-spin" />
                  ) : (
                    <Plus size={15} />
                  )}
                  Simpan Member
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {lastCreated ? (
        <div className="fixed bottom-5 right-5 z-[75] w-[min(420px,calc(100vw-32px))] border border-[#22c55e]/35 bg-[#102018] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.45)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="garage-mono text-[#bbf7d0]">Member dibuat</p>
              <p className="mt-1 font-semibold text-white">{lastCreated.name}</p>
              <p className="mt-1 text-xs text-[#b8b8bf]">
                {lastCreated.cardTier} · {lastCreated.memberCode || "kode belum diisi"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLastCreated(null)}
              className="text-[#b8b8bf] hover:text-white"
              aria-label="Tutup notifikasi member dibuat"
            >
              <X size={15} />
            </button>
          </div>
          <a
            href={memberWhatsappUrl(lastCreated)}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex w-full items-center justify-center gap-2 border border-[#22c55e]/45 bg-[#22c55e]/12 px-3 py-2 text-sm font-semibold text-[#bbf7d0] hover:border-[#22c55e]/80 hover:text-white"
          >
            <MessageCircle size={15} />
            Kirim Login via WhatsApp
          </a>
        </div>
      ) : null}

      {importOpen ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/72 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-2xl border border-white/12 bg-[#111116] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="garage-mono">CSV Sync</p>
                <h2 className="garage-display text-3xl">Import Member</h2>
                <p className="mt-1 text-sm text-[#9696a1]">
                  Preview CSV aktif sebelum sync replace. Untuk keamanan, tombol apply final
                  disambungkan setelah mapping kolom dikunci.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="grid h-9 w-9 place-items-center border border-white/10 bg-white/[0.04] text-[#d0d0d6] hover:border-[#d11a2a]/55 hover:text-white"
                aria-label="Tutup import CSV"
              >
                <X size={16} />
              </button>
            </div>
            <label className="mt-5 grid cursor-pointer place-items-center border border-dashed border-white/18 bg-white/[0.035] px-4 py-10 text-center hover:border-[#f5a742]/50">
              <Upload className="text-[#f5a742]" size={26} />
              <span className="mt-3 text-sm font-semibold text-white">Pilih file CSV member aktif</span>
              <span className="mt-1 text-xs text-[#9696a1]">Preview nama file, jumlah row, dan contoh header.</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => void handleCsvPreview(event.target.files?.[0] ?? null)}
              />
            </label>
            {csvPreview ? (
              <div className="mt-4 border border-white/10 bg-black/20 p-3">
                <p className="font-semibold text-white">{csvPreview.name}</p>
                <p className="mt-1 text-sm text-[#d0d0d6]">{csvPreview.rows} data row terbaca.</p>
                <pre className="mt-3 max-h-36 overflow-auto whitespace-pre-wrap bg-black/30 p-3 text-xs text-[#b8b8bf]">
                  {csvPreview.sample.join("\n")}
                </pre>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {editOpen && selected ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/72 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[92svh] w-full max-w-2xl overflow-auto border border-white/12 bg-[#111116] shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-[#111116]/95 p-5 backdrop-blur">
              <div>
                <p className="garage-mono">Tier Control</p>
                <h2 className="garage-display text-3xl">Edit Member</h2>
                <p className="mt-1 text-sm text-[#9696a1]">
                  {selected.name} · {selected.phone}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="grid h-9 w-9 place-items-center border border-white/10 bg-white/[0.04] text-[#d0d0d6] hover:border-[#d11a2a]/55 hover:text-white"
                aria-label="Tutup edit member"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid gap-5 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="garage-mono">Nama member</span>
                  <input
                    value={editForm.name}
                    onChange={(event) => updateEditForm("name", event.target.value)}
                    className="h-11 border border-[#34343c] bg-white/[0.055] px-3 text-sm text-white outline-none focus:border-[#f5a742]"
                    placeholder="Nama lengkap"
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="garage-mono">No HP / Login</span>
                  <input
                    value={editForm.phone}
                    onChange={(event) =>
                      updateEditForm("phone", event.target.value.replace(/[^\d+]/g, ""))
                    }
                    className="h-11 border border-[#34343c] bg-white/[0.055] px-3 font-mono text-sm text-white outline-none focus:border-[#f5a742]"
                    placeholder="08xxxxxxxxxx"
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="garage-mono">Member code</span>
                  <div className="flex gap-2">
                    <input
                      value={editForm.memberCode}
                      onChange={(event) =>
                        updateEditForm(
                          "memberCode",
                          event.target.value.replace(/\s+/g, "").toUpperCase(),
                        )
                      }
                      className="h-11 min-w-0 flex-1 border border-[#34343c] bg-white/[0.055] px-3 font-mono text-sm uppercase text-white outline-none focus:border-[#f5a742]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateEditForm(
                          "memberCode",
                          generateMemberCode(editForm.cardTier, counts[editForm.cardTier]),
                        )
                      }
                      className="inline-flex h-11 items-center gap-1.5 border border-white/12 bg-white/[0.04] px-3 text-xs font-semibold text-[#d0d0d6] hover:border-[#f5a742]/50 hover:text-white"
                    >
                      <Wand2 size={13} />
                      Auto
                    </button>
                  </div>
                </label>
                <label className="grid gap-1.5">
                  <span className="garage-mono">Tanggal lahir</span>
                  <input
                    type="date"
                    value={editForm.birthday}
                    onChange={(event) => updateEditForm("birthday", event.target.value)}
                    className="h-11 border border-[#34343c] bg-white/[0.055] px-3 text-sm text-white outline-none focus:border-[#f5a742]"
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="garage-mono">Alamat</span>
                  <textarea
                    value={editForm.address}
                    onChange={(event) => updateEditForm("address", event.target.value)}
                    rows={3}
                    className="resize-none border border-[#34343c] bg-white/[0.055] p-3 text-sm text-white outline-none focus:border-[#f5a742]"
                    placeholder="Alamat member"
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="garage-mono">Foto URL</span>
                  <input
                    value={editForm.photoUrl}
                    onChange={(event) => updateEditForm("photoUrl", event.target.value)}
                    className="h-11 border border-[#34343c] bg-white/[0.055] px-3 text-sm text-white outline-none focus:border-[#f5a742]"
                    placeholder="/uploads/member.jpg atau https://..."
                  />
                  <span className="text-xs text-[#9696a1]">
                    Dipakai untuk avatar/member card kalau tersedia.
                  </span>
                </label>
              </div>

              {canChangeMemberPassword ? (
                <div className="border border-[#f5a742]/30 bg-[#f5a742]/10 p-3">
                  <label className="grid gap-1.5">
                    <span className="garage-mono">Rubah password member</span>
                    <input
                      type="password"
                      value={editForm.memberPassword}
                      onChange={(event) =>
                        updateEditForm("memberPassword", event.target.value)
                      }
                      className="h-11 border border-[#34343c] bg-black/25 px-3 text-sm text-white outline-none focus:border-[#f5a742]"
                      placeholder="Kosongkan jika tidak ingin mengganti"
                      autoComplete="new-password"
                    />
                    <span className="text-xs text-[#d0d0d6]">
                      Khusus Admin dan Owner. Minimal 8 karakter jika diisi.
                    </span>
                  </label>
                </div>
              ) : null}

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="garage-mono">Tier member</p>
                  {!isOwner ? (
                    <p className="text-xs text-[#9696a1]">Ultra hanya Owner / CEO.</p>
                  ) : null}
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {tierOrder.map((tier) => {
                    const ultraLocked = tier === "Ultra" && !isOwner;
                    const active = editForm.cardTier === tier;
                    return (
                      <button
                        key={tier}
                        type="button"
                        disabled={ultraLocked}
                        onClick={() => updateEditForm("cardTier", tier)}
                        className={`border p-3 text-left transition ${
                          active
                            ? "border-[#f5a742] bg-[#f5a742]/14"
                            : "border-white/10 bg-white/[0.035] hover:border-white/25"
                        } ${ultraLocked ? "cursor-not-allowed opacity-45" : ""}`}
                      >
                        <p className="garage-mono text-[10px] text-[#9696a1]">Tier</p>
                        <p className="mt-2 text-xl font-black uppercase tracking-wide text-white">
                          {tier}
                        </p>
                        <span
                          className={`mt-3 inline-flex border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${tierChipClass[tier]}`}
                        >
                          {tier === "Ultra" ? "Owner approval" : "CRM write"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="grid gap-1.5">
                <span className="garage-mono">Catatan staff</span>
                <textarea
                  value={editForm.staffNote}
                  onChange={(event) => updateEditForm("staffNote", event.target.value)}
                  rows={3}
                  className="resize-none border border-[#34343c] bg-white/[0.055] p-3 text-sm text-white outline-none focus:border-[#f5a742]"
                />
              </label>

              {editError ? (
                <p className="border border-[#d11a2a]/35 bg-[#d11a2a]/12 px-3 py-2 text-sm text-[#ffc2c8]">
                  {editError}
                </p>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  disabled={savingEdit}
                  className="h-10 border border-white/12 bg-white/[0.03] px-4 text-sm font-semibold text-[#d0d0d6] hover:border-white/25 hover:text-white disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveEdit()}
                  disabled={savingEdit || !selected.id}
                  className="inline-flex h-10 items-center gap-2 border border-[#f5a742]/50 bg-[#f5a742]/14 px-4 text-sm font-semibold text-[#ffd79a] hover:border-[#f5a742] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingEdit ? (
                    <RotateCcw size={15} className="animate-spin" />
                  ) : (
                    <Pencil size={15} />
                  )}
                  Simpan Perubahan
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {deleteOpen && selected ? (
        <div className="fixed inset-0 z-[85] grid place-items-center bg-black/72 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-md border border-[#d11a2a]/40 bg-[#111116] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="garage-mono text-[#ffc2c8]">Hapus member</p>
                <h2 className="garage-display text-2xl">Konfirmasi hapus</h2>
              </div>
              <button
                type="button"
                onClick={() => (deleting ? null : setDeleteOpen(false))}
                disabled={deleting}
                className="grid h-9 w-9 place-items-center border border-white/10 bg-white/[0.04] text-[#d0d0d6] hover:border-[#d11a2a]/55 hover:text-white disabled:opacity-50"
                aria-label="Tutup konfirmasi hapus"
              >
                <X size={16} />
              </button>
            </div>
            <p className="mt-4 text-sm text-[#d0d0d6]">
              Yakin hapus <span className="font-semibold text-white">{selected.name}</span>
              {" "}({selected.phone})? Aksi ini permanen — akun member, sesi login, dan
              riwayat point member akan dihapus. Order historis akan tetap ada tapi tanpa
              tautan ke member.
            </p>
            {deleteError ? (
              <p className="mt-3 border border-[#d11a2a]/35 bg-[#d11a2a]/12 px-3 py-2 text-sm text-[#ffc2c8]">
                {deleteError}
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                disabled={deleting}
                className="h-10 border border-white/12 bg-white/[0.03] px-4 text-sm font-semibold text-[#d0d0d6] hover:border-white/25 hover:text-white disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteMember()}
                disabled={deleting}
                className="inline-flex h-10 items-center gap-2 border border-[#d11a2a]/55 bg-[#d11a2a]/22 px-4 text-sm font-semibold text-white hover:border-[#ff4d5d] hover:bg-[#d11a2a]/32 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? (
                  <RotateCcw size={15} className="animate-spin" />
                ) : (
                  <Trash2 size={15} />
                )}
                Hapus Member
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
