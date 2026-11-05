// =============================================================================
// AYA Assistant menu digital (Menu V5 F4, papan 04) — mesin jawaban BERBASIS ATURAN.
//
// Keputusan D-07: AYA pelanggan tidak memanggil AI/layanan luar dan tidak membuka
// data internal. Semua jawaban dibentuk dari data menu yang sudah tampil
// (nama, kategori, seksi, tag, deskripsi, varian, unggulan, promo, terlaris).
// Tidak ada rating, "menu terbaru" atau promo karangan: data itu tidak ada.
// =============================================================================
import { menuGroupForCategory, type MenuItem } from "@/lib/garage-api-types";

import { itemHasPromo } from "../order-ui";

export type AyaIntent =
  | "recommend"
  | "cold"
  | "hot"
  | "bold"
  | "sweet"
  | "creamy"
  | "work"
  | "food"
  | "snack"
  | "promo"
  | "coffee"
  | "nonCoffee"
  | "howTo"
  | "staff"
  | "greeting";

export type AyaAction = "guide" | "staff";

export type AyaAnswer = {
  intents: AyaIntent[];
  text: string;
  items: MenuItem[];
  action?: AyaAction;
  /** true = tidak ada menu yang cocok (jawaban berisi saran lain). */
  empty?: boolean;
};

export type AyaContext = { items: readonly MenuItem[]; bestSellerIds?: readonly string[] };

export type AyaPromptIcon = "cup" | "snow" | "bean" | "heart" | "star" | "tag" | "utensils";
export type AyaPrompt = { id: string; label: string; query: string; icon: AyaPromptIcon };

/** Chip "Coba tanyakan" (papan 04 §4). Promo hanya muncul bila ada menu promo. */
export function ayaQuickPrompts(ctx: AyaContext): AyaPrompt[] {
  const prompts: AyaPrompt[] = [
    { id: "rekomendasi", label: "Rekomendasi menu", query: "Rekomendasi menu favorit", icon: "cup" },
    { id: "dingin", label: "Menu dingin", query: "Menu minuman dingin yang segar", icon: "snow" },
    { id: "makan", label: "Makan kenyang", query: "Makanan yang bikin kenyang", icon: "utensils" },
  ];
  if (ctx.items.some((item) => available(item) && itemHasPromo(item))) {
    prompts.push({ id: "promo", label: "Promo", query: "Ada promo apa hari ini?", icon: "tag" });
  }
  return prompts;
}

/** Contoh pertanyaan (papan 04 §7). */
export const AYA_SAMPLE_PROMPTS: AyaPrompt[] = [
  { id: "kopi-favorit", label: "Rekomendasikan menu kopi paling favorit di Garage Coffee.", query: "Rekomendasikan menu kopi paling favorit", icon: "cup" },
  { id: "dingin-segar", label: "Ada menu minuman dingin yang segar?", query: "Ada menu minuman dingin yang segar?", icon: "snow" },
  { id: "kopi-bold", label: "Rekomendasi menu kopi dengan rasa bold.", query: "Rekomendasi kopi dengan rasa bold", icon: "bean" },
  { id: "kerja", label: "Menu apa yang cocok untuk pendamping kerja?", query: "Menu yang cocok untuk pendamping kerja", icon: "heart" },
  { id: "spesial", label: "Ada menu rekomendasi spesial hari ini?", query: "Menu spesial hari ini", icon: "star" },
];

export const AYA_WELCOME =
  "Hai! Aku AYA, asisten Garage Coffee. Aku bisa bantu rekomendasi menu, cari menu yang kamu mau, atau jelaskan cara pesan. Mau mulai dari mana?";

const MAX_RESULTS = 3;

