// Pengelompokan lineup GIGS di website (aturan murni, tanpa data tertulis di sini).
// Nama, logo, dan jenis penampil hanya datang dari platform event (events.json / admin event).
// Jenis opsional: bila platform belum mengirimnya, lineup tampil sebagai satu daftar seperti sebelumnya.

export type LineupKind = "band" | "standup" | "akustik" | "dj" | "kreator";

/** `time` = jam tampil (mis. "20.00–20.45") dari rundown Garage OS; platform event tidak mengirimnya. */
export type LineupItem = { name: string; logo: string | null; kind: LineupKind | null; time?: string | null; live?: boolean };

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
 * Lineup website = lineup terkonfirmasi dari Garage OS (modul Lineup & Panitia) bila ada, logo diambil dari
 * platform event untuk nama yang sama (tanpa peduli huruf besar/kecil). Tanpa data Garage OS → lineup platform.
 */
export function mergeLineup(
  platform: LineupItem[],
  garage: Array<{ name: string; kind: LineupKind; time?: string | null; live?: boolean }>,
): LineupItem[] {
  if (!garage.length) return platform;
  const logoByName = new Map(platform.map((item) => [item.name.trim().toLowerCase(), item.logo]));
  return garage.map((item) => ({
    name: item.name,
    kind: item.kind,
    logo: logoByName.get(item.name.trim().toLowerCase()) ?? null,
    time: item.time ?? null,
    live: item.live ?? false,
  }));
}
