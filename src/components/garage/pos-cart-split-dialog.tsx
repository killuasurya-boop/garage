"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Minus, Plus, Printer, RefreshCw, Users, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  defaultPaymentProvider,
  paymentMethods,
  type PaymentMethod,
} from "@/components/garage/garage-app-helpers";
import { GarageApiError, garageApi } from "@/lib/api-client";
import type { AppSettings } from "@/lib/garage-app-settings-types";
import type { OrderCreateResponse } from "@/lib/garage-api-types";
import { idempotencyAttemptFor, type IdempotencyAttempt } from "@/lib/idempotency-client";
import {
  activeGuests,
  clampAssignment,
  guestEstimate,
  initialAssignment,
  linesForGuest,
  type SplitAssignment,
} from "@/lib/split-bill";

const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const METHOD_LABEL: Record<PaymentMethod, string> = {
  Cash: "Tunai",
  QRIS: "QRIS",
  "Bank Transfer": "Transfer",
  "E-Wallet": "E-Wallet",
};

// Warna chip tamu — aksen Garage (merah, amber, chrome) supaya mudah dibedakan.
const GUEST_TONES = [
  "border-[#d11a2a] bg-[#d11a2a] text-white",
  "border-[#f5a742] bg-[#f5a742] text-black",
  "border-[#d6d6dc] bg-[#d6d6dc] text-black",
  "border-[#ff8a93] bg-[#ff8a93] text-black",
  "border-[#ffd79a] bg-[#ffd79a] text-black",
  "border-[#8f8f99] bg-[#8f8f99] text-black",
];

export type CartSplitLine = {
  itemId: string;
  variantId: string;
  qty: number;
  note?: string;
  price: number;
  name: string;
  variantLabel: string;
  category: string;
};

type GuestPayState = {
  name: string;
  method: PaymentMethod;
  cash: string;
  paying: boolean;
  error: string | null;
  // Koneksi putus saat bayar: server mungkin sudah mencatat. Kasir harus
  // mengulang Bayar (key sama → tidak dobel) sebelum menutup dialog.
  uncertain: boolean;
  result: OrderCreateResponse | null;
};

