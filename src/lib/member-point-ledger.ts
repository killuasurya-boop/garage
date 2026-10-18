// Riwayat poin member (dapat / pakai / kembali / kedaluwarsa) dengan saldo
// berjalan, dihitung mundur dari saldo poin member saat ini.

export type PointLedgerEntry = {
  id: string;
  at: string;
  kind: "earn" | "redeem" | "return" | "expire" | "adjust" | "reverse";
  label: string;
  points: number; // + masuk, − keluar
  balanceAfter: number;
  orderId: string | null;
};

type TxRow = { id: string; source: string; pointsEarned: number; orderId: string | null; createdAt: Date };
type RedemptionRow = {
  id: string;
  pointsUsed: number;
  source: string;
  status: string;
  returnedPoints: number;
  returnedAt: Date | null;
  orderId: string | null;
  createdAt: Date;
};

const SOURCE_LABEL: Record<string, string> = {
  POS: "Belanja di kasir",
  QR: "Belanja menu digital",
  WELCOME: "Bonus daftar member",
  REFERRAL: "Bonus referral",
  ADJUSTMENT: "Penyesuaian manual",
  EXPIRE: "Poin kedaluwarsa",
  VOID: "Order dibatalkan",
  REFUND: "Order direfund",
};

function txKind(source: string, points: number): PointLedgerEntry["kind"] {
  if (source === "EXPIRE") return "expire";
  if (source === "ADJUSTMENT") return "adjust";
  if (source === "VOID" || source === "REFUND") return "reverse";
  return points < 0 ? "reverse" : "earn";
}

export function buildPointLedger(
  transactions: TxRow[],
  redemptions: RedemptionRow[],
  currentPoints: number,
  limit = 30,
): PointLedgerEntry[] {
  const entries: Array<Omit<PointLedgerEntry, "balanceAfter">> = [];
  for (const tx of transactions) {
    if (tx.pointsEarned === 0) continue;
    entries.push({
      id: `tx-${tx.id}`,
      at: tx.createdAt.toISOString(),
      kind: txKind(tx.source, tx.pointsEarned),
      label: SOURCE_LABEL[tx.source] ?? tx.source,
      points: tx.pointsEarned,
      orderId: tx.orderId,
    });
  }
  for (const r of redemptions) {
    entries.push({
      id: `rd-${r.id}`,
      at: r.createdAt.toISOString(),
      kind: "redeem",
      label: r.source === "QR" ? "Pakai poin (menu digital)" : r.source === "POS" ? "Pakai poin di kasir" : "Tukar poin",
      points: -r.pointsUsed,
      orderId: r.orderId,
    });
    if (r.returnedPoints > 0 && r.returnedAt) {
      entries.push({
        id: `rt-${r.id}`,
        at: r.returnedAt.toISOString(),
        kind: "return",
        label: "Poin dikembalikan",
        points: r.returnedPoints,
        orderId: r.orderId,
      });
    }
  }
  entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  let balance = currentPoints;
  return entries.slice(0, limit).map((entry) => {
    const row = { ...entry, balanceAfter: balance };
    balance -= entry.points;
    return row;
  });
}
