// =============================================================================
// Lineup & Panitia Event: aturan murni (tanpa DB). Dipakai server, layar Owner, dan tes.
// Jenis penampil sama dengan website (gigs-lineup.ts) supaya label konsisten di semua tempat.
// =============================================================================
import { LINEUP_KIND_LABEL, LINEUP_KIND_ORDER, type LineupKind } from "@/lib/gigs-lineup";

export { LINEUP_KIND_LABEL, LINEUP_KIND_ORDER, type LineupKind };

export const PERFORMER_STATUSES = ["calon", "konfirmasi", "batal"] as const;
export type PerformerStatus = (typeof PERFORMER_STATUSES)[number];
export const PERFORMER_STATUS_LABEL: Record<PerformerStatus, string> = {
  calon: "Calon",
  konfirmasi: "Terkonfirmasi",
  batal: "Batal",
};

export const CREW_ROLES = [
  "ketua",
  "sekretaris",
  "bendahara",
  "lineup",
  "stage",
  "sound",
  "keamanan",
  "dokumentasi",
  "humas",
  "konsumsi",
  "tiket",
  "lo",
  "lainnya",
] as const;
export type CrewRole = (typeof CREW_ROLES)[number];
export const CREW_ROLE_LABEL: Record<CrewRole, string> = {
  ketua: "Ketua Panitia",
  sekretaris: "Sekretaris",
  bendahara: "Bendahara",
  lineup: "Koordinator Lineup",
  stage: "Stage Manager",
  sound: "Sound & Teknis",
  keamanan: "Keamanan",
  dokumentasi: "Dokumentasi",
  humas: "Humas & Media",
  konsumsi: "Konsumsi",
  tiket: "Tiket & Registrasi",
  lo: "Liaison Officer (LO)",
  lainnya: "Lainnya",
};

