import { ALL_TABLE_NUMBERS, TABLE_NUMBER_RANGE_MESSAGE, parseTableNumber } from "@/lib/garage-tables";

export const QR_TABLE_NUMBERS = ALL_TABLE_NUMBERS;

export function normalizeQrTableNumber(value: string | number | null | undefined) {
  return parseTableNumber(value);
}

export function normalizeGarageBaseUrl(raw: string) {
  const value = raw.trim().replace(/\/+$/, "");
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}

export function garageQrOrderPath(table: string, outletId?: string | null) {
  const normalizedTable = normalizeQrTableNumber(table);
  if (!normalizedTable) {
    throw new Error(TABLE_NUMBER_RANGE_MESSAGE);
  }

  const params = new URLSearchParams();
  params.set("table", normalizedTable);
  params.set("source", "qr_table");
  // Multi-outlet: QR membawa outlet supaya order masuk ke outlet yang benar.
  if (outletId) params.set("outletId", outletId);
  return `/order?${params.toString()}`;
}

export function garageQrOrderUrl(baseUrl: string, table: string, outletId?: string | null) {
  return new URL(garageQrOrderPath(table, outletId), normalizeGarageBaseUrl(baseUrl)).toString();
}

export function isLocalQrBaseUrl(baseUrl: string) {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}
