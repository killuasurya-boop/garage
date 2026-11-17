// "Tempel daftar" (Owner 17 Nov 2026): baris yang ditempel dari Excel / Google Sheets (tab), CSV (; atau ,), atau
// WhatsApp ("Nama - jenis - @ig") → data siap simpan + kesalahan per baris. Aturan murni, dipakai layar (pratinjau)
// dan server (validasi ulang sebelum menyimpan). Tidak menebak: nilai yang tidak dikenali = kesalahan, bukan diisi asal.

import { CREW_ROLE_LABEL, CREW_ROLES, cleanCrewPhone, type CrewRole } from "@/lib/event-lineup-rules";
import { LINEUP_KIND_LABEL, parseInstagramHandle, parseLineupKind, type LineupKind } from "@/lib/gigs-lineup";

export const PASTE_MAX_ROWS = 100;

export type PastedRow<T> = { line: number; cells: string[]; value: T | null; errors: string[] };

/** Pisah teks jadi baris & sel. Pemisah dipilih per teks: tab → ; → | → " - " → ,. Baris kosong dilewati. */
export function splitPasted(text: string): Array<{ line: number; cells: string[] }> {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const sample = lines.filter((l) => l.trim()).join("\n");
  const sep = sample.includes("\t") ? "\t" : sample.includes(";") ? ";" : sample.includes("|") ? "|" : / - /.test(sample) ? " - " : ",";
  return lines
    .map((raw, index) => ({ line: index + 1, raw }))
    .filter(({ raw }) => raw.trim())
    .map(({ line, raw }) => ({ line, cells: raw.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, "$1").trim()) }));
}

const HEADER_WORDS = /^(no\.?|nomor|nama|name|jenis|kategori|jabatan|peran|paket|nilai|tagline|instagram|ig|jam|durasi|wa|whatsapp|kontak|tugas)$/i;

/** Baris pertama dianggap judul kolom bila sebagian besar selnya kata judul yang dikenal. */
function dropHeader(rows: Array<{ line: number; cells: string[] }>) {
  const first = rows[0];
  if (!first) return rows;
  const known = first.cells.filter((c) => HEADER_WORDS.test(c.replace(/[^a-z.]/gi, ""))).length;
  return known >= Math.max(1, Math.ceil(first.cells.filter(Boolean).length / 2)) ? rows.slice(1) : rows;
}

/** Kolom pertama berupa nomor urut ("1", "01.", "#2") diabaikan. */
function withoutNumber(cells: string[]) {
  return /^#?\d{1,3}[.)]?$/.test(cells[0] ?? "") && cells.length > 1 ? cells.slice(1) : cells;
}

const empty = (v: string | undefined) => !v || !v.trim() || v.trim() === "-";

