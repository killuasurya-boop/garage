// Bank kalimat Aya (A4): bijak, lucu, imut — Bahasa Indonesia, tanpa AI berbayar (OD-03).
// Aturan isi: maksimal 2 kalimat, tidak menyebut harga/promo/stok/data internal, tidak menyindir
// atau menyalahkan orang (pelanggan maupun staf), tidak menjanjikan hal di luar sistem.
// Fungsi murni: pemilihan kalimat memakai fungsi acak yang bisa disuntik saat tes.

export type AyaLineCategory =
  | "greeting" // menyambut pelanggan (dipakai bersama sapaan sesuai jam)
  | "wisdom" // kata bijak ala barista
  | "joke" // plesetan/tebak-tebakan ringan seputar kopi & makanan
  | "tapped" // reaksi saat Aya diketuk
  | "dizzy" // setelah dilempar
  | "guideDone" // panduan cara pesan selesai
  | "staffCheer" // semangat untuk staf (tanpa menilai/menegur siapa pun)
  | "staffAllClear"; // tidak ada pengingat yang perlu dikerjakan

export const AYA_LINES: Record<AyaLineCategory, readonly string[]> = {
  greeting: [
    "Aku Aya, teman pilih menumu hari ini. Butuh bantuan, ketuk aku saja!",
    "Hai hai! Lagi pengin yang segar, manis, atau yang bikin kenyang?",
    "Selamat datang di Garage! Pilih pelan-pelan, Aya temani.",
    "Halo! Kalau bingung mulai dari mana, tekan tombol Cara pesan ya.",
  ],
  wisdom: [
    "Kopi yang enak itu sabar diseduh. Hari yang baik juga begitu.",
    "Pahitnya kopi bikin manisnya obrolan makin terasa.",
    "Istirahat sebentar bukan kalah, cuma isi ulang semangat.",
    "Hidup itu kayak latte art: tidak harus sempurna, yang penting dibuat dengan hati.",
    "Secangkir hangat, teman yang tepat, dan hati yang lapang. Cukup kan?",
    "Pelan-pelan saja, yang penting sampai. Sama seperti tetesan kopi.",
  ],
  joke: [
    "Kopi apa yang bikin rindu? Kopi-kiran kamu terus.",
    "Kenapa barista selalu tenang? Tiap hari belajar dari espresso: ditekan tinggi, hasilnya tetap nikmat.",
    "Gula itu kayak pujian: secukupnya bikin manis, kebanyakan bikin enek.",
    "Aya mau jadi barista, tapi tanganku kependekan. Jadi Aya tukang semangat saja!",
    "Jangan sedih kalau pahit, itu namanya kopi. Kalau manis, itu kamu.",
    "Es batu tahu rahasia ketenangan: tetap dingin walau suasana panas.",
  ],
  tapped: [
    "Hihi, geli! Ada yang bisa Aya bantu?",
    "Aya di sini! Mau dicarikan menu?",
    "Ketuk lagi dan Aya joget, eh beneran!",
    "Hai! Aya siap membantu, sambil imut tentunya.",
  ],
  dizzy: [
    "Waduh, dunia berputar… Aya pusing sebentar ya!",
    "Wuuush! Aya kayak habis naik komidi putar.",
    "Pelan-pelan dong, Aya kan cuma mochi kecil!",
  ],
  guideDone: [
    "Mantap! Sekarang kamu sudah jago pesan sendiri.",
    "Selesai! Selamat memilih menu favoritmu ya.",
    "Hore, paham semua! Kalau lupa, panggil Aya lagi.",
  ],
  staffCheer: [
    "Semangat, tim! Satu pesanan rapi lebih berarti dari sepuluh yang terburu-buru.",
    "Tarik napas, senyum, lanjut. Kalian keren!",
    "Kerja tim itu kayak espresso: padat, kuat, dan bikin melek.",
    "Jangan lupa minum air putih juga ya, bukan cuma kopi.",
    "Pelanggan senang dimulai dari tim yang saling bantu.",
  ],
  staffAllClear: [
    "Semua aman terkendali. Aya bangga sama kalian!",
    "Antrean tenang, stok aman. Waktunya rapikan meja kerja sebentar?",
    "Tidak ada yang mendesak. Tetap siaga, tetap santai.",
  ],
};

/**
 * Pilih kalimat yang belum dipakai di sesi ini; bila semua sudah, mulai ulang (tetap tidak
 * mengulang kalimat terakhir). `used` diperbarui oleh pemanggil.
 */
export function pickAyaLine(category: AyaLineCategory, used: ReadonlySet<string> = new Set(), random: () => number = Math.random): string {
  const lines = AYA_LINES[category];
  const fresh = lines.filter((line) => !used.has(line));
  const last = [...used].at(-1);
  const others = lines.filter((line) => line !== last);
  const pool = fresh.length ? fresh : others.length ? others : lines;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

/** Penanda kalimat sudah dipakai di sesi ini (sessionStorage; aman bila diblokir). */
const USED_KEY = "garage:aya-lines-used";

export function readUsedAyaLines(): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(USED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function rememberAyaLine(line: string) {
  try {
    const used = [...readUsedAyaLines().add(line)].slice(-60);
    window.sessionStorage.setItem(USED_KEY, JSON.stringify(used));
  } catch {
    // Penyimpanan diblokir: kalimat bisa berulang, tidak masalah.
  }
}

/** Ambil kalimat untuk sesi ini dan catat sebagai sudah dipakai (khusus browser). */
export function nextAyaLine(category: AyaLineCategory) {
  const line = pickAyaLine(category, readUsedAyaLines());
  rememberAyaLine(line);
  return line;
}
