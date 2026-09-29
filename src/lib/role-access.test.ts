import { describe, it, expect } from "vitest";

import type { Role } from "@/lib/garage-data";
import {
  canAccessModule,
  canUseApi,
  modulesForRole,
  permissionsForRole,
  firstModuleForRole,
  homeModuleFor,
  rolePermissions,
} from "@/lib/role-access";

// =============================================================================
// Audit Fungsional GARAGE OS — lapisan SECURITY & PERMISSION (STEP: security).
// Mengunci matriks akses role sesuai mandat: setiap perubahan policy yang tak
// sengaja membocorkan modul sensitif (finance/earnings/owner control) akan
// langsung gagal di sini. Pure-logic (tanpa DB/server) → cepat & deterministik.
//
// 4 role: Owner, Manajer, Kasir, Waiter.
// =============================================================================

const ALL_ROLES = Object.keys(rolePermissions) as Role[];

describe("role-access: invariants", () => {
  it("setiap role punya minimal satu modul & satu permission", () => {
    for (const role of ALL_ROLES) {
      expect(modulesForRole(role).length, `${role} modules`).toBeGreaterThan(0);
      expect(permissionsForRole(role).length, `${role} permissions`).toBeGreaterThan(0);
    }
  });

  it("firstModuleForRole konsisten dengan modul yang dimiliki role", () => {
    for (const role of ALL_ROLES) {
      expect(modulesForRole(role)).toContain(firstModuleForRole(role));
    }
  });

  it("homeModuleFor: stasiun produksi langsung ke Production, kasir biasa ke POS", () => {
    for (const ws of ["bar", "dapur", "helper_bar", "helper_dapur", "helper_all"]) {
      expect(homeModuleFor("Kasir", ws), ws).toBe("kitchen");
      expect(canAccessModule("Kasir", homeModuleFor("Kasir", ws))).toBe(true);
    }
    expect(homeModuleFor("Kasir", null)).toBe("pos");
    expect(homeModuleFor("Kasir", "all")).toBe("pos");
    expect(homeModuleFor("Waiter", "bar")).toBe("waiter");
    expect(homeModuleFor("Owner", "dapur")).toBe("dashboard");
  });

  it("chat & training tersedia untuk semua role internal", () => {
    for (const role of ALL_ROLES) {
      expect(canUseApi(role, "chat:use"), `${role} chat:use`).toBe(true);
      expect(canAccessModule(role, "chat"), `${role} chat module`).toBe(true);
      expect(canAccessModule(role, "training"), `${role} training module`).toBe(true);
    }
  });
});

describe("role-access: Owner punya akses penuh", () => {
  it("Owner memegang semua permission & modul monitoring", () => {
    const owner: Role = "Owner";
    for (const p of [
      "dashboard:read",
      "finance:read",
      "earnings:read",
      "company:manage",
      "staff:manage",
      "audit:read",
      "ai:manage",
    ] as const) {
      expect(canUseApi(owner, p), `owner ${p}`).toBe(true);
    }
    for (const m of [
      "dashboard",
      "pos",
      "kitchen",
      "waiter",
      "inventory",
      "finance",
      "earnings",
      "audit",
      "company-control",
      "team-management",
    ] as const) {
      expect(canAccessModule(owner, m), `owner module ${m}`).toBe(true);
    }
  });
});

