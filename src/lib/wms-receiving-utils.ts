// Utilitas Receiving WMS — validasi, batch otomatis, kategori basi.

export const WMS_PERISHABLE_KEYWORDS = [
  "susu",
  "milk",
  "cream",
  "ayam",
  "chicken",
  "daging",
  "beef",
  "telur",
  "egg",
  "sayur",
  "selada",
  "lettuce",
  "keju",
  "cheese",
  "yogurt",
  "mentega",
  "butter",
  "ikan",
  "fish",
  "nugget",
  "sosis",
  "fillet",
  "fresh",
  "segar",
  "buah",
  "fruit",
];

export const WMS_PUTAWAY_ZONES = ["DRY", "CHILLED", "FROZEN", "BAR-RACK", "KITCHEN-RACK"] as const;
export type PutAwayZone = (typeof WMS_PUTAWAY_ZONES)[number];

export function isPerishableProduct(name: string, category: string): boolean {
  const hay = `${name} ${category}`.toLowerCase();
  return WMS_PERISHABLE_KEYWORDS.some((k) => hay.includes(k));
}

export function autoBatchNo(doc: string, sku: string, index = 0): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const safeSku = sku.replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase() || "ITEM";
  return `${doc.replace(/[^A-Z0-9-]/gi, "")}-${ymd}-${safeSku}-${String(index + 1).padStart(2, "0")}`;
}

export function discrepancyPct(ordered: number, received: number): number {
  if (ordered <= 0) return 0;
  return Math.abs(received - ordered) / ordered;
}

export function needsDiscrepancyApproval(ordered: number, received: number, qc: string): boolean {
  if (qc !== "discrepancy" && qc !== "pass") return false;
  return discrepancyPct(ordered, received) > 0.1;
}

export type ReceivingLineValidation = {
  productId: string;
  productName: string;
  category?: string;
  orderedQty: number;
  receivedQty: number;
  qc: string;
  expiredAt?: string | null;
  batchNo?: string | null;
};

export function validateReceivingLines(
  lines: ReceivingLineValidation[],
  opts?: { strictExpiry?: boolean },
): string[] {
  const errors: string[] = [];
  for (const line of lines) {
    if (line.qc === "reject" || line.receivedQty <= 0) continue;
    if (isPerishableProduct(line.productName, line.category ?? "")) {
      if (opts?.strictExpiry !== false && !line.expiredAt) {
        errors.push(`${line.productName}: tanggal expired wajib (bahan basi).`);
      }
    }
    if (needsDiscrepancyApproval(line.orderedQty, line.receivedQty, line.qc) && !line.batchNo) {
      // batch recommended for large discrepancy
    }
  }
  return errors;
}
