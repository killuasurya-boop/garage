"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Archive,
  Boxes,
  ChevronRight,
  Coffee,
  Eye,
  FlaskConical,
  Info,
  Layers,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Warehouse,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { garageApi } from "@/lib/api-client";
import { currency, type Role } from "@/lib/garage-data";
import type { InventoryItem, MenuItem } from "@/lib/garage-api-types";

type ResearchRow = {
  id: string;
  productId: string | null;
  productName: string;
  tasteNotes: string;
  recipeNotes: string;
  hppNotes: string;
  sellingPriceNotes: string;
  decision: "research" | "revise" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
};

const DECISION_META: Record<
  ResearchRow["decision"],
  { label: string; tone: "ok" | "warn" | "off"; cls: string }
> = {
  research: { label: "Riset", tone: "warn", cls: "border-[#f5a742]/45 bg-[#f5a742]/12 text-[#ffd08a]" },
  revise: { label: "Revisi", tone: "warn", cls: "border-[#60a5fa]/45 bg-[#60a5fa]/12 text-[#bcd7ff]" },
  approved: { label: "Lolos", tone: "ok", cls: "border-[#22c55e]/45 bg-[#22c55e]/12 text-[#86efac]" },
  rejected: { label: "Ditolak", tone: "off", cls: "border-[#ff6b6b]/45 bg-[#ff6b6b]/12 text-[#ffb3b3]" },
};

// =============================================================================
// PRODUK & GUDANG — wajah owner-friendly (FASE 1, UI saja). Membaca data yang
// SUDAH ADA (menuItems/inventoryItems/stockMovements). Tidak mengubah skema,
// POS, atau InventoryView lama. "Mode Lengkap" = render InventoryView existing
// (opname/transfer/audit) lewat prop `fullView`.
// =============================================================================

type ProdukGudangViewProps = {
  role: Role;
  menuItems: MenuItem[];
  inventoryItems: InventoryItem[];
  stockMovements: string[];
  // Tampilan lengkap (InventoryView lama) untuk power-user.
  fullView?: ReactNode;
};

const tab =
  "data-[state=active]:bg-[#d11a2a] data-[state=active]:text-white border border-[#34343c] bg-white/[0.04] text-[#cfcfd6] min-h-9 gap-1.5";

function Helper({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-[#f5a742]/25 bg-[#f5a742]/[0.07] px-3 py-2 text-[13px] leading-snug text-[#e7d6b4]">
      <Info className="mt-0.5 size-4 shrink-0 text-[#f5a742]" />
      <p>{children}</p>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  desc,
  action,
}: {
  icon: typeof Boxes;
  title: string;
  desc: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[#3a3a44] bg-white/[0.02] px-4 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full border border-[#4a4a54] bg-[#1a1a20] text-[#f5a742]">
        <Icon className="size-6" />
      </span>
      <p className="text-base font-bold text-white">{title}</p>
      <p className="max-w-md text-sm text-[#9a9aa4]">{desc}</p>
      {action}
    </div>
  );
}

function StatusPill({ tone, label }: { tone: "ok" | "warn" | "off"; label: string }) {
  const cls =
    tone === "ok"
      ? "border-[#22c55e]/40 bg-[#22c55e]/12 text-[#86efac]"
      : tone === "warn"
        ? "border-[#f5a742]/45 bg-[#f5a742]/12 text-[#ffd08a]"
        : "border-[#4a4a54] bg-white/[0.05] text-[#9a9aa4]";
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${cls}`}>
      {label}
    </span>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-9 shrink-0 rounded-md border px-3 text-xs font-semibold transition ${
        active
          ? "border-[#d11a2a] bg-[#d11a2a] text-white"
          : "border-[#4a4a54] bg-white/[0.05] text-[#cfcfd6] hover:bg-white/[0.1]"
      }`}
    >
      {children}
    </button>
  );
}

function lowestPrice(item: MenuItem) {
  const prices = (item.variants ?? []).map((v) => v.price).filter((p) => p > 0);
  return prices.length ? Math.min(...prices) : 0;
}

