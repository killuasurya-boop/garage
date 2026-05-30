"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Award,
  BadgeCheck,
  Cake,
  Delete,
  Gift,
  Layers,
  MessageCircle,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Tag,
  TrendingDown,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type SegmentCustomer = {
  id: string;
  name: string;
  phone: string;
  tier: string;
  reason: string;
};

type SegmentData = {
  label: string;
  description: string;
  customers: SegmentCustomer[];
};

type SegmentsResponse = {
  vip: SegmentData;
  atRisk: SegmentData;
  new: SegmentData;
  voucherReady: SegmentData;
  birthdayWeek: SegmentData;
  stampMission: SegmentData;
  vipExclusive: SegmentData;
  referralReady: SegmentData;
};

const SEGMENT_META: Record<
  keyof SegmentsResponse,
  { icon: LucideIcon; tone: string; bulkTemplate: (name: string) => string }
> = {
  vip: {
    icon: Award,
    tone: "border-[#f5a742]/45 bg-[#f5a742]/10 text-[#ffd79a]",
    bulkTemplate: (name) =>
      `Halo ${name}!\n\nTerima kasih sudah jadi customer VIP GARAGE Coffee & Motor. Sebagai apresiasi, kamu dapat priority service & promo eksklusif.\n\nMampir lagi yuk untuk merasakan menu signature kami yang baru!`,
  },
  atRisk: {
    icon: TrendingDown,
    tone: "border-[#d11a2a]/45 bg-[#d11a2a]/10 text-[#ffc2c8]",
    bulkTemplate: (name) =>
      `Halo ${name}!\n\nKami kangen sama kamu di GARAGE Coffee & Motor 🤗 Sudah lama nggak mampir nih.\n\nKami punya menu baru & promo spesial buat reuni. Yuk balik lagi, kopi favoritmu sudah menunggu!`,
  },
  new: {
    icon: Sparkles,
    tone: "border-[#22c55e]/45 bg-[#22c55e]/10 text-[#86efac]",
    bulkTemplate: (name) =>
      `Halo ${name}!\n\nTerima kasih sudah mampir ke GARAGE Coffee & Motor. Kami senang banget kamu mau coba kami.\n\nNext visit, jangan lupa daftar member untuk dapat poin & promo eksklusif ya! 🎁`,
  },
  voucherReady: {
    icon: Gift,
    tone: "border-[#3b82f6]/45 bg-[#3b82f6]/10 text-[#93c5fd]",
    bulkTemplate: (name) =>
      `Halo ${name}!\n\nPoin GARAGE-mu sudah cukup banget untuk redeem voucher 🎉\n\nMampir yuk dan tukar poin kamu jadi diskon atau menu gratis. Info lengkap di link invoice terakhir.`,
  },
  birthdayWeek: {
    icon: Cake,
    tone: "border-[#ec4899]/45 bg-[#ec4899]/10 text-[#f9a8d4]",
    bulkTemplate: (name) =>
      `Halo ${name}!\n\nHappy birthday week dari GARAGE Coffee & Motor! Kamu dapat birthday reward spesial: voucher Rp25.000 atau free drink pilihan.\n\nTunjukkan pesan ini ke kasir minggu ini ya.`,
  },
  stampMission: {
    icon: BadgeCheck,
    tone: "border-[#a855f7]/45 bg-[#a855f7]/10 text-[#d8b4fe]",
    bulkTemplate: (name) =>
      `Halo ${name}!\n\nStamp mission GARAGE kamu hampir selesai. Sedikit lagi menuju bonus dessert/coffee reward.\n\nMampir lagi yuk, kasir akan bantu cek progresnya.`,
  },
  vipExclusive: {
    icon: Sparkles,
    tone: "border-[#f5a742]/45 bg-[#f5a742]/10 text-[#ffd79a]",
    bulkTemplate: (name) =>
      `Halo ${name}!\n\nSebagai member prioritas GARAGE, kamu dapat akses seasonal drink dan menu rahasia lebih awal.\n\nTanyakan menu VIP ke kasir saat mampir ya.`,
  },
  referralReady: {
    icon: Users,
    tone: "border-[#14b8a6]/45 bg-[#14b8a6]/10 text-[#5eead4]",
    bulkTemplate: (name) =>
      `Halo ${name}!\n\nAjak teman ke GARAGE dan kalian berdua dapat bonus 30 poin setelah transaksi pertama temanmu.\n\nBagikan kode referral kamu dari member app ya.`,
  },
};