/** Huruf kecil, tanpa aksen/tanda baca, spasi tunggal. */
export function normalizeAyaText(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const INTENT_PATTERNS: Array<[AyaIntent, RegExp]> = [
  ["staff", /\b(waiter|pelayan|kasir|staf|staff|panggil|bantuan orang)\b/],
  ["howTo", /\b(cara (pesan|order|bayar|memesan)|gimana (pesan|order|cara)|bagaimana (pesan|cara|memesan)|pesannya gimana)\b/],
  ["nonCoffee", /\b(non[ -]?kopi|non[ -]?coffee|bukan kopi|tanpa kopi|teh|tea|matcha|coklat|cokelat|chocolate)\b/],
  ["cold", /\b(dingin|es|segar|seger|ice|iced|cold|adem)\b/],
  ["hot", /\b(panas|hangat|anget|hot)\b/],
  ["bold", /\b(bold|strong|pahit|kuat|americano|espresso|hitam|black)\b/],
  ["sweet", /\b(manis|caramel|karamel|vanilla|vanila|gula|aren|sweet|hazelnut)\b/],
  ["creamy", /\b(creamy|krim|cream|susu|milk|latte|lembut|smooth)\b/],
  ["work", /\b(kerja|nugas|tugas|belajar|ngantuk|melek|fokus|begadang|meeting)\b/],
  ["food", /\b(lapar|laper|kenyang|makan|makanan|nasi|berat|mie|indomie)\b/],
  ["snack", /\b(cemilan|camilan|ngemil|snack|ringan|gorengan|kentang)\b/],
  ["promo", /\b(promo|diskon|potongan|murah|hemat)\b/],
  ["coffee", /\b(kopi|coffee|ngopi)\b/],
  ["recommend", /\b(rekomendasi|rekomendasiin|rekomen|favorit|terlaris|best|enak|spesial|andalan|saran|populer|recommended)\b/],
];

const GREETING = /^(hai|halo|hallo|hi|hello|hey|pagi|siang|sore|malam|selamat (pagi|siang|sore|malam)|assalamualaikum|permisi)( (aya|kak|min))?$/;

export function detectAyaIntents(query: string): AyaIntent[] {
  const text = normalizeAyaText(query);
  if (!text) return [];
  if (GREETING.test(text)) return ["greeting"];
  const intents = INTENT_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([intent]) => intent);
  // "non kopi" / "bukan kopi" / "non-coffee" juga memuat kata "kopi": maksud kopi positif dibatalkan.
  return intents.includes("nonCoffee") ? intents.filter((intent) => intent !== "coffee") : intents;
}

function available(item: MenuItem) {
  return item.stock !== "sold_out" && item.showInDigitalMenu !== false && item.status !== "archived";
}

function haystack(item: MenuItem) {
  return normalizeAyaText([item.name, item.section, item.category, item.description ?? "", ...(item.tags ?? []), ...item.variants.map((v) => v.label)].join(" "));
}

const FEATURE: Partial<Record<AyaIntent, (item: MenuItem, text: string) => boolean>> = {
  cold: (item, text) => isDrink(item) && (item.variants.some((v) => /\b(cold|ice|iced|es|dingin)\b/i.test(v.label)) || /\b(iced|ice|es|dingin|cold|frappe|soda|squash)\b/.test(text)),
  hot: (item, text) => isDrink(item) && (item.variants.some((v) => /\b(hot|panas)\b/i.test(v.label)) || /\b(hot|panas|tubruk)\b/.test(text)),
  bold: (item, text) => item.category === "Coffee" && /\b(americano|espresso|black|hitam|tubruk|long black|v60|manual|bold|doppio|kopi tubruk)\b/.test(text),
  sweet: (_item, text) => /\b(caramel|karamel|vanilla|vanila|aren|gula|hazelnut|butterscotch|choco|coklat|cokelat|manis|brown sugar|mocha|sweet|palm|creamy nutty|nutty)\b/.test(text),
  creamy: (item, text) => isDrink(item) && /\b(latte|milk|susu|cream|creamy|cappuccino|frappe|matcha|mocha|flat white|nutty)\b/.test(text),
  work: (item) => item.category === "Coffee",
  food: (item) => item.category === "Makanan",
  snack: (item) => item.category === "Cemilan",
  promo: (item) => itemHasPromo(item),
  coffee: (item) => item.category === "Coffee",
  nonCoffee: (item) => item.category === "Non-Coffee",
};

function isDrink(item: MenuItem) {
  return menuGroupForCategory(item.category, item.menuGroup) === "Bar" || item.category === "Minuman Botol";
}

const STOPWORDS = new Set([
  "ada", "apa", "yang", "dan", "atau", "untuk", "buat", "dong", "deh", "ya", "yg", "aku", "saya", "mau", "ingin", "pengen",
  "menu", "minuman", "minum", "dengan", "rasa", "di", "ini", "itu", "hari", "garage", "kak", "min", "aya", "tolong", "cari",
  "carikan", "kasih", "yuk", "cocok", "paling", "yang", "sih", "nya", "kah", "tidak", "gak", "nggak", "ga", "bisa", "tau",
]);

