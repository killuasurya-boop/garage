// Impor data Dashboard Penyelenggara platform GIGS → Garage OS (Owner 22 Nov 2026). Murni, tanpa DB.
// Data dibaca di browser Owner (login dashboard lama), dikirim ke server, lalu dipetakan di sini:
// - buku dana SAH (tidak batal) → Transparansi (catatan publik, BUKAN buku kas)
// - kontrak vendor → Kontrak vendor (pos anggaran dicocokkan lewat kode RAB / nama pos)
// - log kejadian → Kejadian Hari-H
// Semua masukan diperlakukan sebagai data tak tepercaya: dibaca longgar, dibatasi panjang & nilainya.

import type { PublicFinance } from "@/lib/event-public-finance-rules";

const MAX_RUPIAH = 2_000_000_000;
type Raw = Record<string, unknown>;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v).slice(0, max) : "");
const money = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d]/g, "")) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), MAX_RUPIAH) : 0;
};
/** Tanggal WIB "YYYY-MM-DD" dari stempel platform ("2026-11-17 15:34:53" UTC atau ISO). */
export function platformDate(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(v) ? `${v.replace(" ", "T")}Z` : v;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
  return new Date(t + 7 * 3_600_000).toISOString().slice(0, 10);
}
function platformTime(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(v) ? `${v.replace(" ", "T")}Z` : v;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t) : null;
}
const list = (v: unknown): Raw[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Raw[]).slice(0, 2000) : []);

// ─── Buku dana → Transparansi ───────────────────────────────────────────────

const PAY_KINDS = new Set(["dp", "termin", "pelunasan", "lunas"]);

export function planLedger(entries: unknown, current: Pick<PublicFinance, "incomes" | "expenses" | "budgetLines">) {
  const codes = new Set(current.budgetLines.map((l) => l.code));
  // Penanda impor ulang berbasis JUMLAH (multiset): dua transaksi sah yang kebetulan sama tanggal, nominal & pos tetap
  // dua; hanya sebanyak yang sudah ada di Transparansi yang dilewati.
  const existing = new Map<string, number>();
  const bump = (key: string) => existing.set(key, (existing.get(key) ?? 0) + 1);
  current.incomes.forEach((e) => bump(`in|${e.date}|${e.amount}|${e.from.toLowerCase()}`));
  current.expenses.forEach((e) => bump(`out|${e.date}|${e.amount}|${e.code}`));
  const alreadyThere = (key: string) => {
    const n = existing.get(key) ?? 0;
    if (n <= 0) return false;
    existing.set(key, n - 1);
    return true;
  };
  const incomes: PublicFinance["incomes"] = [];
  const expenses: PublicFinance["expenses"] = [];
  const skipped = { waiting: 0, voided: 0, duplicate: 0, unknownCode: [] as string[], invalid: 0 };
  for (const e of list(entries)) {
    if (e.voided_at) {
      skipped.voided += 1;
      continue;
    }
    if (!e.approved_at) {
      skipped.waiting += 1;
      continue;
    }
    const date = platformDate(e.approved_at);
    const amount = money(e.declared_amount);
    if (!date || !amount) {
      skipped.invalid += 1;
      continue;
    }
    if (e.kind === "masuk") {
      const from = str(e.participant_name, 120) || str(e.business_name, 120);
      if (alreadyThere(`in|${date}|${amount}|${from.toLowerCase()}`)) {
        skipped.duplicate += 1;
        continue;
      }
      incomes.push({ date, from, amount });
    } else if (e.kind === "keluar") {
      const code = str(e.budget_code, 6);
      if (!codes.has(code)) {
        if (!skipped.unknownCode.includes(code || "-")) skipped.unknownCode.push(code || "-");
        continue;
      }
      if (alreadyThere(`out|${date}|${amount}|${code}`)) {
        skipped.duplicate += 1;
        continue;
      }
      const payKind = str(e.pay_kind, 20);
      const to = str(e.business_name, 120) || str(e.contract_vendor, 120);
      expenses.push({
        date,
        code,
        description: [to && `ke ${to}`, str(e.contact, 80)].filter(Boolean).join(" · ").slice(0, 200),
        payKind: (PAY_KINDS.has(payKind) ? payKind : "") as PublicFinance["expenses"][number]["payKind"],
        amount,
      });
    } else {
      skipped.invalid += 1;
    }
  }
  return { incomes, expenses, skipped };
}

