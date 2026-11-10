"use client";

import {
AlertTriangle,
Banknote,
Check,
Copy,
Equal,
Landmark,
Plus,
Printer,
QrCode,
RefreshCw,
Search,
ShieldCheck,
WalletCards
} from "lucide-react";
import Image from "next/image";
import {
useEffect,
useMemo,
useState
} from "react";
import {
bankAccounts,
eWalletAccounts,
tableAvailabilityLabel,
tableAvailabilityState,
tableLiveStatusLabel,
tableLiveStatusTone,
type PosCustomerMode,
type TableAvailability
} from "@/components/garage/garage-app-helpers";
import { Alert,AlertDescription,AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
Select,
SelectContent,
SelectItem,
SelectTrigger,
SelectValue
} from "@/components/ui/select";
import { Tabs,TabsList,TabsTrigger } from "@/components/ui/tabs";
import type {
CartLine,
Customer,
MenuItem,
MenuVariant,
OrderType,
PosMemberLookupResponse,
TableLiveRow
} from "@/lib/garage-api-types";
import {
currency
} from "@/lib/garage-data";
import { BillRow, PaymentStep, OpenBillSaved } from "@/components/garage/pos/pos-ui-shared";


export function PaymentWizardProgress({ step }: { step: PaymentStep }) {
  const steps: Array<{ id: PaymentStep; label: string; shortLabel: string }> = [
    { id: "summary", label: "Ringkasan", shortLabel: "Ringkas" },
    { id: "table", label: "Meja", shortLabel: "Meja" },
    { id: "customer", label: "Pelanggan", shortLabel: "Plg." },
    { id: "payment", label: "Pembayaran", shortLabel: "Bayar" },
    { id: "done", label: "Selesai", shortLabel: "Selesai" },
  ];
  const currentIndex = steps.findIndex((item) => item.id === step);

  return (
    <div className="grid grid-cols-5 gap-1">
      {steps.map((item, index) => {
        const active = index <= currentIndex;
        return (
          <div
            key={item.id}
            className={`rounded-md border px-1 py-2 text-center sm:px-2 ${
              active
                ? "border-[#f5a742]/45 bg-[#f5a742]/12 text-[#ffe0ad]"
                : "border-[#34343c] bg-white/[0.04] text-[#8f8f99]"
            }`}
            title={`Step ${index + 1}: ${item.label}`}
          >
            <p className="garage-mono text-[11px]">Step {index + 1}</p>
            <p className="mt-0.5 text-[11px] font-semibold leading-tight">
              <span className="sm:hidden">{item.shortLabel}</span>
              <span className="hidden sm:inline">{item.label}</span>
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function CheckoutSummaryCard({
  cartLines,
  cartItemCount,
  subtotal,
  service,
  tax,
  serviceChargePct,
  taxPct,
  roundingAdjustment,
  voucher,
  manualDiscount,
  totalDue,
}: {
  cartLines: Array<CartLine & { item: MenuItem; variant: MenuVariant }>;
  cartItemCount: number;
  subtotal: number;
  service: number;
  tax: number;
  serviceChargePct: number;
  taxPct: number;
  roundingAdjustment: number;
  voucher: number;
  manualDiscount: { amount: number; reason: string } | null;
  totalDue: number;
}) {
  return (
    <div className="rounded-md border border-[#34343c] bg-[#18181f] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="garage-mono text-[10px] uppercase tracking-[0.14em] text-[#b8b8bf]">
            Ringkasan order
          </p>
          <h3 className="mt-1 text-xl font-black text-white">{cartItemCount} item</h3>
        </div>
        <div className="text-right">
          <p className="garage-mono text-[10px] text-[#b8b8bf]">Total bayar</p>
          <p className="text-xl font-black text-[#ffd08a]">{currency.format(totalDue)}</p>
        </div>
      </div>
      <div className="garage-scroll mt-3 max-h-52 space-y-2 overflow-y-auto pr-1">
        {cartLines.map((line) => (
          <div
            key={`${line.itemId}-${line.variantId}`}
            className="flex items-start justify-between gap-3 rounded-md border border-[#34343c] bg-[#202027]/78 p-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{line.item.name}</p>
              <p className="text-xs text-[#b8b8bf]">
                {line.variant.label} x {line.qty}
              </p>
            </div>
            <p className="shrink-0 text-sm font-semibold text-white">
              {currency.format(line.variant.price * line.qty)}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-1 border-t border-[#34343c] pt-3 text-sm sm:grid-cols-2">
        <BillRow label="Subtotal" value={currency.format(subtotal)} />
        {service > 0 ? (
          <BillRow label={`Service ${serviceChargePct}%`} value={currency.format(service)} />
        ) : null}
        {tax > 0 ? <BillRow label={`PB1 ${taxPct}%`} value={currency.format(tax)} /> : null}
        {roundingAdjustment !== 0 ? (
          <BillRow
            label="Pembulatan"
            value={`${roundingAdjustment > 0 ? "+" : "-"} ${currency.format(Math.abs(roundingAdjustment))}`}
          />
        ) : null}
        {voucher > 0 ? (
          <BillRow label="Voucher" value={`- ${currency.format(voucher)}`} accent />
        ) : null}
        {manualDiscount && manualDiscount.amount > 0 ? (
          <BillRow
            label={`Diskon kasir (${manualDiscount.reason})`}
            value={`- ${currency.format(manualDiscount.amount)}`}
            accent
          />
        ) : null}
      </div>
    </div>
  );
}

export function CheckoutOrderStep({
  orderType,
  tableLabel,
  selectedTableNumber,
  selectedTableLiveRow,
  selectedTableAvailability,
  dineInTableMissing,
  tablePickerRows,
  tableLiveDataReady,
  paymentPending,
  onOrderTypeChange,
  onTableChange,
}: {
  orderType: OrderType;
  tableLabel: string;
  selectedTableNumber: string;
  selectedTableLiveRow: TableLiveRow | null;
  selectedTableAvailability: TableAvailability;
  dineInTableMissing: boolean;
  tablePickerRows: TableLiveRow[];
  tableLiveDataReady: boolean;
  paymentPending: boolean;
  onOrderTypeChange: (value: OrderType) => void;
  onTableChange: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-[#34343c] bg-[#18181f] p-3">
        <p className="garage-mono text-[10px] uppercase tracking-[0.14em] text-[#b8b8bf]">
          Tipe order
        </p>
        <Tabs
          value={orderType}
          onValueChange={(value) => onOrderTypeChange(value as OrderType)}
          className="mt-2 w-full"
        >
          <TabsList className="grid w-full grid-cols-3 bg-[#202027]">
            <TabsTrigger value="dine-in" disabled={paymentPending}>
              Dine in
            </TabsTrigger>
            <TabsTrigger value="takeaway" disabled={paymentPending}>
              Take away
            </TabsTrigger>
            <TabsTrigger value="delivery" disabled={paymentPending}>
              Delivery
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {orderType === "dine-in" ? (
        <div className="rounded-md border border-[#34343c] bg-[#18181f] p-3">
          <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-end">
            <div>
              <p className="garage-mono mb-1 text-[10px] text-[#b8b8bf]">No meja</p>
              <Select value={selectedTableNumber} onValueChange={onTableChange} disabled={paymentPending}>
                <SelectTrigger className="h-11 w-full border-[#34343c] bg-white/[0.06]">
                  <SelectValue placeholder="Pilih meja" />
                </SelectTrigger>
                <SelectContent>
                  {tablePickerRows.map((table) => {
                    const availability = tableAvailabilityState(table, tableLiveDataReady);
                    return (
                      <SelectItem key={table.tableNumber} value={table.tableNumber}>
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="pos-table-indicator"
                            data-state={availability}
                            aria-hidden="true"
                          />
                          <span>Meja {table.tableNumber}</span>
                          <span className="garage-mono ml-auto text-[10px] opacity-80">
                            {tableAvailabilityLabel(availability)}
                          </span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <Badge
              className={`${tableLiveStatusTone(selectedTableLiveRow)} inline-flex h-11 max-w-full items-center gap-1.5 px-3 text-[11px]`}
            >
              {selectedTableNumber ? (
                <span
                  className="pos-table-indicator"
                  data-state={selectedTableAvailability}
                  aria-hidden="true"
                />
              ) : null}
              <span className="truncate">
                {selectedTableNumber
                  ? `${tableLabel} - ${tableAvailabilityLabel(selectedTableAvailability)}`
                  : "Meja belum dipilih"}
              </span>
            </Badge>
          </div>

          <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#b8b8bf]" aria-label="Keterangan status meja">
            {(["ready", "held", "bill", "reserved", "cleaning"] as const).map((state) => (
              <li key={state} className="inline-flex items-center gap-1.5">
                <span className="pos-table-indicator" data-state={state} aria-hidden="true" />
                {state === "bill" ? "Terisi" : tableAvailabilityLabel(state)}
              </li>
            ))}
          </ul>
          <div className="garage-scroll mt-2 grid max-h-[min(50svh,420px)] grid-cols-5 gap-1.5 overflow-y-auto overscroll-contain pr-1 sm:grid-cols-8">
            {tablePickerRows.map((table) => {
              const selected = table.tableNumber === selectedTableNumber;
              const availability = tableAvailabilityState(table, tableLiveDataReady);

              return (
                <button
                  key={table.tableNumber}
                  type="button"
                  className={`garage-press relative min-h-14 rounded-md border p-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                    selected
                      ? "border-white bg-white/15 text-white ring-2 ring-white"
                      : availability === "ready"
                        ? "border-[#4a4a54] bg-white/[0.04] text-white hover:border-white/50"
                        : availability === "bill" || availability === "full"
                          ? "border-[#f5a742]/60 bg-[#f5a742]/10 text-[#ffd08a]"
                          : availability === "paid"
                            ? "border-[#d4d4d8]/55 bg-white/[0.07] text-white"
                            : availability === "cleaning"
                              ? "border-[#ff2a3a]/60 bg-[#d11a2a]/12 text-[#ffc2c8]"
                              : "border-[#303038] bg-black/16 text-[#d4d4d8]"
                  }`}
                  disabled={paymentPending}
                  onClick={() => onTableChange(table.tableNumber)}
                  aria-pressed={selected}
                  aria-label={`Meja ${table.tableNumber}, ${tableAvailabilityLabel(availability)}${selected ? ", dipilih" : ""}`}
                >
                  <span className="flex items-center justify-between gap-1">
                    <span className="garage-mono text-[18px] font-black tabular-nums leading-none">{table.tableNumber}</span>
                    {selected ? (
                      <Check className="size-4 text-white" aria-hidden />
                    ) : (
                      <span className="pos-table-indicator" data-state={availability} aria-hidden="true" />
                    )}
                  </span>
                  <span className="mt-1 block truncate text-[11px] font-semibold leading-tight">
                    {tableAvailabilityLabel(availability)}
                  </span>
                </button>
              );
            })}
          </div>

          {dineInTableMissing ? (
            <Alert className="mt-3 border-[#f5a742]/45 bg-[#f5a742]/12 text-[#f4f4f5]">
              <AlertTriangle className="size-4" />
              <AlertTitle>Nomor meja wajib</AlertTitle>
              <AlertDescription>Pilih meja untuk order dine-in.</AlertDescription>
            </Alert>
          ) : null}
          {selectedTableLiveRow ? (
            <TableSessionInfoCard
              tableLabel={tableLabel}
              row={selectedTableLiveRow}
            />
          ) : null}
        </div>
      ) : (
        <div className="rounded-md border border-[#34343c] bg-[#18181f] p-3">
          <p className="text-base font-semibold text-white">{tableLabel}</p>
          <p className="mt-1 text-xs text-[#b8b8bf]">Order ini tidak memakai nomor meja.</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TableSessionInfoCard — UX upgrade untuk meja yang dipilih.
// Kalau meja kosong → tampilkan card hijau "siap dipakai".
// Kalau meja butuh dibersihkan → card merah "perlu cleaning".
// Kalau meja punya session aktif (sudah ada order) → card amber
// "ORDER TAMBAHAN — akan masuk ke bill session yang sama".
// Ini menggantikan warning generic lama yang cuma bilang "status: pending".
// ─────────────────────────────────────────────────────────────
export function TableSessionInfoCard({
  tableLabel,
  row,
}: {
  tableLabel: string;
  row: TableLiveRow;
}) {
  const status = row.status;
  const hasActiveOrder = Boolean(row.currentOrderId);

  // Status "empty" + tidak butuh cleaning → kartu netral "siap dipakai"
  if (status === "empty" && !row.needsCleaning) {
    return (
      <div className="mt-3 rounded-md border border-white/20 bg-white/[0.05] p-3">
        <div className="flex items-center gap-2">
          <Check className="size-4 text-white" />
          <p className="garage-mono text-[11px] uppercase tracking-wide text-white">
            {tableLabel} siap dipakai
          </p>
        </div>
        <p className="mt-1 text-xs text-[#d4d4d8]">
          Meja kosong dan bersih. Lanjut ke step berikutnya.
        </p>
      </div>
    );
  }

  // Needs cleaning → red warning
  if (row.needsCleaning && !hasActiveOrder) {
    return (
      <div className="mt-3 rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 p-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-[#ffc2c8]" />
          <p className="garage-mono text-[11px] uppercase tracking-wide text-[#ffc2c8]">
            {tableLabel} perlu dibersihkan
          </p>
        </div>
        <p className="mt-1 text-xs text-[#ffe1e5]">
          Status meja: butuh cleaning sebelum customer baru duduk.
        </p>
      </div>
    );
  }

  // Active session — INI inti fitur Add Order
  if (hasActiveOrder) {
    const customerName = row.customerName?.trim() || "Tamu";
    const customerPhone = row.customerPhone?.trim();
    const kitchenStatus = row.kitchenStatus?.replace(/_/g, " ");
    const totalLabel = row.total > 0 ? currency.format(row.total) : "-";
    const minutesLabel =
      row.timerMinutes > 0
        ? row.timerMinutes >= 60
          ? `${Math.floor(row.timerMinutes / 60)}j ${row.timerMinutes % 60}m lalu`
          : `${row.timerMinutes} menit lalu`
        : "baru saja";

    return (
      <div className="mt-3 rounded-md border border-[#f5a742]/55 bg-gradient-to-br from-[#f5a742]/14 to-[#f5a742]/4 p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-[#f5a742]/55 bg-[#f5a742]/18 text-[#ffd79a]">
            <Plus className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="garage-mono text-[11px] font-bold uppercase tracking-wide text-[#ffd79a]">
                ORDER TAMBAHAN
              </p>
              <span className="rounded-md border border-[#f5a742]/45 bg-[#f5a742]/14 px-1.5 py-0.5 font-mono text-[11px] text-[#ffd79a]">
                {tableLabel}
              </span>
            </div>
            <p className="mt-1 text-sm text-[#f4f4f5]">
              Order ini akan ditambahkan ke bill yang sama. Customer bisa bayar
              sekaligus di akhir.
            </p>
          </div>
        </div>

        {/* Info order sebelumnya */}
        <div className="mt-3 rounded-md border border-[#34343c] bg-black/30 p-3">
          <p className="garage-mono text-[10px] uppercase tracking-wide text-[#8f8f99]">
            Order Aktif di {tableLabel}
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div>
              <p className="text-[10px] text-[#8f8f99]">No. Order</p>
              <p className="garage-mono text-sm font-semibold text-white">
                {row.orderNo ?? "-"}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-[#8f8f99]">Pelanggan</p>
              <p className="text-sm font-semibold text-white">{customerName}</p>
              {customerPhone && (
                <p className="font-mono text-[10px] text-[#8f8f99]">{customerPhone}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] text-[#8f8f99]">Total Saat Ini</p>
              <p className="garage-mono text-sm font-bold text-[#ffd79a]">{totalLabel}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#8f8f99]">Status</p>
              <p className="text-sm font-semibold capitalize text-white">
                {kitchenStatus || tableLiveStatusLabel(row)}
              </p>
              <p className="font-mono text-[10px] text-[#8f8f99]">
                Dibuat {minutesLabel}
              </p>
            </div>
          </div>
        </div>

        <p className="mt-2 text-[10px] leading-relaxed text-[#b8b8bf]">
          Mau order untuk customer berbeda? Pilih meja lain yang masih kosong (warna
          hijau di picker atas).
        </p>
      </div>
    );
  }

  // Fallback — status unknown / lain
  return (
    <div className="mt-3 rounded-md border border-[#34343c] bg-white/[0.04] p-3">
      <p className="text-xs text-[#b8b8bf]">
        {tableLabel} berstatus {tableLiveStatusLabel(row)}.
      </p>
    </div>
  );
}

export function CheckoutCustomerStep({
  mode,
  guestName,
  guestPhone,
  memberPhone,
  selectedMember,
  memberLookupLoading,
  memberError,
  memberCreatedPin,
  estimatedMemberPoints,
  pointsToUse,
  maxPointsToUse,
  minPointsToUse,
  pointValue,
  onPointsToUseChange,
  memberQrVerified,
  onScanMemberQr,
  memberOptions,
  onModeChange,
  onGuestNameChange,
  onGuestPhoneChange,
  onMemberPhoneChange,
  onLookupMember,
  onSelectMember,
  onClearMember,
  claimCode,
  claimCodeLoading,
  claimCodeError,
  onRequestClaimCode,
}: {
  mode: PosCustomerMode;
  guestName: string;
  guestPhone: string;
  memberPhone: string;
  selectedMember: PosMemberLookupResponse | null;
  memberLookupLoading: boolean;
  memberError: string | null;
  memberCreatedPin: string | null;
  estimatedMemberPoints: number;
  pointsToUse: number;
  maxPointsToUse: number;
  minPointsToUse: number;
  pointValue: number;
  onPointsToUseChange: (points: number) => void;
  memberQrVerified: boolean;
  onScanMemberQr: () => void;
  memberOptions: Customer[];
  onModeChange: (mode: PosCustomerMode) => void;
  onGuestNameChange: (value: string) => void;
  onGuestPhoneChange: (value: string) => void;
  onMemberPhoneChange: (value: string) => void;
  onLookupMember: () => void;
  onSelectMember: (customer: Customer) => void;
  onClearMember: () => void;
  /** Kode klaim member online dari kasir (owner Nov 2026). */
  claimCode: { code: string; expiresAt: string; maskedPhone: string } | null;
  claimCodeLoading: boolean;
  claimCodeError: string | null;
  onRequestClaimCode: () => void;
}) {
  const [memberSearch, setMemberSearch] = useState("");
  const memberSearchResults = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    if (query.length < 2) return memberOptions.slice(0, 6);
    return memberOptions
      .filter((customer) => {
        const haystack = [
          customer.name,
          customer.phone,
          customer.memberCode,
          customer.cardTier,
          customer.tier,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 8);
  }, [memberOptions, memberSearch]);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant={mode === "guest" ? "default" : "outline"}
          className={`garage-press h-12 ${
            mode === "guest" ? "bg-[#d11a2a] text-white hover:bg-[#ff2a3a]" : "border-[#4a4a54]"
          }`}
          onClick={() => onModeChange("guest")}
        >
          Tamu (non-member)
        </Button>
        <Button
          type="button"
          variant={mode === "member" ? "default" : "outline"}
          className={`garage-press h-12 ${
            mode === "member" ? "bg-[#d11a2a] text-white hover:bg-[#ff2a3a]" : "border-[#4a4a54]"
          }`}
          onClick={() => onModeChange("member")}
        >
          Member
        </Button>
      </div>

      {mode === "guest" ? (
        <div className="rounded-md border border-[#34343c] bg-[#18181f] p-3">
          <p className="garage-mono text-[10px] uppercase tracking-[0.14em] text-[#b8b8bf]">
            Tamu (non-member)
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="garage-mono mb-1 text-[10px] text-[#b8b8bf]">
                Nama (tampil di tiket produksi & antar)
              </p>
              <Input
                value={guestName}
                onChange={(event) => onGuestNameChange(event.target.value)}
                className="h-11 border-[#34343c] bg-white/[0.06]"
                placeholder="Nama pelanggan"
              />
            </div>
            <div>
              <p className="garage-mono mb-1 text-[10px] text-[#b8b8bf]">No WA opsional</p>
              <Input
                value={guestPhone}
                onChange={(event) => onGuestPhoneChange(event.target.value)}
                className="h-11 border-[#34343c] bg-white/[0.06]"
                placeholder="08xxxxxxxxxx"
              />
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-[#b8b8bf]">
            Nomor WA dibutuhkan untuk mengaktifkan tracking invoice dan tombol kirim link invoice.
            Jika nomor cocok dengan database member, POS otomatis memilih member tersebut.
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-[#34343c] bg-[#18181f] p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="garage-mono text-[10px] uppercase tracking-[0.14em] text-[#b8b8bf]">
              Member customer
            </p>
            <Badge className="garage-mono border-[#4a4a54] bg-white/[0.06] px-2 text-[10px] text-[#d4d4d8]">
              {selectedMember ? selectedMember.member.level : "Cari member"}
            </Badge>
          </div>
          {selectedMember ? (
            <div className="mt-3 rounded-md border border-[#34343c] bg-black/20 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {selectedMember.member.name}
                  </p>
                  <p className="garage-mono mt-0.5 truncate text-[11px] text-[#b8b8bf]">
                    {selectedMember.member.phone}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="garage-press h-8 px-2 text-xs text-[#d4d4d8]"
                  onClick={onClearMember}
                >
                  Lepas
                </Button>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-2">
                  <p className="garage-mono text-[11px] text-[#8f8f99]">Poin</p>
                  <p className="text-xs font-semibold text-white">
                    {selectedMember.member.totalPoints}
                  </p>
                </div>
                <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-2">
                  <p className="garage-mono text-[11px] text-[#8f8f99]">Pengali</p>
                  <p className="text-xs font-semibold text-white">
                    x{selectedMember.member.multiplier}
                  </p>
                </div>
                <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-2">
                  <p className="garage-mono text-[11px] text-[#8f8f99]">Estimasi</p>
                  <p className="text-xs font-semibold text-[#ffd08a]">+{estimatedMemberPoints}</p>
                </div>
              </div>
              <PosPointsRedeemBox
                balance={selectedMember.member.points}
                pointsToUse={pointsToUse}
                maxPointsToUse={maxPointsToUse}
                minPointsToUse={minPointsToUse}
                pointValue={pointValue}
                onChange={onPointsToUseChange}
                verified={memberQrVerified}
                onScan={onScanMemberQr}
              />
              {selectedMember.accountStatus === "crm-only" ? (
                <PosMemberClaimCode
                  claimCode={claimCode}
                  loading={claimCodeLoading}
                  error={claimCodeError}
                  onRequest={onRequestClaimCode}
                />
              ) : null}
              {memberCreatedPin ? (
                <Alert className="mt-3 border-[#22c55e]/45 bg-[#22c55e]/12 text-[#f4f4f5]">
                  <ShieldCheck className="size-4" />
                  <AlertTitle>PIN sementara</AlertTitle>
                  <AlertDescription>Berikan ke customer: {memberCreatedPin}</AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <div>
                <p className="garage-mono mb-1 text-[10px] text-[#b8b8bf]">
                  Pilih otomatis dari database
                </p>
                <Input
                  value={memberSearch}
                  onChange={(event) => setMemberSearch(event.target.value)}
                  className="h-11 border-[#34343c] bg-white/[0.06]"
                  placeholder="Cari member nama / HP / kode"
                />
                <div className="garage-scroll mt-2 max-h-44 space-y-1.5 overflow-y-auto pr-1">
                  {memberSearchResults.length > 0 ? (
                    memberSearchResults.map((customer) => (
                      <button
                        key={customer.id ?? customer.phone}
                        type="button"
                        className="garage-press grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border border-[#34343c] bg-white/[0.04] px-3 py-2 text-left transition hover:border-[#f5a742]/55 hover:bg-[#f5a742]/10"
                        onClick={() => onSelectMember(customer)}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-white">
                            {customer.name}
                          </span>
                          <span className="garage-mono mt-0.5 block truncate text-[10px] text-[#b8b8bf]">
                            {customer.phone}
                            {customer.memberCode ? ` - ${customer.memberCode}` : ""}
                          </span>
                        </span>
                        <Badge className="garage-mono border-[#4a4a54] bg-black/30 px-2 text-[10px] text-[#ffd08a]">
                          {customer.cardTier ?? customer.tier}
                        </Badge>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-md border border-[#34343c] bg-white/[0.03] p-3 text-xs text-[#8f8f99]">
                      Member tidak ditemukan di database aktif.
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <Input
                  value={memberPhone}
                  onChange={(event) => onMemberPhoneChange(event.target.value)}
                  className="h-11 border-[#34343c] bg-white/[0.06]"
                  placeholder="No HP member"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-11 border-[#4a4a54] px-4"
                  disabled={memberLookupLoading}
                  onClick={onLookupMember}
                >
                  {memberLookupLoading ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <Search className="size-4" />
                  )}
                </Button>
              </div>
              <div className="rounded-md border border-[#34343c] bg-white/[0.035] p-3 text-xs leading-5 text-[#b8b8bf]">
                Member baru wajib registrasi sendiri lewat portal member. POS hanya memilih
                akun member yang sudah aktif.
              </div>
            </div>
          )}
          {memberError ? (
            <Alert className="mt-3 border-[#f5a742]/45 bg-[#f5a742]/12 text-[#f4f4f5]">
              <AlertTriangle className="size-4" />
              <AlertTitle>Member</AlertTitle>
              <AlertDescription>{memberError}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─── CartLineNoteRow — input catatan per item di cart ───
// UX: default collapsed (cuma tombol "+ Catatan" kecil). Klik → expand input.
// Auto-save on blur. Visible chip dengan icon jika sudah ada catatan.
export function CartLineNoteRow({
  note,
  onChange,
}: {
  note: string;
  onChange: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState(Boolean(note));
  const [draft, setDraft] = useState(note);

  // Sync external note changes (misalnya cart di-clear)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from prop
    setDraft(note);
    if (!note) setExpanded(false);
  }, [note]);

  const commit = () => {
    if (draft === note) return;
    onChange(draft);
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="mt-2 flex items-center gap-1 text-[10px] font-mono text-[#8f8f99] hover:text-[#ffd79a]"
      >
        <Plus className="size-3" />
        Tambah catatan untuk dapur
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-md border border-[#f5a742]/30 bg-[#f5a742]/6 p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="garage-mono text-[10px] uppercase tracking-wide text-[#ffd79a]">
          📝 Catatan untuk dapur
        </p>
        {!draft && (
          <button
            type="button"
            onClick={() => {
              setExpanded(false);
              onChange("");
            }}
            className="text-[10px] text-[#8f8f99] underline hover:text-[#d6d6dc]"
          >
            Batal
          </button>
        )}
      </div>
      <input
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        maxLength={120}
        placeholder="Misal: less ice, no garlic, extra spicy, dibungkus terpisah"
        className="mt-1 h-9 w-full rounded-md border border-[#34343c] bg-white/[0.06] px-2 text-xs text-white placeholder:text-[#6e6e76] focus:border-[#f5a742] focus:outline-none"
        autoFocus={!note}
      />
      <p className="mt-1 text-right text-[11px] text-[#8f8f99]">{draft.length}/120</p>
    </div>
  );
}

export function CashPaymentPanel({
  cashReceived,
  cashReceivedValue,
  cashPaymentReady,
  cashChange,
  cashShortage,
  quickCashAmounts,
  totalDue,
  paymentPending,
  onCashReceivedChange,
}: {
  cashReceived: string;
  cashReceivedValue: number;
  cashPaymentReady: boolean;
  cashChange: number;
  cashShortage: number;
  quickCashAmounts: number[];
  totalDue: number;
  paymentPending: boolean;
  onCashReceivedChange: (value: string) => void;
}) {
  const exactCash = cashReceivedValue === totalDue && totalDue > 0;
  // POS V6 papan 05: input Uang Diterima, nominal cepat (termasuk Uang Pas), kartu Kembalian.
  // Memilih nominal HANYA mengisi "Uang diterima" — transaksi tetap selesai lewat tombol final.
  return (
    <div className="pos-v6-cash garage-surface rounded-xl p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Banknote className="pos-v6-cash-icon size-4" />
          <p className="pos-v6-cash-label text-[13px] font-bold">Uang Diterima</p>
        </div>
        <span className="pos-v6-cash-muted text-xs font-semibold">
          Total Tagihan <span className="pos-v6-cash-total font-mono tabular-nums">{currency.format(totalDue)}</span>
        </span>
      </div>
      <div className="relative">
        <span className="pos-v6-cash-muted pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-base font-semibold">
          Rp
        </span>
        <Input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={cashReceived ? Number(cashReceived).toLocaleString("id-ID") : ""}
          onChange={(event) =>
            onCashReceivedChange(event.target.value.replace(/\D/g, ""))
          }
          placeholder="0"
          aria-label="Uang diterima dari pelanggan (Rupiah)"
          className="pos-v6-cash-input h-14 pl-11 pr-3 text-right font-mono text-2xl font-bold tracking-wide tabular-nums"
        />
      </div>
      <p className="pos-v6-cash-muted mb-1.5 mt-3 text-xs font-semibold">Nominal cepat</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Button
          type="button"
          variant="outline"
          data-selected={exactCash}
          className="pos-v6-quickcash garage-press h-11 gap-1.5 px-2 text-sm font-bold"
          disabled={paymentPending || totalDue <= 0}
          onClick={() => onCashReceivedChange(String(totalDue))}
        >
          <Equal className="size-4 shrink-0" />
          Uang Pas
          <span className="sr-only"> ({currency.format(totalDue)})</span>
        </Button>
        {quickCashAmounts.map((amount) => (
          <Button
            key={amount}
            type="button"
            variant="outline"
            data-selected={cashReceivedValue === amount && !exactCash}
            className="pos-v6-quickcash garage-press h-11 px-2 text-sm font-bold"
            disabled={paymentPending}
            onClick={() => onCashReceivedChange(String(amount))}
          >
            {currency.format(amount)}
          </Button>
        ))}
      </div>
      {cashReceived === "" ? (
        <p className="pos-v6-change mt-3 rounded-xl border p-4 text-sm font-bold" data-state="empty" role="status">
          Isi uang yang diterima dari pelanggan, atau tekan Uang Pas bila uangnya pas.
        </p>
      ) : (
      <div className="pos-v6-change mt-3 rounded-xl border p-4" data-state={cashPaymentReady ? "ok" : "short"} role="status" aria-live="polite">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="pos-v6-change-label text-[13px] font-extrabold uppercase tracking-wide">
              {cashPaymentReady ? "Kembalian untuk pelanggan" : "Uang masih kurang"}
            </p>
            <p className="pos-v6-change-value mt-1 font-mono text-4xl font-extrabold leading-none tabular-nums">
              {currency.format(cashPaymentReady ? cashChange : cashShortage)}
            </p>
          </div>
          <Badge className="pos-v6-change-badge">{cashPaymentReady ? "CUKUP" : "KURANG"}</Badge>
        </div>
        <div className="pos-v6-change-rows mt-3 space-y-1 border-t pt-3 text-sm">
          <div className="flex justify-between gap-3">
            <span>Total tagihan</span>
            <span className="font-mono font-semibold tabular-nums">{currency.format(totalDue)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span>Uang diterima</span>
            <span className="font-mono font-semibold tabular-nums">{currency.format(cashReceivedValue)}</span>
          </div>
          <div className="flex justify-between gap-3 font-bold">
            <span>{cashPaymentReady ? "Kembalian pelanggan" : "Sisa kurang"}</span>
            <span className="font-mono tabular-nums">{currency.format(cashPaymentReady ? cashChange : cashShortage)}</span>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

export function QrisPaymentPanel({
  imagePath,
  imageReady,
  paymentReference,
  onImageReadyChange,
  onPaymentReferenceChange,
  totalDue,
  referenceRequired = false,
}: {
  imagePath: string;
  imageReady: boolean;
  paymentReference: string;
  onImageReadyChange: (ready: boolean) => void;
  onPaymentReferenceChange: (value: string) => void;
  totalDue?: number;
  referenceRequired?: boolean;
}) {
  // Buka layar QRIS customer-facing di window/tab kedua (untuk monitor pelanggan).
  // window.open dari handler klik = tidak diblokir popup-blocker (gesture user).
  const openCustomerDisplay = () => {
    const params = new URLSearchParams();
    if (totalDue && totalDue > 0) params.set("amount", String(totalDue));
    const url = `/display/payment${params.toString() ? `?${params.toString()}` : ""}`;
    window.open(url, "garage-qris-display", "noopener,noreferrer");
  };
  return (
    <div className="pos-v6-paypanel garage-surface rounded-xl p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <QrCode className="pos-v6-cash-icon size-4" />
          <p className="pos-v6-cash-label text-[13px] font-bold">Pembayaran QRIS</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={openCustomerDisplay} className="pos-v6-quickcash h-9 gap-1.5 px-2.5 text-xs font-bold">
          <QrCode className="size-3.5" />
          Layar Customer
        </Button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] sm:items-start">
        {imageReady ? (
          <div className="pos-v6-qris-frame flex flex-col items-center rounded-xl bg-white p-3 text-[#111116]">
            <Image
              src={imagePath}
              alt="QRIS resmi GARAGE"
              width={180}
              height={180}
              className="h-[180px] w-[180px] object-contain"
              onLoad={() => onImageReadyChange(true)}
              onError={() => onImageReadyChange(false)}
            />
            <p className="mt-2 text-center text-xs font-semibold">Scan QRIS merchant resmi GARAGE</p>
          </div>
        ) : (
          <Alert className="border-[#f5a742]/45 bg-[#f5a742]/12 text-[#f4f4f5]">
            <AlertTriangle className="size-4" />
            <AlertTitle>QRIS resmi belum dikonfigurasi</AlertTitle>
            <AlertDescription>Taruh file QRIS merchant resmi di `public/payments/qris-garage.png`.</AlertDescription>
          </Alert>
        )}
        <div className="min-w-0 space-y-3">
          <p className="pos-v6-cash-muted text-sm leading-snug">Minta pelanggan scan dengan aplikasi e-wallet atau m-banking, lalu cek notifikasi merchant sebelum konfirmasi.</p>
          {typeof totalDue === "number" ? <PosV6TotalStrip label="Total Pembayaran" amount={totalDue} /> : null}
          <p className="pos-v6-warn flex gap-2 text-sm font-semibold">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Pastikan status BERHASIL di notifikasi merchant/bank. Screenshot pelanggan saja tidak cukup.
          </p>
          <div>
            <p className="pos-v6-cash-muted mb-1 text-xs font-semibold">{referenceRequired ? "Referensi wajib" : "Referensi (opsional)"}</p>
            <Input
              value={paymentReference}
              onChange={(event) => onPaymentReferenceChange(event.target.value.slice(0, 80))}
              className="pos-v6-cash-input h-11"
              placeholder="No. Ref / RRN dari notifikasi QRIS"
              aria-label="Referensi QRIS"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Kotak total tagihan (papan 05: "Total Pembayaran" merah, angka besar). */
function PosV6TotalStrip({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="pos-v6-total-strip flex items-center justify-between gap-3 rounded-xl px-3.5 py-3">
      <span className="text-sm font-bold">{label}</span>
      <span className="font-mono text-2xl font-extrabold tabular-nums">{currency.format(amount)}</span>
    </div>
  );
}

/** Nilai yang bisa disalin (nomor rekening/akun) — kasir tidak perlu mengetik ulang. */
function PosV6CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="pos-v6-copy flex items-center gap-2 rounded-xl px-3 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="pos-v6-cash-muted block text-xs font-semibold">{label}</span>
        <span className="block break-all font-mono text-lg font-bold tabular-nums">{value}</span>
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="pos-v6-quickcash h-10 shrink-0 gap-1.5 px-3 text-xs font-bold"
        onClick={() => {
          void navigator.clipboard?.writeText(value.replace(/\s/g, "")).then(
            () => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            },
            () => setCopied(false),
          );
        }}
        aria-label={`Salin ${label}`}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? "Tersalin" : "Salin"}
      </Button>
    </div>
  );
}

export function BankTransferPaymentPanel({
  selectedProvider,
  selectedAccount,
  paymentReference,
  onProviderChange,
  onPaymentReferenceChange,
  totalDue,
}: {
  selectedProvider: string;
  selectedAccount: (typeof bankAccounts)[number];
  paymentReference: string;
  onProviderChange: (value: string) => void;
  onPaymentReferenceChange: (value: string) => void;
  totalDue?: number;
}) {
  return (
    <div className="pos-v6-paypanel garage-surface space-y-3 rounded-xl p-3">
      <div className="flex items-center gap-2">
        <Landmark className="pos-v6-cash-icon size-4" />
        <p className="pos-v6-cash-label text-[13px] font-bold">Transfer Bank</p>
      </div>
      <div>
        <p className="pos-v6-cash-muted mb-1.5 text-xs font-semibold">Pilih bank tujuan</p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Bank tujuan">
          {bankAccounts.map((account) => (
            <Button
              key={account.id}
              type="button"
              variant="outline"
              role="radio"
              aria-checked={selectedProvider === account.id}
              data-selected={selectedProvider === account.id}
              className="pos-v6-quickcash h-12 text-sm font-bold"
              onClick={() => onProviderChange(account.id)}
            >
              <Landmark className="size-4" />
              {account.bank}
            </Button>
          ))}
        </div>
      </div>
      <PosV6CopyValue label={`Rekening ${selectedAccount.bank} · a.n. ${selectedAccount.accountName}`} value={selectedAccount.accountNumber} />
      {typeof totalDue === "number" ? <PosV6TotalStrip label="Total Pembayaran" amount={totalDue} /> : null}
      <div>
        <p className="pos-v6-cash-muted mb-1 text-xs font-semibold">Referensi (opsional)</p>
        <Input
          value={paymentReference}
          onChange={(event) => onPaymentReferenceChange(event.target.value)}
          className="pos-v6-cash-input h-11"
          placeholder="Nomor transaksi / catatan kasir"
        />
      </div>
    </div>
  );
}

export function EWalletPaymentPanel({
  selectedProvider,
  selectedAccount,
  paymentReference,
  onProviderChange,
  onPaymentReferenceChange,
  totalDue,
}: {
  selectedProvider: string;
  selectedAccount: (typeof eWalletAccounts)[number];
  paymentReference: string;
  onProviderChange: (value: string) => void;
  onPaymentReferenceChange: (value: string) => void;
  totalDue?: number;
}) {
  return (
    <div className="pos-v6-paypanel garage-surface space-y-3 rounded-xl p-3">
      <div className="flex items-center gap-2">
        <WalletCards className="pos-v6-cash-icon size-4" />
        <p className="pos-v6-cash-label text-[13px] font-bold">E-Wallet</p>
      </div>
      <div>
        <p className="pos-v6-cash-muted mb-1.5 text-xs font-semibold">Pilih e-wallet (akun resmi outlet)</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="E-wallet">
          {eWalletAccounts.map((account) => (
            <Button
              key={account.id}
              type="button"
              variant="outline"
              role="radio"
              aria-checked={selectedProvider === account.id}
              data-selected={selectedProvider === account.id}
              className="pos-v6-quickcash h-12 text-sm font-bold"
              onClick={() => onProviderChange(account.id)}
            >
              <WalletCards className="size-4" />
              {account.provider}
            </Button>
          ))}
        </div>
      </div>
      <PosV6CopyValue label={`${selectedAccount.provider} · a.n. ${selectedAccount.accountName}`} value={selectedAccount.accountNumber} />
      {typeof totalDue === "number" ? <PosV6TotalStrip label="Total Pembayaran" amount={totalDue} /> : null}
      <div>
        <p className="pos-v6-cash-muted mb-1 text-xs font-semibold">Referensi (opsional)</p>
        <Input
          value={paymentReference}
          onChange={(event) => onPaymentReferenceChange(event.target.value)}
          className="pos-v6-cash-input h-11"
          placeholder="Nomor transaksi / catatan kasir"
        />
      </div>
    </div>
  );
}

export function OpenBillSavedPanel({
  bill,
  printing,
  onPrint,
  onNewTransaction,
  onClose,
}: {
  bill: OpenBillSaved;
  printing: boolean;
  onPrint: () => void;
  onNewTransaction: () => void;
  onClose: () => void;
}) {
  const who = [bill.tableLabel, bill.customerName].filter(Boolean).join(" · ") || "Take away";
  return (
    <div className="space-y-3" data-testid="pos-open-bill-saved">
      <div className="rounded-lg border-2 border-[#f5a742]/70 bg-[#f5a742]/10 p-4 text-center">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#ffd08a]">Tagihan disimpan · belum bayar</p>
        <p className="mt-2 text-lg font-bold text-white">{who}</p>
        <p className="garage-display mt-1 text-4xl font-bold tabular-nums text-white">{currency.format(bill.total)}</p>
        {/* Token tema (bukan warna tetap) supaya terbaca di tema terang & gelap. */}
        <p className="mt-1 font-mono text-sm font-semibold" style={{ color: "var(--pos-text-2, #e5e2dc)" }}>{bill.orderNo}</p>
      </div>
      <p className="rounded-md border border-[#4a4a54] bg-white/[0.04] p-3 text-sm leading-relaxed" style={{ color: "var(--pos-text-2, #e5e2dc)" }}>
        Pesanan sudah masuk Bar/Dapur. Saat pelanggan selesai, buka menu <b>Belum Bayar</b> (F6) lalu tekan <b>Ambil uang</b> /{" "}
        <b>Final Bayar</b> untuk memilih Cash/QRIS/Transfer — kembalian tampil di sana. Voucher, poin, dan diskon dipakai saat Final Bayar.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="outline" className="garage-press h-11 flex-1" disabled={printing} onClick={onPrint}>
          <Printer aria-hidden className="size-4" />
          {printing ? "Mencetak..." : "Cetak tagihan sementara"}
        </Button>
        <Button type="button" className="garage-press h-11 flex-1 text-base font-semibold" onClick={onNewTransaction}>
          Transaksi baru
        </Button>
        <Button type="button" variant="ghost" className="garage-press h-11" onClick={onClose}>
          Tutup
        </Button>
      </div>
    </div>
  );
}

/** Pakai poin member di kasir: potongan = poin × nilai poin, maks sesuai Pengaturan. */
function PosPointsRedeemBox({
  balance,
  pointsToUse,
  maxPointsToUse,
  minPointsToUse,
  pointValue,
  onChange,
  verified,
  onScan,
}: {
  balance: number;
  pointsToUse: number;
  maxPointsToUse: number;
  minPointsToUse: number;
  pointValue: number;
  onChange: (points: number) => void;
  verified: boolean;
  onScan: () => void;
}) {
  const canUse = maxPointsToUse >= minPointsToUse;
  return (
    <div className="mt-3 rounded-md border border-[#f5a742]/40 bg-[#f5a742]/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[#ffe2b8]">Pakai poin</p>
        <p className="garage-mono text-[11px] text-[#ffd08a]">
          1 poin = {currency.format(pointValue)} · saldo {balance}
        </p>
      </div>
      {canUse && !verified ? (
        <div className="mt-2 space-y-1.5">
          <Button
            type="button"
            variant="outline"
            className="garage-press h-10 w-full border-[#f5a742]/50 text-sm text-[#ffd08a]"
            onClick={onScan}
          >
            <QrCode className="mr-2 size-4" />
            Scan QR member untuk pakai poin
          </Button>
          <p className="text-[11px] text-[#e4e4e7]">
            Poin hanya bisa dipakai setelah QR di kartu/aplikasi member dipindai. Nomor HP saja tidak cukup.
          </p>
        </div>
      ) : canUse ? (
        <>
          <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-[#ffd08a]">
            <ShieldCheck className="size-3.5" />
            QR member terverifikasi
          </p>
          <div className="mt-2 flex gap-2">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={maxPointsToUse}
              value={pointsToUse || ""}
              placeholder={`${minPointsToUse}–${maxPointsToUse}`}
              onChange={(event) => onChange(Math.max(0, Math.floor(Number(event.target.value) || 0)))}
              aria-label="Jumlah poin dipakai"
              className="h-10 border-[#34343c] bg-black/30 text-sm"
            />
            <Button
              type="button"
              variant="outline"
              className="garage-press h-10 shrink-0 border-[#f5a742]/50 px-3 text-xs text-[#ffd08a]"
              onClick={() => onChange(maxPointsToUse)}
            >
              Maks {maxPointsToUse}
            </Button>
            {pointsToUse > 0 ? (
              <Button
                type="button"
                variant="ghost"
                className="garage-press h-10 shrink-0 px-2 text-xs text-[#d4d4d8]"
                onClick={() => onChange(0)}
              >
                Batal
              </Button>
            ) : null}
          </div>
          <p className="mt-1.5 text-[11px] text-[#e4e4e7]">
            {pointsToUse > 0
              ? `Potongan ${currency.format(pointsToUse * pointValue)} (${pointsToUse} poin).`
              : `Minimal ${minPointsToUse} poin, maksimal ${maxPointsToUse} poin untuk tagihan ini.`}
          </p>
        </>
      ) : (
        <p className="mt-1.5 text-[11px] text-[#e4e4e7]">
          {balance < minPointsToUse
            ? `Poin bisa dipakai mulai ${minPointsToUse} poin.`
            : "Tagihan ini belum bisa memakai poin (batas potongan terlalu kecil)."}
        </p>
      )}
    </div>
  );
}

/**
 * Kode klaim member online (owner Nov 2026): pelanggan POS tanpa akun online hadir di kasir → kasir
 * membuat kode 6 angka → pelanggan memasukkannya di /member-login (Daftar → "Punya kode dari kasir?").
 * Poin & riwayat POS tersambung tanpa OTP WhatsApp. Kode hanya tampil di layar ini.
 */
function PosMemberClaimCode({
  claimCode,
  loading,
  error,
  onRequest,
}: {
  claimCode: { code: string; expiresAt: string; maskedPhone: string } | null;
  loading: boolean;
  error: string | null;
  onRequest: () => void;
}) {
  const expiresLabel = claimCode
    ? new Date(claimCode.expiresAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
    : null;
  return (
    <div className="mt-3 rounded-md border border-[#f5a742]/40 bg-[#f5a742]/[0.07] p-3" data-testid="pos-member-claim-code">
      <p className="text-xs font-semibold text-[#ffe2b8]">Belum punya akun member online</p>
      {claimCode ? (
        <div className="mt-2 space-y-2">
          <p
            className="garage-mono text-center text-3xl font-bold tracking-[0.3em] text-white"
            aria-label={`Kode klaim ${claimCode.code.split("").join(" ")}`}
          >
            {claimCode.code.slice(0, 3)} {claimCode.code.slice(3)}
          </p>
          <p className="text-center text-xs text-[#e4e4e8]">
            Berlaku s/d <span className="garage-mono font-semibold text-[#ffd08a]">{expiresLabel}</span> · nomor {claimCode.maskedPhone}
          </p>
          <p className="text-xs leading-5 text-[#d4d4d8]">
            Pelanggan buka <span className="font-semibold text-white">garagecoffee.id/member-login</span> → Daftar → pilih
            {" "}<span className="font-semibold text-white">&quot;Punya kode dari kasir?&quot;</span> → masukkan kode ini. Poin &amp; riwayatnya ikut tersambung.
          </p>
        </div>
      ) : (
        <p className="mt-1 text-xs leading-5 text-[#d4d4d8]">
          Pelanggan mau daftar member online? Buat kode klaim di sini lalu tunjukkan ke pelanggan.
        </p>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="garage-press mt-2 h-10 w-full border-[#f5a742]/55 text-[#ffd08a]"
        disabled={loading}
        onClick={onRequest}
      >
        {loading ? "Membuat kode…" : claimCode ? "Buat kode baru" : "Buat kode klaim member online"}
      </Button>
      {error ? <p className="mt-2 text-xs text-[#ff9aa2]" role="alert">{error}</p> : null}
    </div>
  );
}