function makeIdempotencyKey() {
  return `split-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Split bill per produk untuk keranjang kasir. Langkah 1: tiap porsi ditandai
 * milik tamu siapa. Langkah 2: tiap tamu bayar sendiri (metode bebas) → order
 * & struk terpisah. Bila ditutup di tengah jalan, porsi yang sudah lunas
 * dikeluarkan dari keranjang oleh parent lewat onClose(paidGuests, assignment).
 */
export function PosCartSplitDialog({
  open,
  lines,
  orderType,
  tableNumber,
  tableLabel,
  settings,
  qrisReady,
  blockedReason,
  onGuestPaid,
  onClose,
  onPrintReceipt,
}: {
  open: boolean;
  lines: CartSplitLine[];
  orderType: "dine-in" | "takeaway" | "delivery";
  tableNumber?: string;
  tableLabel: string;
  settings: Pick<AppSettings, "serviceChargePct" | "taxPct" | "roundingMode">;
  qrisReady: boolean;
  blockedReason: string | null;
  onGuestPaid: (result: OrderCreateResponse, guestLines: CartSplitLine[], guestName: string) => void;
  onClose: (paidGuests: Set<number>, assignment: SplitAssignment) => void;
  onPrintReceipt: (receipt: OrderCreateResponse["receipt"]) => void;
}) {
  return (
    // Ditutup hanya lewat tombol di dalam dialog supaya status "sudah lunas"
    // per tamu selalu dikembalikan ke keranjang (tidak tertagih dua kali).
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[94svh] flex-col overflow-hidden border-[#34343c] bg-[#111116] sm:max-w-2xl"
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        {open ? (
          <SplitFlow
            lines={lines}
            orderType={orderType}
            tableNumber={tableNumber}
            tableLabel={tableLabel}
            settings={settings}
            qrisReady={qrisReady}
            blockedReason={blockedReason}
            onGuestPaid={onGuestPaid}
            onClose={onClose}
            onPrintReceipt={onPrintReceipt}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SplitFlow({
  lines,
  orderType,
  tableNumber,
  tableLabel,
  settings,
  qrisReady,
  blockedReason,
  onGuestPaid,
  onClose,
  onPrintReceipt,
}: Omit<Parameters<typeof PosCartSplitDialog>[0], "open">) {
  const totalUnits = lines.reduce((sum, line) => sum + line.qty, 0);
  const [guestCount, setGuestCount] = useState(Math.min(2, Math.max(1, totalUnits)));
  const [assignment, setAssignment] = useState<SplitAssignment>(() => initialAssignment(lines));
  const [step, setStep] = useState<"assign" | "pay">("assign");
  const [guests, setGuests] = useState<GuestPayState[]>(() =>
    Array.from({ length: 8 }, (_, index) => ({
      name: `Tamu ${index + 1}`,
      method: "Cash" as PaymentMethod,
      cash: "",
      paying: false,
      error: null,
      uncertain: false,
      result: null,
    })),
  );

  const attemptsRef = useRef<Record<number, IdempotencyAttempt>>({});

  const paidGuests = useMemo(
    () => new Set(guests.flatMap((guest, index) => (guest.result ? [index] : []))),
    [guests],
  );
  const payingGuests = activeGuests(assignment, guestCount);
  const anyPaid = paidGuests.size > 0;
  const allPaid = payingGuests.length > 0 && payingGuests.every((guest) => paidGuests.has(guest));
  const anyPaying = guests.some((guest) => guest.paying);
  const uncertainGuests = payingGuests.filter(
    (index) => guests[index].uncertain && !guests[index].result,
  );

  function changeGuestCount(next: number) {
    const count = Math.max(2, Math.min(8, next, Math.max(2, totalUnits)));
    setGuestCount(count);
    setAssignment((current) => clampAssignment(current, count));
  }

  function assignUnit(lineIndex: number, unitIndex: number, guest: number) {
    setAssignment((current) =>
      current.map((units, li) =>
        li === lineIndex ? units.map((g, ui) => (ui === unitIndex ? guest : g)) : units,
      ),
    );
  }

  function assignLine(lineIndex: number, guest: number) {
    setAssignment((current) =>
      current.map((units, li) => (li === lineIndex ? units.map(() => guest) : units)),
    );
  }

  function updateGuest(index: number, patch: Partial<GuestPayState>) {
    setGuests((current) => current.map((guest, i) => (i === index ? { ...guest, ...patch } : guest)));
  }

  async function payGuest(index: number) {
    const guest = guests[index];
    const guestLines = linesForGuest(lines, assignment, index);
    const estimate = guestEstimate(lines, assignment, index, settings);
    const cashValue = Number(guest.cash.replace(/[^\d]/g, "")) || 0;
    if (guest.method === "Cash" && cashValue < estimate.total) {
      updateGuest(index, { error: `Uang diterima kurang dari ${currency.format(estimate.total)}.` });
      return;
    }
    if (guest.method === "QRIS" && !qrisReady) {
      updateGuest(index, { error: "QRIS resmi belum dikonfigurasi." });
      return;
    }
    updateGuest(index, { paying: true, error: null });
    const body = {
      orderType,
      tableNumber: orderType === "dine-in" ? tableNumber : undefined,
      tableLabel,
      paymentMethod: guest.method,
      paymentProvider: defaultPaymentProvider(guest.method) || undefined,
      cashReceived: guest.method === "Cash" ? cashValue : undefined,
      guestName: guest.name.trim() || undefined,
      items: guestLines.map((line) => ({
        itemId: line.itemId,
        variantId: line.variantId,
        qty: line.qty,
        note: line.note,
      })),
    };
    // Key sama selama isi pembayaran tamu sama → retry setelah respons hilang
    // tidak membuat order dobel.
    const attempt = idempotencyAttemptFor(attemptsRef.current[index], body, makeIdempotencyKey);
    attemptsRef.current[index] = attempt;
    try {
      const result = await garageApi.post<OrderCreateResponse>("/api/orders", body, {
        headers: { "X-Idempotency-Key": attempt.key },
      });
      delete attemptsRef.current[index];
      updateGuest(index, { paying: false, uncertain: false, result });
      onGuestPaid(result, guestLines, guest.name.trim() || `Tamu ${index + 1}`);
    } catch (err) {
      const network = err instanceof GarageApiError && err.code === "NETWORK_ERROR";
      if (!network) {
        // Ditolak server (mis. uang kurang) → pasti belum tercatat; key boleh baru.
        delete attemptsRef.current[index];
      }
      updateGuest(index, {
        paying: false,
        uncertain: network,
        error: network
          ? "Koneksi terputus — pembayaran belum pasti tercatat. Tekan Bayar lagi setelah server/WiFi normal (aman, tidak tertagih dua kali)."
          : err instanceof Error
            ? err.message
            : "Pembayaran gagal.",
      });
    }
  }

  const header = (
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2">
        <Users className="size-5 text-[#f5a742]" />
        Split per produk
      </DialogTitle>
      <DialogDescription>
        {tableLabel} · tiap tamu bayar item miliknya sendiri, dapat struk sendiri.
      </DialogDescription>
    </DialogHeader>
  );

  if (blockedReason) {
    return (
      <>
        {header}
        <p className="rounded-md border border-[#f5a742]/45 bg-[#f5a742]/10 p-3 text-sm text-[#ffd79a]">
          {blockedReason}
        </p>
        <Button
          type="button"
          variant="outline"
          className="garage-press h-11 border-[#4a4a54]"
          onClick={() => onClose(new Set(), assignment)}
        >
          Tutup
        </Button>
      </>
    );
  }

  return (
    <>
      {header}

      {step === "assign" ? (
        <div className="garage-scroll min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          <div className="flex items-center justify-between gap-3 rounded-md border border-[#34343c] bg-[#17171c] p-3">
            <span className="text-sm font-semibold text-white">Jumlah tamu</span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Kurangi tamu"
                className="garage-press size-10 border-[#4a4a54]"
                onClick={() => changeGuestCount(guestCount - 1)}
                disabled={guestCount <= 2}
              >
                <Minus className="size-4" />
              </Button>
              <span className="w-10 text-center font-mono text-lg font-bold text-white">{guestCount}</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Tambah tamu"
                className="garage-press size-10 border-[#4a4a54]"
                onClick={() => changeGuestCount(guestCount + 1)}
                disabled={guestCount >= Math.min(8, totalUnits)}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>

          <p className="text-xs text-[#b8b8bf]">
            Ketuk nomor tamu untuk tiap porsi. Semua porsi awalnya milik Tamu 1.
          </p>

          {lines.map((line, lineIndex) => (
            <div key={`${line.itemId}-${line.variantId}-${lineIndex}`} className="rounded-md border border-[#34343c] bg-[#17171c] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {line.name}
                    {line.variantLabel ? <span className="text-[#b8b8bf]"> · {line.variantLabel}</span> : null}
                  </p>
                  <p className="text-xs text-[#b8b8bf]">
                    {currency.format(line.price)} × {line.qty}
                    {line.note ? <span className="italic"> · {line.note}</span> : null}
                  </p>
                </div>
                {line.qty > 1 ? (
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    {Array.from({ length: guestCount }, (_, guest) => (
                      <button
                        key={guest}
                        type="button"
                        onClick={() => assignLine(lineIndex, guest)}
                        className="garage-press rounded border border-[#4a4a54] px-1.5 py-1 text-[11px] font-semibold text-[#d6d6dc] hover:border-[#f5a742]"
                      >
                        Semua T{guest + 1}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="mt-2 space-y-1.5">
                {(assignment[lineIndex] ?? []).map((owner, unitIndex) => (
                  <div key={unitIndex} className="flex items-center gap-2">
                    {line.qty > 1 ? (
                      <span className="w-12 shrink-0 font-mono text-xs text-[#b8b8bf]">
                        {unitIndex + 1}/{line.qty}
                      </span>
                    ) : null}
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from({ length: guestCount }, (_, guest) => (
                        <button
                          key={guest}
                          type="button"
                          aria-pressed={owner === guest}
                          aria-label={`${line.name} porsi ${unitIndex + 1} untuk Tamu ${guest + 1}`}
                          onClick={() => assignUnit(lineIndex, unitIndex, guest)}
                          className={`garage-press h-10 min-w-10 rounded-md border px-2 text-sm font-bold ${
                            owner === guest
                              ? GUEST_TONES[guest % GUEST_TONES.length]
                              : "border-[#34343c] bg-white/[0.05] text-[#d6d6dc] hover:border-[#4a4a54]"
                          }`}
                        >
                          T{guest + 1}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="rounded-md border border-[#34343c] bg-black/30 p-3">
            <p className="garage-mono text-[11px] uppercase tracking-wide text-[#b8b8bf]">
              Perkiraan per tamu (service & pajak proporsional)
            </p>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {Array.from({ length: guestCount }, (_, guest) => {
                const estimate = guestEstimate(lines, assignment, guest, settings);
                return (
                  <div key={guest} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-[#d6d6dc]">Tamu {guest + 1}</span>
                    <span className="garage-mono font-bold text-[#ffd79a]">
                      {estimate.total ? currency.format(estimate.total) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="garage-scroll min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {payingGuests.map((guestIndex) => {
            const guest = guests[guestIndex];
            const guestLines = linesForGuest(lines, assignment, guestIndex);
            const estimate = guestEstimate(lines, assignment, guestIndex, settings);
            const paid = guest.result;
            const quickCash = [estimate.total, 50_000, 100_000, 200_000].filter(
              (amount, i, all) => amount >= estimate.total && all.indexOf(amount) === i,
            );
            return (
              <div
                key={guestIndex}
                className={`rounded-lg border p-3 ${
                  paid ? "border-[#22c55e]/45 bg-[#22c55e]/8" : "border-[#34343c] bg-[#17171c]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-md border text-xs font-black ${GUEST_TONES[guestIndex % GUEST_TONES.length]}`}
                    >
                      T{guestIndex + 1}
                    </span>
                    {paid ? (
                      <p className="truncate text-sm font-bold text-white">{guest.name}</p>
                    ) : (
                      <Input
                        value={guest.name}
                        onChange={(event) => updateGuest(guestIndex, { name: event.target.value })}
                        aria-label={`Nama Tamu ${guestIndex + 1}`}
                        maxLength={40}
                        className="h-9 border-[#34343c] bg-white/[0.06] text-sm"
                      />
                    )}
                  </div>
                  <span className="garage-mono shrink-0 text-base font-extrabold text-[#ffd79a]">
                    {currency.format(paid ? paid.total : estimate.total)}
                  </span>
                </div>

                <ul className="mt-2 space-y-0.5 text-xs text-[#d6d6dc]">
                  {guestLines.map((line) => (
                    <li key={`${line.itemId}-${line.variantId}-${line.note ?? ""}`} className="flex justify-between gap-2">
                      <span className="min-w-0">
                        {line.qty}× {line.name}
                        {line.variantLabel ? <span className="text-[#b8b8bf]"> · {line.variantLabel}</span> : null}
                      </span>
                      <span className="garage-mono shrink-0">{currency.format(line.price * line.qty)}</span>
                    </li>
                  ))}
                </ul>

                {paid ? (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#22c55e]/25 pt-2">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#86efac]">
                      <Check className="size-3.5" />
                      Lunas · {METHOD_LABEL[guest.method]} · {paid.orderNo}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      className="garage-press h-9 border-[#4a4a54] px-3 text-xs"
                      onClick={() => onPrintReceipt(paid.receipt)}
                    >
                      <Printer className="mr-1.5 size-3.5" />
                      Cetak struk
                    </Button>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2 border-t border-[#34343c] pt-3">
                    <div className="grid grid-cols-4 gap-1">
                      {paymentMethods.map((method) => (
                        <button
                          key={method}
                          type="button"
                          onClick={() => updateGuest(guestIndex, { method, error: null })}
                          disabled={method === "QRIS" && !qrisReady}
                          className={`garage-press h-10 rounded-md border px-1 text-xs font-bold disabled:opacity-40 ${
                            guest.method === method
                              ? "border-[#f5a742] bg-[#f5a742] text-black"
                              : "border-[#34343c] bg-white/[0.05] text-[#d6d6dc]"
                          }`}
                        >
                          {METHOD_LABEL[method]}
                        </button>
                      ))}
                    </div>
                    {guest.method === "Cash" ? (
                      <div className="space-y-1.5">
                        <Input
                          inputMode="numeric"
                          value={guest.cash}
                          onChange={(event) =>
                            updateGuest(guestIndex, { cash: event.target.value.replace(/[^\d]/g, ""), error: null })
                          }
                          placeholder={`Uang diterima (min ${currency.format(estimate.total)})`}
                          aria-label={`Uang diterima Tamu ${guestIndex + 1}`}
                          className="h-11 border-[#34343c] bg-white/[0.06] text-base font-semibold"
                        />
                        <div className="flex flex-wrap gap-1">
                          {quickCash.map((amount) => (
                            <button
                              key={amount}
                              type="button"
                              onClick={() => updateGuest(guestIndex, { cash: String(amount), error: null })}
                              className="garage-press rounded-md border border-[#34343c] bg-white/[0.05] px-2 py-1.5 text-xs font-semibold text-[#d6d6dc]"
                            >
                              {amount === estimate.total ? "Uang pas" : currency.format(amount)}
                            </button>
                          ))}
                        </div>
                        {Number(guest.cash) > estimate.total ? (
                          <p className="text-xs text-[#86efac]">
                            Kembalian {currency.format(Number(guest.cash) - estimate.total)}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    {guest.error ? <p className="text-xs font-semibold text-[#ffc2c8]">{guest.error}</p> : null}
                    <Button
                      type="button"
                      className="garage-press h-11 w-full gap-1.5 bg-[#22c55e] font-bold text-black hover:bg-[#34d76b]"
                      disabled={guest.paying}
                      onClick={() => void payGuest(guestIndex)}
                    >
                      {guest.paying ? <RefreshCw className="size-4 animate-spin" /> : <Wallet className="size-4" />}
                      Bayar {guest.name.trim() || `Tamu ${guestIndex + 1}`}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {step === "pay" && uncertainGuests.length > 0 ? (
        <p className="rounded-md border border-[#d11a2a]/55 bg-[#d11a2a]/14 p-2.5 text-xs font-semibold text-[#ffe1e5]">
          Pembayaran {uncertainGuests.map((index) => guests[index].name.trim() || `Tamu ${index + 1}`).join(", ")}{" "}
          belum pasti karena koneksi terputus. Tekan Bayar lagi sampai muncul &quot;Lunas&quot; sebelum menutup —
          jangan tagih ulang dari keranjang.
        </p>
      ) : null}

      <div className="flex gap-2 border-t border-[#34343c] pt-3">
        {step === "assign" ? (
          <>
            <Button
              type="button"
              variant="outline"
              className="garage-press h-11 flex-1 border-[#4a4a54]"
              onClick={() => onClose(new Set(), assignment)}
            >
              Batal
            </Button>
            <Button
              type="button"
              className="garage-press h-11 flex-1 bg-[#d11a2a] font-bold text-white hover:bg-[#e72c3c]"
              disabled={payingGuests.length < 2}
              onClick={() => setStep("pay")}
            >
              {payingGuests.length < 2 ? "Bagi ke minimal 2 tamu" : `Lanjut bayar (${payingGuests.length} tamu)`}
            </Button>
          </>
        ) : (
          <>
            {!anyPaid ? (
              <Button
                type="button"
                variant="outline"
                className="garage-press h-11 flex-1 border-[#4a4a54]"
                onClick={() => setStep("assign")}
                disabled={anyPaying || uncertainGuests.length > 0}
              >
                Ubah pembagian
              </Button>
            ) : null}
            <Button
              type="button"
              className={`garage-press h-11 flex-1 font-bold ${
                allPaid ? "bg-[#22c55e] text-black hover:bg-[#34d76b]" : "border border-[#4a4a54] bg-transparent text-white"
              }`}
              // Jangan tutup saat request bayar masih berjalan — hasilnya bisa hilang
              // & porsi yang sudah lunas tertinggal di keranjang (tertagih dua kali).
              disabled={anyPaying}
              onClick={() => onClose(paidGuests, assignment)}
            >
              {allPaid ? "Selesai — semua tamu lunas" : anyPaid ? "Tutup (sisa tetap di keranjang)" : "Batal"}
            </Button>
          </>
        )}
      </div>
    </>
  );
}
