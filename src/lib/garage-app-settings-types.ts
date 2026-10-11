// AppSettings type & defaults — di-extract ke file ini supaya bisa di-import
// dari client component tanpa narik server-only deps (db, drizzle) yang ada
// di garage-service.ts.

import { GARAGE_LOCATION } from "@/lib/garage-location";

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
  // Anggaran biaya tetap harian (IDR/hari) — dipakai panel Alokasi Harian Finance.
  dailyBudgetElectricity: number; // token listrik
  dailyBudgetPayroll: number; // gaji karyawan
  dailyBudgetRent: number; // sewa lapak
  dailyBudgetSaveMoney: number; // tabungan / save money
  dailyBudgetInternet: number; // internet
  dailyBudgetAds: number; // biaya iklan
  dailyBudgetSystem: number; // biaya sistem/aplikasi
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
  // Cetak chit dapur/bar otomatis saat kasir konfirmasi order (ke printer kasir).
  kitchenChitAutoPrint: boolean;
  // Production Hub: rentang waktu maksimal antar porsi dalam satu Smart Batch
  // (detik). 0 = tanpa batas. Dokumen §8.4 menyarankan mulai 60–120 detik.
  productionBatchWindowSec: number;
  // Target SLA tiket produksi (menit) — dipasang ke tiket BARU saat dibuat.
  productionTargetBarMinutes: number;
  productionTargetFoodMinutes: number;
  // Delivery menu digital (wajib bayar QRIS dulu).
  deliveryEnabled: boolean;
  deliveryFee: number;
  deliveryMinItems: number;
  deliveryAreaNote: string;
  // Ongkir per km: deliveryFee = ongkir dasar untuk deliveryBaseKm pertama,
  // + deliveryPerKmFee per km berikutnya, maks deliveryMaxKm (0 = tanpa batas).
  deliveryBaseKm: number;
  deliveryPerKmFee: number;
  deliveryMaxKm: number;
  // Minimal belanja delivery (harga menu, Rp). 0 = tanpa minimal.
  deliveryMinSpend: number;
  // Titik lokasi Garage untuk hitung jarak (0 = pakai titik geofence absensi).
  garageLat: number;
  garageLng: number;
  // Delivery hanya bisa dipilih bila ada kurir yang sedang "Siap antar".
  deliveryRequireOnlineCourier: boolean;
  // Menu digital pilih meja (owner, Okt 2026): lama kunci meja saat customer
  // memilih (menit) dan peringatan meja terisi tanpa aktivitas (jam).
  tableHoldMinutes: number;
  tableIdleWarnHours: number;
  // Nomor WhatsApp Garage (format 62…) — tombol bukti bayar & chat pelanggan.
  garageWhatsapp: string;
  // Order take away/delivery belum dibayar lewat batas ini otomatis ditolak (menit, 0 = mati).
  unpaidOrderAutoRejectMinutes: number;
  // Loyalty
  pointsPerThousand: number;
  // Pakai poin saat bayar (owner, Okt 2026): nilai 1 poin, batas potongan per
  // tagihan, minimal poin dipakai, dan poin hangus bila tidak aktif N bulan.
  memberPointValue: number;
  memberRedeemMaxPct: number;
  memberRedeemMinPoints: number;
  memberPointExpiryMonths: number;
  voucherMaxDiscountPct: number;
  // Promo otomatis order QR/online (dulu tertanam di kode: 10% maks Rp25.000).
  qrPromoPct: number;
  qrPromoMaxAmount: number;
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
  // Gudang: potong stok bahan otomatis dari resep saat menu terjual.
  inventoryAutoDeduct: boolean;
  // USANG (Sep 2026): stok WMS kini selalu dipotong lewat potong stok resep order.
  // Dipertahankan agar nilai tersimpan lama tetap valid; tidak dibaca POS lagi.
  wmsAutoConsume: boolean;
  // Auto-habis: menu otomatis HABIS bila bahan utama resepnya tidak cukup di
  // gudang. Nyalakan setelah stock opname pembukaan (stok awal 0 → semua habis).
  autoSoldOutFromStock: boolean;
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
  // Contoh awal biaya tetap harian (bisa diubah owner di Pengaturan → Anggaran Harian).
  dailyBudgetElectricity: 35_000,
  dailyBudgetPayroll: 544_000,
  dailyBudgetRent: 25_000,
  dailyBudgetSaveMoney: 100_000,
  dailyBudgetInternet: 10_000,
  dailyBudgetAds: 30_000,
  dailyBudgetSystem: 0,
  brandName: "GARAGE",
  brandTagline: "Coffee & Motor",
  receiptFooter: "TERIMA KASIH",
  // Default = lokasi resmi Google Maps (garage-location.ts); bisa diubah di Pengaturan.
  outletAddress: GARAGE_LOCATION.address,
  outletPhone: GARAGE_LOCATION.phoneDisplay,
  npwp: "",
  approvalPollIntervalSec: 60,
  qrSoundOn: true,
  autoPrintReceipt: true,
  defaultPrinterName: "",
  receiptCopies: 1,
  kitchenChitAutoPrint: true,
  productionBatchWindowSec: 120,
  productionTargetBarMinutes: 5,
  productionTargetFoodMinutes: 15,
  deliveryEnabled: true,
  deliveryFee: 5000,
  deliveryMinItems: 2,
  deliveryAreaNote:
    "Khusus wilayah perkotaan Tebing Tinggi yang aman & terjangkau kurir. Tidak melayani daerah pelosok/rawan.",
  deliveryRequireOnlineCourier: true,
  deliveryBaseKm: 2,
  deliveryPerKmFee: 2000,
  deliveryMaxKm: 7,
  deliveryMinSpend: 25000,
  garageLat: 0,
  garageLng: 0,
  tableHoldMinutes: 5,
  tableIdleWarnHours: 3,
  garageWhatsapp: "6285121552341",
  unpaidOrderAutoRejectMinutes: 30,
  // 0,5 poin per Rp1.000 menu → Silver ±5% (1 poin = Rp100).
  pointsPerThousand: 0.5,
  memberPointValue: 100,
  memberRedeemMaxPct: 50,
  memberRedeemMinPoints: 50,
  memberPointExpiryMonths: 12,
  voucherMaxDiscountPct: 30,
  qrPromoPct: 10,
  qrPromoMaxAmount: 25_000,
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
  inventoryAutoDeduct: true,
  wmsAutoConsume: false,
  autoSoldOutFromStock: false,
  quickReorderWindowMinutes: 30,
  // Receipt extra
  // Kosong = struk memakai nama brand + tagline + alamat & telepon outlet asli
  // (dulu berisi alamat contoh "Jl. Contoh No. 1, Jakarta" yang tercetak di struk).
  receiptHeaderText: "",
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
