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

    it('should Owner / CEO have all modules', () => {
      const ownerMods = roleModules['Owner / CEO'] as string[];
      const definedIds = modules.map((m) => m.id);
      // Role modules + auto-injected chat & training
      for (const modId of [...definedIds, 'chat', 'training']) {
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

    it('should Owner / CEO have maximum permissions', () => {
      const ownerPerms = rolePermissions['Owner / CEO'];
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

    it('should Admin not have ai:manage or company:manage', () => {
      const adminPerms = rolePermissions['Admin'];
      expect(adminPerms).not.toContain('ai:manage');
      expect(adminPerms).not.toContain('company:manage');
    });
  });

  describe('canAccessModule', () => {
    it('should return true for modules a role has access to', () => {
      expect(canAccessModule('Owner / CEO', 'dashboard')).toBe(true);
      expect(canAccessModule('Owner / CEO', 'pos')).toBe(true);
      expect(canAccessModule('Owner / CEO', 'inventory')).toBe(true);
    });

    it('should return false for modules a role does NOT have', () => {
      // Kasir only has pos, earnings, and auto-injected modules
      expect(canAccessModule('Kasir', 'finance')).toBe(false);
      expect(canAccessModule('Kasir', 'inventory')).toBe(false);
      expect(canAccessModule('Kasir', 'audit')).toBe(false);
    });

    it('should return true for auto-injected chat and training', () => {
      expect(canAccessModule('Kasir', 'chat')).toBe(true);
      expect(canAccessModule('Kasir', 'training')).toBe(true);
      expect(canAccessModule('Barista', 'chat')).toBe(true);
      expect(canAccessModule('Barista', 'training')).toBe(true);
    });
  });

  describe('canUseApi', () => {
    it('should return true for permissions the role has', () => {
      expect(canUseApi('Owner / CEO', 'dashboard:read')).toBe(true);
      expect(canUseApi('Owner / CEO', 'pos:use')).toBe(true);
      expect(canUseApi('Owner / CEO', 'finance:write')).toBe(true);
    });

    it('should return false for permissions the role does NOT have', () => {
      expect(canUseApi('Kasir', 'finance:write')).toBe(false);
      expect(canUseApi('Barista', 'finance:read')).toBe(false);
      expect(canUseApi('Gudang', 'pos:use')).toBe(false);
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
      // Dashboard should be first for owner, admin, manager
      expect(firstModuleForRole('Owner / CEO')).toBe('dashboard');
      expect(firstModuleForRole('Admin')).toBe('dashboard');
      expect(firstModuleForRole('Manager Operasional')).toBe('dashboard');
      // Kasir first module should be pos
      expect(firstModuleForRole('Kasir')).toBe('pos');
      // Barista first module should be kitchen
      expect(firstModuleForRole('Barista')).toBe('kitchen');
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
