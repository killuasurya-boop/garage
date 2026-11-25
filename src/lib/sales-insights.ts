// Insight penjualan murni (Fase 5, owner 25 Nov 2026) — tanpa DB supaya bisa dipakai klien & dites di Node.
// Semua dari order LUNAS; zona WIB (Asia/Jakarta).

const WIB_HOUR = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Jakarta" });

function wibHour(date: Date) {
  return Number(WIB_HOUR.format(date)) % 24;
}

const WIB_WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Asia/Jakarta" });
const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
export const WEEKDAY_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"] as const;

/** Hari WIB (0 = Senin … 6 = Minggu). */
export function wibWeekday(date: Date) {
  return WEEKDAY_INDEX[WIB_WEEKDAY.format(date)] ?? 0;
}

export type WeekdayHourCell = { weekday: number; hour: number; count: number; revenue: number };

/** Pola jam sibuk (Fase 5): transaksi lunas per hari WIB × jam WIB. Hanya sel berisi. */
export function weekdayHourGrid(paidOrders: readonly { createdAt: Date; total: number }[]): WeekdayHourCell[] {
  const cells = new Map<string, WeekdayHourCell>();
  for (const order of paidOrders) {
    const weekday = wibWeekday(order.createdAt);
    const hour = wibHour(order.createdAt);
    const key = `${weekday}:${hour}`;
    const cell = cells.get(key) ?? { weekday, hour, count: 0, revenue: 0 };
    cell.count += 1;
    cell.revenue += order.total;
    cells.set(key, cell);
  }
  return [...cells.values()].sort((a, b) => a.weekday - b.weekday || a.hour - b.hour);
}


/** Rentang jam yang punya transaksi (untuk kolom grid), urut. */
export function activeHours(cells: readonly WeekdayHourCell[]) {
  return [...new Set(cells.map((cell) => cell.hour))].sort((a, b) => a - b);
}
