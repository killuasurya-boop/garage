// Aturan murni hari-H event (GIGS EO Fase 3, Owner 17 Nov 2026): check-in pintu & mode stage manager. Tanpa DB.

import { INVITATION_TOKEN_PATTERN } from "@/lib/event-invitation-token";

/**
 * Isi hasil scan QR / ketikan panitia → token undangan. QR undangan = tautan `/undangan/<token>`; token polos juga
 * diterima. Selain itu null (bukan undangan).
 */
export function extractInvitationToken(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const match = value.match(/\/undangan\/([A-Za-z0-9_-]{32})(?:[/?#]|$)/);
  if (match) return match[1];
  return INVITATION_TOKEN_PATTERN.test(value) ? value : null;
}

export type CheckinDecision = { ok: true } | { ok: false; code: string; message: string };

/**
 * Boleh check-in? `alreadyForInvitation` = pax aktif yang sudah masuk dengan undangan ini. `maxPax` = batas tamu undangan
 * (null untuk walk-in). Kapasitas event null = tanpa batas.
 */
export function checkinDecision(input: { pax: number; alreadyForInvitation: number; maxPax: number | null; totalActive: number; capacity: number | null }): CheckinDecision {
  if (!Number.isInteger(input.pax) || input.pax < 1) return { ok: false, code: "INVALID_PAX", message: "Jumlah orang minimal 1." };
  if (input.maxPax !== null && input.alreadyForInvitation + input.pax > input.maxPax) {
    const left = Math.max(0, input.maxPax - input.alreadyForInvitation);
    return {
      ok: false,
      code: left ? "PAX_EXCEEDS_INVITATION" : "ALREADY_CHECKED_IN",
      message: left ? `Undangan ini hanya untuk ${input.maxPax} orang; sisa ${left}.` : `Undangan ini sudah dipakai masuk penuh (${input.maxPax} orang).`,
    };
  }
  if (input.capacity !== null && input.totalActive + input.pax > input.capacity) {
    return { ok: false, code: "CAPACITY_FULL", message: `Kapasitas penuh: ${input.totalActive} dari ${input.capacity} orang sudah masuk.` };
  }
  return { ok: true };
}

export type StageSlot = {
  id: string;
  name: string;
  slot: number;
  /** Rencana: menit sejak 00:00 tanggal event (WIB), bisa > 1440. */
  startAbs: number | null;
  endAbs: number | null;
  actualStart: Date | null;
  actualEnd: Date | null;
};

const WIB_MS = 7 * 3_600_000;

/** Menit sejak 00:00 WIB `eventDate` ("YYYY-MM-DD") untuk waktu `at`. */
export function minutesSinceEventDay(eventDate: string, at: Date): number {
  const dayStart = Date.parse(`${eventDate}T00:00:00Z`) - WIB_MS;
  return Math.round((at.getTime() - dayStart) / 60_000);
}

/**
 * Status panggung: yang sedang tampil (mulai, belum selesai), berikutnya (belum mulai, urutan slot), telat (menit) =
 * mulai nyata − rencana untuk slot terakhir yang sudah mulai. Proyeksi jam mulai slot berikutnya = rencana + telat.
 */
export function stageState(slots: StageSlot[], eventDate: string) {
  const ordered = slots.slice().sort((a, b) => a.slot - b.slot);
  const live = ordered.find((s) => s.actualStart && !s.actualEnd) ?? null;
  const started = ordered.filter((s) => s.actualStart);
  const last = started.length ? started.reduce((a, b) => (a.actualStart!.getTime() >= b.actualStart!.getTime() ? a : b)) : null;
  const rawDelay = last && last.startAbs !== null ? minutesSinceEventDay(eventDate, last.actualStart!) - last.startAbs : 0;
  // Jam nyata jauh dari tanggal event (uji coba / salah tekan) → telat tidak dihitung, bukan angka ribuan menit.
  const offDay = Math.abs(rawDelay) > 720;
  const delayMinutes = offDay ? 0 : rawDelay;
  const upcoming = ordered.filter((s) => !s.actualStart);
  const next = upcoming[0] ?? null;
  const projected = upcoming.map((s) => ({ id: s.id, projectedStartAbs: s.startAbs === null ? null : s.startAbs + Math.max(0, delayMinutes) }));
  return { liveId: live?.id ?? null, nextId: next?.id ?? null, delayMinutes, offDay, projected, done: ordered.filter((s) => s.actualEnd).length, total: ordered.length };
}

/** Menit absolut → "HH.MM" (gaya Indonesia, lewat tengah malam dibungkus). */
export function clockDot(minutes: number | null): string | null {
  if (minutes === null) return null;
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}.${String(m % 60).padStart(2, "0")}`;
}

/** GIGS EO #11: checklist operasional & keselamatan bawaan per event (bisa ditambah item sendiri). */
export const OPS_CHECK_TEMPLATE: Array<{ key: string; label: string }> = [
  { key: "izin", label: "Izin keramaian (Polsek/Polres) & pemberitahuan lingkungan" },
  { key: "keamanan", label: "Petugas keamanan & pembagian pos jaga" },
  { key: "p3k", label: "Kotak P3K & petugas medis / nomor ambulans" },
  { key: "kapasitas", label: "Kapasitas lokasi & alur masuk–keluar" },
  { key: "evakuasi", label: "Jalur evakuasi, pintu darurat & APAR siap" },
  { key: "listrik", label: "Listrik cukup & genset / cadangan daya" },
  { key: "hujan", label: "Rencana hujan (tenda, terpal, panggung tertutup)" },
  { key: "soundcheck", label: "Sound check selesai sebelum gerbang dibuka" },
  { key: "parkir", label: "Area parkir & petugas parkir" },
  { key: "kebersihan", label: "Tempat sampah & petugas kebersihan" },
];
