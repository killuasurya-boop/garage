// Kode singkat menu untuk kasir (owner, Okt 2026): ketik 2–4 huruf di
// pencarian POS untuk langsung menemukan menu, mis. "cl" → Coffee Latte
// (huruf depan tiap kata) atau "lt" → Latte (konsonan awal kata).

const VOWELS = new Set(["a", "i", "u", "e", "o"]);

function words(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function consonants(word: string, max: number) {
  let out = word[0] ?? "";
  for (const char of word.slice(1)) {
    if (out.length >= max) break;
    if (VOWELS.has(char) || /\d/.test(char) || char === out[out.length - 1]) continue;
    out += char;
  }
  // "Sosis" → konsonan saja cuma "s"; pakai 3 huruf awal.
  return out.length >= 2 ? out : word.slice(0, 3);
}

/** Kode singkat sebuah nama menu, kode utama di indeks 0. */
export function menuShortcodes(name: string): string[] {
  const parts = words(name);
  if (!parts.length) return [];
  const codes = new Set<string>();
  if (parts.length > 1) codes.add(parts.map((part) => part[0]).join("").slice(0, 4));
  codes.add(parts.map((part) => consonants(part, parts.length > 1 ? 2 : 3)).join("").slice(0, 4));
  return [...codes].filter((code) => code.length >= 2);
}

/** Query dianggap kode singkat bila 2–4 huruf tanpa spasi. */
export function isShortcodeQuery(query: string) {
  return /^[a-z0-9]{2,4}$/.test(query.trim().toLowerCase());
}

/** 2 = kode persis, 1 = awalan kode, 0 = tidak cocok. */
export function shortcodeMatchRank(query: string, codes: readonly string[]): 0 | 1 | 2 {
  const normalized = query.trim().toLowerCase();
  if (!isShortcodeQuery(normalized)) return 0;
  if (codes.includes(normalized)) return 2;
  return codes.some((code) => code.startsWith(normalized)) ? 1 : 0;
}
