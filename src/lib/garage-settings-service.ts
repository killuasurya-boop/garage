// Wrapper di atas getAppSettings/updateAppSettings dari garage-service.ts.
// Mendukung per-outlet override: kalau outletId disertakan, return effective
// settings (global + outlet override merged) + map "ditulis dimana" tiap key.

import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { appSettings } from "@/db/schema";
import {
  getAppSettings,
  updateAppSettings,
  type AppSettings,
} from "@/lib/garage-service";
import {
  GarageOsThemeSaveError,
  isSavableGarageOsThemePreset,
} from "@/lib/garage-theme";
import type { GarageSession } from "@/lib/server-auth";

export type SettingValue = string | number | boolean;

// Map key → "global" | "outlet" — menunjukkan dari layer mana value berasal.
// "global" = value dari DEFAULT atau global row (outletId=null).
// "outlet" = ada override outlet-specific.
export type SettingScope = "global" | "outlet";

export async function loadAllSettings(
  outletId: string | null = null,
): Promise<Record<string, SettingValue>> {
  const settings = await getAppSettings(outletId);
  return appSettingsToRecord(settings);
}

export async function loadSettingsByKeys(
  keys: string[],
  outletId: string | null = null,
): Promise<Record<string, SettingValue>> {
  if (!keys.length) return {};
  const all = await loadAllSettings(outletId);
  const result: Record<string, SettingValue> = {};
  for (const key of keys) {
    if (key in all) result[key] = all[key];
  }
  return result;
}

export async function loadSetting(
  key: string,
  outletId: string | null = null,
): Promise<SettingValue | undefined> {
  const all = await loadAllSettings(outletId);
  return all[key];
}

export async function saveSettings(
  updates: Record<string, SettingValue>,
  garage: GarageSession,
  outletId: string | null = null,
): Promise<{ saved: number }> {
  const validKeys = new Set(Object.keys(await getAppSettings(null)));
  const patch: Partial<AppSettings> = {};
  let saved = 0;
  for (const [key, value] of Object.entries(updates)) {
    if (!validKeys.has(key)) continue;
    if (key === "garageOsThemePreset") {
      if (typeof value !== "string" || !isSavableGarageOsThemePreset(value)) {
        throw new GarageOsThemeSaveError();
      }
    }
    (patch as Record<string, unknown>)[key] = value;
    saved += 1;
  }
  if (saved > 0) {
    await updateAppSettings(outletId, patch, garage);
  }
  return { saved };
}

// Hapus outlet-specific override → fall back ke global.
export async function deleteOutletOverrides(
  keys: string[],
  outletId: string,
): Promise<{ deleted: number }> {
  if (!keys.length) return { deleted: 0 };
  const result = await getDb()
    .delete(appSettings)
    .where(
      and(
        eq(appSettings.outletId, outletId),
        inArray(appSettings.key, keys),
      ),
    )
    .returning({ id: appSettings.id });
  return { deleted: result.length };
}

// Untuk UI: cek key mana yang sudah punya outlet-specific override.
// Return: Set<key> yang di-override di level outlet ini.
export async function getOutletOverrideKeys(
  outletId: string,
): Promise<Set<string>> {
  const rows = await getDb()
    .select({ key: appSettings.key })
    .from(appSettings)
    .where(eq(appSettings.outletId, outletId));
  return new Set(rows.map((row) => row.key));
}

// Bundle untuk UI: effective settings + map scope per key.
export async function loadSettingsWithScope(
  outletId: string | null = null,
): Promise<{
  settings: Record<string, SettingValue>;
  globalSettings: Record<string, SettingValue>;
  overrideKeys: string[];
}> {
  const [effective, global] = await Promise.all([
    loadAllSettings(outletId),
    outletId ? loadAllSettings(null) : Promise.resolve(undefined),
  ]);
  const overrideKeys = outletId ? await getOutletOverrideKeys(outletId) : new Set<string>();
  return {
    settings: effective,
    globalSettings: global ?? effective,
    overrideKeys: Array.from(overrideKeys),
  };
}

function appSettingsToRecord(settings: AppSettings): Record<string, SettingValue> {
  const result: Record<string, SettingValue> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      result[key] = value;
    }
  }
  return result;
}

// Re-export biar import path konsisten
export type { AppSettings };
// _unused exports keep tree-shake friendly: helper imports below
void or;
void isNull;
void sql;
