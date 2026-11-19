// Pengelompokan lineup GIGS di website (aturan murni, tanpa data tertulis di sini).
// Nama, logo, dan jenis penampil hanya datang dari platform event (events.json / admin event).
// Jenis opsional: bila platform belum mengirimnya, lineup tampil sebagai satu daftar seperti sebelumnya.

export type LineupKind = "band" | "standup" | "akustik" | "dj" | "kreator";

/** `time` = jam tampil (mis. "20.00–20.45") dari rundown Garage OS; platform event tidak mengirimnya. */
/** `tagline` = baris kecil di bawah nama (mis. "Heavy / Metallic Roster"), diisi Owner di modul Lineup. */
/**
 * Nama resmi talent menurut Owner bila platform GIGS masih menulis ejaan lain (Owner 17–18 Nov 2026: "SURAU" → "SURAI").
 * Dipakai untuk SEMUA data lineup dari platform (beranda, ticker, impor). Kunci = nama platform huruf kecil.
 */
// "SURAI HC" / "LOSTSIDE" = nama slot di dashboard panitia platform untuk talent yang sama (Owner 18 Nov 2026).
export const OFFICIAL_LINEUP_NAMES: Readonly<Record<string, string>> = { surau: "SURAI", "surai hc": "SURAI", lostside: "LOST SIDE" };

/** Nama platform → nama resmi Garage (selain yang terdaftar: apa adanya). */
export function officialLineupName(name: string): string {
  return OFFICIAL_LINEUP_NAMES[name.trim().toLowerCase()] ?? name;
}

/** Kunci pencocokan talent: nama resmi, huruf kecil, tanpa spasi/tanda baca ("LOST SIDE" = "Lost-Side"). */
export function lineupKey(name: string): string {
  return officialLineupName(name).toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type LineupItem = {
  name: string;
  /** Nama asli di platform GIGS bila berbeda dari nama resmi (untuk mencocokkan impor; tidak ditampilkan). */
  platformName?: string;
  logo: string | null;
  kind: LineupKind | null;
  time?: string | null;
  live?: boolean;
  tagline?: string | null;
  /** Akun Instagram tanpa "@" (diisi Owner); kartu website jadi tautan ke profilnya. */
  instagram?: string | null;
};

/**
 * "@akun", "akun", atau tautan instagram.com/akun → "akun". Kosong → null. Format salah → Error
 * (pemanggil memetakan ke error modulnya). Aturan murni, dipakai lineup & sponsor.
 */
export function parseInstagramHandle(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null;
  const handle = value
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
  if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) throw new Error("Akun Instagram tidak valid.");
  return handle;
}

/** Tautan profil publik; null bila akun kosong/tidak valid (tidak pernah membuat tautan sembarang). */
export function instagramUrl(handle: string | null | undefined): string | null {
  if (!handle || !/^[A-Za-z0-9._]{1,30}$/.test(handle)) return null;
  return `https://www.instagram.com/${handle}/`;
}

export type LineupGroup = { kind: LineupKind | null; label: string; items: LineupItem[] };

export const LINEUP_KIND_ORDER: LineupKind[] = ["band", "standup", "akustik", "dj", "kreator"];

export const LINEUP_KIND_LABEL: Record<LineupKind, string> = {
  band: "Band",
  standup: "Stand-up Comedy",
  akustik: "Akustik",
  dj: "DJ",
  kreator: "Kreator Konten",
};

const KIND_ALIASES: Record<string, LineupKind> = {
  band: "band",
  musik: "band",
  music: "band",
  standup: "standup",
  "stand-up": "standup",
  "stand up": "standup",
  komika: "standup",
  comedy: "standup",
  komedi: "standup",
  akustik: "akustik",
  acoustic: "akustik",
  dj: "dj",
  kreator: "kreator",
  creator: "kreator",
  "konten kreator": "kreator",
};

/** Jenis penampil dari API (type/kind/category), hanya nilai yang dikenal; lainnya = null. */
export function parseLineupKind(value: unknown): LineupKind | null {
  if (typeof value !== "string") return null;
  return KIND_ALIASES[value.trim().toLowerCase()] ?? null;
}

/**
 * Kelompokkan lineup per jenis dengan urutan tetap (Band, Stand-up, …). Urutan penampil di dalam
 * kelompok mengikuti urutan dari platform event. Bila tidak ada satu pun yang berjenis → satu kelompok.
 */
