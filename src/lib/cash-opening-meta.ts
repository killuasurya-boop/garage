// Saldo pembuka disahkan Owner (P6) — label & tipe bersama server dan UI (aman untuk klien).

export const CERTIFIABLE_ACCOUNTS = ["petty", "bank_jago", "bank_bni"] as const;
export type CertifiableAccount = (typeof CERTIFIABLE_ACCOUNTS)[number];

export const CERTIFIABLE_ACCOUNT_LABEL: Record<CertifiableAccount, string> = {
  petty: "Petty cash",
  bank_jago: "Rekening Jago",
  bank_bni: "Rekening BNI / QRIS BNI",
};

/** Petty cash = dana per outlet; rekening = satu untuk semua outlet. */
export function isOutletScoped(account: CertifiableAccount) {
  return account === "petty";
}

export function openingScopeKey(account: CertifiableAccount, outletId: string | null) {
  return `${account}:${isOutletScoped(account) ? outletId ?? "-" : "all"}`;
}

export type OpeningCertification = {
  id: string;
  asOf: string;
  ledgerBalance: number;
  countedBalance: number;
  adjustment: number;
  evidenceRef: string;
  note: string | null;
  certifiedBy: string;
  certifiedByName: string | null;
};

export type OpeningScope = {
  scopeKey: string;
  account: CertifiableAccount;
  label: string;
  outletId: string | null;
  outletCode: string | null;
  /** Saldo buku kas sekarang (sudah termasuk penyesuaian pembuka bila disahkan). */
  ledgerBalance: number;
  /** Baris isian migrasi (entri lama) di akun ini; `legacy_unverified` selama belum disahkan. */
  legacyEntries: number;
  legacyTotal: number;
  certification: OpeningCertification | null;
};

export type LedgerFingerprint = {
  entries: number;
  lastSeq: number;
  certifications: number;
  balances: Record<string, number>;
  /** md5 seluruh baris buku kas + pengesahan berurutan. */
  digest: string;
};

export type OpeningStatus = {
  scopes: OpeningScope[];
  pending: number;
  /** Laci: saldo awal shift lama dari cache (`legacy_opening`) — selalu `legacy_unverified`. */
  drawerLegacy: { entries: number; total: number };
  /** Total baris lama yang belum dicakup pengesahan (termasuk laci). */
  legacyUnverified: { entries: number; total: number };
  fingerprint: LedgerFingerprint;
};
