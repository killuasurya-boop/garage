// Ekspresi SQL tanggal operasional (B1b) — padanan `businessDateKey` untuk
// GROUP BY di database. Nilai kebijakan ditulis sebagai literal (bukan parameter)
// supaya ekspresi SELECT dan GROUP BY identik; keduanya sudah tervalidasi ketat
// (jam bulat 1..12, tanggal YYYY-MM-DD) oleh `normalizeBusinessDayPolicy`.
import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { CALENDAR_POLICY, normalizeBusinessDayPolicy, type BusinessDayPolicy } from "@/lib/business-date";

/** Tanggal operasional (YYYY-MM-DD) dari kolom timestamptz. */
export function businessDaySql(column: AnyPgColumn, policy: BusinessDayPolicy = CALENDAR_POLICY): SQL<string> {
  const calendar = sql<string>`to_char((${column} at time zone 'UTC') + interval '7 hours', 'YYYY-MM-DD')`;
  const safe = normalizeBusinessDayPolicy({ cutoffHour: policy.cutoffHour, effectiveFrom: policy.effectiveFrom });
  if (!safe.effectiveFrom) return calendar;
  const shifted = sql<string>`to_char((${column} at time zone 'UTC') + interval '${sql.raw(String(7 - safe.cutoffHour))} hours', 'YYYY-MM-DD')`;
  return sql<string>`(case when ${shifted} >= '${sql.raw(safe.effectiveFrom)}' then ${shifted} else ${calendar} end)`;
}