describe("role-access: isolasi modul sensitif (mandat keamanan)", () => {
  // Kasir sekarang juga pegang KDS dapur/bar & gudang, tapi TETAP tidak boleh
  // lihat dashboard owner / finance / company control / audit / kelola staff.
  it("Kasir tidak bisa akses dashboard owner, finance, company, audit", () => {
    expect(canAccessModule("Kasir", "dashboard")).toBe(false);
    expect(canAccessModule("Kasir", "finance")).toBe(false);
    expect(canAccessModule("Kasir", "company-control")).toBe(false);
    expect(canAccessModule("Kasir", "audit")).toBe(false);
    expect(canUseApi("Kasir", "finance:read")).toBe(false);
    expect(canUseApi("Kasir", "company:manage")).toBe(false);
    expect(canUseApi("Kasir", "staff:manage")).toBe(false);
  });

  it("Kasir bisa akses KDS dapur/bar dan inventory (tugas Barista/Koki/Gudang lama)", () => {
    expect(canUseApi("Kasir", "kitchen:read")).toBe(true);
    expect(canUseApi("Kasir", "kitchen:write")).toBe(true);
    expect(canUseApi("Kasir", "inventory:read")).toBe(true);
    expect(canUseApi("Kasir", "inventory:write")).toBe(true);
    expect(canAccessModule("Kasir", "kitchen")).toBe(true);
    expect(canAccessModule("Kasir", "inventory")).toBe(true);
  });

  // Waiter: pelayanan meja + delivery. Tanpa finance / cash / company / audit / kitchen.
  it("Waiter tidak bisa akses data sensitif (finance/company/audit/cash/kitchen)", () => {
    const role: Role = "Waiter";
    expect(canUseApi(role, "finance:read"), `${role} finance:read`).toBe(false);
    expect(canUseApi(role, "shift:cash"), `${role} shift:cash`).toBe(false);
    expect(canUseApi(role, "company:manage"), `${role} company:manage`).toBe(false);
    expect(canUseApi(role, "kitchen:write"), `${role} kitchen:write`).toBe(false);
    expect(canAccessModule(role, "finance"), `${role} finance module`).toBe(false);
    expect(canAccessModule(role, "audit"), `${role} audit module`).toBe(false);
    expect(canAccessModule(role, "company-control"), `${role} company module`).toBe(false);
    expect(canAccessModule(role, "pos"), `${role} pos module`).toBe(false);
  });

  // Manajer: hampir setara Owner (POS, KDS, inventory, finance, approval,
  // payroll), TAPI tidak boleh ubah sistem owner (company:manage/ai:manage).
  it("Manajer punya akses operasional & finance luas, TAPI tidak company:manage/ai:manage", () => {
    const mgr: Role = "Manajer";
    expect(canUseApi(mgr, "dashboard:read")).toBe(true);
    expect(canUseApi(mgr, "finance:read")).toBe(true);
    expect(canUseApi(mgr, "finance:write")).toBe(true);
    expect(canUseApi(mgr, "earnings:read")).toBe(true);
    expect(canUseApi(mgr, "staff:manage")).toBe(true);
    expect(canUseApi(mgr, "audit:read")).toBe(true);
    expect(canAccessModule(mgr, "finance")).toBe(true);
    expect(canAccessModule(mgr, "earnings")).toBe(true);
    expect(canAccessModule(mgr, "team-management")).toBe(true);
    // Setting sistem inti tetap Owner-only:
    expect(canUseApi(mgr, "company:manage")).toBe(false);
    expect(canUseApi(mgr, "ai:manage")).toBe(false);
    expect(canAccessModule(mgr, "company-control")).toBe(false);
  });
});

describe("role-access: konsistensi modul ↔ permission data", () => {
  // Modul yang menampilkan data harus disertai permission baca-nya, kalau tidak
  // sidebar memunculkan modul yang isinya 403 (modul "putus").
  const MODULE_READ_PERMISSION = {
    pos: "pos:use",
    kitchen: "kitchen:read",
    inventory: "inventory:read",
    crm: "crm:read",
    approvals: "approvals:read",
    audit: "audit:read",
    "team-management": "staff:manage",
    finance: "finance:read",
    earnings: "earnings:read",
  } as const;

  for (const [moduleId, perm] of Object.entries(MODULE_READ_PERMISSION)) {
    it(`role yang punya modul "${moduleId}" juga punya ${perm}`, () => {
      for (const role of ALL_ROLES) {
        if (canAccessModule(role, moduleId as never)) {
          expect(canUseApi(role, perm as never), `${role} → ${moduleId}`).toBe(true);
        }
      }
    });
  }

});
