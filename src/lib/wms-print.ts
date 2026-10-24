import { countPack, formatPacks, type PackUom } from "@/lib/stock-uom";

// Helper cetak dokumen WMS (client-only): buka jendela + layout print seragam.
// Dipanggil dari event handler (onClick) — aman, tak mengakses window saat import.

export function printWmsDoc(title: string, bodyHtml: string, meta?: string) {
  const win = window.open("", "_blank", "width=960,height=680");
  if (!win) {
    window.alert("Jendela cetak diblokir browser. Izinkan pop-up untuk situs ini lalu coba lagi.");
    return;
  }
  const tanggal = `${new Date().toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta" })} WIB`;
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    *{font-family:Inter,Arial,system-ui,sans-serif;box-sizing:border-box}
    body{margin:0;padding:22px;color:#111}
    .hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #C8102E;padding-bottom:10px;margin-bottom:14px}
    h1{font-size:18px;margin:0}
    .brand{font-weight:800;color:#C8102E;font-size:15px}
    .sub{font-size:11px;color:#666;margin-top:2px}
    table{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}
    th,td{border:1px solid #cfcfcf;padding:6px 8px;text-align:left}
    th{background:#f4f4f5;font-size:11px;text-transform:uppercase;letter-spacing:.03em}
    td.r,th.r{text-align:right}
    td.c,th.c{text-align:center}
    .sign{margin-top:44px;display:flex;gap:48px}
    .sign div{flex:1;text-align:center;font-size:12px}
    .sign .line{margin-top:46px;border-top:1px solid #333;padding-top:4px}
    @media print{.noprint{display:none}}
  </style></head><body>
    <button class="noprint" onclick="window.print()" style="margin-bottom:14px;padding:9px 18px;background:#C8102E;color:#fff;border:0;border-radius:6px;font-weight:700;cursor:pointer">🖨 Cetak / Simpan PDF</button>
    <div class="hd">
      <div><div class="brand">GARAGE Coffee</div><h1>${escapeHtml(title)}</h1>${meta ? `<div class="sub">${escapeHtml(meta)}</div>` : ""}</div>
      <div class="sub" style="text-align:right">${tanggal}</div>
    </div>
    ${bodyHtml}
  </body></html>`);
  win.document.close();
}

export function escapeHtml(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/** Baris tanda tangan (mis. Disiapkan / Diterima). */
export function signatureRow(labels: string[]): string {
  return `<div class="sign">${labels.map((l) => `<div><div class="line">${escapeHtml(l)}</div></div>`).join("")}</div>`;
}

const rupiah = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
const qtyText = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 4 });
const dateText = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" }) : "-";

/** Surat jalan + pick list pindah stok: tiap baris per batch (no. batch & expired). */
export function printDeliveryNote(data: {
  doc: string;
  from: string | null;
  to: string | null;
  lines: Array<{ name: string; sku: string; unit: string; uoms?: PackUom[]; qty: number; batchNo: string; expiredAt: string | null; location: string }>;
}) {
  const rows = data.lines
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.name)}<div style="font-size:10px;color:#666">${escapeHtml(l.sku)}</div></td><td>${escapeHtml(l.batchNo || "-")}</td><td class="c">${escapeHtml(dateText(l.expiredAt))}</td><td class="r">${escapeHtml(formatPacks(l.qty, l.unit, l.uoms))}${countPack(l.uoms) ? `<div style="font-size:10px;color:#666">${qtyText(l.qty)} ${escapeHtml(l.unit)}</div>` : ""}</td><td style="width:70px"></td></tr>`,
    )
    .join("");
  printWmsDoc(
    `Surat Jalan · ${data.doc}`,
    `<table><thead><tr><th>Bahan</th><th>No. Batch</th><th class="c">Expired</th><th class="r">Jumlah</th><th class="c">Cek</th></tr></thead><tbody>${rows}</tbody></table>
     ${signatureRow(["Disiapkan (Gudang)", "Dibawa", "Diterima (Outlet)"])}`,
    `${data.from ?? "-"} → ${data.to ?? "-"} · ambil sesuai no. batch (expired terdekat dulu)`,
  );
}

/** Cetak Purchase Order untuk dikirim ke supplier. */
export function printPurchaseOrder(po: {
  doc: string;
  supplierName: string;
  supplierPhone?: string;
  expectedDate: string | null;
  note: string;
  items: Array<{ name: string | null; sku: string | null; unit: string | null; orderedQty: number; unitPrice: number; uom?: string | null; uomFactor?: number | null }>;
}) {
  const total = po.items.reduce((sum, it) => sum + it.orderedQty * it.unitPrice, 0);
  // Dipesan per kemasan → cetak "4 kotak @ Rp45.000"; selain itu per satuan dasar.
  const rows = po.items
    .map((it, i) => {
      const packed = it.uom && it.uomFactor && it.uomFactor > 1;
      const qty = packed ? it.orderedQty / (it.uomFactor as number) : it.orderedQty;
      const unit = packed ? (it.uom as string) : (it.unit ?? "");
      const price = packed ? it.unitPrice * (it.uomFactor as number) : it.unitPrice;
      const content = packed ? `<div style="font-size:10px;color:#666">1 ${escapeHtml(unit)} = ${qtyText(it.uomFactor as number)} ${escapeHtml(it.unit ?? "")}</div>` : "";
      return `<tr><td class="c">${i + 1}</td><td>${escapeHtml(it.name ?? "-")}<div style="font-size:10px;color:#666">${escapeHtml(it.sku ?? "")}</div></td><td class="r">${qtyText(qty)}</td><td class="c">${escapeHtml(unit)}${content}</td><td class="r">${it.unitPrice ? rupiah(price) : "-"}</td><td class="r">${it.unitPrice ? rupiah(it.orderedQty * it.unitPrice) : "-"}</td></tr>`;
    })
    .join("");
  printWmsDoc(
    `Purchase Order · ${po.doc}`,
    `<p style="font-size:12px;margin:0 0 6px">Kepada: <b>${escapeHtml(po.supplierName)}</b>${po.supplierPhone ? ` · ${escapeHtml(po.supplierPhone)}` : ""}<br/>Tanggal kirim diharapkan: <b>${escapeHtml(po.expectedDate ?? "-")}</b></p>
     <table><thead><tr><th class="c">No</th><th>Bahan</th><th class="r">Qty</th><th class="c">Satuan</th><th class="r">Harga</th><th class="r">Jumlah</th></tr></thead><tbody>${rows}</tbody>
     <tfoot><tr><th colspan="5" class="r">Perkiraan total</th><th class="r">${rupiah(total)}</th></tr></tfoot></table>
     ${po.note ? `<p style="font-size:12px">Catatan: ${escapeHtml(po.note)}</p>` : ""}
     ${signatureRow(["Dipesan (Garage Coffee)", "Disetujui Supplier"])}`,
    "Pembayaran tunai saat barang diterima.",
  );
}
