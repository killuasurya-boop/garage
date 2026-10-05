import type { ModuleId, Role } from "@/lib/garage-data";

export type Permission =
  | "dashboard:read"
  | "pos:use"
  | "orders:read"
  | "orders:manage"
  | "kitchen:read"
  | "kitchen:write"
  | "inventory:read"
  | "inventory:write"
  | "finance:read"
  | "finance:write"
  | "crm:read"
  | "crm:write"
  | "marketing:read"
  | "marketing:write"
  | "approvals:read"
  | "approvals:decide"
  | "audit:read"
  | "staff:manage"
  | "ai:use"
  | "ai:manage"
  | "website:manage"
  | "company:read"
  | "company:manage"
  | "tables:read"
  | "tables:write"
  | "print:read"
  | "print:write"
  | "shift:cash"
  | "shift:handover"
  | "earnings:read"
  | "earnings:manage"
  | "chat:use";

const ownerPermissions: Permission[] = [
  "dashboard:read",
  "pos:use",
  "orders:read",
  "orders:manage",
  "kitchen:read",
  "kitchen:write",
  "inventory:read",
  "inventory:write",
  "finance:read",
  "finance:write",
  "crm:read",
  "crm:write",
  "marketing:read",
  "marketing:write",
  "approvals:read",
  "approvals:decide",
  "audit:read",
  "staff:manage",
  "ai:use",
  "ai:manage",
  "website:manage",
  "company:read",
  "company:manage",
  "tables:read",
  "tables:write",
  "print:read",
  "print:write",
  "shift:cash",
  "shift:handover",
  "earnings:read",
  "earnings:manage",
  "chat:use",
];

export const rolePermissions: Record<Role, Permission[]> = {
  Owner: ownerPermissions,
  // Manajer = union Admin + Manager Operasional + Finance/CFO + Supervisor
  // Shift lama. Hampir setara Owner, KECUALI ai:manage & company:* (setting
  // sistem inti/provider AI — tetap Owner-only, sesuai keputusan konsolidasi
  // role). Proteksi akun Owner sendiri ada di protectedRoleRank.
  Manajer: [
    "dashboard:read",
    "pos:use",
    "orders:read",
    "orders:manage",
    "kitchen:read",
    "kitchen:write",
    "inventory:read",
    "inventory:write",
    "finance:read",
    "finance:write",
    "crm:read",
    "crm:write",
    "marketing:read",
    "marketing:write",
    "approvals:read",
    "approvals:decide",
    "audit:read",
    "staff:manage",
    "ai:use",
    "website:manage",
    "tables:read",
    "tables:write",
    "print:read",
    "print:write",
    "shift:cash",
    "shift:handover",
    "earnings:read",
    "earnings:manage",
  ],
  // Kasir = union Kasir + Barista + Koki + Asisten Koki + Kitchen/Barista +
  // Gudang lama — kasir sekarang juga pegang KDS dapur/bar dan stok gudang.
  Kasir: [
    "pos:use",
    "orders:read",
    "orders:manage",
    "kitchen:read",
    "kitchen:write",
    "inventory:read",
    "inventory:write",
    "tables:read",
    "tables:write",
    "print:read",
    "print:write",
    "shift:cash",
    "earnings:read",
    "ai:use",
  ],
  // Waiter = union Waiter 1 + Waiter 2 + Delivery Admin lama.
  Waiter: [
    "pos:use",
    "orders:read",
    "orders:manage",
    "tables:read",
    "tables:write",
    "ai:use",
    "earnings:read",
  ],
};

export const roleModules: Record<Role, ModuleId[]> = {
  Owner: [
    "dashboard",
    "pos",
    "kitchen",
    "ai-agent",
    "waiter",
    "produk",
    "inventory",
    "finance",
    "crm",
    "membership",
    "marketing",
    "approvals",
    "website",
    "company-control",
    "earnings",
    "audit",
    "team-management",
    "settings",
    "recruitment",
  ],
  // Manajer = union modul Admin/Manager Operasional/Finance-CFO/Supervisor
  // Shift lama. TIDAK termasuk "company-control" — setting sistem inti tetap
  // Owner-only (lihat CompanyControlBridge di garage-app.tsx).
  Manajer: [
    "dashboard",
    "pos",
    "kitchen",
    "ai-agent",
    "waiter",
    "produk",
    "inventory",
    "finance",
    "crm",
    "membership",
    "marketing",
    "approvals",
    "website",
    "earnings",
    "audit",
    "team-management",
    "settings",
    "recruitment",
  ],
  // Kasir = union modul Kasir + Barista/Koki/Asisten Koki/Kitchen-Barista +
  // Gudang lama. "kitchen" ditambahkan supaya kasir bisa buka KDS langsung
  // (sebelumnya modul ini tidak dimiliki role manapun).
  Kasir: ["pos", "kitchen", "inventory", "earnings", "ai-agent"],
  // Waiter bukan kasir — TIDAK boleh kena shift gate / cash control.
  // Modul "waiter" sudah cukup utk tugas operasional mereka (antar, bersih meja,
  // notifikasi order ready, delivery). POS dihilangkan dari sidebar mereka.
  Waiter: ["waiter", "earnings", "ai-agent"],
};

