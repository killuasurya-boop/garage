// Helper cetak dokumen WMS (client-only): buka jendela + layout print seragam.
// Dipanggil dari event handler (onClick) — aman, tak mengakses window saat import.

export function printWmsDoc(title: string, bodyHtml: string, meta?: string) {
  const win = window.open("", "_blank", "width=960,height=680");
  if (!win) return;
  const tanggal = new Date().toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" });
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
      <div><div class="brand">GARAGE Coffee &amp; Motor</div><h1>${escapeHtml(title)}</h1>${meta ? `<div class="sub">${escapeHtml(meta)}</div>` : ""}</div>
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
