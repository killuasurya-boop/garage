import { z } from "zod";

import { isThemePresetId, isSavableGarageOsThemePreset, GarageOsThemeSaveError } from "@/lib/garage-theme";
import { fail, ok, readJson } from "@/lib/api-response";
import {
  getAppSettings,
  updateAppSettings,
  DEFAULT_APP_SETTINGS,
} from "@/lib/garage-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Patch schema — semua field optional. Validasi tipe per field.
const patchSchema = z.object({
  serviceChargePct: z.number().min(0).max(50).optional(),
  taxPct: z.number().min(0).max(50).optional(),
  manualDiscountMaxPct: z.number().min(0).max(100).optional(),
  manualDiscountApprovalPct: z.number().min(0).max(100).optional(),
  receiptHistoryMax: z.number().int().min(5).max(200).optional(),
  expenseApprovalThreshold: z.number().int().min(0).max(1_000_000_000).optional(),
  brandName: z.string().trim().min(1).max(40).optional(),
  brandTagline: z.string().trim().max(60).optional(),
  receiptFooter: z.string().trim().max(120).optional(),
  outletAddress: z.string().trim().max(200).optional(),
  outletPhone: z.string().trim().max(40).optional(),
  npwp: z.string().trim().max(40).optional(),
  approvalPollIntervalSec: z.number().int().min(10).max(600).optional(),
  qrSoundOn: z.boolean().optional(),
  autoPrintReceipt: z.boolean().optional(),
  defaultPrinterName: z.string().trim().max(80).optional(),
  receiptCopies: z.number().int().min(1).max(5).optional(),
  pointsPerThousand: z.number().min(0).max(10).optional(),
  voucherMaxDiscountPct: z.number().min(0).max(100).optional(),
  marketingCampaignName: z.string().trim().min(1).max(80).optional(),
  marketingMonthlyBudget: z.number().int().min(0).max(100_000_000).optional(),
  marketingDefaultSegment: z
    .enum([
      "vip",
      "atRisk",
      "new",
      "voucherReady",
      "birthdayWeek",
      "stampMission",
      "vipExclusive",
      "referralReady",
    ])
    .optional(),
  marketingWhatsappTemplate: z.string().trim().min(10).max(500).optional(),
  marketingUtmSource: z.string().trim().min(1).max(60).optional(),
  marketingAutoLogEnabled: z.boolean().optional(),
  marketingApprovalThreshold: z.number().int().min(0).max(1_000_000_000).optional(),
  marketingDefaultChannel: z.enum(["whatsapp", "instagram", "in_store", "multi"]).optional(),
  marketingDefaultVoucherType: z.enum(["fixed", "percent"]).optional(),
  marketingDefaultVoucherValue: z.number().int().min(1).max(1_000_000_000).optional(),
  marketingQuietHoursStart: z.number().int().min(0).max(23).optional(),
  marketingQuietHoursEnd: z.number().int().min(0).max(23).optional(),
  marketingDefaultDurationDays: z.number().int().min(1).max(365).optional(),
  aiAutopilotEnabled: z.boolean().optional(),
  aiAutopilotStartHour: z.number().int().min(0).max(23).optional(),
  aiAutopilotEndHour: z.number().int().min(0).max(23).optional(),
  aiWhatsappHighAlerts: z.boolean().optional(),
  aiWhatsappAlertTemplate: z.string().trim().min(10).max(500).optional(),
  aiWhatsappPhonesCashier: z.string().trim().max(300).optional(),
  aiWhatsappPhonesKitchen: z.string().trim().max(300).optional(),
  aiWhatsappPhonesGudang: z.string().trim().max(300).optional(),
  aiWhatsappPhonesManagement: z.string().trim().max(300).optional(),
  garageOsThemePreset: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine(isThemePresetId, "Tema Garage OS tidak dikenal.")
    .refine(isSavableGarageOsThemePreset, "Hanya tema operasional MVP yang boleh disimpan.")
    .optional(),
  // Tarif fee staf (Rupiah per item)
  feeWaiterDeliveredPerItem: z.number().int().min(0).max(100_000).optional(),
  feeKitchenReadyPerItem: z.number().int().min(0).max(100_000).optional(),
  feeBaristaReadyPerItem: z.number().int().min(0).max(100_000).optional(),
  feePackagingReadyPerItem: z.number().int().min(0).max(100_000).optional(),
  feeCashierPaidPerItem: z.number().int().min(0).max(100_000).optional(),
});

export async function GET() {
  // Read settings = semua staff terautentikasi (bukan `dashboard:read` yang
  // TIDAK dimiliki Admin/Kasir/Barista dst — dulu bikin 403 padahal modul
  // Settings tampil untuk Admin). Settings (pajak/brand/printer) config operasional
  // non-sensitif; tulis (PATCH) tetap dibatasi role di bawah.
  const session = await requireGarageSession();
  if (session.response) return session.response;

  const settings = await getAppSettings(session.data.profile.outlet.id);
  return ok({ settings, defaults: DEFAULT_APP_SETTINGS });
}

export async function PATCH(request: Request) {
  // Update setting OS boleh untuk role yang memang ditampilkan canWrite di UI.
  const session = await requireGarageSession([
    "Owner / CEO",
    "Admin",
    "Manager Operasional",
    "Finance / CFO",
  ]);
  if (session.response) return session.response;

  const body = await readJson(request, patchSchema);
  if (body.error) return body.error;

  try {
    const updated = await updateAppSettings(
      session.data.profile.outlet.id,
      body.data,
      session.data,
    );
    return ok({ settings: updated });
  } catch (error) {
    if (error instanceof GarageOsThemeSaveError) {
      return fail(400, "INVALID_THEME_PRESET", error.message);
    }
    throw error;
  }
}
