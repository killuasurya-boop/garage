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
  "Owner / CEO": ownerPermissions,
  Admin: ownerPermissions.filter(
    (permission) =>
      permission !== "ai:manage" &&
      permission !== "staff:manage" &&
      permission !== "company:read" &&
      permission !== "company:manage",
  ),
  "Manager Operasional": [
    "dashboard:read",
    "pos:use",
    "orders:read",
    "orders:manage",
    "kitchen:read",
    "kitchen:write",
    "inventory:read",
    "inventory:write",
    "finance:read",
    "crm:read",
    "crm:write",
    "marketing:read",
    "marketing:write",
    "approvals:read",
    "approvals:decide",
    "audit:read",
    "ai:use",
    "tables:read",
    "tables:write",
    "print:read",
    "print:write",
    "shift:cash",
    "shift:handover",
  ],
  "Finance / CFO": [
    "dashboard:read",
    "orders:read",
    "finance:read",
    "finance:write",
    "approvals:read",
    "audit:read",
    "ai:use",
    "print:read",
    "earnings:read",
    "earnings:manage",
  ],
  Kasir: [
    "pos:use",
    "orders:read",
    "orders:manage",
    "ai:use",
    "tables:read",
    "tables:write",
    "print:read",
    "print:write",
    "shift:cash",
    "earnings:read",
  ],
  Barista: ["kitchen:read", "kitchen:write", "inventory:read", "ai:use", "earnings:read"],
  Koki: ["kitchen:read", "kitchen:write", "inventory:read", "ai:use", "earnings:read"],
  "Asisten Koki": ["kitchen:read", "kitchen:write", "inventory:read", "ai:use", "earnings:read"],
  "Waiter 1": [
    "pos:use",
    "orders:read",
    "orders:manage",
    "tables:read",
    "tables:write",
    "ai:use",
    "earnings:read",
  ],
  "Waiter 2": [
    "pos:use",
    "orders:read",
    "orders:manage",
    "tables:read",
    "tables:write",
    "ai:use",
    "earnings:read",
  ],
  "Kitchen / Barista": ["kitchen:read", "kitchen:write", "inventory:read", "ai:use", "earnings:read"],
  Gudang: ["inventory:read", "inventory:write", "ai:use"],
  "Supervisor Shift": [
    "dashboard:read",
    "pos:use",
    "orders:read",
    "orders:manage",
    "kitchen:read",
    "kitchen:write",
    "inventory:read",
    "inventory:write",
    "approvals:read",
    "approvals:decide",
    "tables:read",
    "tables:write",
    "print:read",
    "print:write",
    "shift:cash",
    "shift:handover",
    "ai:use",
  ],
  "Delivery Admin": ["orders:read", "orders:manage", "ai:use"],
};

export const roleModules: Record<Role, ModuleId[]> = {
  "Owner / CEO": [
    "dashboard",
    "pos",
    "ai-agent",
    "kitchen",
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
    "settings",
  ],
  Admin: [
    "dashboard",
    "pos",
    "ai-agent",
    "kitchen",
    "inventory",
    "finance",
    "crm",
    "membership",
    "marketing",
    "approvals",
    "website",
    "earnings",
    "audit",
    "settings",
  ],
  "Manager Operasional": [
    "dashboard",
    "pos",
    "ai-agent",
    "kitchen",
    "inventory",
    "finance",
    "crm",
    "membership",
    "marketing",
    "approvals",
    "earnings",
    "audit",
    "settings",
  ],
  "Finance / CFO": ["dashboard", "ai-agent", "finance", "earnings", "approvals", "audit"],
  Kasir: ["pos", "earnings"],
  Barista: ["kitchen", "inventory", "earnings", "ai-agent"],
  Koki: ["kitchen", "inventory", "earnings", "ai-agent"],
  "Asisten Koki": ["kitchen", "inventory", "earnings", "ai-agent"],
  "Waiter 1": ["pos", "earnings", "ai-agent"],
  "Waiter 2": ["pos", "earnings", "ai-agent"],
  "Kitchen / Barista": ["kitchen", "inventory", "earnings", "ai-agent"],
  Gudang: ["inventory", "ai-agent"],
  "Supervisor Shift": [
    "dashboard",
    "pos",
    "ai-agent",
    "kitchen",
    "inventory",
    "approvals",
  ],
  "Delivery Admin": ["ai-agent"],
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
}

// Smart Notification Center — semua role yang punya station kerja real-time
// butuh akses. Owner/Admin/Manager untuk konfigurasi, kasir/dapur/bar/waiter
// untuk monitor trigger di station mereka.
const SMART_NOTIF_ROLES: Role[] = [
  "Owner / CEO",
  "Admin",
  "Manager Operasional",
  "Supervisor Shift",
  "Kasir",
  "Barista",
  "Koki",
  "Asisten Koki",
  "Waiter 1",
  "Waiter 2",
  "Kitchen / Barista",
  "Gudang",
];
for (const role of SMART_NOTIF_ROLES) {
  if (roleModules[role] && !roleModules[role].includes("smart-notif")) {
    roleModules[role].push("smart-notif");
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
