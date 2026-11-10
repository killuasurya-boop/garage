import { z } from "zod";

import { isThemePresetId, isSavableGarageOsThemePreset, GarageOsThemeSaveError } from "@/lib/garage-theme";
import { AgentProtectedSettingError } from "@/lib/agent-protected-settings";
import { fail, ok, readJson } from "@/lib/api-response";
import { BusinessDaySettingError } from "@/lib/business-date";
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
  dailyBudgetElectricity: z.number().int().min(0).max(100_000_000).optional(),
  dailyBudgetPayroll: z.number().int().min(0).max(100_000_000).optional(),
  dailyBudgetRent: z.number().int().min(0).max(100_000_000).optional(),
  dailyBudgetSaveMoney: z.number().int().min(0).max(100_000_000).optional(),
  dailyBudgetInternet: z.number().int().min(0).max(100_000_000).optional(),
  dailyBudgetAds: z.number().int().min(0).max(100_000_000).optional(),
  dailyBudgetSystem: z.number().int().min(0).max(100_000_000).optional(),
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
  kitchenChitAutoPrint: z.boolean().optional(),
  productionBatchWindowSec: z.number().int().min(0).max(900).optional(),
  productionTargetBarMinutes: z.number().int().min(1).max(60).optional(),
  productionTargetFoodMinutes: z.number().int().min(1).max(90).optional(),
  productionTargetFromMenu: z.boolean().optional(),
  productionStartTargetMinutes: z.number().int().min(1).max(60).optional(),
  productionDeliverTargetMinutes: z.number().int().min(1).max(60).optional(),
  productionWarnBeforeMinutes: z.number().int().min(0).max(30).optional(),
  productionBusyThreshold: z.number().int().min(0).max(100).optional(),
  productionBusyExtraMinutes: z.number().int().min(0).max(30).optional(),
  deliveryEnabled: z.boolean().optional(),
  deliveryFee: z.number().int().min(0).max(100_000).optional(),
  deliveryMinItems: z.number().int().min(1).max(20).optional(),
  deliveryAreaNote: z.string().trim().max(240).optional(),
  deliveryRequireOnlineCourier: z.boolean().optional(),
  deliveryBaseKm: z.number().min(0).max(20).optional(),
  deliveryPerKmFee: z.number().int().min(0).max(50_000).optional(),
  deliveryMaxKm: z.number().min(0).max(50).optional(),
  deliveryMinSpend: z.number().int().min(0).max(1_000_000).optional(),
  garageLat: z.number().min(-90).max(90).optional(),
  garageLng: z.number().min(-180).max(180).optional(),
  tableHoldMinutes: z.number().int().min(2).max(15).optional(),
  digitalMenuMode: z.enum(["self_order", "waiter_list"]).optional(),
  tableIdleWarnHours: z.number().int().min(1).max(12).optional(),
  partnerHubEnabled: z.boolean().optional(),
  partnerSlaAcceptWarnMinutes: z.number().int().min(1).max(30).optional(),
  partnerSlaEscalateMinutes: z.number().int().min(1).max(60).optional(),
  partnerReadyWaitWarnMinutes: z.number().int().min(1).max(30).optional(),
  garageWhatsapp: z.string().trim().regex(/^(\+?62|0)8\d{7,12}$/, "Nomor WhatsApp tidak valid").optional(),
  bankAccountsText: z.string().max(1000).optional(),
  wifiEnabled: z.boolean().optional(),
  wifiSsid: z.string().trim().max(32).optional(),
  wifiSessionHours: z.number().int().min(1).max(24).optional(),
  wifiMaxDevices: z.number().int().min(1).max(500).optional(),
  wifiHotspotHost: z.string().trim().max(80).regex(/^[a-z0-9.-]*$/i, "Nama host hanya huruf, angka, titik, minus.").optional(),
  unpaidOrderAutoRejectMinutes: z.number().int().min(0).max(240).optional(),
  pointsPerThousand: z.number().min(0).max(10).optional(),
  memberPointValue: z.number().int().min(1).max(1_000).optional(),
  memberRedeemMaxPct: z.number().int().min(0).max(100).optional(),
  memberRedeemMinPoints: z.number().int().min(1).max(10_000).optional(),
  memberPointExpiryMonths: z.number().int().min(0).max(60).optional(),
  voucherMaxDiscountPct: z.number().min(0).max(100).optional(),
  qrPromoPct: z.number().min(0).max(100).optional(),
  qrPromoMaxAmount: z.number().int().min(0).max(10_000_000).optional(),
  autoSoldOutFromStock: z.boolean().optional(),
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
  const session = await requireGarageSession(["Owner", "Manajer"]);
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
    if (error instanceof BusinessDaySettingError) {
      return fail(error.code === "BUSINESS_DAY_OWNER_ONLY" ? 403 : 400, error.code, error.message);
    }
    if (error instanceof GarageOsThemeSaveError) {
      return fail(400, "INVALID_THEME_PRESET", error.message);
    }
    if (error instanceof AgentProtectedSettingError) {
      return fail(403, error.code, error.message);
    }
    throw error;
  }
}
