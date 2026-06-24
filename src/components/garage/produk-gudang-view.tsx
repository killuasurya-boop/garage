"use client";

import { useState, type ReactNode } from "react";
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
  Search,
  SlidersHorizontal,
  Warehouse,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { currency, type Role } from "@/lib/garage-data";
import type { InventoryItem, MenuItem } from "@/lib/garage-api-types";

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

// ── Tab 1: Menu Jualan ──────────────────────────────────────────────────────
function MenuTab({ menuItems, onOpenFull }: { menuItems: MenuItem[]; onOpenFull?: () => void }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("Semua");
  const [stat, setStat] = useState<"Semua" | "active" | "archived">("Semua");

  const cats = ["Semua", "Coffee", "Non-Coffee", "Makanan", "Cemilan"];
  const needle = q.trim().toLowerCase();
  const filtered = menuItems.filter((m) => {
    if (cat !== "Semua" && m.category !== cat) return false;
    const s = m.status ?? "active";
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
                const archived = (m.status ?? "active") === "archived";
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
                        <ActionBtn title="Arsipkan di Mode Lengkap" tone="amber" onClick={onOpenFull}>
                          <Archive className="size-4" />
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

  const areaLabel = (a: string) =>
    a === "bar" ? "Bar" : a === "dapur" ? "Dapur" : a === "packaging" ? "Kemasan" : "Umum";
  const areas = ["Semua", "bar", "dapur", "packaging", "general"];

  const needle = q.trim().toLowerCase();
  const filtered = inventoryItems.filter((i) => {
    if (area !== "Semua" && i.usageArea !== area) return false;
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
      </div>

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
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 text-right font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => {
                const low = i.onHand <= i.min;
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
                      <div className="flex justify-end gap-1">
                        <ActionBtn title="Stok Masuk (Mode Lengkap)" onClick={onOpenFull}>
                          <PackagePlus className="size-4" />
                        </ActionBtn>
                        <ActionBtn title="Koreksi Stok (Mode Lengkap)" onClick={onOpenFull}>
                          <SlidersHorizontal className="size-4" />
                        </ActionBtn>
                        <ActionBtn title="Arsipkan (Mode Lengkap)" tone="amber" onClick={onOpenFull}>
                          <Archive className="size-4" />
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
  return (
    <EmptyState
      icon={FlaskConical}
      title="Riset Menu — segera hadir"
      desc="Nanti owner bisa mencatat produk percobaan, catatan rasa, catatan revisi resep, estimasi HPP & harga jual, lalu menandai keputusan: Lanjut, Revisi, atau Tolak. Fitur ini menyusul setelah bahan baku mulai final."
    />
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
  tone?: "amber";
  children: ReactNode;
}) {
  const color =
    tone === "amber"
      ? "border-[#f5a742]/40 text-[#ffd08a] hover:bg-[#f5a742]/12"
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
