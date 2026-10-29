// Helper form Master Data WMS (client-safe, tanpa DB).

/** Angka format Indonesia: "110.000" → 110000, "151,32" → 151.32, "946" → 946. Kosong → NaN. */
export function parseIdNumber(value: string): number {
  const v = value.trim().replace(/\s/g, "").replace(/^rp/i, "");
  if (!v) return NaN;
  if (v.includes(",")) return Number(v.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(v)) return Number(v.replace(/\./g, ""));
  return Number(v);
}

/** HPP per satuan = harga beli per kemasan ÷ isi kemasan (null bila belum lengkap/valid). */
export function unitCostFromPackText(packPrice: string, packQty: string): number | null {
  const price = parseIdNumber(packPrice);
  const qty = parseIdNumber(packQty);
  if (!Number.isFinite(price) || !Number.isFinite(qty) || price < 0 || qty <= 0) return null;
  return Math.round((price / qty) * 10_000) / 10_000;
}

/** Nama kemasan dari label katalog, mis. "botol 760 ml" → "botol". */
export function packNameFromLabel(label: string | null | undefined): string {
  return (label ?? "").split(/\d/)[0].trim();
}

/**
 * Peringatan konversi yang mencurigakan (bukan blokir): isi kemasan < 1 satuan dasar, atau
 * isi "kg/liter" yang lupa dikali 1000 (mis. 1 pack kopi = 1 gram).
 */
export function conversionWarning(unit: string, packQty: number, packName: string): string | null {
  if (!Number.isFinite(packQty) || packQty <= 0) return null;
  const u = unit.toLowerCase();
  const pack = packName.toLowerCase();
  if ((u === "gram" || u === "gr" || u === "ml") && packQty < 5 && pack !== u) {
    return `Isi ${packQty} ${unit} per ${packName || "kemasan"} terlihat terlalu kecil. Isi dalam satuan dasar: 1 kg = 1000 gram, 1 liter = 1000 ml.`;
  }
  if (packQty > 1_000_000) return "Isi per kemasan sangat besar — periksa lagi angkanya.";
  return null;
}

/** Link WhatsApp dari nomor 08… → https://wa.me/628… */
export function whatsappLink(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  const intl = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  return `https://wa.me/${intl}`;
}
