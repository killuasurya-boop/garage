// Transparansi dana publik GIGS (Owner 18 Nov 2026: "ingin bisa diubah bebas"). Owner mengisi angka sendiri di Garage
// OS; halaman event platform membacanya (config.finance + sponsor/summary) lewat Caddy. BUKAN buku kas: tidak ada uang
// yang bergerak, angka uang sungguhan tetap di Sponsor Event / Keuangan Event. Aturan murni, tanpa DB.
import { z } from "zod";

export const PUBLIC_STAGES = ["belum-dipesan", "dipesan", "dp", "lunas", "selesai", "tanpa-vendor", "terpakai"] as const;
export const PUBLIC_STAGE_LABEL: Record<(typeof PUBLIC_STAGES)[number], string> = {
  "belum-dipesan": "Belum dipesan",
  dipesan: "Vendor dipesan",
  dp: "DP dibayar",
  lunas: "Lunas",
  selesai: "Selesai",
  "tanpa-vendor": "Tanpa vendor",
  terpakai: "Terpakai",
};
export const PAY_KINDS = ["", "dp", "termin", "pelunasan", "lunas"] as const;

const rupiah = (label: string) => z.number({ message: `${label} harus angka.` }).int(`${label} harus rupiah bulat.`).min(0, `${label} tidak boleh minus.`).max(10_000_000_000);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus diisi (YYYY-MM-DD).");

export const publicFinanceSchema = z
  .object({
    target: rupiah("Target"),
    notes: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
    budgetLines: z
      .array(
        z.object({
          code: z.string().trim().regex(/^[A-Za-z0-9-]{1,6}$/, "Kode pos 1–6 huruf/angka, mis. 01."),
          name: z.string().trim().min(1, "Nama pos wajib diisi.").max(80),
          budget: rupiah("Anggaran"),
          purpose: z.string().trim().max(300).default(""),
          pic: z.string().trim().max(60).default(""),
          needsVendor: z.boolean().default(true),
          contracted: rupiah("Nilai dipesan").default(0),
          stage: z.enum(PUBLIC_STAGES).default("belum-dipesan"),
        }),
      )
      .max(40),
    incomes: z
      .array(z.object({ date: isoDate, from: z.string().trim().max(120).default(""), amount: rupiah("Jumlah dana masuk").min(1, "Jumlah dana masuk minimal Rp1.") }))
      .max(300)
      .default([]),
    expenses: z
      .array(
        z.object({
          date: isoDate,
          code: z.string().trim().min(1, "Pilih pos RAB."),
          description: z.string().trim().max(200).default(""),
          payKind: z.enum(PAY_KINDS).default(""),
          amount: rupiah("Jumlah dana keluar").min(1, "Jumlah dana keluar minimal Rp1."),
        }),
      )
      .max(300)
      .default([]),
    committedCount: z.number().int().min(0).max(1000).default(0),
    committedAmount: rupiah("Komitmen sponsor").default(0),
  })
  .superRefine((value, ctx) => {
    const codes = new Set<string>();
    value.budgetLines.forEach((line, index) => {
      if (codes.has(line.code)) ctx.addIssue({ code: "custom", path: ["budgetLines", index, "code"], message: `Kode pos ${line.code} dipakai dua kali.` });
      codes.add(line.code);
    });
    value.expenses.forEach((entry, index) => {
      if (!codes.has(entry.code)) ctx.addIssue({ code: "custom", path: ["expenses", index, "code"], message: `Dana keluar memakai pos ${entry.code} yang tidak ada di RAB.` });
    });
  });
export type PublicFinance = z.infer<typeof publicFinanceSchema>;

export const EMPTY_PUBLIC_FINANCE: PublicFinance = { target: 0, notes: [], budgetLines: [], incomes: [], expenses: [], committedCount: 0, committedAmount: 0 };

const sum = (values: number[]) => values.reduce((total, n) => total + n, 0);
/** Tanggal saja → "YYYY-MM-DD 05:00:00" (UTC = 12.00 WIB), format waktu yang dibaca halaman event. */
const atNoonWib = (date: string) => `${date} 05:00:00`;

export function publicFinanceTotals(data: PublicFinance) {
  const income = sum(data.incomes.map((e) => e.amount));
  const expense = sum(data.expenses.map((e) => e.amount));
  const rab = sum(data.budgetLines.map((l) => l.budget));
  return { income, expense, balance: income - expense, rab, percent: data.target > 0 ? Math.round((income / data.target) * 1000) / 10 : 0 };
}

