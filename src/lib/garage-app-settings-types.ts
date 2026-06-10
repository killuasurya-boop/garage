// AppSettings type & defaults — di-extract ke file ini supaya bisa di-import
// dari client component tanpa narik server-only deps (db, drizzle) yang ada
// di garage-service.ts.

export type StaffFeeRates = {
  feeWaiterDeliveredPerItem: number;
  feeKitchenReadyPerItem: number;
  feeBaristaReadyPerItem: number;
  feePackagingReadyPerItem: number;
  feeCashierPaidPerItem: number;
};

export type AppSettings = {
  // POS billing
  serviceChargePct: number;
  taxPct: number;
  manualDiscountMaxPct: number;
  manualDiscountApprovalPct: number;
  receiptHistoryMax: number;
  // Finance approval
  expenseApprovalThreshold: number;
  // Receipt branding
  brandName: string;
  brandTagline: string;
  receiptFooter: string;
  outletAddress: string;
  outletPhone: string;
  npwp: string;
  // Notifikasi
  approvalPollIntervalSec: number;
  qrSoundOn: boolean;
  autoPrintReceipt: boolean;
  // Printer
  defaultPrinterName: string;
  receiptCopies: number;
  // Loyalty
  pointsPerThousand: number;
  voucherMaxDiscountPct: number;
  // Marketing
  marketingCampaignName: string;
  marketingMonthlyBudget: number;
  marketingDefaultSegment: string;
  marketingWhatsappTemplate: string;
  marketingUtmSource: string;
  marketingAutoLogEnabled: boolean;
  marketingApprovalThreshold: number;
  marketingDefaultChannel: string;
  marketingDefaultVoucherType: "fixed" | "percent";
  marketingDefaultVoucherValue: number;
  marketingQuietHoursStart: number;
  marketingQuietHoursEnd: number;
  marketingDefaultDurationDays: number;
  // GARAGE AI autopilot
  aiAutopilotEnabled: boolean;
  aiAutopilotStartHour: number;
  aiAutopilotEndHour: number;
  aiWhatsappHighAlerts: boolean;
  aiWhatsappAlertTemplate: string;
  aiWhatsappPhonesCashier: string;
  aiWhatsappPhonesKitchen: string;
  aiWhatsappPhonesGudang: string;
  aiWhatsappPhonesManagement: string;
  // Locale & general
  timezone: string;
  currency: string;
  locale: string;
  // POS extra
  roundingMode: string;
  requireManagerForVoid: boolean;
  cashDrawerOnPayment: boolean;
  defaultPaymentMethod: string;
  quickReorderWindowMinutes: number;
  // Receipt extra
  receiptHeaderText: string;
  receiptShowLogo: boolean;
  receiptShowTaxBreakdown: boolean;
  receiptShowMemberPoints: boolean;
  // Notification extra
  notificationPushEnabled: boolean;
  lowStockThreshold: number;
  newOrderSound: string;
  // Security
  securitySessionMaxHours: number;
  securityIdleLogoutMinutes: number;
  securityFailedLoginLockoutCount: number;
  securityLockoutDurationMinutes: number;
  securityRequire2faForOwner: boolean;
  // Attendance control
  attendanceEnabled: boolean;
  attendanceTerminalMode: "pin_only" | "pin_gps" | "pin_gps_selfie";
  attendanceLateGraceMinutes: number;
  attendanceEarlyLeaveGraceMinutes: number;
  attendanceRequireGps: boolean;
  attendanceRequireSelfie: boolean;
  attendanceBlockDoublePunch: boolean;
  attendanceRequireActiveGeofence: boolean;
  // Shift extra
  shiftOpeningCashDefault: number;
  shiftRequireManagerSignoff: boolean;
  shiftDiscrepancyThreshold: number;
  // AI Assistant control
  aiAssistantEnabled: boolean;
  aiAutonomyMode: string;
  aiMaxRiskAuto: string;
  // Garage OS theme
  garageOsThemePreset: string;
  // Tarif fee staf (Rupiah per item) — bisa diatur owner dari Pengaturan.
  feeWaiterDeliveredPerItem: number; // waiter saat antar
  feeKitchenReadyPerItem: number; // Koki / Asisten Koki saat makanan ready
  feeBaristaReadyPerItem: number; // Barista saat minuman ready
  feePackagingReadyPerItem: number; // packing
  feeCashierPaidPerItem: number; // kasir saat order lunas
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  serviceChargePct: 5,
  taxPct: 10,
  manualDiscountMaxPct: 50,
  manualDiscountApprovalPct: 10,
  receiptHistoryMax: 20,
  expenseApprovalThreshold: 1_000_000,
  brandName: "GARAGE",
  brandTagline: "Coffee & Motor",
  receiptFooter: "TERIMA KASIH",
  outletAddress: "",
  outletPhone: "",
  npwp: "",
  approvalPollIntervalSec: 60,
  qrSoundOn: true,
  autoPrintReceipt: true,
  defaultPrinterName: "",
  receiptCopies: 1,
  pointsPerThousand: 1,
  voucherMaxDiscountPct: 30,
  marketingCampaignName: "Garage Repeat Booster",
  marketingMonthlyBudget: 1_500_000,
  marketingDefaultSegment: "atRisk",
  marketingWhatsappTemplate:
    "Halo {name}, kami kangen kamu di {brand}. Minggu ini ada promo spesial: tunjukkan pesan ini ke kasir untuk cek reward kamu. {orderUrl}",
  marketingUtmSource: "garage_marketing",
  marketingAutoLogEnabled: true,
  marketingApprovalThreshold: 2_000_000,
  marketingDefaultChannel: "whatsapp",
  marketingDefaultVoucherType: "fixed",
  marketingDefaultVoucherValue: 10_000,
  marketingQuietHoursStart: 22,
  marketingQuietHoursEnd: 8,
  marketingDefaultDurationDays: 14,
  aiAutopilotEnabled: true,
  aiAutopilotStartHour: 7,
  aiAutopilotEndHour: 23,
  aiWhatsappHighAlerts: true,
  aiWhatsappAlertTemplate:
    "[GARAGE AI] {brand}\nPrioritas: {priority}\n{title}\n{detail}\nBuka Garage OS dan tandai Sudah ditangani.",
  aiWhatsappPhonesCashier: "",
  aiWhatsappPhonesKitchen: "",
  aiWhatsappPhonesGudang: "",
  aiWhatsappPhonesManagement: "",
  // Locale & general
  timezone: "Asia/Jakarta",
  currency: "IDR",
  locale: "id-ID",
  // POS extra
  roundingMode: "nearest_100",
  requireManagerForVoid: true,
  cashDrawerOnPayment: true,
  defaultPaymentMethod: "cash",
  quickReorderWindowMinutes: 30,
  // Receipt extra
  receiptHeaderText: "Garage Coffee & Motor\nJl. Contoh No. 1, Jakarta",
  receiptShowLogo: true,
  receiptShowTaxBreakdown: true,
  receiptShowMemberPoints: true,
  // Notification extra
  notificationPushEnabled: true,
  lowStockThreshold: 5,
  newOrderSound: "bell",
  // Security
  securitySessionMaxHours: 24,
  securityIdleLogoutMinutes: 30,
  securityFailedLoginLockoutCount: 5,
  securityLockoutDurationMinutes: 15,
  securityRequire2faForOwner: false,
  // Attendance control
  attendanceEnabled: true,
  attendanceTerminalMode: "pin_gps",
  attendanceLateGraceMinutes: 10,
  attendanceEarlyLeaveGraceMinutes: 10,
  attendanceRequireGps: true,
  attendanceRequireSelfie: false,
  attendanceBlockDoublePunch: true,
  attendanceRequireActiveGeofence: false,
  // Shift extra
  shiftOpeningCashDefault: 500_000,
  shiftRequireManagerSignoff: true,
  shiftDiscrepancyThreshold: 50_000,
  // AI Assistant control
  aiAssistantEnabled: true,
  aiAutonomyMode: "controlled",
  aiMaxRiskAuto: "low",
  // Garage OS theme
  garageOsThemePreset: "industrial-garage",
  // Tarif fee staf (Rupiah per item)
  feeWaiterDeliveredPerItem: 100,
  feeKitchenReadyPerItem: 200,
  feeBaristaReadyPerItem: 200,
  feePackagingReadyPerItem: 200,
  feeCashierPaidPerItem: 200,
};
