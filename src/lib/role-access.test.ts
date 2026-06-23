import { describe, it, expect } from "vitest";

import type { Role } from "@/lib/garage-data";
import {
  canAccessModule,
  canUseApi,
  modulesForRole,
  permissionsForRole,
  firstModuleForRole,
  rolePermissions,
} from "@/lib/role-access";

// =============================================================================
// Audit Fungsional GARAGE OS — lapisan SECURITY & PERMISSION (STEP: security).
// Mengunci matriks akses role sesuai mandat: setiap perubahan policy yang tak
// sengaja membocorkan modul sensitif (finance/earnings/owner control) akan
// langsung gagal di sini. Pure-logic (tanpa DB/server) → cepat & deterministik.
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

  it("chat & training tersedia untuk semua role internal", () => {
    for (const role of ALL_ROLES) {
      expect(canUseApi(role, "chat:use"), `${role} chat:use`).toBe(true);
      expect(canAccessModule(role, "chat"), `${role} chat module`).toBe(true);
      expect(canAccessModule(role, "training"), `${role} training module`).toBe(true);
    }
  });
});

describe("role-access: Owner punya akses penuh", () => {
  it("Owner / CEO memegang semua permission & modul monitoring", () => {
    const owner: Role = "Owner / CEO";
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
  // Kasir TIDAK boleh lihat dashboard owner / finance / earnings orang lain /
  // company control / audit.
  it("Kasir tidak bisa akses dashboard owner, finance, company, audit", () => {
    expect(canAccessModule("Kasir", "dashboard")).toBe(false);
    expect(canAccessModule("Kasir", "finance")).toBe(false);
    expect(canAccessModule("Kasir", "company-control")).toBe(false);
    expect(canAccessModule("Kasir", "audit")).toBe(false);
    expect(canUseApi("Kasir", "finance:read")).toBe(false);
    expect(canUseApi("Kasir", "company:manage")).toBe(false);
    expect(canUseApi("Kasir", "staff:manage")).toBe(false);
  });

  // Barista & Koki: hanya station dapur/bar + inventory baca. TANPA finance.
  it("Barista & Koki tidak bisa akses finance / POS / company", () => {
    for (const role of ["Barista", "Koki", "Asisten Koki", "Kitchen / Barista"] as Role[]) {
      expect(canUseApi(role, "finance:read"), `${role} finance:read`).toBe(false);
      expect(canUseApi(role, "pos:use"), `${role} pos:use`).toBe(false);
      expect(canUseApi(role, "company:manage"), `${role} company:manage`).toBe(false);
      expect(canAccessModule(role, "finance"), `${role} finance module`).toBe(false);
      expect(canAccessModule(role, "company-control"), `${role} company module`).toBe(false);
    }
  });

  // Waiter: pelayanan meja. Tanpa finance / cash / company / audit.
  it("Waiter tidak bisa akses data sensitif (finance/company/audit/cash)", () => {
    for (const role of ["Waiter 1", "Waiter 2"] as Role[]) {
      expect(canUseApi(role, "finance:read"), `${role} finance:read`).toBe(false);
      expect(canUseApi(role, "shift:cash"), `${role} shift:cash`).toBe(false);
      expect(canUseApi(role, "company:manage"), `${role} company:manage`).toBe(false);
      expect(canAccessModule(role, "finance"), `${role} finance module`).toBe(false);
      expect(canAccessModule(role, "audit"), `${role} audit module`).toBe(false);
      expect(canAccessModule(role, "company-control"), `${role} company module`).toBe(false);
    }
  });

  // Finance / CFO (Admin Finance pada mandat): boleh finance & earnings, TAPI
  // tidak boleh ubah sistem owner (company:manage) atau kelola staff.
  it("Finance / CFO tidak bisa ubah sistem owner atau kelola staff", () => {
    const fin: Role = "Finance / CFO";
    expect(canUseApi(fin, "finance:read")).toBe(true);
    expect(canUseApi(fin, "finance:write")).toBe(true);
    expect(canUseApi(fin, "company:manage")).toBe(false);
    expect(canUseApi(fin, "staff:manage")).toBe(false);
    expect(canUseApi(fin, "pos:use")).toBe(false);
    expect(canAccessModule(fin, "company-control")).toBe(false);
    expect(canAccessModule(fin, "team-management")).toBe(false);
  });

  // Manager: operasional + monitoring, TANPA kontrol perusahaan owner.
  it("Manager Operasional tidak memegang company:manage", () => {
    const mgr: Role = "Manager Operasional";
    expect(canUseApi(mgr, "company:manage")).toBe(false);
    expect(canAccessModule(mgr, "company-control")).toBe(false);
    expect(canUseApi(mgr, "dashboard:read")).toBe(true);
  });

  // F-01 (keputusan owner): Finance & Earnings disembunyikan dari Manager —
  // operasional murni. Modul tak boleh muncul tanpa permission baca.
  it("Manager Operasional tidak melihat modul Finance & Earnings", () => {
    const mgr: Role = "Manager Operasional";
    expect(canAccessModule(mgr, "finance")).toBe(false);
    expect(canAccessModule(mgr, "earnings")).toBe(false);
    expect(canUseApi(mgr, "finance:read")).toBe(false);
    expect(canUseApi(mgr, "earnings:read")).toBe(false);
  });

  // Gudang: hanya inventory.
  it("Gudang hanya akses inventory (tanpa pos/finance/kitchen-write umum)", () => {
    expect(canUseApi("Gudang", "inventory:read")).toBe(true);
    expect(canUseApi("Gudang", "inventory:write")).toBe(true);
    expect(canUseApi("Gudang", "finance:read")).toBe(false);
    expect(canUseApi("Gudang", "pos:use")).toBe(false);
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
    // Setelah F-01 diselesaikan, finance & earnings juga konsisten:
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