export function groupLineup(items: LineupItem[]): LineupGroup[] {
  if (!items.some((item) => item.kind)) {
    return items.length ? [{ kind: null, label: "Penampil", items }] : [];
  }
  const groups: LineupGroup[] = [];
  for (const kind of LINEUP_KIND_ORDER) {
    const list = items.filter((item) => item.kind === kind);
    if (list.length) groups.push({ kind, label: LINEUP_KIND_LABEL[kind], items: list });
  }
  const others = items.filter((item) => !item.kind);
  if (others.length) groups.push({ kind: null, label: "Penampil lain", items: others });
  return groups;
}

/** Ringkasan jumlah per jenis, mis. "3 band · 1 stand-up". Kosong bila jenis belum dikirim. */
export function lineupSummary(groups: LineupGroup[]): string {
  return groups
    .filter((group) => group.kind)
    .map((group) => `${group.items.length} ${group.kind === "standup" ? "stand-up" : LINEUP_KIND_LABEL[group.kind!].toLowerCase()}`)
    .join(" · ");
}

/**
 * Lineup website = lineup terkonfirmasi dari Garage OS (modul Lineup & Panitia) bila ada. Logo: unggahan Owner di
 * Garage OS lebih dulu, lalu logo platform event untuk nama yang sama (tanpa peduli huruf besar/kecil).
 * Tanpa data Garage OS → lineup platform.
 */
export function mergeLineup(
  platform: LineupItem[],
  garage: Array<{
    name: string;
    kind: LineupKind;
    time?: string | null;
    live?: boolean;
    logo?: string | null;
    tagline?: string | null;
    instagram?: string | null;
  }>,
): LineupItem[] {
  if (!garage.length) return platform;
  const logoByName = new Map(platform.map((item) => [item.name.trim().toLowerCase(), item.logo]));
  return garage.map((item) => {
    // Baris lama di Garage OS bisa masih bernama ejaan platform (mis. "SURAU" diimpor sebelum koreksi) → tampil nama resmi.
    const name = officialLineupName(item.name);
    return {
      name,
      kind: item.kind,
      logo: item.logo || logoByName.get(name.trim().toLowerCase()) || null,
      time: item.time ?? null,
      live: item.live ?? false,
      tagline: item.tagline ?? null,
      instagram: item.instagram ?? null,
    };
  });
}

/**
 * Data slot untuk HALAMAN EVENT platform (`/event/<slug>`), dilewatkan Caddy → Garage OS (Owner 18 Nov 2026).
 * Kode halaman platform hanya menampilkan slot yang punya `performer`; panitia sering hanya mengisi nama slot. Di sini:
 * slot penampil (jenis dikenal) tanpa penampil → penampil = nama resmi slot; ejaan dikoreksi; logo kosong dilengkapi
 * dari Garage OS / promo platform (kunci `lineupKey`); baris kecil di kartu = "Official Lineup". Slot lain (mis. sesi
 * sponsor) dikirim apa adanya. Bentuk respons tetap milik platform (`{ slots: [...] }`).
 */
export function enrichSlotsForEventPage(slots: unknown, logoByKey: ReadonlyMap<string, string>): Array<Record<string, unknown>> {
  return (Array.isArray(slots) ? slots : [])
    .filter((slot): slot is Record<string, unknown> => Boolean(slot) && typeof slot === "object")
    .map((slot) => {
      if (!parseLineupKind(slot.category)) return slot;
      const raw = (typeof slot.performer === "string" && slot.performer.trim()) || (typeof slot.name === "string" && slot.name.trim()) || "";
      if (!raw) return slot;
      const performer = officialLineupName(raw);
      const logo = (typeof slot.logo === "string" && slot.logo) || logoByKey.get(lineupKey(performer)) || "";
      return { ...slot, name: "Official Lineup", performer, logo };
    });
}

/**
 * SATU pintu (Owner 18 Nov 2026): lineup terkonfirmasi di Garage OS (Kontrol → Lineup) → bentuk slot platform untuk
 * halaman `/event/<slug>`. `performer` = nama, baris kecil = tagline (atau "Official Lineup"), jam = rentang rundown,
 * logo = Garage OS lalu logo platform bernama sama. Durasi 0 → kartu tidak menulis "n menit".
 */
export function garageLineupAsEventSlots(
  items: ReadonlyArray<{ name: string; kind: LineupKind | null; time?: string | null; logo?: string | null; tagline?: string | null }>,
  logoByKey: ReadonlyMap<string, string>,
): Array<Record<string, unknown>> {
  return items.map((item, index) => {
    const performer = officialLineupName(item.name);
    return {
      id: `garage-${index + 1}`,
      name: item.tagline?.trim() || "Official Lineup",
      category: item.kind ?? "band",
      startTime: item.time ?? "",
      durationMin: 0,
      performer,
      logo: item.logo || logoByKey.get(lineupKey(performer)) || "",
    };
  });
}
