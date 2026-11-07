// =============================================================================
// AYA Assistant menu digital (Menu V5 F4, papan 04) — mesin jawaban BERBASIS ATURAN.
//
// Keputusan D-07: AYA pelanggan tidak memanggil AI/layanan luar dan tidak membuka
// data internal. Semua jawaban dibentuk dari data menu yang sudah tampil
// (nama, kategori, seksi, tag, deskripsi, varian, unggulan, promo, terlaris).
// Tidak ada rating, "menu terbaru" atau promo karangan: data itu tidak ada.
// =============================================================================
import { menuGroupForCategory, type MenuItem } from "@/lib/garage-api-types";

import { GARAGE_LOCATION } from "@/lib/garage-location";
import { GARAGE_SOCIALS } from "@/lib/garage-socials";

import { itemHasPromo } from "../order-ui";
import { isSignature, isUnggulan } from "./menu-v5-model";

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
  | "signature"
  | "unggulan"
  | "location"
  | "social"
  | "table"
  | "greeting";

export type AyaAction = "guide" | "staff";

/** Target navigasi halaman (Smart Page Navigation, master prompt §8). */
export type AyaNav =
  | { kind: "category"; category: string; label: string }
  | { kind: "chip"; chip: "signature" | "unggulan" | "best" | "promo"; label: string }
  | { kind: "help"; label: string };

export type AyaLink = { label: string; href: string };

export type AyaAnswer = {
  intents: AyaIntent[];
  text: string;
  items: MenuItem[];
  action?: AyaAction;
  /** Navigasi yang ditawarkan (tombol) — `autoNav` = pelanggan memintanya langsung ("tunjukkan …"). */
  nav?: AyaNav;
  autoNav?: boolean;
  /** Tautan resmi (lokasi, media sosial) — dari garage-location / garage-socials, tidak pernah karangan. */
  links?: AyaLink[];
  /** true = tidak ada menu yang cocok (jawaban berisi saran lain). */
  empty?: boolean;
};

export type AyaContext = {
  items: readonly MenuItem[];
  bestSellerIds?: readonly string[];
  /** Mode menu outlet: "waiter_list" = pesanan dicatat waiter; "self_order" = pesan sendiri. */
  mode?: "waiter_list" | "self_order";
  /** Meja yang sedang dilihat pelanggan (info saja), mis. "Meja 07". */
  tableLabel?: string | null;
};

export type AyaPromptIcon = "cup" | "snow" | "bean" | "heart" | "star" | "tag" | "utensils" | "crown" | "help" | "table" | "pin" | "camera";
export type AyaPrompt = { id: string; label: string; query: string; icon: AyaPromptIcon };

/**
 * Chip "Coba tanyakan" (papan 04 §4 + master prompt §2). Chip yang butuh data (Coffee, Signature, Unggulan, Promo)
 * hanya muncul bila datanya ada — tidak ada tombol ke hal yang kosong.
 */