export const TASK_STATUSES = ["todo", "proses", "selesai", "batal"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = { todo: "Belum", proses: "Proses", selesai: "Selesai", batal: "Batal" };
export const TASK_PRIORITIES = ["rendah", "normal", "tinggi"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** "HH:MM" 00:00–23:59 → menit sejak tengah malam; selain itu null. */
export function clockToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Menit → "HH:MM" (melewati tengah malam tetap dibungkus 24 jam). */
export function minutesToClock(total: number): string {
  const m = ((Math.round(total) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Nomor WhatsApp → hanya angka, format 08… (62… diubah ke 0…). Kosong/tidak valid → null. */
export function cleanCrewPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  let digits = value.replace(/[^\d]/g, "");
  if (digits.startsWith("62")) digits = `0${digits.slice(2)}`;
  return /^0\d{8,14}$/.test(digits) ? digits : null;
}

export type RundownInput = {
  id: string;
  name: string;
  kind: LineupKind;
  status: PerformerStatus;
  slotOrder: number | null;
  setStart: string | null;
  setMinutes: number | null;
};

export type RundownRow = RundownInput & {
  slot: number;
  start: string | null;
  end: string | null;
  /** Bertumpuk dengan penampil sebelumnya (jam mulai < jam selesai sebelumnya). */
  overlap: boolean;
  /** Jeda dari penampil sebelumnya (menit), null bila salah satu jam belum diisi. */
  gapMinutes: number | null;
};

/**
 * Rundown penampil: hanya yang tidak batal, diurutkan menurut nomor slot (yang belum punya slot di belakang,
 * lalu nama). Jam selesai = jam mulai + durasi. Tumpang tindih ditandai, tidak diubah otomatis.
 */
export function buildRundown(items: RundownInput[]): RundownRow[] {
  const active = items
    .filter((item) => item.status !== "batal")
    .slice()
    .sort((a, b) => {
      const sa = a.slotOrder ?? Number.MAX_SAFE_INTEGER;
      const sb = b.slotOrder ?? Number.MAX_SAFE_INTEGER;
      return sa - sb || a.name.localeCompare(b.name, "id");
    });
  let prevEnd: number | null = null;
  return active.map((item, index) => {
    const startMin = clockToMinutes(item.setStart);
    const endMin = startMin !== null && item.setMinutes ? startMin + item.setMinutes : null;
    const overlap = startMin !== null && prevEnd !== null && startMin < prevEnd;
    const gapMinutes = startMin !== null && prevEnd !== null ? startMin - prevEnd : null;
    if (endMin !== null) prevEnd = endMin;
    else if (startMin !== null) prevEnd = startMin;
    return {
      ...item,
      slot: index + 1,
      start: startMin !== null ? minutesToClock(startMin) : null,
      end: endMin !== null ? minutesToClock(endMin) : null,
      overlap,
      gapMinutes,
    };
  });
}

export type TaskLike = { status: TaskStatus; dueDate: string | null };

/** Tugas terlambat = belum selesai/batal dan tenggat sebelum hari ini (tanggal WIB "YYYY-MM-DD"). */
export function isTaskOverdue(task: TaskLike, today: string): boolean {
  return (task.status === "todo" || task.status === "proses") && Boolean(task.dueDate) && task.dueDate! < today;
}

export type ReadinessInput = {
  performers: Array<{ status: PerformerStatus; setStart: string | null; setMinutes: number | null; contactPhone: string | null }>;
  crew: Array<{ role: CrewRole; status: "aktif" | "nonaktif" }>;
  tasks: TaskLike[];
  overlaps: number;
};

export type ReadinessItem = { key: string; label: string; done: boolean; detail: string };

/** Checklist kesiapan acara (netral, dari data nyata saja). */
export function eventReadiness(input: ReadinessInput, today: string): { items: ReadinessItem[]; done: number; total: number } {
  const confirmed = input.performers.filter((p) => p.status === "konfirmasi");
  const withoutTime = confirmed.filter((p) => clockToMinutes(p.setStart) === null || !p.setMinutes).length;
  const withoutContact = confirmed.filter((p) => !p.contactPhone).length;
  const activeCrew = input.crew.filter((c) => c.status === "aktif");
  const hasLead = activeCrew.some((c) => c.role === "ketua");
  const hasStage = activeCrew.some((c) => c.role === "stage" || c.role === "lineup");
  const openTasks = input.tasks.filter((t) => t.status === "todo" || t.status === "proses").length;
  const overdue = input.tasks.filter((t) => isTaskOverdue(t, today)).length;
  const items: ReadinessItem[] = [
    { key: "lineup", label: "Ada penampil terkonfirmasi", done: confirmed.length > 0, detail: `${confirmed.length} terkonfirmasi` },
    { key: "jadwal", label: "Semua penampil terkonfirmasi punya jam & durasi", done: confirmed.length > 0 && withoutTime === 0, detail: withoutTime ? `${withoutTime} belum dijadwalkan` : "Lengkap" },
    { key: "bentrok", label: "Rundown tanpa jadwal bertumpuk", done: input.overlaps === 0, detail: input.overlaps ? `${input.overlaps} slot bertumpuk` : "Aman" },
    { key: "kontak", label: "Kontak penampil terkonfirmasi lengkap", done: confirmed.length > 0 && withoutContact === 0, detail: withoutContact ? `${withoutContact} tanpa nomor` : "Lengkap" },
    { key: "ketua", label: "Ketua panitia ditunjuk", done: hasLead, detail: hasLead ? "Ada" : "Belum ada" },
    { key: "stage", label: "Stage manager / koordinator lineup ditunjuk", done: hasStage, detail: hasStage ? "Ada" : "Belum ada" },
    { key: "tugas", label: "Tidak ada tugas terlambat", done: overdue === 0, detail: overdue ? `${overdue} terlambat dari ${openTasks} terbuka` : `${openTasks} tugas terbuka` },
  ];
  const done = items.filter((i) => i.done).length;
  return { items, done, total: items.length };
}

/** Pesan WhatsApp jadwal tampil untuk satu penampil (tanpa data pribadi lain). */
export function performerScheduleMessage(eventName: string, row: Pick<RundownRow, "name" | "slot" | "start" | "end">): string {
  const time = row.start ? `${row.start}${row.end ? `–${row.end}` : ""} WIB` : "jam tampil menyusul";
  return `Halo ${row.name}, jadwal tampil di ${eventName}: slot #${String(row.slot).padStart(2, "0")}, ${time}. Mohon datang 60 menit sebelum tampil untuk cek sound. Terima kasih!`;
}
