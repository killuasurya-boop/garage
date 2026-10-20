import { CASH_DRAWER_GROUP_LABELS, CASH_DRAWER_STATUS_LABELS } from "@/lib/cash-drawer";
import { cashMovementFiltersFrom } from "@/lib/cash-movement-http";
import { csvCell } from "@/lib/event-invitations";
import { listCashMovements } from "@/lib/garage-service";
import { requireCashierSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const fmtDateTime = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(
        new Date(iso),
      )
    : "";

/**
 * Ekspor CSV riwayat kas laci dengan filter yang sama seperti layar Riwayat
 * (maks 5.000 baris). Hak akses & penyembunyian saldo sama dengan daftar.
 */
export async function GET(request: Request) {
  const session = await requireCashierSession();
  if (session.response) return session.response;
  const params = new URL(request.url).searchParams;
  const list = await listCashMovements({ ...cashMovementFiltersFrom(params), limit: 5_000 }, session.data);

  const header = [
    "No Ref",
    "Waktu",
    "Jenis",
    "Kategori",
    "Kelompok",
    "Deskripsi",
    "Nominal",
    "Status",
    "Pihak terkait",
    "Karyawan",
    "Toko/pemasok",
    "No nota",
    "Foto nota",
    "No order",
    "Kasir",
    "Disetujui oleh",
    "Ditolak oleh",
    "Dibatalkan oleh",
    "Alasan",
    "Saldo sebelum",
    "Saldo sesudah",
    "Shift",
    "Catatan",
  ];
  const lines = list.items.map((row) =>
    [
      row.refNo ?? "",
      fmtDateTime(row.movementAt),
      row.type === "out" ? "Kas keluar" : "Kas masuk",
      row.category,
      CASH_DRAWER_GROUP_LABELS[row.group],
      row.description,
      row.amount,
      CASH_DRAWER_STATUS_LABELS[row.status] ?? row.status,
      row.counterparty ?? "",
      row.employeeName ?? "",
      row.vendorName ?? "",
      row.receiptNo ?? "",
      row.hasReceiptPhoto ? "Ada" : "",
      row.orderNo ?? "",
      row.createdByName ?? "",
      row.approvedByName ?? "",
      row.rejectedByName ?? "",
      row.voidedByName ?? "",
      row.voidReason ?? row.decisionNote ?? "",
      row.balanceBefore ?? (row.balanceHidden ? "Disembunyikan" : ""),
      row.balanceAfter ?? (row.balanceHidden ? "Disembunyikan" : ""),
      row.sessionCode ?? "",
      row.note ?? "",
    ]
      .map(csvCell)
      .join(";"),
  );
  // BOM + pemisah ";" supaya langsung terbaca rapi di Excel lokal Indonesia.
  const csv = `﻿${[header.map(csvCell).join(";"), ...lines].join("\r\n")}`;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kas-laci-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
