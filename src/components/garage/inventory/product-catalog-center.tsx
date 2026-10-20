"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  FolderPlus,
  Loader2,
  Pencil,
  RefreshCw,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { garageApi } from "@/lib/api-client";
import { currency } from "@/lib/garage-data";
import { catalogQueryToSearch } from "@/lib/product-catalog-query";
import {
  HPP_STATUS_LABEL,
  PRODUCT_EXPORT_TYPES,
  PRODUCT_ISSUE_LABEL,
  PRODUCT_TYPE_LABEL,
  productExportFileName,
  type CatalogBulkAction,
  type CatalogKpiKey,
  type CatalogKpis,
  type CatalogQuery,
  type CatalogRow,
  type CatalogSortKey,
  type ProductCategoryRow,
  type ProductExportType,
  type ProductIssue,
  type ProductType,
} from "@/lib/product-catalog-types";
import { downloadReportFile } from "@/lib/report-download-client";

type CatalogResponse = {
  rows: CatalogRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  kpis: CatalogKpis;
  categories: ProductCategoryRow[];
  range: { from: string; to: string };
};

// KPI → filter katalog yang dibuka saat kartu diklik.
const KPI_CARDS: Array<{ key: CatalogKpiKey; label: string; tone: "neutral" | "good" | "warn" | "bad"; filter: CatalogQuery | "categories" }> = [
  { key: "total", label: "Total produk", tone: "neutral", filter: { status: "all" } },
  { key: "active", label: "Aktif", tone: "good", filter: { status: "active" } },
  { key: "archived", label: "Nonaktif / arsip", tone: "neutral", filter: { status: "archived" } },
  { key: "categories", label: "Kategori aktif", tone: "neutral", filter: "categories" },
  { key: "ready", label: "Stok ready", tone: "good", filter: { status: "active", stock: "ready" } },
  { key: "limited", label: "Stok menipis (limited)", tone: "warn", filter: { status: "active", stock: "limited" } },
  { key: "soldOut", label: "Habis", tone: "bad", filter: { status: "active", stock: "sold_out" } },
  { key: "menu", label: "Menu siap jual", tone: "neutral", filter: { status: "all", productType: "menu" } },
  { key: "retail", label: "Produk retail", tone: "neutral", filter: { status: "all", productType: "retail" } },
  { key: "variants", label: "Total varian", tone: "neutral", filter: { status: "all" } },
  { key: "noSku", label: "Tanpa SKU", tone: "warn", filter: { status: "active", issue: "no_sku" } },
  { key: "noBarcode", label: "Retail tanpa barcode", tone: "warn", filter: { status: "active", issue: "no_barcode" } },
  { key: "noPrice", label: "Tanpa harga jual", tone: "bad", filter: { status: "active", issue: "no_price" } },
  { key: "hppIncomplete", label: "HPP belum lengkap", tone: "warn", filter: { status: "active", hpp: "incomplete" } },
  { key: "incomplete", label: "Data belum lengkap", tone: "warn", filter: { status: "active", issue: "any" } },
];

const TONE_CLASS: Record<"neutral" | "good" | "warn" | "bad", string> = {
  neutral: "text-white",
  good: "text-[#bbf7d0]",
  warn: "text-[#ffd08a]",
  bad: "text-[#fca5a5]",
};

const STOCK_LABEL: Record<CatalogRow["stock"], string> = { ready: "Ready", limited: "Limited", sold_out: "Habis" };
const STOCK_CLASS: Record<CatalogRow["stock"], string> = {
  ready: "border-[#22c55e]/45 bg-[#22c55e]/12 text-[#bbf7d0]",
  limited: "border-[#f5a742]/45 bg-[#f5a742]/12 text-[#ffd08a]",
  sold_out: "border-[#d11a2a]/50 bg-[#d11a2a]/15 text-[#fecaca]",
};
const HPP_CLASS: Record<CatalogRow["hppStatus"], string> = {
  complete: "text-[#bbf7d0]",
  unverified: "text-[#ffd08a]",
  partial: "text-[#ffd08a]",
  missing: "text-[#fca5a5]",
};

const DEFAULT_QUERY: CatalogQuery = { status: "active", sort: "category", dir: "asc", page: 1, pageSize: 25 };
const fieldClass = "h-9 border-[#34343c] bg-black/25 text-xs";

