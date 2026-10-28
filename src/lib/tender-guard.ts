// Tender guard POS (PRD V4.0 §09.2, F28/F34). Aturan murni, dipakai server
// (createOrder, Final Bayar) dan layar kasir supaya pesannya sama.
//
// - CASH wajib "uang diterima" ≥ total (kecuali sinkron order offline: uang
//   sudah diterima fisik, kekurangan dicatat sebagai cashShortfall).
// - Split: minimal 2 tender, jumlah persis total, referensi tidak boleh dobel.
// - QRIS/Transfer/E-Wallet: referensi pembayaran disimpan ter-normalisasi;
//   referensi yang sama tidak boleh dipakai dua kali (lihat
//   `referenceNeedsUniqueness`). QRIS statis belum punya status provider
//   (D-06) — kasir tetap mengecek notifikasi merchant sebelum konfirmasi.

export type TenderKind = "cash" | "qris" | "transfer" | "ewallet" | "card" | "other";

export const TENDER_LABEL: Record<TenderKind, string> = {
  cash: "Tunai",
  qris: "QRIS",
  transfer: "Transfer",
  ewallet: "E-Wallet",
  card: "Kartu",
  other: "Lainnya",
};

/** Satu definisi jenis tender (sama dengan normalizePaymentMethod di service). */
export function tenderKindOf(method: string | null | undefined): TenderKind {
  const value = String(method ?? "").toLowerCase();
  if (value.includes("cash") || value.includes("tunai")) return "cash";
  if (value.includes("qris")) return "qris";
  if (value.includes("transfer") || value.includes("bank")) return "transfer";
  if (value.includes("wallet")) return "ewallet";
  if (value.includes("card") || value.includes("kartu")) return "card";
  return "other";
}

export const PAYMENT_REFERENCE_MAX = 80;
/** Referensi sependek ini (mis. "ok", "4 digit") tidak dicek ganda — terlalu mudah bentrok. */
export const PAYMENT_REFERENCE_UNIQUE_MIN = 6;

/** Rapikan referensi: trim, spasi tunggal, huruf besar. Kosong → null. */
export function normalizePaymentReference(value: string | null | undefined): string | null {
  const cleaned = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, PAYMENT_REFERENCE_MAX);
  return cleaned ? cleaned : null;
}

/** Kunci pembanding referensi: hanya huruf & angka ("RRN 0012-34" = "RRN001234"). */
export function paymentReferenceKey(value: string | null | undefined): string | null {
  const key = String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return key ? key : null;
}

/** Referensi non-tunai yang cukup panjang wajib unik di seluruh pembayaran. */
export function referenceNeedsUniqueness(method: string | null | undefined, reference: string | null | undefined) {
  if (tenderKindOf(method) === "cash") return false;
  const key = paymentReferenceKey(reference);
  return Boolean(key && key.length >= PAYMENT_REFERENCE_UNIQUE_MIN);
}

export type TenderSplitInput = {
  method: string;
  amount: number;
  reference?: string | null;
};

export type TenderInput = {
  method: string;
  total: number;
  cashReceived?: number | null;
  reference?: string | null;
  splits?: TenderSplitInput[] | null;
  /** Pengaturan Owner: QRIS wajib referensi (F34). */
  qrisReferenceRequired?: boolean;
  /** Order dari antrean offline: uang tunai sudah diterima fisik. */
  offlineSync?: boolean;
};

export type TenderPlan = {
  /** Bagian yang masuk laci (hanya tender tunai). */
  cashPortion: number;
  /** Kekurangan tunai (hanya mungkin untuk sinkron offline). */
  cashShortfall: number;
  change: number;
  /** Referensi non-tunai yang wajib unik (sudah dinormalisasi). */
  uniqueReferences: string[];
};

export class TenderGuardError extends Error {
  constructor(
    readonly code:
      | "CASH_RECEIVED_REQUIRED"
      | "CASH_INSUFFICIENT"
      | "SPLIT_TOO_FEW"
      | "SPLIT_INVALID_AMOUNT"
      | "SPLIT_UNBALANCED"
      | "QRIS_REFERENCE_REQUIRED"
      | "REFERENCE_DUPLICATE_IN_ORDER",
    message: string,
  ) {
    super(message);
    this.name = "TenderGuardError";
  }
}

