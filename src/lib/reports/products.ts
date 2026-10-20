// Laporan Manajemen Produk (Excel/PDF). Selalu memakai SELURUH baris yang cocok
// dengan filter (bukan halaman layar) dari sumber yang sama dengan katalog
// (loadCatalogRows) supaya angka layar = angka file.
import {
  formatRupiah,
  periodLabelFor,
  sumRows,
  type ReportColumn,
  type ReportDoc,
  type ReportRow,
  type ReportTable,
} from "@/lib/report-engine";
import {
  CATEGORY_KIND_LABEL,
  CATEGORY_STATION_LABEL,
  CATEGORY_STATUS_LABEL,
  HPP_STATUS_LABEL,
  PRODUCT_EXPORT_TYPES,
  PRODUCT_ISSUE_LABEL,
  PRODUCT_TYPE_LABEL,
  type CatalogQuery,
  type CatalogRow,
  type ProductCategoryRow,
  type ProductExportType,
} from "@/lib/product-catalog-types";
import {
  computeCatalogKpis,
  defaultSalesRange,
  filterCatalogRows,
  listProductCategories,
  loadCatalogRows,
  sortCatalogRows,
} from "@/lib/product-management";

const STOCK_LABEL: Record<CatalogRow["stock"], string> = { ready: "Ready", limited: "Limited", sold_out: "Habis" };
const STATUS_LABEL: Record<CatalogRow["status"], string> = { active: "Aktif", archived: "Nonaktif/arsip" };

const LIMITED_NOTE =
  "Status stok produk jual = ready / limited / habis (diatur kasir & owner). Kuantitas stok fisik, kartu stok, opname, pembelian dan nilai persediaan dikelola modul gudang terpisah (di luar laporan ini).";

function describeFilters(query: CatalogQuery, categories: ProductCategoryRow[]) {
  const out: string[] = [];
  if (query.q) out.push(`Cari "${query.q}"`);
  if (query.categoryId) out.push(`Kategori ${categories.find((c) => c.id === query.categoryId)?.name ?? query.categoryId}`);
  if (query.productType) out.push(`Tipe ${PRODUCT_TYPE_LABEL[query.productType]}`);
  out.push(`Status ${query.status === "all" ? "semua" : query.status === "archived" ? "nonaktif/arsip" : "aktif"}`);
  if (query.stock) out.push(`Stok ${STOCK_LABEL[query.stock]}`);
  if (query.hpp) out.push(`HPP ${{ has: "ada", missing: "belum ada", complete: "lengkap", incomplete: "belum lengkap" }[query.hpp]}`);
  if (query.issue) out.push(query.issue === "any" ? "Data belum lengkap" : PRODUCT_ISSUE_LABEL[query.issue]);
  if (query.digital) out.push(query.digital === "shown" ? "Tampil di menu digital" : "Tersembunyi dari menu digital");
  return out;
}

const col = (key: string, label: string, type: ReportColumn["type"], extra?: Partial<ReportColumn>): ReportColumn => ({ key, label, type, ...extra });

function priceText(row: CatalogRow) {
  return row.priceMin === row.priceMax ? formatRupiah(row.priceMin) : `${formatRupiah(row.priceMin)} – ${formatRupiah(row.priceMax)}`;
}

function variantRows(rows: CatalogRow[]) {
  return rows.flatMap((row) =>
    row.variants.map((variant) => {
      const costKnown = variant.baseCost > 0;
      const verified = costKnown && (row.productType === "retail" || variant.hasRecipe);
      const margin = verified && variant.price > 0 ? ((variant.price - variant.baseCost) / variant.price) * 100 : null;
      return { row, variant, costKnown, verified, margin };
    }),
  );
}

function table(title: string, columns: ReportColumn[], rows: ReportRow[], opts?: { totalsLabelKey?: string; subtotalBy?: string; noTotals?: boolean }): ReportTable {
  return {
    title,
    columns,
    rows,
    subtotalBy: opts?.subtotalBy,
    maxLines: 4,
    totals: opts?.noTotals || !rows.length ? undefined : sumRows(rows, columns, { key: opts?.totalsLabelKey ?? columns[1].key, text: "TOTAL" }),
  };
}

