// Sponsor Event — aturan murni (owner 16 Nov 2026, docs/sponsor-event/01-IMPLEMENTASI.md).
// Tanpa DB: dipakai server (ringkasan, pengingat) dan layar Owner. Tanggal = "YYYY-MM-DD" WIB.

export const SPONSOR_STATUSES = ["aktif", "selesai", "batal"] as const;
export type SponsorStatus = (typeof SPONSOR_STATUSES)[number];

export const SPONSOR_STATUS_LABEL: Record<SponsorStatus, string> = {
  aktif: "Aktif",
  selesai: "Selesai",
  batal: "Batal",
};

export type InstallmentInput = { id?: string; seq: number; label: string; amount: number; dueDate: string };
export type InstallmentState = "lunas" | "sebagian" | "belum" | "hari_ini" | "terlambat";
export type InstallmentView = InstallmentInput & { paidPart: number; remainingPart: number; state: InstallmentState; daysLate: number };

export type ObligationInput = { id?: string; title: string; dueDate: string | null; doneAt: string | null };
export type ObligationState = "selesai" | "belum" | "hari_ini" | "terlambat";

export const INSTALLMENT_STATE_LABEL: Record<InstallmentState, string> = {
  lunas: "Lunas",
  sebagian: "Dibayar sebagian",
  belum: "Belum jatuh tempo",
  hari_ini: "Jatuh tempo hari ini",
  terlambat: "Terlambat",
};

export const OBLIGATION_STATE_LABEL: Record<ObligationState, string> = {
  selesai: "Selesai",
  belum: "Belum",
  hari_ini: "Hari ini",
  terlambat: "Lewat tenggat",
};

const DAY_MS = 86_400_000;

/** Tanggal WIB "YYYY-MM-DD" dari Date. */
export function wibDate(at: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(at);
}

/** Selisih hari kalender a − b (keduanya "YYYY-MM-DD"). */
export function dayDiff(a: string, b: string) {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS);
}

export function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** Uang sponsor: total disepakati vs yang sudah masuk Rekening Jago (pembayaran yang tidak dibatalkan). */
export function sponsorMoney(agreedAmount: number, postedPayments: readonly number[]) {
  const paid = postedPayments.reduce((sum, amount) => sum + amount, 0);
  return { agreed: agreedAmount, paid, remaining: Math.max(0, agreedAmount - paid), overpaid: Math.max(0, paid - agreedAmount) };
}

/**
 * Status tiap cicilan. Uang yang sudah masuk dialokasikan ke cicilan berurutan (jatuh tempo paling awal dulu),
 * jadi transfer tidak perlu ditandai "untuk cicilan mana".
 */
export function installmentSchedule(installments: readonly InstallmentInput[], paid: number, today: string): InstallmentView[] {
  const ordered = [...installments].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.seq - b.seq);
  let left = Math.max(0, paid);
  return ordered.map((item) => {
    const paidPart = Math.min(item.amount, left);
    left -= paidPart;
    const remainingPart = item.amount - paidPart;
    const daysLate = Math.max(0, dayDiff(today, item.dueDate));
    let state: InstallmentState;
    if (remainingPart === 0) state = "lunas";
    else if (item.dueDate < today) state = "terlambat";
    else if (item.dueDate === today) state = "hari_ini";
    else state = paidPart > 0 ? "sebagian" : "belum";
    return { ...item, paidPart, remainingPart, state, daysLate: remainingPart > 0 ? daysLate : 0 };
  });
}

/**
 * Cek jadwal cicilan terhadap nilai kesepakatan. Total jadwal tidak boleh MELEBIHI nilai
 * kesepakatan; boleh kurang (sisanya tampil sebagai "belum dijadwalkan").
 */
export function scheduleProblem(installments: readonly Pick<InstallmentInput, "amount" | "dueDate" | "label">[], agreedAmount: number): string | null {
  for (const item of installments) {
    if (!Number.isInteger(item.amount) || item.amount <= 0) return "Nominal tiap cicilan harus rupiah bulat lebih dari 0.";
    if (!isIsoDate(item.dueDate)) return "Tanggal jatuh tempo cicilan tidak valid.";
    if (!item.label.trim()) return "Nama cicilan wajib diisi (mis. DP, Pelunasan).";
  }
  const total = installments.reduce((sum, item) => sum + item.amount, 0);
  if (total > agreedAmount) return `Total jadwal cicilan (${rupiah(total)}) melebihi nilai kesepakatan (${rupiah(agreedAmount)}).`;
  return null;
}

export function unscheduledAmount(installments: readonly { amount: number }[], agreedAmount: number) {
  return Math.max(0, agreedAmount - installments.reduce((sum, item) => sum + item.amount, 0));
}

