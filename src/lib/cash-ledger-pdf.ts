// =============================================================================
// B7c — PDF buku kas rinci & arus kas Owner (PRD §20.2 F38, §13.5 F35).
// Penulis & gaya sama dengan PDF resmi lain (shift-accountability-pdf.ts).
// =============================================================================
import type { CashLedgerReport } from "@/lib/cash-ledger-report";
import {
  OfficialPdfWriter as Writer,
  officialCover as cover,
  pdfDateTime as dateTime,
  pdfLongDate as longDate,
  pdfNum as num,
  pdfRp as rp,
} from "@/lib/shift-accountability-pdf";

const SHORT: Record<string, string> = {
  drawer: "Laci",
  petty: "Petty",
  bank_jago: "Jago",
  bank_bni: "BNI",
  qris_clearing: "QRIS",
  deposit_transit: "Setoran",
  external: "Pihak luar",
};

export async function renderCashLedgerPdf(r: CashLedgerReport) {
  const w = new Writer(`Buku kas · ${r.from} s/d ${r.to}`);
  w.watermark = r.totals.unreconciled.length ? "PERIKSA · SALDO TIDAK COCOK" : null;
  cover(w, "Buku Kas Rinci & Arus Kas", `${longDate(r.from)} — ${longDate(r.to)}`, [
    ["Outlet", r.outletName ?? "Semua outlet (rekening bersifat global)"],
    ["Periode", `${r.from} s/d ${r.to}`],
    ["Jumlah baris buku kas", num(r.totals.entries)],
    ["Baris pembalik (koreksi)", num(r.totals.reversals)],
    ["Baris data lama (migrasi, belum diverifikasi)", num(r.totals.legacyRows)],
    ["Rekonsiliasi saldo", r.totals.unreconciled.length ? `TIDAK COCOK: ${r.totals.unreconciled.join(", ")}` : "Cocok untuk semua akun"],
    ["Report ID", r.meta.reportId],
  ]);

  w.section("Arus kas per akun", "landscape", "Saldo awal + masuk − keluar = saldo akhir. Saldo laci = kas seharusnya menurut buku kas, bukan hitungan fisik (selisih fisik: PDF closing harian). Buku kas tidak bisa diubah/dihapus; koreksi = baris pembalik.");
  w.table(
    [
      { label: "Akun", width: 26 },
      { label: "Saldo awal", width: 13, align: "right" },
      { label: "Masuk", width: 13, align: "right" },
      { label: "Keluar", width: 13, align: "right" },
      { label: "Saldo akhir", width: 13, align: "right" },
      { label: "Cek DB", width: 10 },
    ],
    r.accounts.map((a) => [a.label, rp(a.opening), rp(a.inflow), rp(a.outflow), rp(a.closing), a.reconciled ? "Cocok" : `BEDA ${rp(a.recordedClosing - a.closing)}`]),
  );

  w.section("Arus dengan pihak luar (non-laci)", "portrait", "Lawan akun di luar Garage: modal awal shift, uang pribadi Owner, pembayaran ke pihak luar. Rincian per jenis di bawah.");
  w.keyValues([
    ["Masuk dari pihak luar ke akun Garage", rp(r.external.inflow)],
    ["Keluar dari akun Garage ke pihak luar", rp(r.external.outflow)],
  ]);
  w.table(
    [
      { label: "Jenis", width: 50 },
      { label: "Masuk", width: 25, align: "right" },
      { label: "Keluar", width: 25, align: "right" },
    ],
    r.external.bySource.map((s) => [s.label, rp(s.inflow), rp(s.outflow)]),
    { empty: "Tidak ada arus dengan pihak luar." },
  );

  for (const account of r.accounts) {
    if (!account.lines.length) continue;
    w.section(`${account.label} · rincian per jenis`, "portrait");
    w.table(
      [
        { label: "Jenis", width: 46 },
        { label: "Baris", width: 10, align: "right" },
        { label: "Masuk", width: 22, align: "right" },
        { label: "Keluar", width: 22, align: "right" },
      ],
      account.bySource.map((s) => [s.label, num(s.count), rp(s.inflow), rp(s.outflow)]),
      { totals: ["TOTAL", num(account.lines.length), rp(account.inflow), rp(account.outflow)] },
    );
    w.section(`${account.label} · buku kas`, "landscape", `Saldo awal ${rp(account.opening)}. ID = 8 karakter awal ID baris buku kas (stabil; lengkap di Excel).`);
    w.table(
      [
        { label: "#", width: 5, align: "right" },
        { label: "ID", width: 7 },
        { label: "Waktu", width: 11 },
        { label: "Jenis", width: 15 },
        { label: "Lawan akun", width: 8 },
        { label: "Ref / shift", width: 14 },
        { label: "Masuk", width: 9, align: "right" },
        { label: "Keluar", width: 9, align: "right" },
        { label: "Saldo", width: 9, align: "right" },
        { label: "Oleh / catatan", width: 18 },
      ],
      account.lines.map((l) => [
        String(l.seq),
        l.id.slice(0, 8),
        dateTime(l.at),
        `${l.label}${l.reversesId ? ` (balik ${l.reversesId.slice(0, 8)})` : ""}${l.reversedById ? " · dibalik" : ""}${l.legacy ? " · data lama" : ""}`,
        SHORT[l.counterparty] ?? l.counterparty,
        [l.ref, l.sessionCode].filter(Boolean).join(" · ") || "-",
        l.inflow ? rp(l.inflow) : "",
        l.outflow ? rp(l.outflow) : "",
        rp(l.running),
        [l.by, l.note].filter(Boolean).join(" · ") || "-",
      ]),
      { fontSize: 6.5, totals: ["", "", "", "TOTAL", "", "", rp(account.inflow), rp(account.outflow), rp(account.closing), ""] },
    );
  }

  w.section("Metadata audit", "portrait");
  w.keyValues(
    [
      ["Report ID", r.meta.reportId],
      ["Hash (SHA-256)", r.meta.hash],
      ["Sumber", "cash_ledger_entries (append-only; trigger menolak UPDATE/DELETE)"],
      ["Dibuat", dateTime(r.meta.generatedAt)],
    ],
    0.35,
  );
  return w.finish();
}