// Chat tersedia untuk semua role internal — comms internal antar shift/owner.
for (const role of Object.keys(rolePermissions) as Role[]) {
  if (!rolePermissions[role].includes("chat:use")) {
    rolePermissions[role].push("chat:use");
  }
}
for (const role of Object.keys(roleModules) as Role[]) {
  if (!roleModules[role].includes("chat")) {
    roleModules[role].push("chat");
  }
  if (!roleModules[role].includes("training")) {
    roleModules[role].push("training");
  }
}

// Garage Control Center — layar operasional bersama untuk semua staf (tanpa
// nominal uang; detail personal hanya milik sendiri).
for (const role of Object.keys(roleModules) as Role[]) {
  if (!roleModules[role].includes("ops-center")) {
    roleModules[role].push("ops-center");
  }
}

// Modul Kurir: Owner/Manajer memantau semua antaran; Waiter hanya bila akunnya kurir
// (difilter di modulesForProfile).
for (const role of ["Owner", "Manajer", "Waiter"] as Role[]) {
  if (!roleModules[role].includes("courier")) roleModules[role].push("courier");
}

// Smart Notification Center — semua role yang punya station kerja real-time
// butuh akses. Owner/Manajer untuk konfigurasi, kasir/waiter untuk monitor
// trigger di station mereka.
const SMART_NOTIF_ROLES: Role[] = ["Owner", "Manajer", "Kasir", "Waiter"];
for (const role of SMART_NOTIF_ROLES) {
  if (roleModules[role] && !roleModules[role].includes("smart-notif")) {
    roleModules[role].push("smart-notif");
  }
}

// --- Payroll V2 role gating ---
// Staff (Kasir/Waiter) dapat: absensi + wallet-gaji + wallet-fee.
// Manajer dapat absensi + wallet-gaji (gaji tetap), tapi TIDAK wallet-fee.
// Owner & Manajer dapat payroll-owner (settings + payout + laporan) — Manajer
// setara Owner untuk urusan payroll sesuai keputusan konsolidasi role.
const PAYROLL_V2_STAFF_ROLES: Role[] = ["Kasir", "Waiter"];
const PAYROLL_V2_MANAGER_ROLES: Role[] = ["Manajer"];
const PAYROLL_V2_OWNER_ROLES: Role[] = ["Owner", "Manajer"];

for (const role of PAYROLL_V2_STAFF_ROLES) {
  if (roleModules[role]) {
    for (const m of ["absensi-v2", "wallet-gaji", "wallet-fee"] as ModuleId[]) {
      if (!roleModules[role].includes(m)) roleModules[role].push(m);
    }
  }
}
for (const role of PAYROLL_V2_MANAGER_ROLES) {
  if (roleModules[role]) {
    for (const m of ["absensi-v2", "wallet-gaji"] as ModuleId[]) {
      if (!roleModules[role].includes(m)) roleModules[role].push(m);
    }
  }
}
for (const role of PAYROLL_V2_OWNER_ROLES) {
  if (roleModules[role] && !roleModules[role].includes("payroll-owner")) {
    roleModules[role].push("payroll-owner");
  }
}

export function permissionsForRole(role: Role) {
  return rolePermissions[role] ?? [];
}

export function modulesForRole(role: Role) {
  return roleModules[role] ?? [];
}

export function canUseApi(role: Role, permission: Permission) {
  return permissionsForRole(role).includes(permission);
}

export function canAccessModule(role: Role, moduleId: ModuleId) {
  return modulesForRole(role).includes(moduleId);
}

export function firstModuleForRole(role: Role): ModuleId {
  return modulesForRole(role)[0] ?? "dashboard";
}

// Workstation khusus produksi (tablet Bar/Dapur, HP helper) — bukan kasir.
const PRODUCTION_ONLY_WORKSTATIONS = new Set(["bar", "dapur", "helper_bar", "helper_dapur", "helper_all"]);

/**
 * Modul awal setelah login. Akun Kasir yang ditugaskan ke stasiun produksi
 * langsung ke papan Production — bukan ke POS yang terkunci "Shift Belum
 * Dibuka" (barista/koki tidak membuka shift kas). Temuan QA-audit 2026-09-28.
 */
export function homeModuleFor(role: Role, workstation?: string | null): ModuleId {
  // Termasuk workstation "all": POS hanya untuk kasir (lihat canHandleMoney).
  const station = (workstation ?? "").trim().toLowerCase();
  if (role === "Waiter" && station === "kurir") return "courier";
  if (role === "Kasir" && (PRODUCTION_ONLY_WORKSTATIONS.has(station) || station === "all")) {
    return "kitchen";
  }
  return firstModuleForRole(role);
}