export function ProdukGudangView({
  role,
  menuItems,
  inventoryItems,
  stockMovements,
  fullView,
}: ProdukGudangViewProps) {
  const [showFull, setShowFull] = useState(false);

  if (showFull && fullView) {
    return (
      <div className="space-y-3">
        <Button
          type="button"
          variant="outline"
          className="min-h-9 border-[#4a4a54] bg-white/[0.05] text-[#cfcfd6]"
          onClick={() => setShowFull(false)}
        >
          <ChevronRight className="size-4 rotate-180" /> Kembali ke tampilan sederhana
        </Button>
        {fullView}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-black text-white sm:text-2xl">
            <Boxes className="size-6 text-[#f5a742]" /> Produk &amp; Gudang
          </h1>
          <p className="mt-0.5 text-sm text-[#9a9aa4]">
            Kelola menu jualan, bahan baku, resep &amp; HPP, dan stok gudang dalam satu tempat.
          </p>
        </div>
        {fullView ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-9 shrink-0 border-[#4a4a54] bg-white/[0.05] text-[#cfcfd6]"
            onClick={() => setShowFull(true)}
          >
            <SlidersHorizontal className="size-4" /> Mode Lengkap
          </Button>
        ) : null}
      </div>

      <RingkasanCards menuItems={menuItems} inventoryItems={inventoryItems} />

      <Tabs defaultValue="menu" className="w-full">
        <div className="garage-scroll-x -mx-1 overflow-x-auto px-1">
          <TabsList className="flex w-max gap-1.5 bg-transparent p-0">
            <TabsTrigger value="menu" className={tab}>
              <Coffee className="size-4" /> Menu Jualan
            </TabsTrigger>
            <TabsTrigger value="bahan" className={tab}>
              <Boxes className="size-4" /> Bahan Baku
            </TabsTrigger>
            <TabsTrigger value="resep" className={tab}>
              <Layers className="size-4" /> Resep &amp; HPP
            </TabsTrigger>
            <TabsTrigger value="gudang" className={tab}>
              <Warehouse className="size-4" /> Gudang
            </TabsTrigger>
            <TabsTrigger value="riset" className={tab}>
              <FlaskConical className="size-4" /> Riset Menu
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="menu" className="mt-3">
          <MenuTab menuItems={menuItems} onOpenFull={fullView ? () => setShowFull(true) : undefined} />
        </TabsContent>
        <TabsContent value="bahan" className="mt-3">
          <BahanTab inventoryItems={inventoryItems} onOpenFull={fullView ? () => setShowFull(true) : undefined} />
        </TabsContent>
        <TabsContent value="resep" className="mt-3">
          <ResepTab menuItems={menuItems} />
        </TabsContent>
        <TabsContent value="gudang" className="mt-3">
          <GudangTab stockMovements={stockMovements} onOpenFull={fullView ? () => setShowFull(true) : undefined} />
        </TabsContent>
        <TabsContent value="riset" className="mt-3">
          <RisetTab />
        </TabsContent>
      </Tabs>

      <p className="text-center text-[11px] text-[#6f6f78]">
        Peran kamu: {role}. Data masih bisa berubah selama tahap riset.
      </p>
    </div>
  );
}

// ── Ringkasan owner (dihitung dari data, tanpa backend baru) ─────────────────
function RingkasanCards({
  menuItems,
  inventoryItems,
}: {
  menuItems: MenuItem[];
  inventoryItems: InventoryItem[];
}) {
  const menuAktif = menuItems.filter((m) => (m.status ?? "active") === "active").length;
  const menuArsip = menuItems.filter((m) => m.status === "archived").length;
  const bahanRendah = inventoryItems.filter((i) => i.onHand <= i.min).length;
  const bahanTotal = inventoryItems.length;

  // HPP tertinggi + margin terendah dari menu yang punya resep.
  let hppTertinggi = 0;
  let marginTerendah: number | null = null;
  for (const m of menuItems) {
    const hpp = m.recipeCost ?? 0;
    if (hpp > hppTertinggi) hppTertinggi = hpp;
    const price = lowestPrice(m);
    if (price > 0 && hpp > 0) {
      const pct = Math.round(((price - hpp) / price) * 100);
      if (marginTerendah == null || pct < marginTerendah) marginTerendah = pct;
    }
  }

  const cards: Array<{ label: string; value: string; tone: "white" | "good" | "warn" | "risk" | "muted" }> = [
    { label: "Menu Aktif", value: String(menuAktif), tone: "good" },
    { label: "Menu Arsip", value: String(menuArsip), tone: "muted" },
    { label: "Total Bahan", value: String(bahanTotal), tone: "white" },
    { label: "Bahan Stok Rendah", value: String(bahanRendah), tone: bahanRendah > 0 ? "warn" : "good" },
    { label: "HPP Tertinggi (est)", value: hppTertinggi > 0 ? currency.format(hppTertinggi) : "—", tone: "white" },
    {
      label: "Margin Terendah (est)",
      value: marginTerendah != null ? `${marginTerendah}%` : "—",
      tone: marginTerendah == null ? "muted" : marginTerendah >= 60 ? "good" : marginTerendah >= 35 ? "warn" : "risk",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((c) => (
        <SummaryCard key={c.label} label={c.label} value={c.value} tone={c.tone} />
      ))}
    </div>
  );
}

// ── Tab 1: Menu Jualan ──────────────────────────────────────────────────────
function MenuTab({ menuItems, onOpenFull }: { menuItems: MenuItem[]; onOpenFull?: () => void }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("Semua");
  const [stat, setStat] = useState<"Semua" | "active" | "archived">("Semua");
  const [statusOverride, setStatusOverride] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const statusOf = (m: MenuItem) => statusOverride[m.id] ?? m.status ?? "active";

  async function setMenuStatus(id: string, status: "active" | "archived") {
    setBusy(id);
    try {
      await garageApi.patch(`/api/menu/${encodeURIComponent(id)}`, { status });
      setStatusOverride((prev) => ({ ...prev, [id]: status }));
    } catch {
      /* abaikan; user bisa coba lagi */
    } finally {
      setBusy(null);
    }
  }

  const cats = ["Semua", "Coffee", "Non-Coffee", "Makanan", "Cemilan"];
  const needle = q.trim().toLowerCase();
  const filtered = menuItems.filter((m) => {
    if (cat !== "Semua" && m.category !== cat) return false;
    const s = statusOf(m);
    if (stat !== "Semua" && s !== stat) return false;
    if (needle && !`${m.name} ${m.category}`.toLowerCase().includes(needle)) return false;
    return true;
  });

  return (
    <div className="space-y-3">
      <Helper>
        Menu Jualan adalah produk yang dijual ke pelanggan (Coffee, Non-Coffee, Food, Snack). Item
        berstatus <b>Arsip</b> tidak muncul di kasir. HPP &amp; margin di bawah masih <b>estimasi</b>.
      </Helper>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[#7a7a85]" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari menu…"
            className="h-9 border-[#34343c] bg-white/[0.06] pl-8"
          />
        </div>
        <div className="garage-scroll-x flex gap-1.5 overflow-x-auto">
          {cats.map((c) => (
            <FilterChip key={c} active={cat === c} onClick={() => setCat(c)}>
              {c}
            </FilterChip>
          ))}
        </div>
        <div className="flex gap-1.5">
          {(["Semua", "active", "archived"] as const).map((s) => (
            <FilterChip key={s} active={stat === s} onClick={() => setStat(s)}>
              {s === "Semua" ? "Semua status" : s === "active" ? "Aktif" : "Arsip"}
            </FilterChip>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Coffee}
          title="Belum ada menu jualan"
          desc="Tambahkan menu coffee, non coffee, food, atau snack. Menu bisa disimpan sebagai Draft sebelum aktif dijual."
          action={
            onOpenFull ? (
              <Button onClick={onOpenFull} className="min-h-9 bg-[#d11a2a] text-white">
                <PackagePlus className="size-4" /> Tambah Menu
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#2a2a32]">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[#2a2a32] bg-white/[0.03] text-left text-[11px] uppercase tracking-wide text-[#8f8f98]">
                <th className="px-3 py-2 font-semibold">Nama</th>
                <th className="px-3 py-2 font-semibold">Kategori</th>
                <th className="px-3 py-2 text-right font-semibold">Harga jual</th>
                <th className="px-3 py-2 text-right font-semibold">HPP (est)</th>
                <th className="px-3 py-2 text-right font-semibold">Margin (est)</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 text-right font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const price = lowestPrice(m);
                const hpp = m.recipeCost ?? 0;
                const margin = price > 0 && hpp > 0 ? price - hpp : null;
                const marginPct = margin != null && price > 0 ? Math.round((margin / price) * 100) : null;
                const archived = statusOf(m) === "archived";
                const isBusy = busy === m.id;
                return (
                  <tr key={m.id} className="border-b border-[#222228] last:border-0 hover:bg-white/[0.02]">
                    <td className="px-3 py-2 font-semibold text-white">{m.name}</td>
                    <td className="px-3 py-2 text-[#cfcfd6]">{m.category}</td>
                    <td className="px-3 py-2 text-right text-white">
                      {price > 0 ? currency.format(price) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-[#cfcfd6]">
                      {hpp > 0 ? currency.format(hpp) : <span className="text-[#7a7a85]">belum ada resep</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {marginPct != null ? (
                        <span className={marginPct >= 60 ? "text-[#86efac]" : marginPct >= 35 ? "text-[#ffd08a]" : "text-[#ff8f8f]"}>
                          {marginPct}%
                        </span>
                      ) : (
                        <span className="text-[#7a7a85]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill tone={archived ? "off" : "ok"} label={archived ? "Arsip" : "Aktif"} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <ActionBtn title="Kelola di Mode Lengkap" onClick={onOpenFull}>
                          <Eye className="size-4" />
                        </ActionBtn>
                        <ActionBtn title="Edit di Mode Lengkap" onClick={onOpenFull}>
                          <Pencil className="size-4" />
                        </ActionBtn>
                        {archived ? (
                          <ActionBtn
                            title="Aktifkan kembali"
                            onClick={isBusy ? undefined : () => void setMenuStatus(m.id, "active")}
                          >
                            <PackagePlus className="size-4" />
                          </ActionBtn>
                        ) : (
                          <ActionBtn
                            title="Arsipkan menu ini"
                            tone="amber"
                            onClick={isBusy ? undefined : () => void setMenuStatus(m.id, "archived")}
                          >
                            <Archive className="size-4" />
                          </ActionBtn>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab 2: Bahan Baku ───────────────────────────────────────────────────────
function BahanTab({
  inventoryItems,
  onOpenFull,
}: {
  inventoryItems: InventoryItem[];
  onOpenFull?: () => void;
}) {
  const [q, setQ] = useState("");
  const [area, setArea] = useState<string>("Semua");
  const [stageFilter, setStageFilter] = useState<string>("Semua");
  const [stageOverride, setStageOverride] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<Record<string, true>>({});
  const [delErr, setDelErr] = useState<string | null>(null);

  async function remove(sku: string, name: string) {
    if (!window.confirm(`Hapus permanen "${name}"? Hanya bisa kalau bahan belum pernah dipakai.`)) {
      return;
    }
    setBusy(sku);
    try {
      await garageApi.delete(`/api/inventory/${encodeURIComponent(sku)}`);
      setDeleted((prev) => ({ ...prev, [sku]: true }));
      setDelErr(null);
    } catch (e) {
      setDelErr(e instanceof Error ? e.message : "Gagal menghapus bahan.");
    } finally {
      setBusy(null);
    }
  }

  const areaLabel = (a: string) =>
    a === "bar" ? "Bar" : a === "dapur" ? "Dapur" : a === "packaging" ? "Kemasan" : "Umum";
  const areas = ["Semua", "bar", "dapur", "packaging", "general"];
  const stageOf = (i: InventoryItem) => stageOverride[i.sku] ?? i.stage ?? "active";

  async function setStage(sku: string, stage: "active" | "archived" | "draft") {
    setBusy(sku);
    try {
      await garageApi.patch(`/api/inventory/${encodeURIComponent(sku)}`, { stage });
      setStageOverride((prev) => ({ ...prev, [sku]: stage }));
    } catch {
      /* abaikan; biarkan user coba lagi */
    } finally {
      setBusy(null);
    }
  }

  const needle = q.trim().toLowerCase();
  const filtered = inventoryItems.filter((i) => {
    if (deleted[i.sku]) return false;
    if (area !== "Semua" && i.usageArea !== area) return false;
    if (stageFilter !== "Semua" && stageOf(i) !== stageFilter) return false;
    if (needle && !`${i.name} ${i.alternativeName} ${i.category}`.toLowerCase().includes(needle))
      return false;
    return true;
  });

  return (
    <div className="space-y-3">
      <Helper>
        Bahan baku adalah semua barang yang dipakai untuk membuat menu, seperti kopi, susu, gula,
        sirup, nasi, ayam, dan kemasan. Tandai stok yang menipis agar tidak kehabisan.
      </Helper>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[#7a7a85]" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari bahan…"
            className="h-9 border-[#34343c] bg-white/[0.06] pl-8"
          />
        </div>
        <div className="garage-scroll-x flex gap-1.5 overflow-x-auto">
          {areas.map((a) => (
            <FilterChip key={a} active={area === a} onClick={() => setArea(a)}>
              {a === "Semua" ? "Semua area" : areaLabel(a)}
            </FilterChip>
          ))}
        </div>
        <div className="flex gap-1.5">
          {[
            { v: "Semua", l: "Semua" },
            { v: "active", l: "Aktif" },
            { v: "draft", l: "Draft" },
            { v: "archived", l: "Arsip" },
          ].map((s) => (
            <FilterChip key={s.v} active={stageFilter === s.v} onClick={() => setStageFilter(s.v)}>
              {s.l}
            </FilterChip>
          ))}
        </div>
      </div>

      {delErr ? (
        <div className="rounded-md border border-[#ff6b6b]/40 bg-[#ff6b6b]/10 px-3 py-2 text-sm text-[#ffb3b3]">
          {delErr}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Belum ada bahan baku"
          desc="Mulai input bahan seperti kopi, susu, gula, sirup, atau bahan dapur lainnya. Data bisa disimpan sebagai Draft dan diubah nanti."
          action={
            onOpenFull ? (
              <Button onClick={onOpenFull} className="min-h-9 bg-[#d11a2a] text-white">
                <PackagePlus className="size-4" /> Tambah Bahan Baku
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#2a2a32]">
          <table className="w-full min-w-[660px] text-sm">
            <thead>
              <tr className="border-b border-[#2a2a32] bg-white/[0.03] text-left text-[11px] uppercase tracking-wide text-[#8f8f98]">
                <th className="px-3 py-2 font-semibold">Nama bahan</th>
                <th className="px-3 py-2 font-semibold">Area</th>
                <th className="px-3 py-2 font-semibold">Satuan</th>
                <th className="px-3 py-2 text-right font-semibold">Harga beli (est)</th>
                <th className="px-3 py-2 text-right font-semibold">Stok</th>
                <th className="px-3 py-2 text-right font-semibold">Min</th>
                <th className="px-3 py-2 font-semibold">Stok</th>
                <th className="px-3 py-2 font-semibold">Data</th>
                <th className="px-3 py-2 text-right font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => {
                const low = i.onHand <= i.min;
                const stage = stageOf(i);
                const stageTone = stage === "archived" ? "off" : stage === "draft" ? "warn" : "ok";
                const stageLabel = stage === "archived" ? "Arsip" : stage === "draft" ? "Draft" : "Aktif";
                const isBusy = busy === i.sku;
                return (
                  <tr key={i.sku} className="border-b border-[#222228] last:border-0 hover:bg-white/[0.02]">
                    <td className="px-3 py-2 font-semibold text-white">{i.name}</td>
                    <td className="px-3 py-2 text-[#cfcfd6]">{areaLabel(i.usageArea)}</td>
                    <td className="px-3 py-2 text-[#cfcfd6]">{i.unit}</td>
                    <td className="px-3 py-2 text-right text-[#cfcfd6]">
                      {i.unitCost ? currency.format(i.unitCost) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-white">
                      {i.onHand} {i.unit}
                    </td>
                    <td className="px-3 py-2 text-right text-[#9a9aa4]">
                      {i.min} {i.unit}
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill tone={low ? "warn" : "ok"} label={low ? "Stok Rendah" : "Aman"} />
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill tone={stageTone} label={stageLabel} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <ActionBtn title="Stok Masuk (Mode Lengkap)" onClick={onOpenFull}>
                          <PackagePlus className="size-4" />
                        </ActionBtn>
                        <ActionBtn title="Koreksi Stok (Mode Lengkap)" onClick={onOpenFull}>
                          <SlidersHorizontal className="size-4" />
                        </ActionBtn>
                        {stage === "archived" ? (
                          <ActionBtn
                            title="Aktifkan kembali"
                            onClick={isBusy ? undefined : () => void setStage(i.sku, "active")}
                          >
                            <PackagePlus className="size-4" />
                          </ActionBtn>
                        ) : (
                          <ActionBtn
                            title="Arsipkan bahan ini"
                            tone="amber"
                            onClick={isBusy ? undefined : () => void setStage(i.sku, "archived")}
                          >
                            <Archive className="size-4" />
                          </ActionBtn>
                        )}
                        <ActionBtn
                          title="Hapus permanen (hanya jika belum pernah dipakai)"
                          tone="danger"
                          onClick={isBusy ? undefined : () => void remove(i.sku, i.name)}
                        >
                          <Trash2 className="size-4" />
                        </ActionBtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab 3: Resep & HPP ──────────────────────────────────────────────────────
function ResepTab({ menuItems }: { menuItems: MenuItem[] }) {
  const withRecipe = menuItems.filter((m) => (m.recipes?.length ?? 0) > 0);
  const noRecipe = menuItems.filter((m) => (m.recipes?.length ?? 0) === 0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = withRecipe.find((m) => m.id === selectedId) ?? withRecipe[0] ?? null;

  return (
    <div className="space-y-3">
      <Helper>
        Resep dipakai untuk menghitung <b>estimasi HPP</b> (modal per produk). Angka di sini masih
        bisa berubah selama bahan, harga, atau takaran belum final.
      </Helper>

      {withRecipe.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Belum ada resep"
          desc="Buat resep dengan memilih produk lalu menambahkan bahan + takarannya. Sistem akan menghitung estimasi HPP otomatis."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
          {/* Daftar produk ber-resep */}
          <div className="garage-scroll-y max-h-[420px] space-y-1 overflow-y-auto rounded-lg border border-[#2a2a32] p-1.5">
            {withRecipe.map((m) => {
              const active = selected?.id === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedId(m.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition ${
                    active ? "bg-[#d11a2a] text-white" : "text-[#cfcfd6] hover:bg-white/[0.06]"
                  }`}
                >
                  <span className="truncate font-semibold">{m.name}</span>
                  <ChevronRight className="size-4 shrink-0 opacity-60" />
                </button>
              );
            })}
          </div>

          {/* Detail resep + HPP */}
          {selected ? (
            <div className="space-y-3 rounded-lg border border-[#2a2a32] p-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[#8f8f98]">Resep</p>
                  <h3 className="text-lg font-black text-white">{selected.name}</h3>
                </div>
                <span className="rounded-full border border-[#f5a742]/40 bg-[#f5a742]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#ffd08a]">
                  Estimasi — masih bisa berubah
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="border-b border-[#2a2a32] text-left text-[11px] uppercase tracking-wide text-[#8f8f98]">
                      <th className="px-2 py-1.5 font-semibold">Bahan</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Takaran</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Biaya (est)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selected.recipes ?? []).map((r, idx) => (
                      <tr key={`${r.inventorySku}-${idx}`} className="border-b border-[#222228] last:border-0">
                        <td className="px-2 py-1.5 text-white">
                          {r.inventoryName ?? r.inventorySku}
                        </td>
                        <td className="px-2 py-1.5 text-right text-[#cfcfd6]">
                          {r.qty} {r.unit}
                        </td>
                        <td className="px-2 py-1.5 text-right text-[#cfcfd6]">
                          {r.lineCost != null ? currency.format(r.lineCost) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <SummaryCard label="HPP estimasi" value={currency.format(selected.recipeCost ?? 0)} tone="white" />
                <SummaryCard label="Harga jual" value={currency.format(lowestPrice(selected))} tone="white" />
                {(() => {
                  const price = lowestPrice(selected);
                  const hpp = selected.recipeCost ?? 0;
                  const pct = price > 0 && hpp > 0 ? Math.round(((price - hpp) / price) * 100) : null;
                  return (
                    <SummaryCard
                      label="Margin estimasi"
                      value={pct != null ? `${pct}%` : "—"}
                      tone={pct == null ? "muted" : pct >= 60 ? "good" : pct >= 35 ? "warn" : "risk"}
                    />
                  );
                })()}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {noRecipe.length > 0 ? (
        <div className="rounded-lg border border-dashed border-[#3a3a44] bg-white/[0.02] px-3 py-2 text-xs text-[#9a9aa4]">
          <b className="text-[#cfcfd6]">{noRecipe.length} menu</b> belum punya resep — HPP-nya belum bisa
          dihitung. Tambahkan resepnya saat bahan sudah final.
        </div>
      ) : null}
    </div>
  );
}

// ── Tab 4: Gudang ───────────────────────────────────────────────────────────
function GudangTab({
  stockMovements,
  onOpenFull,
}: {
  stockMovements: string[];
  onOpenFull?: () => void;
}) {
  return (
    <div className="space-y-3">
      <Helper>
        Gudang mencatat pergerakan stok: <b>Stok Masuk</b>, <b>Stok Keluar</b>, <b>Koreksi Stok</b>, dan
        <b> Transfer</b>. Gunakan Mode Lengkap untuk input stok masuk, opname, dan transfer antar lokasi.
      </Helper>

      <div className="flex flex-wrap gap-2">
        {[
          { label: "Stok Masuk", icon: PackagePlus },
          { label: "Stok Keluar", icon: Boxes },
          { label: "Koreksi Stok", icon: SlidersHorizontal },
        ].map(({ label, icon: Icon }) => (
          <Button
            key={label}
            type="button"
            variant="outline"
            onClick={onOpenFull}
            className="min-h-9 border-[#4a4a54] bg-white/[0.05] text-[#cfcfd6]"
          >
            <Icon className="size-4" /> {label}
          </Button>
        ))}
      </div>

      {stockMovements.length === 0 ? (
        <EmptyState
          icon={Warehouse}
          title="Belum ada pergerakan stok"
          desc="Setiap stok masuk, keluar, atau koreksi akan tercatat di sini sebagai riwayat."
        />
      ) : (
        <div className="garage-scroll-y max-h-[460px] space-y-1.5 overflow-y-auto rounded-lg border border-[#2a2a32] p-2">
          {stockMovements.map((line, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2 rounded-md border border-[#222228] bg-white/[0.02] px-3 py-2 text-sm text-[#d4d4d8]"
            >
              <Warehouse className="mt-0.5 size-4 shrink-0 text-[#f5a742]" />
              <span className="min-w-0">{line}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab 5: Riset Menu ───────────────────────────────────────────────────────
function RisetTab() {
  const [rows, setRows] = useState<ResearchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    productName: "",
    tasteNotes: "",
    recipeNotes: "",
    hppNotes: "",
    sellingPriceNotes: "",
  });

  async function load() {
    try {
      setRows(await garageApi.get<ResearchRow[]>("/api/produk-gudang/research"));
      setErr(null);
    } catch {
      setErr("Gagal memuat catatan riset.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const data = await garageApi.get<ResearchRow[]>("/api/produk-gudang/research");
        if (alive) {
          setRows(data);
          setErr(null);
        }
      } catch {
        if (alive) setErr("Gagal memuat catatan riset.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function submit() {
    if (!form.productName.trim() || busy) return;
    setBusy(true);
    try {
      await garageApi.post("/api/produk-gudang/research", form);
      setForm({ productName: "", tasteNotes: "", recipeNotes: "", hppNotes: "", sellingPriceNotes: "" });
      setAdding(false);
      await load();
    } catch {
      setErr("Gagal menyimpan catatan riset.");
    } finally {
      setBusy(false);
    }
  }

  async function setDecision(id: string, decision: ResearchRow["decision"]) {
    setBusy(true);
    try {
      await garageApi.patch(`/api/produk-gudang/research/${id}`, { decision });
      await load();
    } catch {
      setErr("Gagal memperbarui keputusan.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Hapus catatan riset ini? Tindakan ini permanen.")) return;
    setBusy(true);
    try {
      await garageApi.delete(`/api/produk-gudang/research/${id}`);
      await load();
    } catch {
      setErr("Gagal menghapus catatan riset.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Helper>
        Riset Menu untuk mencatat produk percobaan: catatan rasa, revisi resep, estimasi HPP &amp;
        harga jual. Tandai keputusan <b>Riset / Revisi / Lolos / Ditolak</b>. Data ini terpisah dari
        menu jualan sampai kamu putuskan diaktifkan.
      </Helper>

      <div className="flex justify-between gap-2">
        <p className="text-sm text-[#9a9aa4]">{rows.length} catatan riset</p>
        <Button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="min-h-9 bg-[#d11a2a] text-white"
        >
          <Plus className="size-4" /> Tambah Riset
        </Button>
      </div>

      {err ? <p className="text-sm text-[#ffb3b3]">{err}</p> : null}

      {adding ? (
        <div className="space-y-2 rounded-lg border border-[#34343c] bg-white/[0.03] p-3">
          <Input
            value={form.productName}
            onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))}
            placeholder="Nama produk percobaan (wajib)"
            className="h-9 border-[#34343c] bg-white/[0.06]"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <textarea
              value={form.tasteNotes}
              onChange={(e) => setForm((f) => ({ ...f, tasteNotes: e.target.value }))}
              placeholder="Catatan rasa…"
              rows={2}
              className="resize-none rounded-md border border-[#34343c] bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-[#7a7a85]"
            />
            <textarea
              value={form.recipeNotes}
              onChange={(e) => setForm((f) => ({ ...f, recipeNotes: e.target.value }))}
              placeholder="Catatan resep / revisi…"
              rows={2}
              className="resize-none rounded-md border border-[#34343c] bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-[#7a7a85]"
            />
            <Input
              value={form.hppNotes}
              onChange={(e) => setForm((f) => ({ ...f, hppNotes: e.target.value }))}
              placeholder="Estimasi HPP (mis. Rp4.500)"
              className="h-9 border-[#34343c] bg-white/[0.06]"
            />
            <Input
              value={form.sellingPriceNotes}
              onChange={(e) => setForm((f) => ({ ...f, sellingPriceNotes: e.target.value }))}
              placeholder="Rencana harga jual (mis. Rp18.000)"
              className="h-9 border-[#34343c] bg-white/[0.06]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAdding(false)}
              className="min-h-9 border-[#4a4a54] bg-white/[0.05] text-[#cfcfd6]"
            >
              Batal
            </Button>
            <Button
              type="button"
              disabled={!form.productName.trim() || busy}
              onClick={() => void submit()}
              className="min-h-9 bg-[#22c55e] text-[#04140a] hover:bg-[#34d77f]"
            >
              Simpan
            </Button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="py-8 text-center text-sm text-[#9a9aa4]">Memuat…</p>
      ) : rows.length === 0 && !adding ? (
        <EmptyState
          icon={FlaskConical}
          title="Belum ada catatan riset"
          desc="Catat produk percobaanmu: rasa, resep, estimasi HPP & harga jual. Tandai keputusan lanjut/revisi/tolak sambil menyempurnakan menu."
          action={
            <Button onClick={() => setAdding(true)} className="min-h-9 bg-[#d11a2a] text-white">
              <Plus className="size-4" /> Tambah Riset
            </Button>
          }
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {rows.map((r) => (
            <div key={r.id} className="space-y-2 rounded-lg border border-[#2a2a32] bg-white/[0.02] p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 break-words font-bold text-white">{r.productName}</p>
                <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${DECISION_META[r.decision].cls}`}>
                  {DECISION_META[r.decision].label}
                </span>
              </div>
              {r.tasteNotes ? <p className="text-xs text-[#cfcfd6]"><b className="text-[#9a9aa4]">Rasa:</b> {r.tasteNotes}</p> : null}
              {r.recipeNotes ? <p className="text-xs text-[#cfcfd6]"><b className="text-[#9a9aa4]">Resep:</b> {r.recipeNotes}</p> : null}
              {(r.hppNotes || r.sellingPriceNotes) ? (
                <p className="text-xs text-[#cfcfd6]">
                  {r.hppNotes ? <span><b className="text-[#9a9aa4]">HPP:</b> {r.hppNotes} </span> : null}
                  {r.sellingPriceNotes ? <span><b className="text-[#9a9aa4]">Jual:</b> {r.sellingPriceNotes}</span> : null}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-1 pt-1">
                {(["research", "revise", "approved", "rejected"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    disabled={busy || r.decision === d}
                    onClick={() => void setDecision(r.id, d)}
                    className={`min-h-8 rounded-md border px-2 text-[11px] font-semibold transition disabled:opacity-50 ${
                      r.decision === d
                        ? DECISION_META[d].cls
                        : "border-[#4a4a54] bg-white/[0.04] text-[#cfcfd6] hover:bg-white/[0.1]"
                    }`}
                  >
                    {DECISION_META[d].label}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(r.id)}
                  title="Hapus catatan"
                  className="ml-auto grid size-8 place-items-center rounded-md border border-[#ff6b6b]/40 text-[#ffb3b3] transition hover:bg-[#ff6b6b]/12 disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────
function ActionBtn({
  title,
  onClick,
  tone,
  children,
}: {
  title: string;
  onClick?: () => void;
  tone?: "amber" | "danger";
  children: ReactNode;
}) {
  const color =
    tone === "amber"
      ? "border-[#f5a742]/40 text-[#ffd08a] hover:bg-[#f5a742]/12"
      : tone === "danger"
        ? "border-[#ff6b6b]/40 text-[#ffb3b3] hover:bg-[#ff6b6b]/12"
        : "border-[#4a4a54] text-[#cfcfd6] hover:bg-white/[0.1]";
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={!onClick}
      className={`grid size-8 place-items-center rounded-md border bg-white/[0.04] transition disabled:opacity-40 ${color}`}
    >
      {children}
    </button>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "white" | "good" | "warn" | "risk" | "muted";
}) {
  const color =
    tone === "good"
      ? "text-[#86efac]"
      : tone === "warn"
        ? "text-[#ffd08a]"
        : tone === "risk"
          ? "text-[#ff8f8f]"
          : tone === "muted"
            ? "text-[#7a7a85]"
            : "text-white";
  return (
    <div className="rounded-md border border-[#2a2a32] bg-white/[0.03] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-[#8f8f98]">{label}</p>
      <p className={`mt-0.5 text-base font-black ${color}`}>{value}</p>
    </div>
  );
}