const SORT_COLUMNS: Array<{ key: CatalogSortKey; label: string; align?: "right" }> = [
  { key: "name", label: "Produk" },
  { key: "category", label: "Kategori" },
  { key: "sku", label: "SKU / barcode" },
  { key: "price", label: "Harga jual", align: "right" },
  { key: "cost", label: "HPP / modal", align: "right" },
  { key: "margin", label: "Margin", align: "right" },
  { key: "salesQty", label: "Terjual", align: "right" },
];

export function ProductCatalogCenter({
  refreshKey,
  onEditProduct,
  onChanged,
  onOpenCategories,
  focusCategoryId,
}: {
  /** Naikkan untuk memuat ulang (mis. setelah produk disimpan). */
  refreshKey: number;
  onEditProduct: (productId: string) => void;
  onChanged: () => Promise<void> | void;
  onOpenCategories: () => void;
  /** Dibuka dari Manajemen Kategori "lihat di katalog". */
  focusCategoryId?: string | null;
}) {
  const [query, setQuery] = useState<CatalogQuery>(DEFAULT_QUERY);
  const [search, setSearch] = useState("");
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<CatalogBulkAction | "">("");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [exportType, setExportType] = useState<ProductExportType>("master");
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);

  // Kategori dari Manajemen Kategori → filter katalog.
  useEffect(() => {
    if (!focusCategoryId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sinkron filter dari aksi luar
    setQuery((current) => ({ ...current, categoryId: focusCategoryId, status: "all", page: 1 }));
  }, [focusCategoryId]);

  // Debounce pencarian supaya tidak memanggil API tiap ketikan.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setQuery((current) => (current.q === (search.trim() || undefined) ? current : { ...current, q: search.trim() || undefined, page: 1 }));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await garageApi.get<CatalogResponse>(`/api/products/catalog?${catalogQueryToSearch(query)}`, { cache: "no-store" });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Katalog produk gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch katalog saat filter/refreshKey berubah
    void load();
  }, [load, refreshKey]);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const categories = data?.categories ?? [];
  const pageIds = rows.map((row) => row.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  function patchQuery(patch: Partial<CatalogQuery>) {
    setQuery((current) => ({ ...current, ...patch, page: patch.page ?? 1 }));
  }

  function applyKpi(card: (typeof KPI_CARDS)[number]) {
    if (card.filter === "categories") {
      onOpenCategories();
      return;
    }
    setSearch("");
    setQuery({ ...DEFAULT_QUERY, ...card.filter, sort: query.sort, dir: query.dir, pageSize: query.pageSize });
  }

  function toggleSort(key: CatalogSortKey) {
    setQuery((current) => ({
      ...current,
      sort: key,
      dir: current.sort === key && current.dir === "asc" ? "desc" : key === "salesQty" || key === "margin" ? "desc" : "asc",
      page: 1,
    }));
  }

  function toggleRow(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage() {
    setSelected((current) => {
      const next = new Set(current);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function runBulk() {
    if (!bulkAction || !selected.size) return;
    const needsValue = bulkAction === "stock" || bulkAction === "digital" || bulkAction === "move_category" || bulkAction === "product_type";
    if (needsValue && !bulkValue) {
      setError("Pilih nilai untuk aksi massal.");
      return;
    }
    if (bulkAction === "archive" && !window.confirm(`Nonaktifkan ${selected.size} produk? Produk hilang dari POS & menu digital; riwayat transaksi tetap utuh.`)) {
      return;
    }
    setBulkBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await garageApi.post<{ updated: number }>("/api/products/bulk", {
        ids: [...selected],
        action: bulkAction,
        value: needsValue ? bulkValue : null,
      });
      setNotice(`${result.updated} produk diperbarui (dicatat di audit trail).`);
      setSelected(new Set());
      setBulkAction("");
      setBulkValue("");
      await onChanged();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aksi massal gagal.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function runExport(format: "xlsx" | "pdf") {
    setExporting(format);
    setError(null);
    setNotice(null);
    try {
      // Ekspor memakai filter yang sama, tanpa pagination (seluruh baris sesuai filter).
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { page, pageSize, ...filters } = query;
      const params = catalogQueryToSearch({ ...filters, ...(data?.range && !filters.from ? data.range : {}) });
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
      const result = await downloadReportFile(
        `/api/products/export?type=${exportType}&format=${format}&${params}`,
        productExportFileName(exportType, today, format),
      );
      setNotice(`${result.filename} berhasil diunduh.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ekspor gagal.");
    } finally {
      setExporting(null);
    }
  }

  const activeFilterCount = [
    query.q,
    query.categoryId,
    query.productType,
    query.stock,
    query.hpp,
    query.issue,
    query.digital,
    query.status !== "active" ? query.status : undefined,
  ].filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* KPI — semua dari database, klik = buka daftar terkait */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {KPI_CARDS.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => applyKpi(card)}
            className="garage-press rounded-md border border-[#3f3f48] bg-white/[0.05] p-2.5 text-left transition hover:border-[#f5a742]/55 hover:bg-white/[0.08]"
          >
            <p className="text-[11px] font-semibold leading-4 text-[#c4c4cc]">{card.label}</p>
            <p className={`mt-1 font-mono text-xl font-black ${TONE_CLASS[card.tone]}`}>
              {data ? new Intl.NumberFormat("id-ID").format(data.kpis[card.key]) : "—"}
            </p>
          </button>
        ))}
      </div>

      {/* Toolbar: kategori & ekspor */}
      <div className="flex flex-col gap-2 rounded-md border border-[#34343c] bg-white/[0.03] p-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button type="button" className="garage-press h-9 gap-1.5 bg-[#d11a2a] px-3 text-xs text-white hover:bg-[#b91524]" onClick={onOpenCategories}>
            <FolderPlus className="size-4" />
            Kategori
          </Button>
          <Button type="button" variant="outline" className="h-9 gap-1.5 border-[#34343c] bg-white/[0.04] px-3 text-xs" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Muat ulang
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Download className="size-4 text-[#ffd08a]" aria-hidden />
          <Select value={exportType} onValueChange={(v) => setExportType(v as ProductExportType)}>
            <SelectTrigger className={`${fieldClass} w-[230px]`} aria-label="Jenis ekspor"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRODUCT_EXPORT_TYPES.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>{entry.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" className="h-9 gap-1.5 border-[#22c55e]/45 bg-[#22c55e]/10 px-3 text-xs text-[#bbf7d0]" onClick={() => void runExport("xlsx")} disabled={exporting !== null}>
            {exporting === "xlsx" ? <Loader2 className="size-3.5 animate-spin" /> : <FileSpreadsheet className="size-3.5" />}
            Excel
          </Button>
          <Button type="button" variant="outline" className="h-9 gap-1.5 border-[#d11a2a]/50 bg-[#d11a2a]/10 px-3 text-xs text-[#fecaca]" onClick={() => void runExport("pdf")} disabled={exporting !== null}>
            {exporting === "pdf" ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
            PDF
          </Button>
        </div>
      </div>

      {/* Filter */}
      <div className="grid gap-2 rounded-md border border-[#34343c] bg-white/[0.03] p-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[1.4fr_repeat(4,1fr)]">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama, SKU, barcode, merek…" className="h-9 border-[#34343c] bg-black/25 text-sm" aria-label="Cari produk" />
        <Select value={query.categoryId ?? "all"} onValueChange={(v) => patchQuery({ categoryId: v === "all" ? undefined : v })}>
          <SelectTrigger className={fieldClass} aria-label="Filter kategori"><SelectValue placeholder="Kategori" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua kategori</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}{c.status !== "active" ? ` (${c.status === "archived" ? "arsip" : "nonaktif"})` : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={query.productType ?? "all"} onValueChange={(v) => patchQuery({ productType: v === "all" ? undefined : (v as ProductType) })}>
          <SelectTrigger className={fieldClass} aria-label="Filter tipe produk"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua tipe</SelectItem>
            {(Object.keys(PRODUCT_TYPE_LABEL) as ProductType[]).map((t) => (
              <SelectItem key={t} value={t}>{PRODUCT_TYPE_LABEL[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={query.status ?? "active"} onValueChange={(v) => patchQuery({ status: v as CatalogQuery["status"] })}>
          <SelectTrigger className={fieldClass} aria-label="Filter status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Status: aktif</SelectItem>
            <SelectItem value="archived">Status: nonaktif / arsip</SelectItem>
            <SelectItem value="all">Status: semua</SelectItem>
          </SelectContent>
        </Select>
        <Select value={query.stock ?? "all"} onValueChange={(v) => patchQuery({ stock: v === "all" ? undefined : (v as CatalogQuery["stock"]) })}>
          <SelectTrigger className={fieldClass} aria-label="Filter status stok"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua stok</SelectItem>
            <SelectItem value="ready">Ready</SelectItem>
            <SelectItem value="limited">Limited (menipis)</SelectItem>
            <SelectItem value="sold_out">Habis</SelectItem>
          </SelectContent>
        </Select>
        <Select value={query.hpp ?? "all"} onValueChange={(v) => patchQuery({ hpp: v === "all" ? undefined : (v as CatalogQuery["hpp"]) })}>
          <SelectTrigger className={fieldClass} aria-label="Filter HPP"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">HPP: semua</SelectItem>
            <SelectItem value="has">Sudah punya HPP</SelectItem>
            <SelectItem value="missing">Belum punya HPP</SelectItem>
            <SelectItem value="complete">HPP lengkap & valid</SelectItem>
            <SelectItem value="incomplete">HPP belum lengkap</SelectItem>
          </SelectContent>
        </Select>
        <Select value={query.issue ?? "all"} onValueChange={(v) => patchQuery({ issue: v === "all" ? undefined : (v as ProductIssue | "any") })}>
          <SelectTrigger className={fieldClass} aria-label="Filter kelengkapan data"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Kelengkapan: semua</SelectItem>
            <SelectItem value="any">Ada data belum lengkap</SelectItem>
            {(Object.keys(PRODUCT_ISSUE_LABEL) as ProductIssue[]).map((issue) => (
              <SelectItem key={issue} value={issue}>{PRODUCT_ISSUE_LABEL[issue]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={query.digital ?? "all"} onValueChange={(v) => patchQuery({ digital: v === "all" ? undefined : (v as CatalogQuery["digital"]) })}>
          <SelectTrigger className={fieldClass} aria-label="Filter menu digital"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Menu digital: semua</SelectItem>
            <SelectItem value="shown">Tampil di QR</SelectItem>
            <SelectItem value="hidden">Disembunyikan</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-[11px] text-[#c4c4cc]">
          <span className="shrink-0">Terjual dari</span>
          <Input type="date" value={query.from ?? data?.range.from ?? ""} onChange={(e) => patchQuery({ from: e.target.value || undefined, to: query.to ?? data?.range.to })} className={fieldClass} aria-label="Periode penjualan dari" />
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-[#c4c4cc]">
          <span className="shrink-0">s/d</span>
          <Input type="date" value={query.to ?? data?.range.to ?? ""} onChange={(e) => patchQuery({ to: e.target.value || undefined, from: query.from ?? data?.range.from })} className={fieldClass} aria-label="Periode penjualan sampai" />
        </label>
      </div>
      {activeFilterCount ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#d4d4d8]">
          <span>{activeFilterCount} filter aktif · {data?.total ?? 0} produk cocok</span>
          <button
            type="button"
            className="inline-flex items-center gap-1 font-semibold text-[#ffd08a] hover:underline"
            onClick={() => {
              setSearch("");
              setQuery(DEFAULT_QUERY);
            }}
          >
            <X className="size-3.5" />
            Reset filter
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 p-3 text-sm text-[#fecaca]" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-md border border-[#22c55e]/45 bg-[#22c55e]/12 p-3 text-sm text-[#bbf7d0]" role="status">{notice}</div>
      ) : null}

      {/* Aksi massal */}
      {selected.size ? (
        <div className="sticky top-0 z-10 flex flex-col gap-2 rounded-md border border-[#f5a742]/50 bg-[#1f1a12] p-2 sm:flex-row sm:flex-wrap sm:items-center">
          <span className="text-xs font-bold text-[#ffd08a]">{selected.size} produk dipilih</span>
          <Select value={bulkAction || "none"} onValueChange={(v) => { setBulkAction(v === "none" ? "" : (v as CatalogBulkAction)); setBulkValue(""); }}>
            <SelectTrigger className={`${fieldClass} sm:w-[200px]`} aria-label="Aksi massal"><SelectValue placeholder="Pilih aksi" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Pilih aksi…</SelectItem>
              <SelectItem value="activate">Aktifkan</SelectItem>
              <SelectItem value="archive">Nonaktifkan (arsip)</SelectItem>
              <SelectItem value="stock">Ubah status stok</SelectItem>
              <SelectItem value="digital">Tampil/sembunyi menu digital</SelectItem>
              <SelectItem value="move_category">Pindah kategori</SelectItem>
              <SelectItem value="product_type">Ubah tipe produk</SelectItem>
            </SelectContent>
          </Select>
          {bulkAction === "stock" ? (
            <Select value={bulkValue || "none"} onValueChange={(v) => setBulkValue(v === "none" ? "" : v)}>
              <SelectTrigger className={`${fieldClass} sm:w-[160px]`} aria-label="Status stok"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Pilih…</SelectItem>
                <SelectItem value="ready">Ready</SelectItem>
                <SelectItem value="limited">Limited</SelectItem>
                <SelectItem value="sold_out">Habis</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
          {bulkAction === "digital" ? (
            <Select value={bulkValue || "none"} onValueChange={(v) => setBulkValue(v === "none" ? "" : v)}>
              <SelectTrigger className={`${fieldClass} sm:w-[160px]`} aria-label="Menu digital"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Pilih…</SelectItem>
                <SelectItem value="shown">Tampilkan</SelectItem>
                <SelectItem value="hidden">Sembunyikan</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
          {bulkAction === "move_category" ? (
            <Select value={bulkValue || "none"} onValueChange={(v) => setBulkValue(v === "none" ? "" : v)}>
              <SelectTrigger className={`${fieldClass} sm:w-[200px]`} aria-label="Kategori tujuan"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Kategori tujuan…</SelectItem>
                {categories.filter((c) => c.status === "active").map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {bulkAction === "product_type" ? (
            <Select value={bulkValue || "none"} onValueChange={(v) => setBulkValue(v === "none" ? "" : v)}>
              <SelectTrigger className={`${fieldClass} sm:w-[180px]`} aria-label="Tipe produk"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Pilih…</SelectItem>
                {(Object.keys(PRODUCT_TYPE_LABEL) as ProductType[]).map((t) => (
                  <SelectItem key={t} value={t}>{PRODUCT_TYPE_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <div className="flex gap-2">
            <Button type="button" className="h-9 bg-[#f5a742] px-3 text-xs text-black hover:bg-[#ffc167]" disabled={!bulkAction || bulkBusy} onClick={() => void runBulk()}>
              {bulkBusy ? "Memproses…" : "Terapkan"}
            </Button>
            <Button type="button" variant="outline" className="h-9 border-[#34343c] bg-white/[0.04] px-3 text-xs" onClick={() => setSelected(new Set())}>
              Batal pilih
            </Button>
          </div>
        </div>
      ) : null}

      {/* Tabel produk */}
      <div className="garage-scrollbar max-h-[68svh] overflow-auto rounded-md border border-[#34343c]">
        <table className="w-full min-w-[980px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-[1] bg-[#18181f] text-[11px] uppercase tracking-wide text-[#c4c4cc]">
            <tr>
              <th className="w-9 px-2 py-2">
                <input type="checkbox" aria-label="Pilih semua di halaman ini" checked={allPageSelected} onChange={togglePage} className="size-4 accent-[#d11a2a]" />
              </th>
              {SORT_COLUMNS.map((column) => {
                const active = query.sort === column.key;
                const Icon = !active ? ArrowUpDown : query.dir === "desc" ? ArrowDown : ArrowUp;
                return (
                  <th key={column.key} className={`px-2 py-2 font-bold ${column.align === "right" ? "text-right" : ""}`}>
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className={`inline-flex items-center gap-1 hover:text-white ${active ? "text-[#ffd08a]" : ""}`}
                    >
                      {column.label}
                      <Icon className="size-3" aria-hidden />
                    </button>
                  </th>
                );
              })}
              <th className="px-2 py-2 font-bold">Status</th>
              <th className="px-2 py-2 font-bold">Kelengkapan</th>
              <th className="px-2 py-2" aria-label="Aksi" />
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-sm text-[#d4d4d8]">
                  <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
                  Memuat katalog produk…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-sm text-[#a1a1aa]">
                  Tidak ada produk yang cocok dengan filter.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className={`border-t border-[#2a2a31] align-top ${selected.has(row.id) ? "bg-[#f5a742]/8" : "odd:bg-white/[0.02]"}`}>
                  <td className="px-2 py-2">
                    <input type="checkbox" aria-label={`Pilih ${row.name}`} checked={selected.has(row.id)} onChange={() => toggleRow(row.id)} className="size-4 accent-[#d11a2a]" />
                  </td>
                  <td className="px-2 py-2">
                    <p className="font-bold text-white">{row.name}</p>
                    <p className="text-[11px] text-[#a1a1aa]">
                      {PRODUCT_TYPE_LABEL[row.productType]}
                      {row.brand ? ` · ${row.brand}` : ""} · {row.variantCount} varian
                    </p>
                  </td>
                  <td className="px-2 py-2 text-[#e4e4e7]">
                    {row.category}
                    {row.categoryStatus && row.categoryStatus !== "active" ? <span className="block text-[11px] text-[#ffd08a]">kategori {row.categoryStatus === "archived" ? "arsip" : "nonaktif"}</span> : null}
                  </td>
                  <td className="px-2 py-2 font-mono text-[11px] text-[#e4e4e7]">
                    {row.sku ?? <span className="text-[#fca5a5]">tanpa SKU</span>}
                    {row.barcode ? <span className="block text-[#a1a1aa]">{row.barcode}</span> : null}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-white">
                    {row.variantCount ? (row.priceMin === row.priceMax ? currency.format(row.priceMin) : `${currency.format(row.priceMin)}–${currency.format(row.priceMax)}`) : <span className="text-[#fca5a5]">—</span>}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <span className="font-mono text-white">{row.costMax > 0 ? (row.costMin === row.costMax ? currency.format(row.costMin) : `${currency.format(row.costMin)}–${currency.format(row.costMax)}`) : "—"}</span>
                    <span className={`block text-[11px] ${HPP_CLASS[row.hppStatus]}`}>{HPP_STATUS_LABEL[row.hppStatus]}</span>
                  </td>
                  <td className="px-2 py-2 text-right font-mono">
                    {row.marginPct === null ? (
                      <span className="text-[#a1a1aa]" title="Margin hanya dihitung dari HPP/harga modal yang valid">—</span>
                    ) : (
                      <span className={row.marginPct < 55 ? "text-[#ffd08a]" : "text-[#bbf7d0]"}>{row.marginPct.toLocaleString("id-ID")}%</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-white">{row.salesQty.toLocaleString("id-ID")}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Badge className={STOCK_CLASS[row.stock]}>{STOCK_LABEL[row.stock]}</Badge>
                      {row.status !== "active" ? <Badge className="border-[#52525b] bg-white/[0.06] text-[#d4d4d8]">Nonaktif</Badge> : null}
                      {!row.showInDigitalMenu ? <Badge className="border-[#52525b] bg-white/[0.06] text-[#d4d4d8]">Tanpa QR</Badge> : null}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    {row.issues.length ? (
                      <ul className="space-y-0.5 text-[11px] text-[#ffd08a]">
                        {row.issues.map((issue) => (
                          <li key={issue}>• {PRODUCT_ISSUE_LABEL[issue]}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-[11px] text-[#bbf7d0]">Lengkap</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <Button type="button" variant="outline" className="h-8 gap-1 border-[#34343c] bg-white/[0.04] px-2 text-xs" onClick={() => onEditProduct(row.id)}>
                      <Pencil className="size-3.5" />
                      Edit
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data ? (
        <div className="flex flex-col gap-2 text-xs text-[#d4d4d8] sm:flex-row sm:items-center sm:justify-between">
          <span>
            {data.total ? `${(data.page - 1) * data.pageSize + 1}–${Math.min(data.total, data.page * data.pageSize)} dari ${data.total} produk` : "0 produk"} · terjual periode {data.range.from} s/d {data.range.to} (order lunas)
          </span>
          <div className="flex items-center gap-2">
            <Select value={String(query.pageSize ?? 25)} onValueChange={(v) => patchQuery({ pageSize: Number(v) })}>
              <SelectTrigger className={`${fieldClass} w-[110px]`} aria-label="Baris per halaman"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[25, 50, 100, 200].map((size) => (
                  <SelectItem key={size} value={String(size)}>{size} / hal</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" className="h-9 border-[#34343c] bg-white/[0.04] px-2" disabled={data.page <= 1 || loading} onClick={() => patchQuery({ page: data.page - 1 })} aria-label="Halaman sebelumnya">
              <ChevronLeft className="size-4" />
            </Button>
            <span className="font-mono">{data.page}/{data.totalPages}</span>
            <Button type="button" variant="outline" className="h-9 border-[#34343c] bg-white/[0.04] px-2" disabled={data.page >= data.totalPages || loading} onClick={() => patchQuery({ page: data.page + 1 })} aria-label="Halaman berikutnya">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