function freeTextTokens(query: string) {
  return normalizeAyaText(query)
    .split(" ")
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

const INTENT_PHRASE: Partial<Record<AyaIntent, string>> = {
  cold: "dingin",
  hot: "hangat",
  bold: "rasa bold",
  sweet: "manis",
  creamy: "creamy",
  work: "teman kerja",
  promo: "promo",
  nonCoffee: "non-kopi",
};

function describe(intents: AyaIntent[]) {
  const kind = intents.includes("food")
    ? "makanan"
    : intents.includes("snack")
      ? "cemilan"
      : intents.includes("coffee") || intents.includes("bold") || intents.includes("work")
        ? "kopi"
        : intents.includes("nonCoffee")
          ? "minuman non-kopi"
          : intents.some((intent) => intent === "cold" || intent === "hot" || intent === "creamy")
            ? "minuman"
            : "menu";
  const traits = intents.map((intent) => INTENT_PHRASE[intent]).filter((phrase): phrase is string => Boolean(phrase) && phrase !== "non-kopi");
  return [kind, ...traits].join(" ");
}

/** Jawaban AYA untuk sebuah pertanyaan pelanggan. Murni: sama input → sama output. */
export function answerAya(query: string, ctx: AyaContext): AyaAnswer {
  const intents = detectAyaIntents(query);
  const pool = ctx.items.filter(available);
  const best = new Map((ctx.bestSellerIds ?? []).map((id, index) => [id, index]));

  if (intents[0] === "greeting") {
    return { intents, text: "Halo juga! Mau AYA bantu cari menu? Coba ketik misalnya “kopi creamy dingin” atau pilih saran di bawah.", items: [] };
  }
  if (intents.includes("howTo")) {
    return {
      intents,
      text: "Gampang! Ketuk + pada menu untuk memasukkannya ke Daftar Pilihan, atur jumlah dan catatan, lalu buka Daftar Pilihan untuk lanjut. Mau AYA tunjukkan langkahnya satu per satu?",
      items: [],
      action: "guide",
    };
  }
  if (intents.includes("staff")) {
    return { intents, text: "Siap, kamu bisa langsung minta bantuan staf Garage lewat tombol di bawah.", items: [], action: "staff" };
  }

  const filters = intents.filter((intent) => FEATURE[intent]);
  // Kata maksud (mis. "rekomendasi", "favorit") bukan kata cari: pencarian bebas hanya bila tidak ada maksud dikenali.
  const tokens = filters.length || intents.length ? [] : freeTextTokens(query);
  const scored = pool
    .map((item) => {
      const text = haystack(item);
      const name = normalizeAyaText(item.name);
      let score = 0;
      let hits = 0;
      for (const intent of filters) {
        if (FEATURE[intent]!(item, text)) {
          score += 3;
          hits += 1;
        }
      }
      for (const token of tokens) {
        if (name.includes(token)) {
          score += 4;
          hits += 1;
        } else if (text.includes(token)) {
          score += 2;
          hits += 1;
        }
      }
      const rank = best.get(item.id);
      if (rank !== undefined) score += 2 + Math.max(0, 1 - rank / 20);
      if (item.featured) score += 1;
      if (itemHasPromo(item)) score += 0.5;
      return { item, score, hits };
    })
    // Semua filter yang diminta harus terpenuhi (kopi + dingin = kopi yang dingin).
    .filter((entry) => (filters.length ? entry.hits === filters.length : tokens.length ? entry.hits > 0 : true))
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, "id"));

  const items = scored.slice(0, MAX_RESULTS).map((entry) => entry.item);
  const onlyRecommend = intents.length > 0 && intents.every((intent) => intent === "recommend");

  if (!items.length) {
    const fallback = recommendations(pool, best);
    const what = filters.length ? describe(filters) : `“${query.trim().slice(0, 40)}”`;
    return {
      intents,
      text: fallback.length
        ? `AYA belum menemukan ${what} yang tersedia sekarang. Ini menu favorit yang bisa kamu coba:`
        : `AYA belum menemukan ${what}. Coba kata lain, ya.`,
      items: fallback,
      empty: true,
    };
  }

  if (onlyRecommend || (!filters.length && !tokens.length)) {
    const picks = recommendations(pool, best);
    return { intents, text: "Siap! Ini rekomendasi menu dari Garage Coffee:", items: picks.length ? picks : items };
  }

  const anyBest = items.some((item) => best.has(item.id));
  const label = filters.length ? describe(filters) : "menu yang cocok";
  const lead = intents.includes("work")
    ? "Biar tetap melek dan fokus, coba kopi ini:"
    : intents.includes("promo")
      ? "Ini menu yang sedang promo:"
      : `Siap! Ini ${label}${anyBest ? " pilihan favorit" : ""} dari Garage Coffee:`;
  return { intents, text: lead, items };
}

/** Rekomendasi umum: unggulan admin → terlaris → promo → urutan menu. */
export function recommendations(pool: readonly MenuItem[], best: ReadonlyMap<string, number>) {
  const featured = pool.filter((item) => item.featured);
  const bestSellers = pool.filter((item) => best.has(item.id)).sort((a, b) => best.get(a.id)! - best.get(b.id)!);
  const promo = pool.filter(itemHasPromo);
  const seen = new Set<string>();
  const picks: MenuItem[] = [];
  for (const item of [...featured, ...bestSellers, ...promo, ...pool]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    picks.push(item);
    if (picks.length === MAX_RESULTS) break;
  }
  return picks;
}