/** Bagian `finance` di /api/public/config halaman event. */
export function toPlatformFinance(data: PublicFinance, showVendorNames: unknown = false) {
  return {
    target: data.target,
    budgetLines: data.budgetLines.map((l) => ({ code: l.code, name: l.name, budget: l.budget, purpose: l.purpose, pic: l.pic, needsVendor: l.needsVendor })),
    notes: data.notes,
    showVendorNames,
  };
}

/** Pengganti /api/sponsor/summary halaman event (hanya data yang dibaca halaman publik). */
export function toPlatformSummary(data: PublicFinance) {
  const totals = publicFinanceTotals(data);
  const byDateDesc = <T extends { date: string }>(rows: T[]) => rows.slice().sort((a, b) => b.date.localeCompare(a.date));
  const income_history = byDateDesc(data.incomes).map((e) => ({ sponsor: e.from || null, amount: e.amount, approved_at: atNoonWib(e.date), budget_code: null }));
  const expense_history = byDateDesc(data.expenses).map((e) => ({
    budget_code: e.code,
    pay_kind: e.payKind || null,
    description: e.description || null,
    amount: e.amount,
    approved_at: atNoonWib(e.date),
  }));
  const paidByCode = new Map<string, number>();
  for (const e of data.expenses) paidByCode.set(e.code, (paidByCode.get(e.code) ?? 0) + e.amount);
  return {
    transaction_count: data.incomes.length + data.expenses.length,
    verified_amount: totals.income,
    verified_expense: totals.expense,
    balance: totals.balance,
    expenses: [...paidByCode.entries()].map(([budget_code, amount]) => ({ budget_code, amount })),
    history: [...income_history, ...expense_history],
    income_history,
    expense_history,
    void_history: [],
    budget_status: data.budgetLines.map((l) => ({ code: l.code, budget: l.budget, contracted: l.contracted, paid: paidByCode.get(l.code) ?? 0, stage: l.stage, vendors: [] })),
    committed_count: data.committedCount,
    committed_amount: data.committedAmount,
    contracted_total: sum(data.budgetLines.map((l) => l.contracted)),
    pending_sponsors: 0,
  };
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const dateOf = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : "");

/** Isi awal dari angka platform saat ini (config + sponsor/summary), supaya Owner mulai dari data yang sudah tampil. */
export function prefillFromPlatform(config: unknown, summary: unknown): PublicFinance {
  const finance = (config as { finance?: Record<string, unknown> } | null)?.finance ?? {};
  const s = (summary ?? {}) as Record<string, unknown>;
  const status = new Map(
    (Array.isArray(s.budget_status) ? (s.budget_status as Array<Record<string, unknown>>) : []).map((b) => [str(b.code, 6), b]),
  );
  const budgetLines = (Array.isArray(finance.budgetLines) ? (finance.budgetLines as Array<Record<string, unknown>>) : []).slice(0, 40).map((l) => {
    const code = str(l.code, 6) || "00";
    const st = status.get(code);
    const stage = str(st?.stage, 20);
    return {
      code,
      name: str(l.name, 80) || "Pos",
      budget: num(l.budget),
      purpose: str(l.purpose, 300),
      pic: str(l.pic, 60),
      needsVendor: l.needsVendor !== false,
      contracted: num(st?.contracted),
      stage: ((PUBLIC_STAGES as readonly string[]).includes(stage) ? stage : "belum-dipesan") as PublicFinance["budgetLines"][number]["stage"],
    };
  });
  const codes = new Set(budgetLines.map((l) => l.code));
  const incomes = (Array.isArray(s.income_history) ? (s.income_history as Array<Record<string, unknown>>) : [])
    .map((e) => ({ date: dateOf(e.approved_at), from: str(e.sponsor, 120), amount: num(e.amount) }))
    .filter((e) => e.date && e.amount > 0);
  const expenses = (Array.isArray(s.expense_history) ? (s.expense_history as Array<Record<string, unknown>>) : [])
    .map((e) => {
      const payKind = str(e.pay_kind, 20);
      return {
        date: dateOf(e.approved_at),
        code: str(e.budget_code, 6),
        description: str(e.description, 200),
        payKind: ((PAY_KINDS as readonly string[]).includes(payKind) ? payKind : "") as PublicFinance["expenses"][number]["payKind"],
        amount: num(e.amount),
      };
    })
    .filter((e) => e.date && e.amount > 0 && codes.has(e.code));
  return {
    target: num(finance.target),
    notes: (Array.isArray(finance.notes) ? finance.notes : []).map((n) => str(n, 200)).filter(Boolean).slice(0, 10),
    budgetLines,
    incomes,
    expenses,
    committedCount: num(s.committed_count),
    committedAmount: num(s.committed_amount),
  };
}