export function CrmSegments() {
  const [data, setData] = useState<SegmentsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openSegment, setOpenSegment] = useState<keyof SegmentsResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/crm/segments");
      const json = (await res.json().catch(() => ({}))) as {
        data?: SegmentsResponse;
        error?: { message?: string };
      };
      if (!res.ok || !json.data) {
        throw new Error(json.error?.message || "Gagal memuat segmen");
      }
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat segmen");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
  }, [load]);

  const segments: Array<keyof SegmentsResponse> = [
    "vip",
    "atRisk",
    "new",
    "voucherReady",
    "birthdayWeek",
    "stampMission",
    "vipExclusive",
    "referralReady",
  ];

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="garage-mono text-[11px] uppercase tracking-[0.14em] text-[#f5a742]">
              Smart Segments
            </p>
            <h2 className="mt-1 text-xl font-black text-white">Segmentasi Customer Otomatis</h2>
            <p className="mt-1 text-xs text-[#b8b8bf]">
              Customer dikelompokkan otomatis berdasarkan behavior. Klik kartu untuk lihat list & kirim WA bulk.
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
      </div>

      {error && (
        <div className="rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 p-3 text-sm text-[#ffc2c8]">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center rounded-lg border border-[#34343c] bg-[#111116] py-12 text-sm text-[#8f8f99]">
          <RefreshCw className="mr-2 size-5 animate-spin text-[#f5a742]" />
          Menghitung segmen…
        </div>
      ) : data ? (
        <div className="grid gap-3 md:grid-cols-2">
          {segments.map((key) => {
            const seg = data[key];
            const meta = SEGMENT_META[key];
            const Icon = meta.icon;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setOpenSegment(key)}
                className={`group flex flex-col gap-3 rounded-lg border p-4 text-left transition-all hover:scale-[1.01] hover:shadow-lg ${meta.tone}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-current/30 bg-current/10">
                    <Icon className="size-5 opacity-90" />
                  </div>
                  <div className="text-right">
                    <p className="garage-display text-3xl font-bold leading-none text-white">
                      {seg.customers.length}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-wide opacity-70">
                      customer
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-base font-bold text-white">{seg.label}</p>
                  <p className="mt-1 text-xs leading-relaxed opacity-80">{seg.description}</p>
                </div>
                <div className="mt-auto flex items-center justify-between border-t border-current/20 pt-3">
                  <span className="text-xs font-semibold opacity-90">
                    {seg.customers.length > 0 ? "Lihat list & kirim WA →" : "Kosong"}
                  </span>
                  {seg.customers.length > 0 && (
                    <Users className="size-4 opacity-60 transition-transform group-hover:translate-x-1" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ) : null}

      <SegmentDrilldownModal
        segmentKey={openSegment}
        data={openSegment && data ? data[openSegment] : null}
        onClose={() => setOpenSegment(null)}
      />
    </section>
  );
}

function SegmentDrilldownModal({
  segmentKey,
  data,
  onClose,
}: {
  segmentKey: keyof SegmentsResponse | null;
  data: SegmentData | null;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!segmentKey || !data) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preselect all on open
    setSelected(new Set(data.customers.map((c) => c.id)));
  }, [segmentKey, data]);

  if (!segmentKey || !data) return null;
  const meta = SEGMENT_META[segmentKey];
  const Icon = meta.icon;

  const toggleAll = () => {
    if (selected.size === data.customers.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.customers.map((c) => c.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const logCampaignOpen = (customer: SegmentCustomer, message: string) => {
    fetch("/api/crm/campaign-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: customer.id,
        customerPhone: customer.phone,
        segmentKey,
        templateKey: `${segmentKey}-whatsapp`,
        messagePreview: message,
        status: "opened",
      }),
    }).catch(() => {});
  };

  const handleBulkWa = () => {
    const customers = data.customers.filter((c) => selected.has(c.id));
    if (customers.length === 0) return;
    // Open WA links satu per satu — browser umumnya allow max 1 per click
    // Best UX: open WA template tab pertama, sisanya kasir manual
    if (customers.length === 1) {
      const c = customers[0];
      const firstName = c.name.split(/\s+/)[0] || "Kak";
      const text = meta.bulkTemplate(firstName);
      logCampaignOpen(c, text);
      window.open(
        `https://wa.me/${normalizeWaNumber(c.phone)}?text=${encodeURIComponent(text)}`,
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }
    // Multiple: open first + show notice
    const first = customers[0];
    const firstName = first.name.split(/\s+/)[0] || "Kak";
    const firstText = meta.bulkTemplate(firstName);
    logCampaignOpen(first, firstText);
    window.open(
      `https://wa.me/${normalizeWaNumber(first.phone)}?text=${encodeURIComponent(firstText)}`,
      "_blank",
      "noopener,noreferrer",
    );
    // Sisa nomor disalin ke clipboard sebagai list
    const remaining = customers.slice(1).map((c) => `${c.name} (${c.phone})`).join("\n");
    navigator.clipboard.writeText(remaining).catch(() => {});
    window.alert(
      `WA tab pertama untuk ${first.name} sudah dibuka.\n\n${customers.length - 1} customer berikutnya disalin ke clipboard untuk follow-up manual.`,
    );
  };

  return (
    <Dialog open={Boolean(segmentKey)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-hidden border-[#34343c] bg-[#111116] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={`size-5 ${meta.tone.includes("amber") ? "text-[#ffd79a]" : ""}`} />
            {data.label}
          </DialogTitle>
          <DialogDescription>{data.description}</DialogDescription>
        </DialogHeader>

        {data.customers.length === 0 ? (
          <div className="py-8 text-center text-sm text-[#8f8f99]">
            Tidak ada customer di segmen ini sekarang. Cek lagi nanti.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-[#34343c] pb-2">
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs text-[#f5a742] underline hover:text-[#ffba5a]"
              >
                {selected.size === data.customers.length ? "Unselect semua" : "Select semua"}
              </button>
              <span className="font-mono text-[11px] text-[#8f8f99]">
                {selected.size} / {data.customers.length} dipilih
              </span>
            </div>

            <div className="garage-scroll min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
              {data.customers.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md border border-[#34343c] bg-[#17171c] p-3 transition-colors hover:bg-white/[0.04]"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggleOne(c.id)}
                    className="size-4 accent-[#f5a742]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-white">{c.name}</p>
                    <p className="font-mono text-[10px] text-[#8f8f99]">{c.phone}</p>
                    <p className="mt-0.5 text-[11px] text-[#ffd79a]">{c.reason}</p>
                  </div>
                  <span className="rounded-md border border-[#34343c] px-2 py-0.5 font-mono text-[10px] text-[#d6d6dc]">
                    {c.tier}
                  </span>
                </label>
              ))}
            </div>

            <div className="border-t border-[#34343c] pt-3">
              <Button
                type="button"
                className="garage-press h-11 w-full gap-2 bg-[#25d366] text-black hover:bg-[#34e377]"
                onClick={handleBulkWa}
                disabled={selected.size === 0}
              >
                <MessageCircle className="size-4" />
                Kirim WA ke {selected.size} customer
              </Button>
              <p className="mt-2 text-center text-[10px] text-[#8f8f99]">
                {selected.size > 1
                  ? "Tab WA pertama dibuka otomatis. Sisanya disalin ke clipboard untuk follow-up."
                  : "WA terbuka di tab baru dengan template pre-filled."}
              </p>
            </div>
          </>
        )}
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

// ── Custom Segment Builder ───────────────────────────────────────────────────

type SegmentRuleField =
  | "tier"
  | "totalSpend"
  | "visits"
  | "points"
  | "daysSinceVisit"
  | "hasTag"
  | "hasVoucher"
  | "birthdayThisWeek"
  | "createdAfter"
  | "createdBefore";

type SegmentRuleOp = "equals" | "notEquals" | "gt" | "lt" | "gte" | "lte";

type SegmentRule = {
  field: SegmentRuleField;
  op: SegmentRuleOp;
  value: string | number | boolean;
  logic?: "AND" | "OR";
};

type CustomSegment = {
  id: string;
  name: string;
  rules: SegmentRule[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  customerCount: number;
};

const RULE_FIELDS: { value: SegmentRuleField; label: string }[] = [
  { value: "tier", label: "Tier Membership" },
  { value: "totalSpend", label: "Total Spend (Rp)" },
  { value: "visits", label: "Jumlah Kunjungan" },
  { value: "points", label: "Poin" },
  { value: "daysSinceVisit", label: "Hari Sejak Kunjungan Terakhir" },
  { value: "hasTag", label: "Memiliki Tag" },
  { value: "hasVoucher", label: "Punya Voucher Aktif" },
  { value: "birthdayThisWeek", label: "Ulang Tahun Minggu Ini" },
  { value: "createdAfter", label: "Member Sejak Setelah" },
  { value: "createdBefore", label: "Member Sejak Sebelum" },
];

const FIELD_OPS: Record<SegmentRuleField, { value: SegmentRuleOp; label: string }[]> = {
  tier: [
    { value: "equals", label: "sama dengan" },
    { value: "notEquals", label: "tidak sama dengan" },
  ],
  totalSpend: [
    { value: "gt", label: "lebih besar dari" },
    { value: "gte", label: "lebih besar atau sama" },
    { value: "lt", label: "lebih kecil dari" },
    { value: "lte", label: "lebih kecil atau sama" },
    { value: "equals", label: "sama dengan" },
  ],
  visits: [
    { value: "gt", label: "lebih besar dari" },
    { value: "gte", label: "lebih besar atau sama" },
    { value: "lt", label: "lebih kecil dari" },
    { value: "lte", label: "lebih kecil atau sama" },
    { value: "equals", label: "sama dengan" },
  ],
  points: [
    { value: "gt", label: "lebih besar dari" },
    { value: "gte", label: "lebih besar atau sama" },
    { value: "lt", label: "lebih kecil dari" },
    { value: "lte", label: "lebih kecil atau sama" },
    { value: "equals", label: "sama dengan" },
  ],
  daysSinceVisit: [
    { value: "gt", label: "lebih dari (hari)" },
    { value: "gte", label: "minimal (hari)" },
    { value: "lt", label: "kurang dari (hari)" },
    { value: "lte", label: "maksimal (hari)" },
  ],
  hasTag: [
    { value: "equals", label: "memiliki tag" },
    { value: "notEquals", label: "tidak memiliki tag" },
  ],
  hasVoucher: [
    { value: "equals", label: "ya" },
    { value: "notEquals", label: "tidak" },
  ],
  birthdayThisWeek: [
    { value: "equals", label: "ya" },
    { value: "notEquals", label: "tidak" },
  ],
  createdAfter: [{ value: "gt", label: "setelah tanggal" }],
  createdBefore: [{ value: "lt", label: "sebelum tanggal" }],
};

function makeDefaultValue(field: SegmentRuleField): string | number | boolean {
  if (field === "hasVoucher" || field === "birthdayThisWeek") return true;
  if (field === "tier") return "Gold";
  if (field === "totalSpend" || field === "visits" || field === "points" || field === "daysSinceVisit") return 0;
  return "";
}

function RuleFieldValue({
  field,
  op: _op,
  value,
  onChange,
}: {
  field: SegmentRuleField;
  op: SegmentRuleOp;
  value: string | number | boolean;
  onChange: (v: string | number | boolean) => void;
}) {
  if (field === "tier") {
    return (
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-[#34343c] bg-white/[0.06] px-2 py-1 text-xs text-white"
      >
        {["Silver", "Gold", "Platinum", "Ultra"].map((t) => (
          <option key={t} value={t} className="bg-[#15151b]">{t}</option>
        ))}
      </select>
    );
  }
  if (field === "hasVoucher" || field === "birthdayThisWeek") {
    return (
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value === "true")}
        className="rounded border border-[#34343c] bg-white/[0.06] px-2 py-1 text-xs text-white"
      >
        <option value="true" className="bg-[#15151b]">Ya</option>
        <option value="false" className="bg-[#15151b]">Tidak</option>
      </select>
    );
  }
  if (field === "totalSpend" || field === "visits" || field === "points" || field === "daysSinceVisit") {
    return (
      <input
        type="number"
        value={Number(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-28 rounded border border-[#34343c] bg-white/[0.06] px-2 py-1 text-xs text-white"
        min={0}
      />
    );
  }
  return (
    <input
      type={field === "createdAfter" || field === "createdBefore" ? "date" : "text"}
      value={String(value)}
      onChange={(e) => onChange(e.target.value)}
      className="w-36 rounded border border-[#34343c] bg-white/[0.06] px-2 py-1 text-xs text-white"
    />
  );
}

export function CrmCustomSegments() {
  const [segments, setSegments] = useState<CustomSegment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [segName, setSegName] = useState("");
  const [rules, setRules] = useState<SegmentRule[]>([{ field: "tier", op: "equals", value: "Gold" }]);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadSegments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/crm/segments/custom");
      const json = (await res.json()) as {
        data?: { segments: CustomSegment[] };
        error?: { message?: string };
      };
      if (!res.ok || !json.data) throw new Error(json.error?.message || "Gagal memuat segment");
      setSegments(json.data.segments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat segment");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadSegments();
      void 0;
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadSegments]);

  const handlePreview = async () => {
    if (!rules.length) return;
    setPreviewLoading(true);
    setPreviewCount(null);
    try {
      const params = new URLSearchParams({ action: "preview", rules: JSON.stringify(rules) });
      const res = await fetch(`/api/crm/segments/custom?${params.toString()}`);
      const json = (await res.json()) as { data?: { count: number }; error?: { message?: string } };
      if (!res.ok || !json.data) throw new Error(json.error?.message || "Gagal preview");
      setPreviewCount(json.data.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSave = async () => {
    if (!segName.trim() || !rules.length) return;
    setSaving(true);
    try {
      const res = await fetch("/api/crm/segments/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: segName.trim(), rules }),
      });
      const json = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) throw new Error(json.error?.message || "Gagal simpan segment");
      setBuilderOpen(false);
      setSegName("");
      setRules([{ field: "tier", op: "equals", value: "Gold" }]);
      setPreviewCount(null);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reload list after save
      void loadSegments();
      void window;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal simpan segment");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch("/api/crm/segments/custom", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) throw new Error(json.error?.message || "Gagal hapus segment");
      setSegments((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal hapus segment");
    } finally {
      setDeleting(null);
    }
  };

  const updateRule = (index: number, patch: Partial<SegmentRule>) => {
    setRules((prev) => {
      const next = [...prev];
      const current = next[index];
      const updated = { ...current, ...patch };
      // Reset value & op when field changes
      if (patch.field && patch.field !== current.field) {
        updated.op = FIELD_OPS[patch.field][0].value;
        updated.value = makeDefaultValue(patch.field);
      }
      next[index] = updated;
      return next;
    });
    setPreviewCount(null);
  };

  const addRule = () => {
    setRules((prev) => [...prev, { field: "tier", op: "equals", value: "Gold", logic: "AND" }]);
    setPreviewCount(null);
  };

  const removeRule = (index: number) => {
    setRules((prev) => prev.filter((_, i) => i !== index));
    setPreviewCount(null);
  };

  const openBuilder = () => {
    setSegName("");
    setRules([{ field: "tier", op: "equals", value: "Gold" }]);
    setPreviewCount(null);
    setError(null);
    setBuilderOpen(true);
  };

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="garage-mono text-[11px] uppercase tracking-[0.14em] text-[#a855f7]">
              Custom Segments
            </p>
            <h2 className="mt-1 text-xl font-black text-white">Segment Builder</h2>
            <p className="mt-1 text-xs text-[#b8b8bf]">
              Buat segmen customer dengan kondisi dinamis. Segment tersimpan dan pre-computed.
            </p>
          </div>
          <button
            type="button"
            className="garage-press flex h-10 items-center gap-2 rounded-md border border-[#a855f7]/40 bg-[#a855f7]/10 px-4 text-sm font-semibold text-[#d8b4fe] hover:bg-[#a855f7]/20"
            onClick={openBuilder}
          >
            <Plus className="size-4" />
            Segment Baru
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 p-3 text-sm text-[#ffc2c8]">
          {error}
        </div>
      )}

      {loading && !segments.length ? (
        <div className="flex items-center justify-center rounded-lg border border-[#34343c] bg-[#111116] py-12 text-sm text-[#8f8f99]">
          <RefreshCw className="mr-2 size-5 animate-spin text-[#a855f7]" />
          Memuat segment…
        </div>
      ) : segments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#34343c] bg-[#111116] py-10 text-center text-sm text-[#8f8f99]">
          <Layers className="mx-auto mb-2 size-8 opacity-30" />
          Belum ada custom segment. Klik &ldquo;Segment Baru&rdquo; untuk membuat.
        </div>
      ) : (
        <div className="space-y-2">
          {segments.map((seg) => (
            <div
              key={seg.id}
              className="flex items-center justify-between rounded-lg border border-[#34343c] bg-[#17171c] px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <Tag className="size-4 shrink-0 text-[#a855f7]" />
                <div>
                  <p className="font-semibold text-white">{seg.name}</p>
                  <p className="mt-0.5 text-xs text-[#8f8f99]">
                    {seg.rules.length} rule{seg.rules.length > 1 ? "s" : ""} &middot;{" "}
                    {seg.customerCount} customer
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleDelete(seg.id)}
                disabled={deleting === seg.id}
                className="flex size-8 items-center justify-center rounded-md border border-[#d11a2a]/30 text-[#ffc2c8] transition-colors hover:border-[#d11a2a] hover:bg-[#d11a2a]/10 disabled:opacity-40"
                title="Hapus segment"
              >
                {deleting === seg.id ? (
                  <RefreshCw className="size-3.5 animate-spin" />
                ) : (
                  <Delete className="size-3.5" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Segment Builder Modal */}
      {builderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-[#34343c] bg-[#111116] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#34343c] px-5 py-4">
              <div className="flex items-center gap-2">
                <Layers className="size-5 text-[#a855f7]" />
                <h3 className="font-bold text-white">Segment Builder</h3>
              </div>
              <button
                type="button"
                onClick={() => setBuilderOpen(false)}
                className="text-[#8f8f99] hover:text-white"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              {/* Segment name */}
              <div className="grid gap-1.5">
                <label className="text-xs font-semibold text-[#b8b8bf]">Nama Segment</label>
                <input
                  type="text"
                  value={segName}
                  onChange={(e) => setSegName(e.target.value)}
                  placeholder="Contoh: High Value Gold Customers"
                  className="h-10 rounded-md border border-[#34343c] bg-white/[0.06] px-3 text-sm text-white placeholder:text-[#8f8f99]"
                />
              </div>

              {/* Rules */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-[#b8b8bf]">Kondisi</label>
                {rules.map((rule, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    {idx > 0 && (
                      <select
                        value={rule.logic ?? "AND"}
                        onChange={(e) =>
                          updateRule(idx, { logic: e.target.value as "AND" | "OR" })
                        }
                        className="shrink-0 rounded border border-[#a855f7]/40 bg-[#a855f7]/10 px-2 py-1 text-xs font-semibold text-[#d8b4fe]"
                      >
                        <option value="AND" className="bg-[#15151b]">AND</option>
                        <option value="OR" className="bg-[#15151b]">OR</option>
                      </select>
                    )}
                    <select
                      value={rule.field}
                      onChange={(e) =>
                        updateRule(idx, { field: e.target.value as SegmentRuleField })
                      }
                      className="flex-1 rounded border border-[#34343c] bg-white/[0.06] px-2 py-1.5 text-xs text-white"
                    >
                      {RULE_FIELDS.map((f) => (
                        <option key={f.value} value={f.value} className="bg-[#15151b]">
                          {f.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={rule.op}
                      onChange={(e) => updateRule(idx, { op: e.target.value as SegmentRuleOp })}
                      className="w-44 rounded border border-[#34343c] bg-white/[0.06] px-2 py-1.5 text-xs text-white"
                    >
                      {FIELD_OPS[rule.field].map((o) => (
                        <option key={o.value} value={o.value} className="bg-[#15151b]">
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <RuleFieldValue
                      field={rule.field}
                      op={rule.op}
                      value={rule.value}
                      onChange={(v) => updateRule(idx, { value: v })}
                    />
                    <button
                      type="button"
                      onClick={() => removeRule(idx)}
                      disabled={rules.length === 1}
                      className="flex size-7 shrink-0 items-center justify-center rounded border border-[#d11a2a]/30 text-[#ffc2c8] transition-colors hover:border-[#d11a2a] hover:bg-[#d11a2a]/10 disabled:opacity-30"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addRule}
                  className="flex items-center gap-1.5 text-xs text-[#a855f7] hover:text-[#d8b4fe]"
                >
                  <Plus className="size-3" /> Tambah kondisi
                </button>
              </div>

              {/* Preview */}
              <div className="flex items-center gap-3 rounded-md border border-[#34343c] bg-[#17171c] px-4 py-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="garage-press h-8 border-[#a855f7]/40 text-[#d8b4fe]"
                  onClick={() => void handlePreview()}
                  disabled={previewLoading || !rules.length}
                >
                  {previewLoading ? (
                    <RefreshCw className="mr-1.5 size-3 animate-spin" />
                  ) : (
                    <Users className="mr-1.5 size-3" />
                  )}
                  Preview
                </Button>
                {previewCount !== null && (
                  <span className="text-sm">
                    <span className="font-bold text-[#d8b4fe]">{previewCount}</span>{" "}
                    <span className="text-[#8f8f99]">customer match</span>
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 border-t border-[#34343c] pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-10 border-[#4a4a54] text-white"
                  onClick={() => setBuilderOpen(false)}
                >
                  Batal
                </Button>
                <Button
                  type="button"
                  className="garage-press h-10 gap-2 bg-[#a855f7] text-white hover:bg-[#9333ea]"
                  onClick={() => void handleSave()}
                  disabled={saving || !segName.trim() || !rules.length}
                >
                  {saving ? <RefreshCw className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Simpan Segment
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