const idr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

/** Validasi tender sebelum transaksi DB. Melempar TenderGuardError dengan pesan untuk kasir. */
export function planTender(input: TenderInput): TenderPlan {
  const total = Math.max(0, Math.round(input.total));
  const splits = input.splits && input.splits.length > 0 ? input.splits : null;
  const references: Array<{ method: string; reference: string | null }> = [];

  if (splits) {
    if (splits.length < 2) {
      throw new TenderGuardError("SPLIT_TOO_FEW", "Split payment butuh minimal 2 metode. Pakai satu metode bila hanya satu.");
    }
    for (const split of splits) {
      if (!Number.isInteger(split.amount) || split.amount <= 0) {
        throw new TenderGuardError("SPLIT_INVALID_AMOUNT", "Nominal tiap metode split harus bilangan bulat positif.");
      }
      references.push({ method: split.method, reference: normalizePaymentReference(split.reference) });
    }
    const sum = splits.reduce((acc, split) => acc + split.amount, 0);
    if (sum !== total) {
      const diff = sum - total;
      throw new TenderGuardError(
        "SPLIT_UNBALANCED",
        diff > 0
          ? `Total split lebih ${idr.format(diff)} dari tagihan ${idr.format(total)}.`
          : `Total split kurang ${idr.format(-diff)} dari tagihan ${idr.format(total)}.`,
      );
    }
  } else {
    references.push({ method: input.method, reference: normalizePaymentReference(input.reference) });
  }

  if (input.qrisReferenceRequired) {
    const missing = references.find((row) => tenderKindOf(row.method) === "qris" && !row.reference);
    if (missing) {
      throw new TenderGuardError(
        "QRIS_REFERENCE_REQUIRED",
        "Isi referensi QRIS (No. Ref/RRN dari notifikasi merchant) sebelum konfirmasi.",
      );
    }
  }

  const uniqueReferences: string[] = [];
  const seenKeys = new Set<string>();
  for (const row of references) {
    if (!referenceNeedsUniqueness(row.method, row.reference)) continue;
    const key = paymentReferenceKey(row.reference)!;
    if (seenKeys.has(key)) {
      throw new TenderGuardError("REFERENCE_DUPLICATE_IN_ORDER", `Referensi ${row.reference} dipakai dua kali di order ini.`);
    }
    seenKeys.add(key);
    uniqueReferences.push(row.reference!);
  }

  if (splits) {
    const cashPortion = splits
      .filter((split) => tenderKindOf(split.method) === "cash")
      .reduce((acc, split) => acc + split.amount, 0);
    return { cashPortion, cashShortfall: 0, change: 0, uniqueReferences };
  }

  if (tenderKindOf(input.method) !== "cash") {
    return { cashPortion: 0, cashShortfall: 0, change: 0, uniqueReferences };
  }

  const received = input.cashReceived;
  if (received == null || !Number.isFinite(received)) {
    if (input.offlineSync) return { cashPortion: total, cashShortfall: 0, change: 0, uniqueReferences };
    throw new TenderGuardError(
      "CASH_RECEIVED_REQUIRED",
      "Isi uang diterima dari pelanggan sebelum konfirmasi bayar tunai.",
    );
  }
  const shortfall = Math.max(0, total - received);
  if (shortfall > 0 && !input.offlineSync) {
    throw new TenderGuardError(
      "CASH_INSUFFICIENT",
      `Uang diterima (${idr.format(received)}) kurang dari total ${idr.format(total)}.`,
    );
  }
  return {
    cashPortion: total,
    cashShortfall: shortfall,
    change: Math.max(0, received - total),
    uniqueReferences,
  };
}

/** Kalimat konfirmasi tunai (PRD §09.1 langkah 4). */
export function cashConfirmLabel(received: number, total: number) {
  const change = Math.max(0, received - total);
  return change > 0
    ? `Terima ${idr.format(received)} · kembali ${idr.format(change)}`
    : `Terima uang pas ${idr.format(total)}`;
}