// ─── Kontrak vendor ─────────────────────────────────────────────────────────

export type ContractPlan = {
  platformRef: string;
  budgetCode: string;
  vendor: string;
  pic: string | null;
  phone: string | null;
  value: number;
  terms: string | null;
  dueDate: string | null;
  status: "aktif" | "selesai" | "batal";
  doneNote: string | null;
};

export function planContracts(contracts: unknown): { items: ContractPlan[]; invalid: number } {
  const items: ContractPlan[] = [];
  let invalid = 0;
  for (const c of list(contracts)) {
    const id = str(c.id, 40);
    const vendor = str(c.vendor, 120);
    if (!id || vendor.length < 2) {
      invalid += 1;
      continue;
    }
    const status = c.status === "batal" ? "batal" : c.status === "selesai" ? "selesai" : "aktif";
    const phone = str(c.whatsapp, 20).replace(/[^\d+\s-]/g, "");
    const due = str(c.due_date, 10);
    items.push({
      platformRef: `contract:${id}`,
      budgetCode: str(c.budgetCode ?? c.budget_code, 6),
      vendor,
      pic: str(c.pic, 80) || null,
      phone: phone.length >= 8 ? phone : null,
      value: money(c.value),
      terms: str(c.terms, 1000) || null,
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null,
      status,
      doneNote: str(c.doneNote ?? c.done_note, 300) || null,
    });
  }
  return { items, invalid };
}

/** Cocokkan kode RAB platform ke pos anggaran Garage: catatan "RAB platform GIGS #02", lalu nama pos RAB yang sama. */
export function matchBudgetLine(
  code: string,
  lines: Array<{ id: string; title: string; notes: string | null; status: string }>,
  rabNames: Map<string, string>,
): string | null {
  const active = lines.filter((l) => l.status === "aktif");
  if (code) {
    const byNote = active.find((l) => (l.notes ?? "").includes(`RAB platform GIGS #${code}`));
    if (byNote) return byNote.id;
    const name = rabNames.get(code)?.trim().toLowerCase();
    if (name) {
      const byTitle = active.find((l) => l.title.trim().toLowerCase() === name);
      if (byTitle) return byTitle.id;
    }
  }
  return null;
}

// ─── Log kejadian ───────────────────────────────────────────────────────────

const INCIDENT_TYPE: Record<string, "keamanan" | "kesehatan" | "teknis" | "kerumunan" | "cuaca" | "lainnya"> = {
  keamanan: "keamanan",
  kesehatan: "kesehatan",
  medis: "kesehatan",
  p3k: "kesehatan",
  teknis: "teknis",
  sound: "teknis",
  listrik: "teknis",
  kerumunan: "kerumunan",
  penonton: "kerumunan",
  cuaca: "cuaca",
  hujan: "cuaca",
};

export type IncidentPlan = {
  platformRef: string;
  type: "keamanan" | "kesehatan" | "teknis" | "kerumunan" | "cuaca" | "lainnya";
  severity: "rendah" | "sedang" | "tinggi";
  note: string;
  reportedByName: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  resolution: string | null;
};

export function planIncidents(log: unknown, now = new Date()): { items: IncidentPlan[]; invalid: number } {
  const items: IncidentPlan[] = [];
  let invalid = 0;
  for (const e of list(log)) {
    const id = str(e.id, 40);
    const message = str(e.message, 500);
    if (!id || message.length < 3) {
      invalid += 1;
      continue;
    }
    const sev = str(e.severity, 20).toLowerCase();
    const at = platformTime(e.at) ?? now;
    const resolved = Boolean(e.resolved);
    const who = str(e.resolved_by, 60);
    const note = str(e.resolved_note, 240);
    items.push({
      platformRef: `log:${id}`,
      type: INCIDENT_TYPE[str(e.type, 30).toLowerCase()] ?? "lainnya",
      severity: sev === "kritis" || sev === "tinggi" ? "tinggi" : sev === "rendah" ? "rendah" : "sedang",
      note: message,
      reportedByName: str(e.created_by, 60) || "Dashboard Penyelenggara",
      createdAt: at,
      resolvedAt: resolved ? at : null,
      resolution: resolved ? ([who && `${who}:`, note || "Ditangani (dari Dashboard Penyelenggara)"].filter(Boolean).join(" ").slice(0, 300)) : null,
    });
  }
  return { items, invalid };
}
