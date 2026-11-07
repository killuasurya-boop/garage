// Pengawasan Kas Owner (P5) — label & tipe bersama server, UI dan ekspor Excel (aman untuk klien).

export const REVIEW_OVERDUE_HOURS = 24;

export const OVERSIGHT_ACCOUNTS = ["petty", "deposit_transit", "bank_jago", "bank_bni"] as const;

export const OVERSIGHT_ACCOUNT_LABEL: Record<(typeof OVERSIGHT_ACCOUNTS)[number], string> = {
  petty: "Petty cash",
  deposit_transit: "Setoran dalam perjalanan",
  bank_jago: "Rekening Jago · arus bersih tercatat",
  bank_bni: "Rekening BNI · arus bersih tercatat",
};

/** Label rekening setelah saldo pembuka disahkan Owner (P6): saldo nyata, bukan arus bersih. */
export const OVERSIGHT_ACCOUNT_CERTIFIED_LABEL: Record<"bank_jago" | "bank_bni", string> = {
  bank_jago: "Rekening Jago · saldo (pembuka disahkan)",
  bank_bni: "Rekening BNI · saldo (pembuka disahkan)",
};

export const OVERSIGHT_QUEUES = [
  "discrepancy_unverified",
  "review_overdue",
  "deposit_unconfirmed",
  "cash_out_pending",
  "cash_out_no_receipt",
  "petty_submitted",
  "petty_unpaid",
  "incident_open",
  "qris_mismatch",
] as const;
export type OversightQueue = (typeof OVERSIGHT_QUEUES)[number];

export const OVERSIGHT_QUEUE_META: Record<OversightQueue, { label: string; owner: string; severity: "red" | "amber" }> = {
  discrepancy_unverified: { label: "Shift berselisih belum diverifikasi", owner: "Manajer lain / Owner", severity: "red" },
  review_overdue: { label: `Shift menunggu pemeriksaan > ${REVIEW_OVERDUE_HOURS} jam`, owner: "Manajer lain / Owner", severity: "amber" },
  deposit_unconfirmed: { label: "Setoran belum dikonfirmasi masuk rekening", owner: "Penerima (Owner / Manajer lain)", severity: "red" },
  cash_out_pending: { label: "Kas keluar/masuk laci menunggu persetujuan", owner: "Manajer / Owner", severity: "amber" },
  cash_out_no_receipt: { label: "Kas keluar tanpa foto nota (tercatat tanpa ACC)", owner: "Manajer / Owner — minta nota ke kasir", severity: "amber" },
  petty_submitted: { label: "Petty cash diajukan, belum diputus", owner: "Penyetuju ≠ pengaju", severity: "amber" },
  petty_unpaid: { label: "Petty cash disetujui, uang belum diserahkan", owner: "Pemegang petty cash", severity: "amber" },
  incident_open: { label: "Kejadian shift masih terbuka", owner: "Manajer / Owner (bukan pelapor)", severity: "amber" },
  qris_mismatch: { label: "QRIS berbeda / belum dicocokkan", owner: "Owner / Manajer", severity: "amber" },
};

export const OVERSIGHT_EXCEPTIONS = ["emergency_close", "self_verified", "petty_self_approved", "deposit_self_confirmed", "cache_mismatch"] as const;
export type OversightException = (typeof OVERSIGHT_EXCEPTIONS)[number];

export const OVERSIGHT_EXCEPTION_LABEL: Record<OversightException, string> = {
  emergency_close: "Tutup darurat tanpa hitungan pecahan",
  self_verified: "Shift diverifikasi pemiliknya sendiri (tanpa pemeriksa kedua)",
  petty_self_approved: "Petty cash Owner tanpa pemeriksa kedua",
  deposit_self_confirmed: "Setoran dikonfirmasi penyetornya sendiri",
  cache_mismatch: "Saldo laci (cache) beda dengan buku kas",
};

export type OversightItem = {
  id: string;
  ref: string;
  title: string;
  detail: string | null;
  outletCode: string | null;
  person: string | null;
  amount: number | null;
  at: string;
  ageHours: number;
  /** Layar yang menyelesaikan item ini. */
  href: string;
};

export type CashOversight = {
  generatedAt: string;
  period: { from: string; to: string };
  outletId: string | null;
  outlets: Array<{ id: string; code: string; name: string }>;
  /** `certifiedAt` = saldo pembuka akun ini sudah disahkan Owner (P6). */
  balances: Array<{ account: (typeof OVERSIGHT_ACCOUNTS)[number]; label: string; balance: number; certifiedAt: string | null }>;
  summary: {
    shifts: number;
    openShifts: number;
    closedShifts: number;
    over: number;
    short: number;
    byStatus: Record<"ok" | "minor" | "review" | "critical", number>;
    verified: number;
    depositsConfirmed: number;
    depositsInTransit: number;
    openItems: number;
  };
  queues: Record<OversightQueue, OversightItem[]>;
  exceptions: Record<OversightException, OversightItem[]>;
};