export function obligationState(item: ObligationInput, today: string): ObligationState {
  if (item.doneAt) return "selesai";
  if (!item.dueDate) return "belum";
  if (item.dueDate < today) return "terlambat";
  if (item.dueDate === today) return "hari_ini";
  return "belum";
}

/** Pengingat keterlambatan tidak dikirim tiap hari: hari ke-1, 3, 7, lalu tiap 7 hari. */
export function isOverdueReminderDay(daysLate: number) {
  return daysLate === 1 || daysLate === 3 || daysLate === 7 || (daysLate > 7 && daysLate % 7 === 0);
}

export type SponsorReminderInput = {
  id: string;
  sponsorNo: string;
  name: string;
  eventName: string;
  status: string;
  installments: InstallmentView[];
  obligations: Array<ObligationInput & { id: string }>;
};

export type SponsorReminder = { key: string; severity: "info" | "warning" | "urgent"; title: string; body: string };

/** Pengingat untuk Owner (dedup per kunci). Hanya sponsor aktif. Bahasa netral, tanpa menyalahkan sponsor. */
export function sponsorReminders(input: SponsorReminderInput, today: string): SponsorReminder[] {
  if (input.status !== "aktif") return [];
  const out: SponsorReminder[] = [];
  const who = `${input.name} (${input.eventName})`;
  for (const item of input.installments) {
    if (item.remainingPart <= 0) continue;
    const until = dayDiff(item.dueDate, today);
    const id = item.id ?? `seq${item.seq}`;
    if (until === 3) {
      out.push({ key: `sponsor:${input.id}:inst:${id}:h3`, severity: "info", title: `Cicilan sponsor jatuh tempo 3 hari lagi`, body: `${who} · ${item.label} ${rupiah(item.remainingPart)} · ${item.dueDate}` });
    } else if (until === 0) {
      out.push({ key: `sponsor:${input.id}:inst:${id}:h0`, severity: "warning", title: `Cicilan sponsor jatuh tempo hari ini`, body: `${who} · ${item.label} ${rupiah(item.remainingPart)}. Cek mutasi Rekening Jago.` });
    } else if (until < 0 && isOverdueReminderDay(-until)) {
      out.push({ key: `sponsor:${input.id}:inst:${id}:late${-until}`, severity: "urgent", title: `Cicilan sponsor belum diterima (${-until} hari)`, body: `${who} · ${item.label} sisa ${rupiah(item.remainingPart)} sejak ${item.dueDate}.` });
    }
  }
  for (const item of input.obligations) {
    if (item.doneAt || !item.dueDate) continue;
    const until = dayDiff(item.dueDate, today);
    if (until === 1) {
      out.push({ key: `sponsor:${input.id}:obl:${item.id}:h1`, severity: "info", title: `Kewajiban sponsor besok`, body: `${who} · ${item.title}` });
    } else if (until < 0 && isOverdueReminderDay(-until)) {
      out.push({ key: `sponsor:${input.id}:obl:${item.id}:late${-until}`, severity: "warning", title: `Kewajiban sponsor lewat tenggat (${-until} hari)`, body: `${who} · ${item.title} · tenggat ${item.dueDate}` });
    }
  }
  return out;
}

/** Ringkasan satu sponsor untuk daftar & laporan. */
export function sponsorHealth(input: { agreed: number; paid: number; installments: InstallmentView[]; obligations: Array<ObligationInput>; inkindValue: number }, today: string) {
  const overdue = input.installments.filter((item) => item.state === "terlambat");
  const next = input.installments.find((item) => item.remainingPart > 0 && item.state !== "terlambat") ?? null;
  const obligationStates = input.obligations.map((item) => obligationState(item, today));
  return {
    overdueAmount: overdue.reduce((sum, item) => sum + item.remainingPart, 0),
    overdueCount: overdue.length,
    nextDue: next ? { label: next.label, dueDate: next.dueDate, amount: next.remainingPart } : null,
    obligationsDone: obligationStates.filter((s) => s === "selesai").length,
    obligationsTotal: obligationStates.length,
    obligationsLate: obligationStates.filter((s) => s === "terlambat").length,
    inkindValue: input.inkindValue,
    // Nilai total dukungan = uang disepakati + perkiraan nilai barang (barang tidak masuk buku kas).
    totalSupport: input.agreed + input.inkindValue,
  };
}

/** Nomor WhatsApp kontak: hanya angka, 9–15 digit, diawali 0/62. null bila kosong. */
export function cleanSponsorPhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/[^0-9]/g, "");
  if (!digits) return null;
  const normalized = digits.startsWith("62") ? `0${digits.slice(2)}` : digits;
  if (!/^0\d{8,14}$/.test(normalized)) throw new Error("Nomor WhatsApp kontak harus angka, contoh 081234567890.");
  return normalized;
}

export function rupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}
