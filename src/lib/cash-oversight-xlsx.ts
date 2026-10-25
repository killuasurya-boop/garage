import ExcelJS from "exceljs";

import {
  OVERSIGHT_EXCEPTION_LABEL,
  OVERSIGHT_EXCEPTIONS,
  OVERSIGHT_QUEUE_META,
  OVERSIGHT_QUEUES,
  type CashOversight,
  type OversightItem,
} from "@/lib/cash-oversight-meta";

const ITEM_COLUMNS: Array<{ header: string; key: keyof OversightItem | "category"; width: number }> = [
  { header: "Kategori", key: "category", width: 42 },
  { header: "Ref", key: "ref", width: 22 },
  { header: "Outlet", key: "outletCode", width: 10 },
  { header: "Orang", key: "person", width: 20 },
  { header: "Uraian", key: "title", width: 40 },
  { header: "Keterangan", key: "detail", width: 48 },
  { header: "Nominal (Rp)", key: "amount", width: 14 },
  { header: "Waktu", key: "at", width: 20 },
  { header: "Umur (jam)", key: "ageHours", width: 11 },
];

const jakartaTime = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });

/** Excel dari objek yang sama dengan layar (angka identik). Baris 1 = versi snapshot. */
export async function oversightWorkbook(data: CashOversight) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Garage OS";
  const stamp = `Snapshot ${jakartaTime.format(new Date(data.generatedAt))} WIB · periode ${data.period.from} s.d. ${data.period.to}`;

  const summary = workbook.addWorksheet("Ringkasan");
  summary.columns = [
    { header: "", key: "label", width: 46 },
    { header: "", key: "value", width: 20 },
  ];
  summary.addRow({ label: stamp });
  summary.addRow({});
  const rows: Array<[string, number]> = [
    ["Jumlah shift", data.summary.shifts],
    ["Shift masih buka", data.summary.openShifts],
    ["Shift ditutup", data.summary.closedShifts],
    ["Shift diverifikasi", data.summary.verified],
    ["Selisih lebih (Rp)", data.summary.over],
    ["Selisih kurang (Rp)", data.summary.short],
    ["Status Balance (Rp0)", data.summary.byStatus.ok],
    ["Status Selisih kecil", data.summary.byStatus.minor],
    ["Status Perlu diperiksa", data.summary.byStatus.review],
    ["Status Kritis", data.summary.byStatus.critical],
    ["Setoran dikonfirmasi (Rp)", data.summary.depositsConfirmed],
    ["Setoran dalam perjalanan (Rp)", data.summary.depositsInTransit],
    ["Item terbuka (semua antrean)", data.summary.openItems],
  ];
  for (const [label, value] of rows) summary.addRow({ label, value });
  summary.addRow({});
  summary.addRow({ label: "Saldo buku kas (akhir periode)" }).font = { bold: true };
  for (const balance of data.balances) summary.addRow({ label: balance.label, value: balance.balance });
  summary.getRow(1).font = { bold: true };

  const addItems = (name: string, groups: Array<{ label: string; items: OversightItem[] }>) => {
    const sheet = workbook.addWorksheet(name);
    sheet.addRow([stamp]).font = { bold: true };
    const header = sheet.addRow(ITEM_COLUMNS.map((column) => column.header));
    header.font = { bold: true };
    ITEM_COLUMNS.forEach((column, index) => {
      sheet.getColumn(index + 1).width = column.width;
    });
    for (const group of groups) {
      for (const item of group.items) {
        sheet.addRow(
          ITEM_COLUMNS.map((column) =>
            column.key === "category"
              ? group.label
              : column.key === "at"
                ? jakartaTime.format(new Date(item.at))
                : (item[column.key] ?? ""),
          ),
        );
      }
    }
    return sheet;
  };
  addItems(
    "Antrean tindakan",
    OVERSIGHT_QUEUES.map((key) => ({ label: OVERSIGHT_QUEUE_META[key].label, items: data.queues[key] })),
  );
  addItems(
    "Pengecualian kontrol",
    OVERSIGHT_EXCEPTIONS.map((key) => ({ label: OVERSIGHT_EXCEPTION_LABEL[key], items: data.exceptions[key] })),
  );
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
