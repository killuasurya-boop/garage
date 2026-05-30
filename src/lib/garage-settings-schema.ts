// Declarative schema of Garage settings — UI di-render dari struktur ini.
// PENTING: keys di sini WAJIB match dengan AppSettings interface di garage-service.ts
// supaya satu source of truth. Saat user save dari UI ini, value langsung
// dipake oleh pricing engine, receipt renderer, AI engine, dll.

import type { Permission } from "@/lib/role-access";
import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
} from "@/lib/garage-app-settings-types";
import { GARAGE_OS_THEME_PRESET_OPTIONS } from "@/lib/garage-theme";

export type SettingFieldType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "select";

export type SettingField = {
  key: keyof AppSettings;
  label: string;
  hint?: string;
  type: SettingFieldType;
  defaultValue: string | number | boolean;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
};

export type SettingCategory = {
  id: string;
  label: string;
  description: string;
  icon: string;
  requiredPermission?: Permission;
  fields: SettingField[];
};

export const SETTINGS_CATEGORIES: SettingCategory[] = [
  {
    id: "general",
    label: "General",
    description: "Identitas bisnis, lokal, dan default global.",
    icon: "Building2",
    fields: [
      {
        key: "brandName",
        label: "Nama bisnis",
        type: "text",
        defaultValue: DEFAULT_APP_SETTINGS.brandName,
        hint: "Tampil di receipt, invoice, dan header POS.",
      },
      {
        key: "brandTagline",
        label: "Tagline",
        type: "text",
        defaultValue: DEFAULT_APP_SETTINGS.brandTagline,
      },
      {
        key: "timezone",
        label: "Zona waktu",
        type: "select",
        defaultValue: DEFAULT_APP_SETTINGS.timezone,
        options: [
          { value: "Asia/Jakarta", label: "WIB · Asia/Jakarta" },
          { value: "Asia/Makassar", label: "WITA · Asia/Makassar" },
          { value: "Asia/Jayapura", label: "WIT · Asia/Jayapura" },
        ],
      },
      {
        key: "currency",
        label: "Mata uang",
        type: "select",
        defaultValue: DEFAULT_APP_SETTINGS.currency,
        options: [
          { value: "IDR", label: "Rupiah (IDR)" },
          { value: "USD", label: "US Dollar (USD)" },
        ],
      },
      {
        key: "locale",
        label: "Locale",
        type: "select",
        defaultValue: DEFAULT_APP_SETTINGS.locale,
        options: [
          { value: "id-ID", label: "Bahasa Indonesia" },
          { value: "en-US", label: "English (US)" },
        ],
      },
    ],
  },
  {
    id: "theme",
    label: "Tema Garage OS",
    description: "Tema visual internal Garage OS, dashboard, control panel, dan POS.",
    icon: "Palette",
    fields: [
      {
        key: "garageOsThemePreset",
        label: "Tema aktif",
        type: "select",
        defaultValue: DEFAULT_APP_SETTINGS.garageOsThemePreset,
        options: GARAGE_OS_THEME_PRESET_OPTIONS,
        hint: "Kurasi MVP: 4 tema operasional. Default Industrial Garage — asphalt, chrome, merah.",
      },
    ],
  },
  {
    id: "pos",
    label: "POS",
    description: "Workflow kasir, void, dan pembayaran.",
    icon: "Cpu",
    requiredPermission: "pos:use",
    fields: [
      {
        key: "requireManagerForVoid",
        label: "Void butuh approval manager",
        type: "boolean",
        defaultValue: DEFAULT_APP_SETTINGS.requireManagerForVoid,
        hint: "Kalau aktif, void order pending approval di module Approvals.",
      },
      {
        key: "autoPrintReceipt",
        label: "Auto-print receipt setelah bayar",
        type: "boolean",
        defaultValue: DEFAULT_APP_SETTINGS.autoPrintReceipt,
      },
      {
        key: "cashDrawerOnPayment",
        label: "Buka cash drawer otomatis",
        type: "boolean",
        defaultValue: DEFAULT_APP_SETTINGS.cashDrawerOnPayment,
      },
      {
        key: "defaultPaymentMethod",
        label: "Metode pembayaran default",
        type: "select",
        defaultValue: DEFAULT_APP_SETTINGS.defaultPaymentMethod,
        options: [
          { value: "cash", label: "Cash" },
          { value: "qris", label: "QRIS" },
          { value: "card", label: "Kartu" },
          { value: "transfer", label: "Transfer" },
        ],
      },
      {
        key: "quickReorderWindowMinutes",
        label: "Jendela quick-reorder",
        type: "number",
        defaultValue: DEFAULT_APP_SETTINGS.quickReorderWindowMinutes,
        min: 5,
        max: 120,
        step: 5,
        unit: "menit",
        hint: "Berapa menit setelah order terakhir muncul di quick-reorder.",
      },
      {
        key: "manualDiscountMaxPct",
        label: "Max discount kasir",
        type: "number",
        defaultValue: DEFAULT_APP_SETTINGS.manualDiscountMaxPct,
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
        hint: "Discount lebih dari ini di-block.",
      },
      {
        key: "manualDiscountApprovalPct",
        label: "Threshold approval supervisor",
        type: "number",
        defaultValue: DEFAULT_APP_SETTINGS.manualDiscountApprovalPct,
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
        hint: "Discount di atas ini butuh approval supervisor.",
      },
    ],
  },
  {
    id: "receipt",
    label: "Receipt & Invoice",
    description: "Layout struk dan invoice WhatsApp.",
    icon: "Receipt",
    fields: [
      {
        key: "receiptHeaderText",
        label: "Header receipt",
        type: "textarea",
        defaultValue: DEFAULT_APP_SETTINGS.receiptHeaderText,
        hint: "Multi-line. Brand name + alamat outlet.",
      },
      {
        key: "receiptFooter",
        label: "Footer receipt",
        type: "textarea",
        defaultValue: DEFAULT_APP_SETTINGS.receiptFooter,
      },
      {
        key: "outletAddress",
        label: "Alamat outlet",
        type: "text",
        defaultValue: DEFAULT_APP_SETTINGS.outletAddress,
      },
      {
        key: "outletPhone",
        label: "Telepon outlet",
        type: "text",
        defaultValue: DEFAULT_APP_SETTINGS.outletPhone,
      },
      {
        key: "npwp",
        label: "NPWP",
        type: "text",
        defaultValue: DEFAULT_APP_SETTINGS.npwp,
      },
      {
        key: "receiptCopies",
        label: "Jumlah copy print",
        type: "number",
        defaultValue: DEFAULT_APP_SETTINGS.receiptCopies,
        min: 1,
        max: 5,
        step: 1,
        unit: "lembar",
      },
      {
        key: "receiptShowLogo",
        label: "Tampilkan logo Garage",
        type: "boolean",
        defaultValue: DEFAULT_APP_SETTINGS.receiptShowLogo,
      },
      {
        key: "receiptShowTaxBreakdown",
        label: "Tampilkan rincian pajak",
        type: "boolean",
        defaultValue: DEFAULT_APP_SETTINGS.receiptShowTaxBreakdown,
      },
      {
        key: "receiptShowMemberPoints",
        label: "Tampilkan poin member",
        type: "boolean",
        defaultValue: DEFAULT_APP_SETTINGS.receiptShowMemberPoints,
      },
    ],
  },
  {
    id: "tax",
    label: "Tax & Service",
    description: "PB1, service charge, dan pembulatan.",
    icon: "Percent",
    fields: [
      {
        key: "taxPct",
        label: "PB1 / PPN",
        type: "number",
        defaultValue: DEFAULT_APP_SETTINGS.taxPct,
        min: 0,
        max: 25,
        step: 0.5,
        unit: "%",
        hint: "Live wired ke pricing engine — setiap order pakai nilai ini.",
      },
      {
        key: "serviceChargePct",
        label: "Service charge",
        type: "number",
        defaultValue: DEFAULT_APP_SETTINGS.serviceChargePct,
        min: 0,
        max: 20,
        step: 0.5,
        unit: "%",
        hint: "Live wired ke pricing engine.",
      },
      {
        key: "roundingMode",
        label: "Mode pembulatan",
        type: "select",
        defaultValue: DEFAULT_APP_SETTINGS.roundingMode,
        options: [
          { value: "none", label: "Tanpa pembulatan" },
          { value: "nearest_100", label: "Bulatkan ke 100 terdekat" },
          { value: "nearest_500", label: "Bulatkan ke 500 terdekat" },
          { value: "nearest_1000", label: "Bulatkan ke 1000 terdekat" },
        ],
      },
    ],
  },
  {
    id: "notification",
    label: "Notifikasi",
    description: "Sound, push alert, dan threshold.",
    icon: "Bell",
    fields: [
      {
        key: "qrSoundOn",
        label: "Sound notification",
        type: "boolean",
        defaultValue: DEFAULT_APP_SETTINGS.qrSoundOn,
      },
      {
        key: "notificationPushEnabled",
        label: "Push notification ke browser",
        type: "boolean",
        defaultValue: DEFAULT_APP_SETTINGS.notificationPushEnabled,
      },
      {
        key: "lowStockThreshold",
        label: "Threshold low stock alert",
        type: "number",
        defaultValue: DEFAULT_APP_SETTINGS.lowStockThreshold,
        min: 0,
        max: 50,
        step: 1,
        unit: "unit",
        hint: "Trigger alert kalau onHand ≤ min + threshold.",
      },
      {
        key: "newOrderSound",
        label: "Sound order baru",
        type: "select",
        defaultValue: DEFAULT_APP_SETTINGS.newOrderSound,
        options: [
          { value: "bell", label: "Bell" },
          { value: "chime", label: "Chime" },
          { value: "engine", label: "Engine rev" },
          { value: "silent", label: "Silent" },
        ],
      },
      {
        key: "approvalPollIntervalSec",
        label: "Polling approval",
        type: "number",
        defaultValue: DEFAULT_APP_SETTINGS.approvalPollIntervalSec,
        min: 10,
        max: 600,
        step: 10,
        unit: "detik",
      },
    ],
  },
  {
    id: "security",
    label: "Security",
    description: "Session, lockout, dan auto-logout.",
    icon: "ShieldCheck",
    requiredPermission: "staff:manage",
    fields: [
      {
        key: "securitySessionMaxHours",
        label: "Sesi maksimum",
        type: "number",
        defaultValue: DEFAULT_APP_SETTINGS.securitySessionMaxHours,
        min: 1,
        max: 720,
        step: 1,
        unit: "jam",
      },
      {
        key: "securityIdleLogoutMinutes",
        label: "Auto-logout idle",
        type: "number",
        defaultValue: DEFAULT_APP_SETTINGS.securityIdleLogoutMinutes,
        min: 0,
        max: 480,
        step: 5,
        unit: "menit",
        hint: "0 = nonaktif. POS tablet biasanya 15-30 menit. Live wired ke AutoLogoutWatcher.",
      },
      {
        key: "securityFailedLoginLockoutCount",
        label: "Lockout setelah gagal login",
        type: "number",
        defaultValue: DEFAULT_APP_SETTINGS.securityFailedLoginLockoutCount,
        min: 0,
        max: 20,
        step: 1,
        unit: "× percobaan",
      },
      {
        key: "securityLockoutDurationMinutes",
        label: "Durasi lockout",
        type: "number",
        defaultValue: DEFAULT_APP_SETTINGS.securityLockoutDurationMinutes,
        min: 1,
        max: 240,
        step: 1,
        unit: "menit",
      },
      {
        key: "securityRequire2faForOwner",
        label: "Wajib 2FA untuk Owner & Admin",
        type: "boolean",
        defaultValue: DEFAULT_APP_SETTINGS.securityRequire2faForOwner,
        hint: "Aktifkan setelah 2FA setup di akun masing-masing.",
      },
    ],
  },
  {
    id: "shift",
    label: "Shift & Cash",
    description: "Cash session, handover, dan opening cash.",
    icon: "Clock",
    fields: [
      {
        key: "shiftOpeningCashDefault",
        label: "Opening cash default",
        type: "number",
        defaultValue: DEFAULT_APP_SETTINGS.shiftOpeningCashDefault,
        min: 0,
        step: 50000,
        unit: "IDR",
      },
      {
        key: "shiftRequireManagerSignoff",
        label: "Tutup shift butuh manager sign-off",
        type: "boolean",
        defaultValue: DEFAULT_APP_SETTINGS.shiftRequireManagerSignoff,
      },
      {
        key: "shiftDiscrepancyThreshold",
        label: "Threshold discrepancy",
        type: "number",
        defaultValue: DEFAULT_APP_SETTINGS.shiftDiscrepancyThreshold,
        min: 0,
        step: 10000,
        unit: "IDR",
        hint: "Selisih lebih dari ini trigger flag audit.",
      },
    ],
  },
  {
    id: "printer",
    label: "Printer & Hardware",
    description: "Thermal printer, jumlah copy, dan device-level config.",
    icon: "Printer",
    fields: [
      {
        key: "defaultPrinterName",
        label: "Nama printer default",
        type: "text",
        defaultValue: DEFAULT_APP_SETTINGS.defaultPrinterName,
        hint: "Nama printer yang muncul di Windows. Kosongkan untuk auto-detect.",
      },
      {
        key: "receiptCopies",
        label: "Jumlah copy default",
        type: "number",
        defaultValue: DEFAULT_APP_SETTINGS.receiptCopies,
        min: 1,
        max: 5,
        step: 1,
        unit: "lembar",
      },
    ],
  },
  {
    id: "loyalty",
    label: "Loyalty & Member",
    description: "Earning rate, voucher cap, dan history member.",
    icon: "Award",
    fields: [
      {
        key: "pointsPerThousand",
        label: "Poin per 1.000 IDR",
        type: "number",
        defaultValue: DEFAULT_APP_SETTINGS.pointsPerThousand,
        min: 0,
        max: 10,
        step: 0.1,
        unit: "poin",
        hint: "Multiplier earning rate. 1 = standard, 2 = bonus event.",
      },
      {
        key: "voucherMaxDiscountPct",
        label: "Cap discount voucher",
        type: "number",
        defaultValue: DEFAULT_APP_SETTINGS.voucherMaxDiscountPct,
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
        hint: "Discount voucher maks % dari subtotal — anti-abuse.",
      },
      {
        key: "receiptHistoryMax",
        label: "History receipt per device",
        type: "number",
        defaultValue: DEFAULT_APP_SETTINGS.receiptHistoryMax,
        min: 5,
        max: 100,
        step: 5,
        unit: "receipt",
      },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    description: "Approval threshold dan policy ekspense.",
    icon: "Wallet",
    requiredPermission: "finance:write",
    fields: [
      {
        key: "expenseApprovalThreshold",
        label: "Threshold approval expense",
        type: "number",
        defaultValue: DEFAULT_APP_SETTINGS.expenseApprovalThreshold,
        min: 0,
        step: 100000,
        unit: "IDR",
        hint: "Expense di atas nilai ini butuh approval Owner/CEO.",
      },
    ],
  },
  {
    id: "marketing",
    label: "Marketing & Campaign",
    description: "Campaign default, budget, voucher policy, dan WhatsApp template.",
    icon: "Megaphone",
    requiredPermission: "marketing:write",
    fields: [
      {
        key: "marketingCampaignName",
        label: "Nama campaign default",
        type: "text",
        defaultValue: DEFAULT_APP_SETTINGS.marketingCampaignName,
      },
      {
        key: "marketingMonthlyBudget",
        label: "Budget bulanan default",
        type: "number",
        defaultValue: DEFAULT_APP_SETTINGS.marketingMonthlyBudget,
        min: 0,
        step: 100000,
        unit: "IDR",
      },
      {
        key: "marketingApprovalThreshold",
        label: "Threshold approval campaign",
        type: "number",
        defaultValue: DEFAULT_APP_SETTINGS.marketingApprovalThreshold,
        min: 0,
        step: 100000,
        unit: "IDR",
        hint: "Campaign dengan budget di atas ini butuh approval Owner.",
      },
      {
        key: "marketingDefaultSegment",
        label: "Segment default",
        type: "select",
        defaultValue: DEFAULT_APP_SETTINGS.marketingDefaultSegment,
        options: [
          { value: "atRisk", label: "At Risk — sudah lama tidak order" },
          { value: "loyal", label: "Loyal — repeat customer" },
          { value: "vip", label: "VIP — Gold & Platinum" },
          { value: "newbie", label: "Newbie — baru daftar" },
          { value: "dormant", label: "Dormant — > 90 hari" },
        ],
      },
      {
        key: "marketingDefaultChannel",
        label: "Channel default",
        type: "select",
        defaultValue: DEFAULT_APP_SETTINGS.marketingDefaultChannel,
        options: [
          { value: "whatsapp", label: "WhatsApp" },
          { value: "instagram", label: "Instagram" },
          { value: "in_store", label: "In-store" },
          { value: "multi", label: "Multi-channel" },
        ],
      },
      {
        key: "marketingDefaultVoucherType",
        label: "Tipe voucher default",
        type: "select",
        defaultValue: DEFAULT_APP_SETTINGS.marketingDefaultVoucherType,
        options: [
          { value: "fixed", label: "Fixed amount (IDR)" },
          { value: "percent", label: "Percentage (%)" },
        ],
      },
      {
        key: "marketingDefaultVoucherValue",
        label: "Nilai voucher default",
        type: "number",
        defaultValue: DEFAULT_APP_SETTINGS.marketingDefaultVoucherValue,
        min: 0,
        step: 1000,
        hint: "Untuk fixed = IDR; untuk percent = % discount.",
      },
      {
        key: "marketingDefaultDurationDays",
        label: "Durasi campaign default",
        type: "number",
        defaultValue: DEFAULT_APP_SETTINGS.marketingDefaultDurationDays,
        min: 1,
        max: 365,
        step: 1,
        unit: "hari",
      },
      {
        key: "marketingQuietHoursStart",
        label: "Quiet hours start",
        type: "number",
        defaultValue: DEFAULT_APP_SETTINGS.marketingQuietHoursStart,
        min: 0,
        max: 23,
        step: 1,
        unit: "jam (0-23)",
        hint: "Jangan blast WA antara jam ini sampai end. 22-08 standard.",
      },
      {
        key: "marketingQuietHoursEnd",
        label: "Quiet hours end",
        type: "number",
        defaultValue: DEFAULT_APP_SETTINGS.marketingQuietHoursEnd,
        min: 0,
        max: 23,
        step: 1,
        unit: "jam (0-23)",
      },
      {
        key: "marketingUtmSource",
        label: "UTM source default",
        type: "text",
        defaultValue: DEFAULT_APP_SETTINGS.marketingUtmSource,
      },
      {
        key: "marketingAutoLogEnabled",
        label: "Auto-log campaign activity",
        type: "boolean",
        defaultValue: DEFAULT_APP_SETTINGS.marketingAutoLogEnabled,
        hint: "Setiap WA blast / IG post otomatis tercatat di CRM campaign logs.",
      },
      {
        key: "marketingWhatsappTemplate",
        label: "WhatsApp template default",
        type: "textarea",
        defaultValue: DEFAULT_APP_SETTINGS.marketingWhatsappTemplate,
        hint: "Variables: {name}, {brand}, {orderUrl}.",
      },
    ],
  },
  {
    id: "ai-autopilot",
    label: "AI Autopilot",
    description: "Scheduled analysis dan window operasional AI agent.",
    icon: "Bot",
    requiredPermission: "ai:manage",
    fields: [
      {
        key: "aiAutopilotEnabled",
        label: "Autopilot scheduled aktif",
        type: "boolean",
        defaultValue: DEFAULT_APP_SETTINGS.aiAutopilotEnabled,
        hint: "Jalankan analisis terjadwal antara start–end hour.",
      },
      {
        key: "aiAutopilotStartHour",
        label: "Window start (WIB)",
        type: "number",
        defaultValue: DEFAULT_APP_SETTINGS.aiAutopilotStartHour,
        min: 0,
        max: 23,
        step: 1,
        unit: "jam",
      },
      {
        key: "aiAutopilotEndHour",
        label: "Window end (WIB)",
        type: "number",
        defaultValue: DEFAULT_APP_SETTINGS.aiAutopilotEndHour,
        min: 0,
        max: 23,
        step: 1,
        unit: "jam",
      },
      {
        key: "aiWhatsappHighAlerts",
        label: "WhatsApp blast high-priority alerts",
        type: "boolean",
        defaultValue: DEFAULT_APP_SETTINGS.aiWhatsappHighAlerts,
        hint: "Alert prioritas tinggi otomatis kirim ke WhatsApp role-routed.",
      },
      {
        key: "aiWhatsappAlertTemplate",
        label: "WhatsApp alert template",
        type: "textarea",
        defaultValue: DEFAULT_APP_SETTINGS.aiWhatsappAlertTemplate,
        hint: "Variables: {brand}, {priority}, {title}, {detail}.",
      },
    ],
  },
  {
    id: "whatsapp-routing",
    label: "WhatsApp Routing",
    description: "Nomor WhatsApp per role buat alert routing.",
    icon: "MessageCircle",
    requiredPermission: "ai:manage",
    fields: [
      {
        key: "aiWhatsappPhonesCashier",
        label: "Kasir / Waiter / Supervisor",
        type: "text",
        defaultValue: DEFAULT_APP_SETTINGS.aiWhatsappPhonesCashier,
        hint: "Comma-separated. Format: 628xxx,628xxx",
      },
      {
        key: "aiWhatsappPhonesKitchen",
        label: "Kitchen / Barista",
        type: "text",
        defaultValue: DEFAULT_APP_SETTINGS.aiWhatsappPhonesKitchen,
        hint: "Comma-separated",
      },
      {
        key: "aiWhatsappPhonesGudang",
        label: "Gudang / Inventory",
        type: "text",
        defaultValue: DEFAULT_APP_SETTINGS.aiWhatsappPhonesGudang,
        hint: "Comma-separated",
      },
      {
        key: "aiWhatsappPhonesManagement",
        label: "Management / Owner",
        type: "text",
        defaultValue: DEFAULT_APP_SETTINGS.aiWhatsappPhonesManagement,
        hint: "Comma-separated",
      },
    ],
  },
  {
    id: "ai",
    label: "AI Assistant",
    description: "Autonomy mode dan risk threshold AI agents.",
    icon: "Sparkles",
    requiredPermission: "ai:manage",
    fields: [
      {
        key: "aiAssistantEnabled",
        label: "AI Assistant aktif",
        type: "boolean",
        defaultValue: DEFAULT_APP_SETTINGS.aiAssistantEnabled,
      },
      {
        key: "aiAutonomyMode",
        label: "Autonomy mode global",
        type: "select",
        defaultValue: DEFAULT_APP_SETTINGS.aiAutonomyMode,
        options: [
          { value: "off", label: "Off — read only" },
          { value: "controlled", label: "Controlled — butuh approval" },
          { value: "autonomous", label: "Autonomous — auto-execute low risk" },
        ],
      },
      {
        key: "aiMaxRiskAuto",
        label: "Max risk untuk auto-execute",
        type: "select",
        defaultValue: DEFAULT_APP_SETTINGS.aiMaxRiskAuto,
        options: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
        ],
      },
      {
        key: "aiAutopilotEnabled",
        label: "Autopilot scheduled",
        type: "boolean",
        defaultValue: DEFAULT_APP_SETTINGS.aiAutopilotEnabled,
        hint: "Jalankan analisis terjadwal antara jam autopilot start–end.",
      },
    ],
  },
];

export function flatFields(): SettingField[] {
  return SETTINGS_CATEGORIES.flatMap((category) => category.fields);
}

export function findField(key: string): SettingField | undefined {
  return flatFields().find((field) => (field.key as string) === key);
}

export function defaultSettingsMap(): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const field of flatFields()) {
    result[field.key as string] = field.defaultValue;
  }
  return result;
}
