import { describe, it, expect } from 'vitest';
import { modules, headlineMetrics } from '@/lib/garage-data';
import {
  canAccessModule,
  modulesForRole,
  canUseApi,
  firstModuleForRole,
  roleModules,
  rolePermissions,
} from '@/lib/role-access';

describe('Garage OS Data Layer', () => {
  describe('modules', () => {
    it('should have at least 15 modules defined', () => {
      expect(modules.length).toBeGreaterThanOrEqual(15);
    });

    it('should have unique module IDs', () => {
      const ids = modules.map((m) => m.id);
      const uniqueIds = [...new Set(ids)];
      expect(ids.length).toBe(uniqueIds.length);
    });

    it('should have no duplicate module IDs', () => {
      const seen = new Set<string>();
      for (const mod of modules) {
        expect(seen.has(mod.id)).toBe(false);
        seen.add(mod.id);
      }
    });

    it('should all modules have label and description', () => {
      for (const mod of modules) {
        expect(mod.label.trim()).toBeTruthy();
        expect(mod.description.trim()).toBeTruthy();
      }
    });
  });

  describe('roleModules', () => {
    it('should cover all defined modules per role', () => {
      for (const [role, roleMods] of Object.entries(roleModules)) {
        const definedIds = modules.map((m) => m.id);
        for (const modId of roleMods) {
          expect(definedIds, `Module "${modId}" not found in modules[] for role "${role}"`).toContain(modId);
        }
      }
    });

    it('should include "chat" and "training" for all roles', () => {
      for (const [role, roleMods] of Object.entries(roleModules)) {
        expect(roleMods, `Role "${role}" missing "chat"`).toContain('chat');
        expect(roleMods, `Role "${role}" missing "training"`).toContain('training');
      }
    });

    it('should Owner have all modules (except staff-only Payroll V2)', () => {
      const ownerMods = roleModules['Owner'] as string[];
      const definedIds = modules.map((m) => m.id);
      // Payroll V2: absensi & wallet staff-only — Owner tidak absen (design doc).
      const staffOnly = new Set(['absensi-v2', 'wallet-gaji', 'wallet-fee']);
      for (const modId of [...definedIds, 'chat', 'training']) {
        if (staffOnly.has(modId)) continue;
        expect(ownerMods).toContain(modId);
      }
    });
  });

  describe('rolePermissions', () => {
    it('should have permissions for all roles that have modules', () => {
      for (const role of Object.keys(roleModules) as Array<keyof typeof rolePermissions>) {
        expect(rolePermissions[role]).toBeDefined();
        expect(Array.isArray(rolePermissions[role])).toBe(true);
        expect(rolePermissions[role].length).toBeGreaterThan(0);
      }
    });

    it('should Owner have maximum permissions', () => {
      const ownerPerms = rolePermissions['Owner'];
      const kioskPerms = rolePermissions['Kasir'];
      // Owner should have more permissions than Kasir
      expect(ownerPerms.length).toBeGreaterThan(kioskPerms.length);
    });

    it('should "chat:use" be in all roles', () => {
      for (const [role, perms] of Object.entries(rolePermissions)) {
        expect(perms, `Role "${role}" missing "chat:use"`).toContain('chat:use');
      }
    });

    it('should Kasir not have company:manage permission', () => {
      const kasirPerms = rolePermissions['Kasir'];
      expect(kasirPerms).not.toContain('company:manage');
      expect(kasirPerms).not.toContain('company:read');
    });

    it('should Manajer not have ai:manage or company:manage', () => {
      const managerPerms = rolePermissions['Manajer'];
      expect(managerPerms).not.toContain('ai:manage');
      expect(managerPerms).not.toContain('company:manage');
    });
  });

  describe('canAccessModule', () => {
    it('should return true for modules a role has access to', () => {
      expect(canAccessModule('Owner', 'dashboard')).toBe(true);
      expect(canAccessModule('Owner', 'pos')).toBe(true);
      expect(canAccessModule('Owner', 'inventory')).toBe(true);
    });

    it('should return false for modules a role does NOT have', () => {
      // Kasir has pos, kitchen, inventory (absorbs Barista/Koki/Gudang), earnings,
      // and auto-injected modules — but NOT finance/audit.
      expect(canAccessModule('Kasir', 'finance')).toBe(false);
      expect(canAccessModule('Kasir', 'audit')).toBe(false);
      expect(canAccessModule('Waiter', 'finance')).toBe(false);
      expect(canAccessModule('Waiter', 'pos')).toBe(false);
    });

    it('should return true for auto-injected chat and training', () => {
      expect(canAccessModule('Kasir', 'chat')).toBe(true);
      expect(canAccessModule('Kasir', 'training')).toBe(true);
      expect(canAccessModule('Waiter', 'chat')).toBe(true);
      expect(canAccessModule('Waiter', 'training')).toBe(true);
    });
  });

  describe('canUseApi', () => {
    it('should return true for permissions the role has', () => {
      expect(canUseApi('Owner', 'dashboard:read')).toBe(true);
      expect(canUseApi('Owner', 'pos:use')).toBe(true);
      expect(canUseApi('Owner', 'finance:write')).toBe(true);
    });

    it('should return false for permissions the role does NOT have', () => {
      expect(canUseApi('Kasir', 'finance:write')).toBe(false);
      expect(canUseApi('Kasir', 'finance:read')).toBe(false);
      expect(canUseApi('Waiter', 'kitchen:write')).toBe(false);
    });
  });

  describe('modulesForRole', () => {
    it('should return non-empty array for all roles', () => {
      for (const role of Object.keys(roleModules)) {
        const mods = modulesForRole(role as keyof typeof roleModules);
        expect(mods.length).toBeGreaterThan(0);
      }
    });

    it('should return correct first module for each role', () => {
      // Dashboard owner hanya untuk Owner & Manajer.
      expect(firstModuleForRole('Owner')).toBe('dashboard');
      expect(firstModuleForRole('Manajer')).toBe('dashboard');
      // Kasir first module should be pos
      expect(firstModuleForRole('Kasir')).toBe('pos');
      // Waiter first module should be waiter
      expect(firstModuleForRole('Waiter')).toBe('waiter');
    });
  });

  describe('headlineMetrics', () => {
    it('should have at least 4 headline metrics', () => {
      expect(headlineMetrics.length).toBeGreaterThanOrEqual(4);
    });

    it('should all have label, value, delta, tone, and icon', () => {
      for (const metric of headlineMetrics) {
        expect(metric.label).toBeTruthy();
        expect(metric.value).toBeTruthy();
        expect(metric.delta).toBeTruthy();
        expect(metric.tone).toMatch(/^(good|warn|risk|watch)$/);
        expect(metric.icon).toBeDefined();
      }
    });
  });
});