export async function buildProductReport(input: {
  type: ProductExportType;
  query: CatalogQuery;
  generatedBy: string;
  outletName?: string | null;
}): Promise<{ doc: ReportDoc; rowCount: number }> {
  const range = input.query.from && input.query.to ? { from: input.query.from, to: input.query.to } : defaultSalesRange();
  const [allRows, categories] = await Promise.all([loadCatalogRows(range), listProductCategories({ includeArchived: true })]);
  const kpis = computeCatalogKpis(allRows, categories.filter((c) => c.status === "active").length);
  // Default urut kategori → nama supaya subtotal per kategori rapi.
  const rows = sortCatalogRows(filterCatalogRows(allRows, input.query), input.query.sort ?? "category", input.query.dir ?? "asc");
  const entry = PRODUCT_EXPORT_TYPES.find((item) => item.id === input.type);
  const filters = describeFilters(input.query, categories);
  const notes: string[] = [];
  let tables: ReportTable[] = [];
  let summary: ReportDoc["summary"] = [
    { label: "Produk dalam laporan", value: String(rows.length) },
    { label: "Total produk (semua)", value: String(kpis.total) },
    { label: "Produk aktif", value: String(kpis.active) },
    { label: "Kategori aktif", value: String(kpis.categories) },
  ];
  let rowCount = rows.length;
  let periodLabel = `Per ${periodLabelFor(range.to, range.to)}`;

  switch (input.type) {
    case "master": {
      const columns = [
        col("category", "Kategori", "text", { weight: 1.1 }),
        col("name", "Nama produk", "text", { weight: 1.7 }),
        col("id", "ID produk", "text", { weight: 1.3 }),
        col("sku", "SKU", "text", { weight: 0.9 }),
        col("barcode", "Barcode", "text", { weight: 1.1 }),
        col("type", "Tipe", "text", { weight: 0.9 }),
        col("brand", "Merek", "text", { weight: 0.9 }),
        col("variants", "Varian", "int", { weight: 0.6, noSum: true }),
        col("price", "Harga jual", "text", { weight: 1.2 }),
        col("hpp", "Status HPP", "text", { weight: 1 }),
        col("status", "Status", "text", { weight: 0.8 }),
        col("stock", "Stok", "text", { weight: 0.7 }),
        col("digital", "Menu digital", "text", { weight: 0.7 }),
      ];
      tables = [
        table(
          "Master Produk",
          columns,
          rows.map((row) => ({
            category: row.category,
            name: row.name,
            id: row.id,
            sku: row.sku ?? "—",
            barcode: row.barcode ?? (row.variants.some((v) => v.barcode) ? "per varian" : "—"),
            type: PRODUCT_TYPE_LABEL[row.productType],
            brand: row.brand ?? "",
            variants: row.variantCount,
            price: priceText(row),
            hpp: HPP_STATUS_LABEL[row.hppStatus],
            status: STATUS_LABEL[row.status],
            stock: STOCK_LABEL[row.stock],
            digital: row.showInDigitalMenu ? "Tampil" : "Sembunyi",
          })),
          { noTotals: true },
        ),
      ];
      summary = [
        ...summary,
        { label: "Menu siap jual", value: String(kpis.menu) },
        { label: "Produk retail", value: String(kpis.retail) },
        { label: "Total varian", value: String(kpis.variants) },
        { label: "Data belum lengkap", value: String(kpis.incomplete) },
      ];
      break;
    }
    case "kategori": {
      const filtered = input.query.status === "all" ? categories : categories.filter((c) => c.status !== "archived");
      const columns = [
        col("sort", "Urut", "int", { weight: 0.5, noSum: true }),
        col("name", "Kategori", "text", { weight: 1.5 }),
        col("id", "ID kategori", "text", { weight: 2 }),
        col("kind", "Jenis", "text", { weight: 0.8 }),
        col("type", "Tipe default", "text", { weight: 1.1 }),
        col("station", "Routing", "text", { weight: 1.4 }),
        col("group", "Grup POS", "text", { weight: 0.7 }),
        col("prefix", "Prefix SKU", "text", { weight: 0.7 }),
        col("status", "Status", "text", { weight: 0.7 }),
        col("active", "Produk aktif", "int", { weight: 0.7 }),
        col("archived", "Produk nonaktif", "int", { weight: 0.7 }),
      ];
      tables = [
        table(
          "Master Kategori",
          columns,
          filtered.map((c) => ({
            sort: c.sortOrder,
            name: c.name,
            id: c.id,
            kind: CATEGORY_KIND_LABEL[c.kind],
            type: PRODUCT_TYPE_LABEL[c.defaultProductType],
            station: CATEGORY_STATION_LABEL[c.station],
            group: c.posGroup,
            prefix: c.skuPrefix ?? "GEN",
            status: CATEGORY_STATUS_LABEL[c.status],
            active: c.activeProducts,
            archived: c.archivedProducts,
          })),
        ),
      ];
      rowCount = filtered.length;
      summary = [
        { label: "Kategori aktif", value: String(categories.filter((c) => c.status === "active").length) },
        { label: "Kategori nonaktif", value: String(categories.filter((c) => c.status === "inactive").length) },
        { label: "Kategori arsip", value: String(categories.filter((c) => c.status === "archived").length) },
      ];
      if (input.query.status !== "all") notes.push("Kategori arsip tidak ditampilkan. Pilih status 'semua' untuk menyertakannya.");
      break;
    }
    case "varian":
    case "barcode": {
      const lines = variantRows(rows);
      const onlyBarcode = input.type === "barcode";
      const data = lines
        .filter((line) => !onlyBarcode || line.variant.barcode || line.row.barcode)
        .map(({ row, variant }) => ({
          category: row.category,
          name: row.name,
          variant: variant.label,
          productSku: row.sku ?? "—",
          variantSku: variant.sku ?? "—",
          productBarcode: row.barcode ?? "—",
          variantBarcode: variant.barcode ?? "—",
          sellUnit: variant.sellUnit ?? "—",
          contents: variant.unitContents,
          price: variant.price,
          id: `${row.id} / ${variant.id}`,
        }));
      const columns = [
        col("category", "Kategori", "text"),
        col("name", "Produk", "text", { weight: 1.6 }),
        col("variant", "Varian", "text"),
        col("productSku", "SKU produk", "text", { weight: 0.9 }),
        col("variantSku", "SKU varian", "text", { weight: 0.9 }),
        col("productBarcode", "Barcode produk", "text", { weight: 1.1 }),
        col("variantBarcode", "Barcode varian", "text", { weight: 1.1 }),
        col("sellUnit", "Satuan jual", "text", { weight: 0.7 }),
        col("contents", "Isi/satuan", "qty", { weight: 0.6, noSum: true }),
        col("price", "Harga jual", "money", { noSum: true }),
        col("id", "ID produk / varian", "text", { weight: 1.6 }),
      ];
      tables = [table(onlyBarcode ? "Daftar Barcode" : "Varian & SKU", columns, data, { noTotals: true })];
      rowCount = data.length;
      summary = [
        { label: "Produk", value: String(rows.length) },
        { label: onlyBarcode ? "Baris ber-barcode" : "Total varian", value: String(data.length) },
        { label: "Varian tanpa SKU", value: String(lines.filter((l) => !l.variant.sku && !l.row.sku).length) },
      ];
      if (onlyBarcode) notes.push("Produk tanpa barcode tidak ditampilkan; lihat laporan Data Belum Lengkap.");
      break;
    }
    case "harga":
    case "hpp-margin": {
      const lines = variantRows(rows);
      const withMargin = input.type === "hpp-margin";
      const data = lines.map(({ row, variant, costKnown, verified, margin }) => ({
        category: row.category,
        name: row.name,
        variant: variant.label,
        sku: variant.sku ?? row.sku ?? "—",
        type: PRODUCT_TYPE_LABEL[row.productType],
        price: variant.price,
        cost: costKnown ? variant.baseCost : null,
        source: !costKnown ? "Belum ada" : row.productType === "retail" ? "Harga modal" : variant.hasRecipe ? "Resep bahan" : "Manual (belum diverifikasi)",
        profit: verified ? variant.price - variant.baseCost : null,
        margin: margin === null ? null : Math.round(margin * 10) / 10,
      }));
      const columns: ReportColumn[] = [
        col("category", "Kategori", "text"),
        col("name", "Produk", "text", { weight: 1.6 }),
        col("variant", "Varian", "text"),
        col("sku", "SKU", "text", { weight: 0.8 }),
        col("type", "Tipe", "text", { weight: 0.9 }),
        col("price", "Harga jual", "money", { noSum: true }),
        col("cost", withMargin ? "HPP / unit" : "Harga modal / HPP", "money", { noSum: true }),
        col("source", "Sumber biaya", "text", { weight: 1.1 }),
        ...(withMargin
          ? [col("profit", "Laba kotor / unit", "money", { noSum: true }), col("margin", "Margin kotor", "pct")]
          : []),
      ];
      tables = [table(withMargin ? "HPP & Margin" : "Harga Modal & Jual", columns, data, { noTotals: true })];
      rowCount = data.length;
      const verifiedLines = lines.filter((l) => l.verified);
      const avgMargin = verifiedLines.length
        ? verifiedLines.reduce((sum, l) => sum + (l.margin ?? 0), 0) / verifiedLines.length
        : null;
      summary = [
        { label: "Varian dalam laporan", value: String(lines.length) },
        { label: "HPP terverifikasi", value: String(verifiedLines.length) },
        { label: "HPP belum lengkap", value: String(lines.length - verifiedLines.length) },
        ...(withMargin
          ? [{ label: "Rata-rata margin (terverifikasi)", value: avgMargin === null ? "—" : `${avgMargin.toFixed(1).replace(".", ",")}%` }]
          : []),
      ];
      notes.push(
        "HPP resep = Σ(takaran bahan × biaya bahan terkini × (1 + susut%)). Laba kotor/unit = harga jual − HPP. Margin kotor = laba kotor ÷ harga jual × 100%.",
        "Harga jual = harga varian di master produk (sebelum diskon/promo, service & pajak transaksi).",
        "Margin hanya dihitung untuk biaya valid: HPP dari resep (menu) atau harga modal (retail). Biaya manual/kosong ditandai, bukan dianggap final.",
      );
      break;
    }
    case "retail": {
      const retail = rows.filter((row) => row.productType === "retail");
      const lines = variantRows(retail);
      const data = lines.map(({ row, variant, costKnown, margin }) => ({
        category: row.category,
        brand: row.brand ?? "—",
        name: row.name,
        variant: variant.label,
        sku: variant.sku ?? row.sku ?? "—",
        barcode: variant.barcode ?? row.barcode ?? "—",
        sellUnit: variant.sellUnit ?? "—",
        contents: variant.unitContents,
        cost: costKnown ? variant.baseCost : null,
        price: variant.price,
        margin: margin === null ? null : Math.round(margin * 10) / 10,
        stock: STOCK_LABEL[row.stock],
        qty: row.variantCount === 1 ? row.salesQty : null,
      }));
      const columns = [
        col("category", "Kategori", "text"),
        col("brand", "Merek", "text", { weight: 0.9 }),
        col("name", "Produk", "text", { weight: 1.5 }),
        col("variant", "Varian", "text", { weight: 0.9 }),
        col("sku", "SKU", "text", { weight: 0.8 }),
        col("barcode", "Barcode", "text", { weight: 1.1 }),
        col("sellUnit", "Satuan jual", "text", { weight: 0.7 }),
        col("contents", "Isi", "qty", { weight: 0.5, noSum: true }),
        col("cost", "Harga modal", "money", { noSum: true }),
        col("price", "Harga jual", "money", { noSum: true }),
        col("margin", "Margin", "pct", { weight: 0.6 }),
        col("stock", "Stok", "text", { weight: 0.6 }),
        col("qty", "Terjual", "int", { weight: 0.6 }),
      ];
      tables = [table("Produk Retail", columns, data, { subtotalBy: "category", totalsLabelKey: "brand" })];
      rowCount = data.length;
      summary = [
        { label: "Produk retail", value: String(retail.length) },
        { label: "Varian retail", value: String(lines.length) },
        { label: "Tanpa barcode", value: String(retail.filter((r) => r.issues.includes("no_barcode")).length) },
        { label: "Tanpa harga modal", value: String(retail.filter((r) => r.hppStatus !== "complete").length) },
      ];
      periodLabel = periodLabelFor(range.from, range.to);
      notes.push(`Kolom Terjual = qty terjual pada order lunas periode ${periodLabel} (hanya produk 1 varian; multi-varian lihat laporan Penjualan).`, LIMITED_NOTE);
      break;
    }
    case "status-stok": {
      const flagged = rows.filter((row) => row.stock !== "ready");
      const columns = [
        col("category", "Kategori", "text"),
        col("name", "Produk", "text", { weight: 1.7 }),
        col("sku", "SKU", "text", { weight: 0.8 }),
        col("type", "Tipe", "text"),
        col("stock", "Status stok", "text", { weight: 0.8 }),
        col("updated", "Terakhir diubah", "text", { weight: 1.1 }),
        col("qty", "Terjual (periode)", "int"),
      ];
      tables = [
        table(
          "Produk Limited & Habis",
          columns,
          flagged.map((row) => ({
            category: row.category,
            name: row.name,
            sku: row.sku ?? "—",
            type: PRODUCT_TYPE_LABEL[row.productType],
            stock: STOCK_LABEL[row.stock],
            updated: new Date(row.updatedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" }),
            qty: row.salesQty,
          })),
          { totalsLabelKey: "name" },
        ),
      ];
      rowCount = flagged.length;
      summary = [
        { label: "Ready", value: String(rows.filter((r) => r.stock === "ready").length) },
        { label: "Limited (menipis)", value: String(rows.filter((r) => r.stock === "limited").length) },
        { label: "Habis", value: String(rows.filter((r) => r.stock === "sold_out").length) },
      ];
      periodLabel = periodLabelFor(range.from, range.to);
      notes.push(LIMITED_NOTE);
      break;
    }
    case "penjualan": {
      const sold = sortCatalogRows(rows, "salesQty", "desc");
      const columns = [
        col("rank", "#", "int", { weight: 0.4, noSum: true }),
        col("name", "Produk", "text", { weight: 1.8 }),
        col("category", "Kategori", "text"),
        col("sku", "SKU", "text", { weight: 0.8 }),
        col("type", "Tipe", "text"),
        col("qty", "Qty terjual", "int"),
        col("revenue", "Penjualan (Rp)", "money"),
        col("share", "Porsi qty", "pct", { weight: 0.7 }),
      ];
      const totalQty = sold.reduce((sum, row) => sum + row.salesQty, 0);
      tables = [
        table(
          "Kuantitas Penjualan",
          columns,
          sold.map((row, index) => ({
            rank: index + 1,
            name: row.name,
            category: row.category,
            sku: row.sku ?? "—",
            type: PRODUCT_TYPE_LABEL[row.productType],
            qty: row.salesQty,
            revenue: row.salesRevenue,
            share: totalQty ? Math.round((row.salesQty / totalQty) * 1000) / 10 : 0,
          })),
          { totalsLabelKey: "name" },
        ),
      ];
      periodLabel = periodLabelFor(range.from, range.to);
      summary = [
        { label: "Total qty terjual", value: new Intl.NumberFormat("id-ID").format(totalQty) },
        { label: "Penjualan (line item)", value: formatRupiah(sold.reduce((sum, row) => sum + row.salesRevenue, 0)) },
        { label: "Produk terjual", value: String(sold.filter((r) => r.salesQty > 0).length) },
        { label: "Produk tidak terjual", value: String(sold.filter((r) => r.salesQty === 0).length) },
      ];
      notes.push(
        "Sumber: item order berstatus lunas (paid) pada periode, tanggal order WIB. Order void/refund tidak dihitung.",
        "Penjualan = Σ total baris item (harga transaksi saat itu) sebelum diskon order, service & pajak.",
      );
      break;
    }
    case "kelengkapan": {
      const incomplete = rows.filter((row) => row.issues.length);
      const columns = [
        col("category", "Kategori", "text"),
        col("name", "Produk", "text", { weight: 1.6 }),
        col("id", "ID produk", "text", { weight: 1.3 }),
        col("sku", "SKU", "text", { weight: 0.8 }),
        col("type", "Tipe", "text"),
        col("issues", "Data yang belum lengkap", "text", { weight: 2.6 }),
      ];
      tables = [
        table(
          "Data Belum Lengkap",
          columns,
          incomplete.map((row) => ({
            category: row.category,
            name: row.name,
            id: row.id,
            sku: row.sku ?? "—",
            type: PRODUCT_TYPE_LABEL[row.productType],
            issues: row.issues.map((issue) => PRODUCT_ISSUE_LABEL[issue]).join(", "),
          })),
          { noTotals: true },
        ),
      ];
      rowCount = incomplete.length;
      summary = [
        { label: "Produk belum lengkap", value: String(incomplete.length) },
        ...(["no_sku", "no_barcode", "no_price", "hpp_incomplete", "no_category", "no_sell_unit"] as const).map((issue) => ({
          label: PRODUCT_ISSUE_LABEL[issue],
          value: String(incomplete.filter((row) => row.issues.includes(issue)).length),
        })),
      ];
      notes.push("Data tidak diisi otomatis/tebakan. Lengkapi lewat Edit Produk; barcode wajib hanya untuk produk retail.");
      break;
    }
  }

  return {
    rowCount,
    doc: {
      title: entry?.label.replace(/^./, (c) => c.toUpperCase()) ?? "Laporan Produk",
      periodLabel,
      outletName: input.outletName ?? null,
      generatedAt: new Date().toISOString(),
      generatedBy: input.generatedBy,
      filters: input.type === "kategori" ? [] : filters,
      showLogo: true,
      summary,
      tables,
      notes,
    },
  };
}
