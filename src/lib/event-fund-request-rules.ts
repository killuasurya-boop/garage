// Pengajuan dana panitia (Owner 23 Nov 2026, pindahan Dashboard Penyelenggara). Murni, tanpa DB.
// Ketua/Bendahara panitia mengajukan dana masuk / keluar + bukti → Owner mengesahkan → satu baris Transparansi
// (catatan publik). TIDAK PERNAH baris buku kas (`cash_ledger_entries`).

import { z } from "zod";

import { PAY_KINDS, type PublicFinance } from "@/lib/event-public-finance-rules";

export const FUND_REQUEST_MAX = 2_000_000_000;
export const FUND_PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const FUND_PROOF_TYPES: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf" };

export const fundRequestInputSchema = z
  .object({
    eventId: z.string().uuid(),
    kind: z.enum(["masuk", "keluar"]),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid."),
    amount: z.coerce.number().int("Nominal harus bilangan bulat.").min(1, "Nominal minimal Rp1.").max(FUND_REQUEST_MAX, "Maksimal Rp2.000.000.000."),
    party: z.string().trim().max(120).default(""),
    budgetCode: z.string().trim().max(6).optional().default(""),
    payKind: z.enum(PAY_KINDS).optional().default(""),
    description: z.string().trim().max(200).default(""),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "keluar" && !v.budgetCode) ctx.addIssue({ code: "custom", path: ["budgetCode"], message: "Pilih pos RAB untuk dana keluar." });
    if (v.kind === "masuk" && !v.party) ctx.addIssue({ code: "custom", path: ["party"], message: "Isi asal dana (sponsor/donatur)." });
  });

export type FundRequestInput = z.infer<typeof fundRequestInputSchema>;

export const fundDecisionSchema = z
  .object({ action: z.enum(["sahkan", "tolak"]), note: z.string().trim().max(300).optional().default("") })
  .refine((v) => v.action === "sahkan" || v.note.length >= 3, { path: ["note"], message: "Alasan penolakan wajib diisi." });

/** Cocokkan isi berkas dengan jenisnya (tipe dari browser bisa dipalsukan). */
export function proofContentMatches(buffer: Uint8Array, ext: string): boolean {
  const at = (bytes: number[], offset = 0) => bytes.every((b, i) => buffer[offset + i] === b);
  switch (ext) {
    case ".pdf":
      return at([0x25, 0x50, 0x44, 0x46]);
    case ".jpg":
      return at([0xff, 0xd8, 0xff]);
    case ".png":
      return at([0x89, 0x50, 0x4e, 0x47]);
    case ".webp":
      return at([0x52, 0x49, 0x46, 0x46]) && at([0x57, 0x45, 0x42, 0x50], 8);
    default:
      return false;
  }
}

type RequestRow = { kind: string; date: string; amount: number; party: string; budgetCode: string | null; payKind: string; description: string };

/**
 * Tambah pengajuan yang disahkan ke Transparansi. Dana keluar wajib memakai kode pos RAB yang ada di Transparansi
 * (null + alasan bila tidak). Kapasitas 300 baris per jenis dijaga; tidak pernah memotong data lama.
 */
export function applyFundRequest(finance: PublicFinance, row: RequestRow): { finance: PublicFinance } | { error: string } {
  if (row.kind === "masuk") {
    if (finance.incomes.length >= 300) return { error: "Transparansi sudah berisi 300 dana masuk. Rapikan/gabungkan dulu di Transparansi." };
    return { finance: { ...finance, incomes: [...finance.incomes, { date: row.date, from: row.party.slice(0, 120), amount: row.amount }] } };
  }
  const code = row.budgetCode ?? "";
  if (!finance.budgetLines.some((l) => l.code === code)) return { error: `Pos RAB ${code || "-"} tidak ada di Transparansi. Tambahkan posnya dulu.` };
  if (finance.expenses.length >= 300) return { error: "Transparansi sudah berisi 300 dana keluar. Rapikan/gabungkan dulu di Transparansi." };
  const description = [row.party && `ke ${row.party}`, row.description].filter(Boolean).join(" · ").slice(0, 200);
  const payKind = ((PAY_KINDS as readonly string[]).includes(row.payKind) ? row.payKind : "") as PublicFinance["expenses"][number]["payKind"];
  return { finance: { ...finance, expenses: [...finance.expenses, { date: row.date, code, description, payKind, amount: row.amount }] } };
}