export function ayaQuickPrompts(ctx: AyaContext): AyaPrompt[] {
  const pool = ctx.items.filter(available);
  const prompts: AyaPrompt[] = [];
  if (pool.some((item) => item.category === "Coffee")) prompts.push({ id: "lihat-kopi", label: "Lihat Menu Coffee", query: "Tunjukkan menu kopi", icon: "bean" });
  prompts.push({ id: "rekomendasi", label: "Rekomendasi Minuman", query: "Rekomendasi minuman favorit", icon: "cup" });
  if (pool.some(isSignature)) prompts.push({ id: "signature", label: "Menu Signature", query: "Mana menu signature?", icon: "crown" });
  if (pool.some(isUnggulan)) prompts.push({ id: "unggulan", label: "Menu Unggulan", query: "Tunjukkan menu unggulan", icon: "star" });
  if (pool.some(itemHasPromo)) prompts.push({ id: "promo", label: "Promo", query: "Ada promo apa hari ini?", icon: "tag" });
  prompts.push({ id: "cara-pesan", label: "Bagaimana Cara Memesan?", query: "Bagaimana cara pesan?", icon: "help" });
  prompts.push({ id: "meja", label: "Informasi Meja", query: "Informasi meja saya", icon: "table" });
  prompts.push({ id: "lokasi", label: "Lokasi Garage Coffee", query: "Di mana lokasi Garage Coffee?", icon: "pin" });
  prompts.push({ id: "instagram", label: "Instagram Garage Coffee", query: "Instagram Garage Coffee apa?", icon: "camera" });
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
  ["howTo", /\b(cara (pesan|order|bayar|memesan)|gimana (pesan|order|cara)|bagaimana (pesan|cara|memesan)|pesannya gimana)\b/],
  ["staff", /\b(panggil (waiter|pelayan|staf|staff|kasir)|bantuan orang|minta bantuan|butuh bantuan)\b/],
  ["location", /\b(lokasi|alamat|di ?mana (garage|tempat|kafe|cafe|lokasinya)|maps|google map|rute|arah ke)\b/],
  ["social", /\b(instagram|insta|ig|tiktok|sosmed|sosial media|media sosial|facebook|fb|youtube)\b/],
  ["table", /\b(meja|table)\b/],
  ["signature", /\b(signature|khas|ciri khas)\b/],
  ["unggulan", /\b(unggulan|andalan)\b/],
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

/** "tunjukkan / lihat / buka / mana …" = pelanggan minta dibawa ke bagian itu. */
const SHOW_VERB = /\b(tunjuk\w*|lihat\w*|buka\w*|mana|tampil\w*|antar\w*|ke bagian)\b/;
const CATEGORY_NAV: Array<[AyaIntent, string, string]> = [
  ["coffee", "Coffee", "menu Coffee"],
  ["nonCoffee", "Non-Coffee", "menu Non-Coffee"],
  ["food", "Makanan", "menu Makanan"],
  ["snack", "Cemilan", "menu Cemilan"],
];

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
  signature: (item) => isSignature(item),
  unggulan: (item) => isUnggulan(item),
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
    if (ctx.mode === "waiter_list") {
      return {
        intents,
        text: "Pesanan di Garage dicatat oleh waiter yang bertugas. Pilih menu dengan tombol +, lalu buka Daftar Pilihan dan ketuk “Tunjukkan ke Waiter”. Butuh waiter sekarang? Ketuk tombol di bawah.",
        items: [],
        action: "staff",
        nav: { kind: "help", label: "Panggil waiter" },
      };
    }
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
  if (intents.includes("location")) {
    return {
      intents,
      text: `Garage Coffee ada di ${GARAGE_LOCATION.address}. Ketuk tombol di bawah untuk membuka rute di Google Maps.`,
      items: [],
      links: [{ label: "Buka rute di Google Maps", href: GARAGE_LOCATION.directionsUrl }],
    };
  }
  if (intents.includes("social")) {
    const ig = GARAGE_SOCIALS.find((social) => social.id === "instagram");
    const wantsIgOnly = /\b(instagram|insta|ig)\b/.test(normalizeAyaText(query));
    const list = wantsIgOnly && ig ? [ig] : GARAGE_SOCIALS;
    return {
      intents,
      text: wantsIgOnly && ig
        ? `Instagram resmi Garage Coffee: ${ig.handle}. Ikuti untuk info promo dan menu terbaru, ya!`
        : `Akun resmi Garage Coffee: ${GARAGE_SOCIALS.map((social) => `${social.label} ${social.handle}`).join(", ")}.`,
      items: [],
      links: list.map((social) => ({ label: `${social.label} ${social.handle}`, href: social.href })),
    };
  }
  if (intents.includes("table") && !intents.some((intent) => FEATURE[intent])) {
    const table = ctx.tableLabel?.trim();
    const known = table && /\d/.test(table);
    const order = ctx.mode === "waiter_list"
      ? "Nomor meja ini hanya penanda supaya waiter tahu kamu duduk di mana — memilihnya tidak membuat pesanan."
      : "Nomor meja dipakai supaya pesananmu diantar ke tempat yang benar.";
    return {
      intents,
      text: known
        ? `Kamu sedang melihat menu untuk ${table}. ${order} Salah meja? Ketuk nomor meja di bagian atas untuk mengubahnya.`
        : `Nomor mejamu belum tercatat. Ketuk “Meja” di bagian atas atau pindai QR di meja. ${order}`,
      items: [],
    };
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
      if (isSignature(item)) score += 1;
      if (itemHasPromo(item)) score += 0.5;
      return { item, score, hits };
    })
    // Semua filter yang diminta harus terpenuhi (kopi + dingin = kopi yang dingin).
    .filter((entry) => (filters.length ? entry.hits === filters.length : tokens.length ? entry.hits > 0 : true))
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, "id"));

  const items = scored.slice(0, MAX_RESULTS).map((entry) => entry.item);
  const wantsShow = SHOW_VERB.test(normalizeAyaText(query));
  const nav = navFor(intents);
  const onlyRecommend = intents.length > 0 && intents.every((intent) => intent === "recommend");

  if (!items.length) {
    const fallback = recommendations(pool, best);
    if (intents.includes("signature") || intents.includes("unggulan")) {
      const which = intents.includes("signature") ? "Signature" : "Unggulan";
      return {
        intents,
        text: `Saat ini belum ada menu yang ditandai ${which} oleh tim Garage. Ini menu favorit yang bisa kamu coba:`,
        items: fallback,
        empty: true,
      };
    }
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
  const lead = intents.includes("signature")
    ? "Ini menu Signature — racikan khas Garage Coffee:"
    : intents.includes("unggulan")
      ? "Ini menu Unggulan yang direkomendasikan tim Garage:"
      : intents.includes("work")
        ? "Biar tetap melek dan fokus, coba kopi ini:"
        : intents.includes("promo")
          ? "Ini menu yang sedang promo:"
          : `Siap! Ini ${label}${anyBest ? " pilihan favorit" : ""} dari Garage Coffee:`;
  const navText = nav && wantsShow ? ` AYA bawa kamu ke ${nav.label}, ya.` : "";
  return { intents, text: lead.replace(/:$/, navText ? `.${navText} Beberapa pilihannya:` : ":"), items, nav, autoNav: Boolean(nav && wantsShow) };
}

/** Bagian halaman yang cocok dengan maksud: satu kategori, atau filter Signature/Unggulan/Promo. */
function navFor(intents: AyaIntent[]): AyaNav | undefined {
  if (intents.includes("signature")) return { kind: "chip", chip: "signature", label: "menu Signature" };
  if (intents.includes("unggulan")) return { kind: "chip", chip: "unggulan", label: "menu Unggulan" };
  // Ciri rasa (dingin, manis …) = lintas kategori → jangan pindah halaman, cukup kartu hasil.
  if (intents.some((intent) => ["cold", "hot", "bold", "sweet", "creamy", "work"].includes(intent))) return undefined;
  const cats = CATEGORY_NAV.filter(([intent]) => intents.includes(intent));
  if (cats.length === 1) return { kind: "category", category: cats[0][1], label: cats[0][2] };
  if (intents.includes("promo")) return { kind: "chip", chip: "promo", label: "menu Promo" };
  return undefined;
}

/** Rekomendasi umum: Signature → Unggulan admin → terlaris → promo → urutan menu. */
export function recommendations(pool: readonly MenuItem[], best: ReadonlyMap<string, number>) {
  const featured = [...pool.filter(isSignature), ...pool.filter((item) => item.featured)];
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
