// Pemuat kebijakan tanggal operasional dari pengaturan GLOBAL (server).
// Menerima handle DB/transaksi: posting buku kas terjadi di dalam transaksi —
// membaca lewat koneksi lain bisa saling tunggu (PGlite) / memakai koneksi ekstra.
// Per outlet (PRD §02.4) belum: saat ini satu outlet, override outlet diabaikan.
import { and, inArray, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { appSettings } from "@/db/schema";
import { normalizeBusinessDayPolicy, type BusinessDayPolicy } from "@/lib/business-date";
import { DEFAULT_APP_SETTINGS } from "@/lib/garage-app-settings-types";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const KEYS = ["businessDayCutoffHour", "businessDayEffectiveDate"] as const;

export async function loadBusinessDayPolicy(db: Db | Tx = getDb()): Promise<BusinessDayPolicy> {
  const rows = await db
    .select({ key: appSettings.key, value: appSettings.valueJson })
    .from(appSettings)
    .where(and(inArray(appSettings.key, [...KEYS]), isNull(appSettings.outletId)));
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return normalizeBusinessDayPolicy({
    cutoffHour: stored.businessDayCutoffHour ?? DEFAULT_APP_SETTINGS.businessDayCutoffHour,
    effectiveFrom: stored.businessDayEffectiveDate ?? DEFAULT_APP_SETTINGS.businessDayEffectiveDate,
  });
}
