"use client";

// Tombol "Cetak slip" di POS / Rekap Harian → printer thermal laptop ini.

import { garageApi } from "@/lib/api-client";
import {
  buildDailyRecapContent,
  buildShiftSlipContent,
  type DailyRecapInput,
  type ShiftSlipInput,
  type SlipBrand,
} from "@/lib/management-slips";
import { printDocument } from "@/lib/print-client";

export interface SlipPrintSettings {
  brand?: SlipBrand | null;
  showSignature?: boolean | null;
  copies?: number | null;
  printedBy?: string | null;
}

export type SlipPrintResult = { ok: true; message: string } | { ok: false; message: string };

async function toResult(res: Response, label: string): Promise<SlipPrintResult> {
  const data = (await res.json().catch(() => ({}))) as {
    printer?: string;
    error?: { message?: string; actions?: string[] };
  };
  if (res.ok) return { ok: true, message: `${label} terkirim ke ${data.printer ?? "printer"}.` };
  return {
    ok: false,
    message: [data.error?.message || `Gagal mencetak ${label.toLowerCase()}.`, ...(data.error?.actions ?? []).slice(0, 2)]
      .filter(Boolean)
      .join(" · "),
  };
}

/** Ambil ringkasan shift dari server lalu cetak slip tutup shift. */
export async function printShiftSlip(
  sessionId: string,
  settings: SlipPrintSettings,
  extra: Pick<ShiftSlipInput, "qrisCounted" | "floatLeft" | "depositAmount" | "closingNote"> = {},
): Promise<SlipPrintResult> {
  try {
    const summary = await garageApi.get<Omit<ShiftSlipInput, "qrisCounted" | "floatLeft" | "depositAmount">>(
      `/api/finance/cash-sessions/${encodeURIComponent(sessionId)}/summary`,
    );
    const res = await printDocument(
      (width) =>
        buildShiftSlipContent(
          { ...summary, ...extra },
          {
            width,
            brand: settings.brand,
            showSignature: settings.showSignature,
            printedBy: settings.printedBy,
          },
        ),
      { copies: settings.copies ?? 1 },
    );
    return toResult(res, "Slip tutup shift");
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Gagal memuat data shift." };
  }
}

export async function printDailyRecap(
  data: DailyRecapInput,
  settings: SlipPrintSettings,
): Promise<SlipPrintResult> {
  const res = await printDocument(
    (width) =>
      buildDailyRecapContent(data, {
        width,
        brand: settings.brand,
        showSignature: settings.showSignature,
        printedBy: settings.printedBy,
      }),
    { copies: settings.copies ?? 1 },
  );
  return toResult(res, "Rekap harian");
}
