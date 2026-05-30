// Formatter helpers yang baca dari AppSettings (timezone/currency/locale).
// Dipake server-side (di garage-service, invoice PDF, dll) supaya format
// tanggal & uang konsisten dan controllable lewat /control/settings.

import type { AppSettings } from "@/lib/garage-app-settings-types";

export type FormatterContext = Pick<
  AppSettings,
  "timezone" | "currency" | "locale"
>;

// Currency symbol map untuk display di receipt thermal text-only.
const CURRENCY_SYMBOL: Record<string, string> = {
  IDR: "Rp",
  USD: "$",
  EUR: "€",
  SGD: "S$",
  MYR: "RM",
};

export function formatCurrency(
  amount: number,
  ctx: FormatterContext,
  options: { compact?: boolean; symbol?: boolean } = {},
): string {
  const locale = ctx.locale || "id-ID";
  const currency = ctx.currency || "IDR";

  if (options.compact && Math.abs(amount) >= 1_000_000) {
    const value = amount / 1_000_000;
    const symbol = options.symbol === false ? "" : `${CURRENCY_SYMBOL[currency] ?? currency} `;
    return `${symbol}${value.toFixed(2).replace(".", ",")} jt`;
  }

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // Locale/currency invalid — fallback ke IDR
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(amount);
  }
}

export function formatDate(
  date: Date | string,
  ctx: FormatterContext,
  options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const locale = ctx.locale || "id-ID";
  const timezone = ctx.timezone || "Asia/Jakarta";
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: timezone }).format(d);
  } catch {
    return new Intl.DateTimeFormat("id-ID", {
      ...options,
      timeZone: "Asia/Jakarta",
    }).format(d);
  }
}

export function formatTime(date: Date | string, ctx: FormatterContext): string {
  return formatDate(date, ctx, { hour: "2-digit", minute: "2-digit" });
}

export function formatDateOnly(date: Date | string, ctx: FormatterContext): string {
  return formatDate(date, ctx, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Helper: konversi setting key → FormatterContext (dipake saat punya AppSettings)
export function formatterContextFromSettings(settings: AppSettings): FormatterContext {
  return {
    timezone: settings.timezone,
    currency: settings.currency,
    locale: settings.locale,
  };
}