// Role manajemen (Owner + Manajer) — dipakai di banyak route/lib untuk gate
// aksi sensitif (outlet switch, payroll admin, warehouse management, dsb).
// Diekspor dari sini (client-safe, tidak menarik drizzle/better-auth) supaya
// bisa diimpor langsung dari komponen client seperti user-management.tsx.
export const MANAGEMENT_ROLES: Role[] = ["Owner", "Manajer"];

// Hierarki proteksi akun: dipakai untuk menentukan siapa boleh mengelola
// (edit/hapus/ganti role) akun siapa. Owner tertinggi (tidak bisa dikelola
// role lain); Manajer tidak bisa mengelola Owner atau Manajer lain.
export const protectedRoleRank: Record<Role, number> = {
  Owner: 100,
  Manajer: 70,
  Kasir: 30,
  Waiter: 20,
};

// =============================================================================
// Kapabilitas per akun (role + workstation + jabatan).
// Role Kasir dipakai bersama oleh kasir, barista, koki, asisten koki & helper —
// pembedanya `staff_profiles.workstation` + `position`. Keputusan owner Okt 2026:
//   • Pegang uang (POS, buka shift kas, pembayaran, tandai lunas): hanya kasir
//     (role Kasir tanpa workstation) + Owner/Manajer.
//   • Tulis stok gudang: kasir, barista (bar/all), koki (dapur). Asisten Koki &
//     helper hanya lihat stok.
// =============================================================================
export type StaffCapabilityProfile = {
  role: Role;
  workstation?: string | null;
  position?: string | null;
};

const MONEY_PERMISSIONS: Permission[] = ["pos:use", "orders:manage", "shift:cash"];
const HELPER_WORKSTATIONS = new Set(["helper_bar", "helper_dapur", "helper_all"]);
const STATION_WORKSTATIONS = new Set(["bar", "dapur", "all", ...HELPER_WORKSTATIONS]);

/** Workstation dinormalkan (huruf kecil, tanpa spasi); nilai tak dikenal = tidak ditugaskan. */
function stationOf(workstation: string | null | undefined): string | null {
  const v = (workstation ?? "").trim().toLowerCase();
  return STATION_WORKSTATIONS.has(v) ? v : null;
}

/** Kasir sungguhan = role Kasir yang tidak ditugaskan ke stasiun produksi. */
export function isCashierStaff(profile: StaffCapabilityProfile): boolean {
  return profile.role === "Kasir" && !stationOf(profile.workstation);
}

/** Boleh pegang uang: buka/tutup shift kas, POS, pembayaran, tandai lunas. */
export function canHandleMoney(profile: StaffCapabilityProfile): boolean {
  return MANAGEMENT_ROLES.includes(profile.role) || isCashierStaff(profile);
}

/** Boleh input/ubah stok gudang (bukan sekadar lihat). */
export function canWriteStock(profile: StaffCapabilityProfile): boolean {
  if (MANAGEMENT_ROLES.includes(profile.role)) return true;
  if (profile.role !== "Kasir") return false;
  const station = stationOf(profile.workstation);
  if (station && HELPER_WORKSTATIONS.has(station)) return false;
  // Jabatan asisten (mis. "Asisten Koki", "asisten dapur") hanya lihat stok.
  if (/\basisten\b/i.test(profile.position ?? "")) return false;
  return true;
}

export function effectivePermissions(profile: StaffCapabilityProfile): Permission[] {
  const base = permissionsForRole(profile.role);
  if (profile.role !== "Kasir") return base;
  const money = canHandleMoney(profile);
  const stock = canWriteStock(profile);
  return base.filter(
    (permission) =>
      (money || !MONEY_PERMISSIONS.includes(permission)) && (stock || permission !== "inventory:write"),
  );
}

export function canUseApiAs(profile: StaffCapabilityProfile, permission: Permission) {
  return effectivePermissions(profile).includes(permission);
}

/** Modul yang tampil untuk akun ini — POS disembunyikan untuk non-kasir. */
export function modulesForProfile(profile: StaffCapabilityProfile): ModuleId[] {
  const modules = modulesForRole(profile.role);
  // Akun kurir (Waiter + workstation "kurir"): modul Kurir menggantikan layar meja.
  if (profile.role === "Waiter") {
    const courier = (profile.workstation ?? "").trim().toLowerCase() === "kurir";
    return courier
      ? ["courier", ...modules.filter((moduleId) => moduleId !== "waiter" && moduleId !== "courier")]
      : modules.filter((moduleId) => moduleId !== "courier");
  }
  if (profile.role === "Kasir" && !canHandleMoney(profile)) {
    return modules.filter((moduleId) => moduleId !== "pos");
  }
  return modules;
}

export function canAccessModuleAs(profile: StaffCapabilityProfile, moduleId: ModuleId) {
  return modulesForProfile(profile).includes(moduleId);
}
