// Check-in tamu event — aturan murni (owner 16 Nov 2026, docs/event-checkin/01-IMPLEMENTASI.md).
// Dipakai server (validasi) dan layar pintu (pesan). Tanpa DB.

const TOKEN = /^[A-Za-z0-9_-]{32}$/;

/**
 * Isi QR undangan → token. Menerima URL undangan penuh (".../undangan/<token>", boleh ada query/hash),
 * jalur relatif, atau token mentah (scanner USB mengetik isi QR). Selain itu null.
 */
export function parseCheckinCode(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  if (TOKEN.test(text)) return text;
  const match = text.match(/\/undangan\/([A-Za-z0-9_-]{32})(?:[/?#]|$)/);
  return match ? match[1] : null;
}

export type CheckinBlock =
  | "INVALID"
  | "REVOKED"
  | "GUEST_ARCHIVED"
  | "EVENT_ARCHIVED"
  | "OTHER_EVENT"
  | "ALREADY_CHECKED_IN"
  | "PAX_TOO_MANY"
  | "PAX_INVALID";

export type CheckinWarning = "RSVP_DECLINED" | "NO_RSVP" | "PAX_ABOVE_RSVP";

export const CHECKIN_BLOCK_TEXT: Record<CheckinBlock, string> = {
  INVALID: "QR bukan undangan yang dikenal. Cari nama tamu secara manual.",
  REVOKED: "Undangan ini sudah dicabut. Hubungi Owner/Manajer sebelum mempersilakan masuk.",
  GUEST_ARCHIVED: "Tamu ini sudah dihapus dari daftar undangan. Hubungi Owner/Manajer.",
  EVENT_ARCHIVED: "Event ini sudah diarsipkan.",
  OTHER_EVENT: "Undangan ini untuk event lain. Pastikan event yang dipilih di layar sudah benar.",
  ALREADY_CHECKED_IN: "Undangan ini sudah dipakai masuk.",
  PAX_TOO_MANY: "Jumlah orang melebihi batas undangan.",
  PAX_INVALID: "Jumlah orang minimal 1.",
};

export const CHECKIN_WARNING_TEXT: Record<CheckinWarning, string> = {
  RSVP_DECLINED: "Di RSVP tamu menjawab tidak hadir. Tetap boleh masuk bila undangannya sah.",
  NO_RSVP: "Tamu belum mengisi RSVP.",
  PAX_ABOVE_RSVP: "Jumlah orang lebih banyak dari RSVP (masih dalam batas undangan).",
};

export type CheckinCandidate = {
  invitationStatus: string;
  guestStatus: string;
  eventStatus: string;
  invitationEventId: string;
  selectedEventId: string;
  maxPax: number;
  rsvp: { response: string; pax: number } | null;
  activeCheckin: { checkedInAt: string; byName: string | null; pax: number } | null;
};

/**
 * Keputusan check-in satu undangan. `pax` = jumlah orang yang datang (bawaan: RSVP, minimal 1).
 * Blok = tidak boleh masuk lewat undangan ini; peringatan = boleh, petugas diberi tahu.
 */
export function checkinDecision(input: CheckinCandidate, pax: number) {
  const warnings: CheckinWarning[] = [];
  let block: CheckinBlock | null = null;
  if (input.invitationEventId !== input.selectedEventId) block = "OTHER_EVENT";
  else if (input.eventStatus === "archived") block = "EVENT_ARCHIVED";
  else if (input.invitationStatus === "revoked") block = "REVOKED";
  else if (input.guestStatus !== "active") block = "GUEST_ARCHIVED";
  else if (input.activeCheckin) block = "ALREADY_CHECKED_IN";
  else if (!Number.isInteger(pax) || pax < 1) block = "PAX_INVALID";
  else if (pax > input.maxPax) block = "PAX_TOO_MANY";
  if (!input.rsvp) warnings.push("NO_RSVP");
  else if (input.rsvp.response === "declined") warnings.push("RSVP_DECLINED");
  else if (pax > input.rsvp.pax && pax <= input.maxPax) warnings.push("PAX_ABOVE_RSVP");
  return { allowed: block === null, block, warnings };
}

/** Jumlah orang bawaan saat konfirmasi: RSVP hadir → pax RSVP; selain itu 1 (dibatasi maxPax). */
export function defaultCheckinPax(maxPax: number, rsvp: { response: string; pax: number } | null) {
  const base = rsvp?.response === "attending" && rsvp.pax > 0 ? rsvp.pax : 1;
  return Math.max(1, Math.min(base, Math.max(1, maxPax)));
}

export type CheckinRowLike = { kind: string; pax: number; undoneAt: string | null };

/** Rekap kehadiran: dibandingkan dengan janji RSVP. Baris yang dibatalkan tidak dihitung. */
export function attendanceSummary(input: { rsvpAttendingGuests: number; rsvpAttendingPax: number; invitedGuests: number; checkins: readonly CheckinRowLike[] }) {
  const active = input.checkins.filter((c) => !c.undoneAt);
  const invited = active.filter((c) => c.kind === "invited");
  const walkin = active.filter((c) => c.kind === "walkin");
  const invitedPax = invited.reduce((sum, c) => sum + c.pax, 0);
  const walkinPax = walkin.reduce((sum, c) => sum + c.pax, 0);
  return {
    invitedGuests: input.invitedGuests,
    rsvpAttendingGuests: input.rsvpAttendingGuests,
    rsvpAttendingPax: input.rsvpAttendingPax,
    arrivedInvitations: invited.length,
    arrivedInvitedPax: invitedPax,
    walkinGroups: walkin.length,
    walkinPax,
    totalPax: invitedPax + walkinPax,
    notArrivedInvitations: Math.max(0, input.invitedGuests - invited.length),
    // Persentase kedatangan terhadap janji RSVP (orang). null bila belum ada RSVP hadir.
    rsvpShowRatePct: input.rsvpAttendingPax > 0 ? Math.round((invitedPax / input.rsvpAttendingPax) * 100) : null,
  };
}
