// Sumber dana biaya tunai (owner, 25 Okt 2026) — aman untuk klien (tanpa DB).
// Hanya "drawer" yang memotong laci (laci shift pencatat sendiri); rekening
// tercatat di buku kas; uang pribadi Owner tidak lewat akun usaha.
export const EXPENSE_CASH_SOURCES = ["drawer", "bank_jago", "bank_bni", "external"] as const;
export type ExpenseCashSource = (typeof EXPENSE_CASH_SOURCES)[number];
export const EXPENSE_CASH_SOURCE_LABEL: Record<ExpenseCashSource, string> = {
  drawer: "Laci shift saya",
  bank_jago: "Rekening Jago",
  bank_bni: "Rekening BNI",
  external: "Uang pribadi Owner",
};
