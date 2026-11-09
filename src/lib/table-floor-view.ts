// Smart Table Selector V5 (Crystal, Owner Nov 2026) — aturan tampilan murni: lantai, ringkasan okupansi, filter, cari.
// Status meja tetap dari server (getPublicTableLiveData); modul ini hanya mengelompokkan untuk layar. Aman untuk klien.
import type { CustomerTableStatus } from "@/lib/garage-table-status";

export type FloorTable = {
  tableNumber: string;
  tableLabel: string;
  floor?: number | null;
  area: string;
  capacity: number;
  customerStatus: CustomerTableStatus;
  mine?: boolean;
};

export type TableStatusFilter = "all" | "available" | "occupied" | "reserved";

export type FloorInfo = { floor: number; label: string; range: string; total: number; available: number };

const fallbackFloor = (tableNumber: string) => (Number.parseInt(tableNumber, 10) > 25 ? 2 : 1);

export function tableFloor(table: Pick<FloorTable, "floor" | "tableNumber">) {
  return table.floor && table.floor > 0 ? table.floor : fallbackFloor(table.tableNumber);
}

/** Lantai yang punya meja aktif, urut naik, dengan rentang nomor ("01–25"). */
export function floorsOf(tables: FloorTable[]): FloorInfo[] {
  const map = new Map<number, FloorTable[]>();
  for (const table of tables) {
    const floor = tableFloor(table);
    map.set(floor, [...(map.get(floor) ?? []), table]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([floor, rows]) => {
      const numbers = rows.map((row) => row.tableNumber).sort();
      return {
        floor,
        label: `Lantai ${floor}`,
        range: numbers.length > 1 ? `${numbers[0]}–${numbers[numbers.length - 1]}` : numbers[0] ?? "",
        total: rows.length,
        available: rows.filter((row) => row.customerStatus === "available").length,
      };
    });
}

export type OccupancySummary = Record<CustomerTableStatus, number> & { total: number };

export function occupancySummary(tables: FloorTable[]): OccupancySummary {
  const summary: OccupancySummary = { available: 0, held: 0, occupied: 0, reserved: 0, cleaning: 0, total: tables.length };
  for (const table of tables) summary[table.customerStatus] += 1;
  return summary;
}

/** Cari nomor meja: "8" / "08" / "meja 8" cocok dengan "08". */
export function matchesTableQuery(table: Pick<FloorTable, "tableNumber" | "tableLabel">, query: string) {
  const digits = query.replace(/\D/g, "");
  if (!digits) return query.trim() === "" || table.tableLabel.toLowerCase().includes(query.trim().toLowerCase());
  return Number.parseInt(table.tableNumber, 10) === Number.parseInt(digits, 10) || table.tableNumber.includes(digits);
}

export function filterTables<T extends FloorTable>(
  tables: T[],
  options: { floor: number | "all"; status: TableStatusFilter; query: string },
): T[] {
  return tables.filter((table) => {
    if (options.floor !== "all" && tableFloor(table) !== options.floor) return false;
    if (options.status !== "all" && table.customerStatus !== options.status) return false;
    return matchesTableQuery(table, options.query);
  });
}

/** Tidak ada meja yang bisa dipilih di seluruh outlet (bukan hanya lantai aktif). */
export function noTableAvailable(tables: FloorTable[]) {
  return tables.length > 0 && !tables.some((table) => table.customerStatus === "available" || table.mine);
}
