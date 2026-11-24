"use client";

import type { Dispatch, SetStateAction } from "react";
import { FileText, Printer, RefreshCw, Scissors, Trash2, Wallet } from "lucide-react";

import {
  tableHasLiveSession,
  tableLiveStatusLabel,
  tableNeedsCleaning,
} from "@/components/garage/garage-app-helpers";
import type { InvoiceDeleteTarget } from "@/components/garage/pos-invoice-delete-dialog";
import { billStatusLabel, kitchenStatusLabel, kitchenStatusTone, statusClass, type QrWorkTab } from "@/components/garage/pos/pos-status";
import { StaffTableJoinCode } from "@/components/garage/staff-table-join-code";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { OrderType, TableLiveRow, TableOrderBill } from "@/lib/garage-api-types";
import { currency } from "@/lib/garage-data";

type QrInsightFilters = { status: string; source: string; table: string };

/**
 * Dialog "Cek Meja": detail + aksi cepat saat kasir tap kartu meja. Dipindah dari
 * pos-view.tsx tanpa perubahan perilaku (U0e) — nama props = nama variabel aslinya.
 */
export function PosTableDetailDialog({
  tableDetail,
  setTableDetail,
  tableOrderBills,
  setTableOrderBills,
  tableItemsLoading,
  setTableItemsLoading,
  tableItemsError,
  setTableItemsError,
  tableActionBusy,
  provisionalBillBusyId,
  canDeleteInvoice,
  setInvoiceDeleteTarget,
  setOrderType,
  setSelectedTableNumber,
  setQrOperationsOpen,
  setQrInsightFilters,
  setQrWorkTab,
  setResetTableDialogOpen,
  setSelectedTableToReset,
  setTableSplitBill,
  payTableBill,
  printProvisionalBill,
  reprintTableBillChit,
  requestTableBill,
}: {
  tableDetail: TableLiveRow | null;
  setTableDetail: Dispatch<SetStateAction<TableLiveRow | null>>;
  tableOrderBills: TableOrderBill[] | null;
  setTableOrderBills: Dispatch<SetStateAction<TableOrderBill[] | null>>;
  tableItemsLoading: boolean;
  setTableItemsLoading: Dispatch<SetStateAction<boolean>>;
  tableItemsError: string | null;
  setTableItemsError: Dispatch<SetStateAction<string | null>>;
  tableActionBusy: "ready" | "bill" | null;
  provisionalBillBusyId: string | null;
  canDeleteInvoice: boolean;
  setInvoiceDeleteTarget: Dispatch<SetStateAction<InvoiceDeleteTarget | null>>;
  setOrderType: Dispatch<SetStateAction<OrderType>>;
  setSelectedTableNumber: Dispatch<SetStateAction<string>>;
  setQrOperationsOpen: Dispatch<SetStateAction<boolean>>;
  setQrInsightFilters: Dispatch<SetStateAction<QrInsightFilters>>;
  setQrWorkTab: Dispatch<SetStateAction<QrWorkTab>>;
  setResetTableDialogOpen: Dispatch<SetStateAction<boolean>>;
  setSelectedTableToReset: Dispatch<SetStateAction<TableLiveRow | null>>;
  setTableSplitBill: Dispatch<SetStateAction<TableOrderBill | null>>;
  payTableBill: (bill: Pick<TableOrderBill, "id" | "orderNo">) => Promise<void>;
  printProvisionalBill: (bill: Pick<TableOrderBill, "id" | "orderNo">) => Promise<void>;
  reprintTableBillChit: (bill: TableOrderBill, tableLabel: string) => void;
  requestTableBill: () => Promise<void>;
}) {
  return (
    <Dialog
      open={Boolean(tableDetail)}
      onOpenChange={(open) => {
        if (!open) {
          setTableDetail(null);
          setTableOrderBills(null);
          setTableItemsError(null);
          setTableItemsLoading(false);
        }
      }}
    >
      {tableDetail
        ? (() => {
            const detailEmpty =
              tableDetail.status === "empty" && !tableHasLiveSession(tableDetail);
            const detailCleaning = tableNeedsCleaning(tableDetail);
            const pickTable = () => {
              setOrderType("dine-in");
              setSelectedTableNumber(tableDetail.tableNumber);
              setTableDetail(null);
              setQrOperationsOpen(false);
            };
            return (
              <DialogContent className="border-[#34343c] bg-[#111116] max-w-sm sm:max-w-md">
                <DialogHeader className="text-left">
                  <DialogTitle className="flex items-center gap-2">
                    <span
                      className={`size-2.5 rounded-full ${
                        detailEmpty ? "bg-[#22c55e]" : "bg-[#d11a2a]"
                      }`}
                    />
                    Meja {tableDetail.tableNumber}
                  </DialogTitle>
                  <DialogDescription>
                    {detailCleaning
                      ? "Perlu dibersihkan sebelum dipakai lagi."
                      : detailEmpty
                        ? "Meja kosong dan siap digunakan."
                        : `Terisi · ${tableLiveStatusLabel(tableDetail)}`}
                  </DialogDescription>
                </DialogHeader>

                {!detailEmpty ? (
                  <div className="space-y-2 rounded-md border border-[#34343c] bg-white/[0.04] p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[#b8b8bf]">Status</span>
                      <span className="font-semibold text-white">
                        {tableLiveStatusLabel(tableDetail)}
                      </span>
                    </div>
                    {tableDetail.kitchenStatus ? (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#b8b8bf]">Status dapur</span>
                        <Badge className={`${statusClass[tableDetail.kitchenStatus] ?? statusClass.info} px-2 text-[11px]`}>
                          {({
                            queue: "Antre",
                            cooking: "Dimasak",
                            ready: "Siap",
                            delivered: "Diantar",
                            completed: "Selesai",
                          } as Record<string, string>)[tableDetail.kitchenStatus] ??
                            tableDetail.kitchenStatus}
                        </Badge>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[#b8b8bf]">Durasi terisi</span>
                      <span
                        className={`garage-mono font-semibold ${
                          tableDetail.timerMinutes >= 90
                            ? "text-[#ffd08a]"
                            : "text-white"
                        }`}
                      >
                        {tableDetail.timerMinutes}m
                      </span>
                    </div>
                    {tableDetail.orderNo ? (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#b8b8bf]">Order</span>
                        <span className="garage-mono font-semibold text-white">
                          {tableDetail.orderNo}
                        </span>
                      </div>
                    ) : null}
                    {tableDetail.customerName ? (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#b8b8bf]">Pelanggan</span>
                        <span className="truncate font-semibold text-white">
                          {tableDetail.customerName}
                        </span>
                      </div>
                    ) : null}
                    {tableDetail.total > 0 ? (
                      <div className="flex items-center justify-between gap-2 border-t border-[#34343c] pt-2">
                        <span className="text-[#b8b8bf]">Total bill</span>
                        <span className="garage-mono text-base font-black text-[#ffd08a]">
                          {currency.format(tableDetail.total)}
                        </span>
                      </div>
                    ) : null}
                    <StaffTableJoinCode joinCode={tableDetail.joinCode} tableLabel={tableDetail.tableLabel} />
                    {/* Ringkasan meja: bill terbuka/lunas + jumlah item. */}
                    {(tableDetail.openBillCount ?? 0) +
                      (tableDetail.paidBillCount ?? 0) >
                      0 || (tableOrderBills?.length ?? 0) > 0 ? (
                      <div className="flex flex-wrap items-center gap-1.5 border-t border-[#34343c] pt-2">
                        <Badge className="border-[#f5a742]/45 bg-[#f5a742]/12 px-2 text-[11px] text-[#ffd08a]">
                          {tableDetail.openBillCount ?? 0} bill terbuka
                        </Badge>
                        <Badge className="border-[#22c55e]/45 bg-[#22c55e]/12 px-2 text-[11px] text-[#dcfce7]">
                          {tableDetail.paidBillCount ?? 0} lunas
                        </Badge>
                        {tableOrderBills ? (
                          <Badge className="garage-mono border-[#4a4a54] bg-white/[0.06] px-2 text-[11px] text-[#d6d6dc]">
                            {tableOrderBills.reduce(
                              (sum, bill) =>
                                sum +
                                bill.items.reduce((s, item) => s + item.qty, 0),
                              0,
                            )}{" "}
                            item
                          </Badge>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="border-t border-[#34343c] pt-2">
                      <p className="mb-1.5 text-[11px] uppercase tracking-wide text-[#8f8f98]">
                        Rincian pesanan
                      </p>
                      {tableItemsLoading ? (
                        <div className="flex items-center gap-2 py-3 text-xs text-[#b8b8bf]">
                          <RefreshCw className="size-3.5 animate-spin" />
                          Memuat rincian pesanan…
                        </div>
                      ) : tableItemsError ? (
                        <p className="rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 p-2 text-xs text-[#ffc2c8]">
                          {tableItemsError}
                        </p>
                      ) : tableOrderBills && tableOrderBills.length ? (
                        <div className="garage-scroll max-h-[42vh] space-y-2 overflow-y-auto pr-0.5">
                          {tableOrderBills.map((bill) => (
                            <div
                              key={bill.id}
                              className="rounded-md border border-[#303038] bg-black/20 p-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="garage-mono truncate text-xs font-semibold text-[#d6d6dc]">
                                  {bill.orderNo}
                                </span>
                                <Badge className={`${statusClass[bill.status] ?? statusClass.info} shrink-0 px-2 text-[11px]`}>
                                  {billStatusLabel(bill.status)}
                                </Badge>
                              </div>
                              {bill.customerName ? (
                                <p className="mt-0.5 truncate text-[11px] text-[#b8b8bf]">
                                  {bill.customerName}
                                </p>
                              ) : null}
                              {bill.parentOrderId ? (
                                <p className="mt-0.5 text-[11px] font-semibold text-[#ffd79a]">
                                  Bill pisahan
                                </p>
                              ) : null}
                              {bill.customerNote ? (
                                <p className="mt-1 rounded border border-[#f5a742]/35 bg-[#f5a742]/10 px-1.5 py-1 text-[11px] italic text-[#ffd08a]">
                                  Catatan: {bill.customerNote}
                                </p>
                              ) : null}
                              {/* Ringkasan station: jumlah item + status tiket Dapur/Bar. */}
                              {bill.items.length ? (
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {(["Dapur", "Bar"] as const).map((station) => {
                                    const qty = bill.items
                                      .filter((item) => item.station === station)
                                      .reduce((sum, item) => sum + item.qty, 0);
                                    if (!qty) return null;
                                    const status =
                                      bill.stations.find((row) => row.station === station)?.status ??
                                      null;
                                    return (
                                      <span
                                        key={station}
                                        className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${kitchenStatusTone(status)}`}
                                      >
                                        {station} {qty} · {kitchenStatusLabel(status)}
                                      </span>
                                    );
                                  })}
                                </div>
                              ) : null}
                              <div className="mt-1.5 space-y-1">
                                {bill.items.length ? (
                                  bill.items.map((item) => {
                                    const itemStatus =
                                      bill.stations.find((row) => row.station === item.station)
                                        ?.status ?? null;
                                    return (
                                    <div key={item.id} className="text-xs">
                                      <div className="flex items-start justify-between gap-2">
                                        <span className="min-w-0 text-[#e7e7ea]">
                                          <span className="garage-mono font-semibold text-white">
                                            {item.qty}×
                                          </span>{" "}
                                          {item.itemName}
                                          {item.variantLabel ? (
                                            <span className="text-[#8f8f98]"> · {item.variantLabel}</span>
                                          ) : null}
                                        </span>
                                        <span className="garage-mono shrink-0 text-[#d6d6dc]">
                                          {currency.format(item.lineTotal)}
                                        </span>
                                      </div>
                                      <div className="mt-0.5 flex items-center gap-1 pl-4">
                                        <span className="text-[11px] text-[#8f8f98]">{item.station}</span>
                                        <span
                                          className={`rounded border px-1 text-[11px] font-semibold ${kitchenStatusTone(itemStatus)}`}
                                        >
                                          {kitchenStatusLabel(itemStatus)}
                                        </span>
                                      </div>
                                      {item.note ? (
                                        <p className="mt-0.5 pl-4 text-[11px] italic text-[#9aa0a6]">
                                          {item.note}
                                        </p>
                                      ) : null}
                                    </div>
                                    );
                                  })
                                ) : (
                                  <p className="text-[11px] text-[#6f6f78]">Tanpa rincian item.</p>
                                )}
                              </div>
                              <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-[#303038] pt-1.5 text-xs">
                                <span className="text-[#8f8f98]">Subtotal bill</span>
                                <span className="garage-mono font-bold text-[#ffd08a]">
                                  {currency.format(bill.total)}
                                </span>
                              </div>
                              {bill.items.length ? (
                                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="garage-press h-9 border-[#4a4a54] bg-white/[0.05] px-2 text-[11px]"
                                    onClick={() =>
                                      reprintTableBillChit(bill, tableDetail.tableLabel)
                                    }
                                  >
                                    <Printer className="mr-1 size-3.5 shrink-0" />
                                    Chit dapur
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="garage-press h-9 border-[#f5a742]/45 bg-[#f5a742]/10 px-2 text-[11px] text-[#ffe0ad]"
                                    disabled={provisionalBillBusyId === bill.id}
                                    onClick={() => void printProvisionalBill(bill)}
                                  >
                                    <FileText className="mr-1 size-3.5 shrink-0" />
                                    {provisionalBillBusyId === bill.id ? "Mencetak…" : "Bill sementara"}
                                  </Button>
                                  {canDeleteInvoice && bill.status !== "paid" ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      data-testid="pos-table-invoice-delete"
                                      className="garage-press col-span-2 h-9 border-[#d11a2a]/55 bg-[#d11a2a]/10 px-2 text-[11px] text-[#ffc2c8]"
                                      onClick={() =>
                                        setInvoiceDeleteTarget({
                                          id: bill.id,
                                          orderNo: bill.orderNo,
                                          total: bill.total,
                                          label: [tableDetail.tableLabel, bill.customerName].filter(Boolean).join(" · "),
                                          status: bill.status,
                                        })
                                      }
                                    >
                                      <Trash2 className="mr-1 size-3.5 shrink-0" />
                                      Hapus invoice
                                    </Button>
                                  ) : null}
                                </div>
                              ) : null}
                              {bill.canSplit || bill.canPay ? (
                                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                                  {bill.canSplit ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className={`garage-press h-10 border-[#d6d6dc]/40 bg-white/[0.06] px-2 text-xs font-semibold text-white ${
                                        bill.canPay ? "" : "col-span-2"
                                      }`}
                                      onClick={() => setTableSplitBill(bill)}
                                    >
                                      <Scissors className="mr-1 size-3.5 shrink-0" />
                                      Pisah bill
                                    </Button>
                                  ) : null}
                                  {bill.canPay ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      className={`garage-press h-10 bg-[#22c55e] px-2 text-xs font-bold text-black hover:bg-[#34d76b] ${
                                        bill.canSplit ? "" : "col-span-2"
                                      }`}
                                      onClick={() => void payTableBill(bill)}
                                    >
                                      <Wallet className="mr-1 size-3.5 shrink-0" />
                                      Bayar {currency.format(bill.total)}
                                    </Button>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="py-2 text-xs text-[#8f8f98]">Belum ada item.</p>
                      )}
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    className="garage-press h-11 bg-[#d11a2a] text-sm text-white hover:bg-[#ff2a3a]"
                    onClick={pickTable}
                  >
                    {detailEmpty
                      ? "Pilih meja ini untuk order"
                      : "Tambah order ke meja ini"}
                  </Button>
                  {!detailEmpty &&
                  tableDetail.currentOrderId &&
                  ["accepted", "ready", "mixed"].includes(tableDetail.status) ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="garage-press h-11 border-[#f5a742]/55 bg-[#f5a742]/12 px-2 text-sm text-[#ffe0ad]"
                      disabled={tableActionBusy !== null}
                      onClick={() => void requestTableBill()}
                    >
                      {tableActionBusy === "bill" ? "Memproses…" : "Siapkan bill"}
                    </Button>
                  ) : null}
                  {!detailEmpty ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="garage-press h-11 border-[#4a4a54] bg-white/[0.05] text-sm"
                      onClick={() => {
                        const target = tableDetail.tableNumber;
                        setTableDetail(null);
                        setQrInsightFilters((current) => ({
                          ...current,
                          table: target,
                        }));
                        setQrWorkTab("qr_control");
                      }}
                    >
                      Lihat bill di QR control
                    </Button>
                  ) : null}
                  {detailCleaning ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="garage-press h-12 border-[#22c55e]/55 bg-[#22c55e]/12 text-sm text-[#dcfce7]"
                      onClick={() => {
                        const target = tableDetail;
                        setTableDetail(null);
                        setSelectedTableToReset(target);
                        setResetTableDialogOpen(true);
                      }}
                    >
                      Bersihkan meja
                    </Button>
                  ) : null}
                </div>
              </DialogContent>
            );
          })()
        : null}
    </Dialog>
  );
}
