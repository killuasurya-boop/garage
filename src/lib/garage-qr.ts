export const QR_TABLE_NUMBERS = Array.from({ length: 50 }, (_, index) =>
  String(index + 1).padStart(2, "0"),
);

export function normalizeQrTableNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(String(value).trim());
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
    return null;
  }

  return String(parsed).padStart(2, "0");
}

export function normalizeGarageBaseUrl(raw: string) {
  const value = raw.trim().replace(/\/+$/, "");
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}

export function garageQrOrderPath(table: string) {
  const normalizedTable = normalizeQrTableNumber(table);
  if (!normalizedTable) {
    throw new Error("Nomor meja harus 01 sampai 50.");
  }

  const params = new URLSearchParams();
  params.set("table", normalizedTable);
  params.set("source", "qr_table");
  return `/order?${params.toString()}`;
}

export function garageQrOrderUrl(baseUrl: string, table: string) {
  return new URL(garageQrOrderPath(table), normalizeGarageBaseUrl(baseUrl)).toString();
}

export function isLocalQrBaseUrl(baseUrl: string) {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}