/** "20.00", "20:00", "2000", "20" → "20:00"; kosong → null; lainnya → Error. */
export function parseClock(value: string | undefined): string | null {
  if (empty(value)) return null;
  const m = /^(\d{1,2})(?:[.:]?(\d{2}))?$/.exec(value!.trim().replace(/\s*(wib)$/i, ""));
  if (!m) throw new Error(`Jam "${value}" tidak dikenal (contoh 20:00).`);
  const h = Number(m[1]);
  const min = Number(m[2] ?? "0");
  if (h > 23 || min > 59) throw new Error(`Jam "${value}" tidak valid.`);
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** "Rp1.000.000", "1.000.000", "1jt", "1,5 juta", "500rb", "500k" → rupiah bulat; kosong → 0. */
export function parseRupiah(value: string | undefined): number {
  if (empty(value)) return 0;
  const v = value!.trim().toLowerCase().replace(/^rp\.?\s*/, "");
  const unit = /(jt|juta)$/.test(v) ? 1_000_000 : /(rb|ribu|k)$/.test(v) ? 1_000 : 1;
  const num = v.replace(/(jt|juta|rb|ribu|k)$/, "").trim();
  const n = unit === 1 ? Number(num.replace(/[.,\s]/g, "")) : Number(num.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) throw new Error(`Nilai "${value}" bukan angka rupiah.`);
  return Math.round(n * unit);
}

function phoneCell(value: string | undefined, errors: string[]): string | null {
  if (empty(value)) return null;
  const phone = cleanCrewPhone(value);
  if (!phone) errors.push(`WA "${value}" tidak valid (contoh 081234567890).`);
  return phone;
}

function instagramCell(value: string | undefined, errors: string[]): string | null {
  if (empty(value)) return null;
  try {
    return parseInstagramHandle(value);
  } catch {
    errors.push(`Instagram "${value}" tidak valid.`);
    return null;
  }
}

function nameCell(value: string | undefined, errors: string[], max: number): string {
  const name = (value ?? "").trim();
  if (name.length < 2) errors.push("Nama wajib diisi (minimal 2 huruf).");
  else if (name.length > max) errors.push(`Nama terlalu panjang (maks ${max}).`);
  return name;
}

// ─── Talent ──────────────────────────────────────────────────────────────────
export const TALENT_COLUMNS = ["Nama", "Jenis", "Tagline", "Instagram", "Jam", "Durasi (menit)", "WA kontak"] as const;
export type PastedTalent = {
  name: string;
  kind: LineupKind;
  tagline: string | null;
  instagram: string | null;
  setStart: string | null;
  setMinutes: number | null;
  contactPhone: string | null;
};

export function parseTalentRows(text: string): PastedRow<PastedTalent>[] {
  return dropHeader(splitPasted(text)).map(({ line, cells: raw }) => {
    const cells = withoutNumber(raw);
    const errors: string[] = [];
    const name = nameCell(cells[0], errors, 80);
    const kind = empty(cells[1]) ? "band" : parseLineupKind(cells[1]);
    if (!kind) errors.push(`Jenis "${cells[1]}" tidak dikenal (${Object.values(LINEUP_KIND_LABEL).join(", ")}).`);
    const tagline = empty(cells[2]) ? null : cells[2].trim();
    if (tagline && tagline.length > 40) errors.push("Tagline maksimal 40 huruf.");
    const instagram = instagramCell(cells[3], errors);
    let setStart: string | null = null;
    try {
      setStart = parseClock(cells[4]);
    } catch (e) {
      errors.push((e as Error).message);
    }
    let setMinutes: number | null = null;
    if (!empty(cells[5])) {
      setMinutes = Number(cells[5].replace(/\s*(menit|mnt|m)$/i, ""));
      if (!Number.isInteger(setMinutes) || setMinutes < 1 || setMinutes > 600) {
        errors.push(`Durasi "${cells[5]}" harus angka menit (1–600).`);
        setMinutes = null;
      }
    }
    const contactPhone = phoneCell(cells[6], errors);
    const value = errors.length ? null : { name, kind: kind!, tagline, instagram, setStart, setMinutes, contactPhone };
    return { line, cells: raw, value, errors };
  });
}

// ─── Panitia ─────────────────────────────────────────────────────────────────
export const CREW_COLUMNS = ["Nama", "Jabatan", "WA", "Tugas"] as const;
export type PastedCrew = { name: string; role: CrewRole; phone: string | null; duties: string | null };

const CREW_ALIASES: Record<string, CrewRole> = {
  ketua: "ketua",
  "ketua panitia": "ketua",
  ketuplak: "ketua",
  sekretaris: "sekretaris",
  sekre: "sekretaris",
  bendahara: "bendahara",
  "koordinator lineup": "lineup",
  lineup: "lineup",
  "stage manager": "stage",
  stage: "stage",
  sm: "stage",
  sound: "sound",
  "sound & teknis": "sound",
  teknis: "sound",
  keamanan: "keamanan",
  security: "keamanan",
  dokumentasi: "dokumentasi",
  dokum: "dokumentasi",
  humas: "humas",
  "humas & media": "humas",
  media: "humas",
  konsumsi: "konsumsi",
  tiket: "tiket",
  "tiket & registrasi": "tiket",
  registrasi: "tiket",
  lo: "lo",
  "liaison officer": "lo",
  "liaison officer (lo)": "lo",
  lainnya: "lainnya",
};

export function parseCrewRole(value: string | undefined): CrewRole | null {
  if (empty(value)) return "lainnya";
  const key = value!.trim().toLowerCase();
  if (CREW_ALIASES[key]) return CREW_ALIASES[key];
  const byLabel = CREW_ROLES.find((r) => CREW_ROLE_LABEL[r].toLowerCase() === key);
  return byLabel ?? null;
}

export function parseCrewRows(text: string): PastedRow<PastedCrew>[] {
  return dropHeader(splitPasted(text)).map(({ line, cells: raw }) => {
    const cells = withoutNumber(raw);
    const errors: string[] = [];
    const name = nameCell(cells[0], errors, 80);
    const role = parseCrewRole(cells[1]);
    if (!role) errors.push(`Jabatan "${cells[1]}" tidak dikenal (mis. Ketua, Sekretaris, Bendahara, Stage Manager).`);
    const phone = phoneCell(cells[2], errors);
    const duties = empty(cells[3]) ? null : cells.slice(3).join(", ").slice(0, 1000);
    return { line, cells: raw, value: errors.length ? null : { name, role: role!, phone, duties }, errors };
  });
}

// ─── Sponsor ─────────────────────────────────────────────────────────────────
export const SPONSOR_COLUMNS = ["Nama", "Paket", "Nilai disepakati", "Instagram", "Nama kontak", "WA kontak"] as const;
export type PastedSponsor = {
  name: string;
  packageName: string | null;
  agreedAmount: number;
  instagram: string | null;
  contactName: string | null;
  contactPhone: string | null;
};

export function parseSponsorRows(text: string): PastedRow<PastedSponsor>[] {
  return dropHeader(splitPasted(text)).map(({ line, cells: raw }) => {
    const cells = withoutNumber(raw);
    const errors: string[] = [];
    const name = nameCell(cells[0], errors, 120);
    const packageName = empty(cells[1]) ? null : cells[1].trim().slice(0, 60);
    let agreedAmount = 0;
    try {
      agreedAmount = parseRupiah(cells[2]);
      if (agreedAmount > 10_000_000_000) errors.push("Nilai terlalu besar.");
    } catch (e) {
      errors.push((e as Error).message);
    }
    const instagram = instagramCell(cells[3], errors);
    const contactName = empty(cells[4]) ? null : cells[4].trim().slice(0, 80);
    const contactPhone = phoneCell(cells[5], errors);
    return { line, cells: raw, value: errors.length ? null : { name, packageName, agreedAmount, instagram, contactName, contactPhone }, errors };
  });
}

/** Nama yang muncul dua kali di tempelan yang sama → kesalahan di kemunculan kedua (tidak membuat data dobel). */
export function markDuplicateNames<T extends { name: string }>(rows: PastedRow<T>[]): PastedRow<T>[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    if (!row.value) return row;
    const key = row.value.name.trim().toLowerCase();
    if (seen.has(key)) return { ...row, value: null, errors: [...row.errors, "Nama ini sudah ada di baris sebelumnya."] };
    seen.add(key);
    return row;
  });
}
