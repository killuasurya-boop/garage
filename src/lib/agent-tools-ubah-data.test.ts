import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { matchApiRoute, ubahDataBlockReason } from "@/lib/agent-tools-ubah-data";
import { API_ROUTE_CATALOG } from "@/lib/api-route-catalog.generated";
import { scanApiRoutes } from "@/lib/api-route-scan";
import { isSecretKey, redactSecrets } from "@/lib/mcp-delegated-api";

/* eslint-disable @typescript-eslint/no-explicit-any */
describe("katalog endpoint & blokir ubah_data_garage", () => {
  it("katalog hasil generate sinkron dengan src/app/api (jalankan scripts/generate-api-catalog.ts bila gagal)", () => {
    expect(API_ROUTE_CATALOG).toEqual(scanApiRoutes(join(process.cwd(), "src/app/api")));
  });

  it("path biasa boleh; R3/R4 & rahasia ditolak", () => {
    for (const path of ["/api/menu", "/api/menu/itm-1", "/api/settings", "/api/promos", "/api/tables/config"]) {
      expect(ubahDataBlockReason(path), path).toBeNull();
    }
    for (const path of [
      "/api/auth/sign-in",
      "/api/agent-keys",
      "/api/admin/users/u1",
      "/api/admin/security/force-logout-all",
      "/api/account/pin",
      "/api/payroll/employees/E1/reset-pin",
      "/api/approvals/a1/pin",
      "/api/finance/closing/daily",
      "/api/control/cash-opening",
      "/api/marketing/publishing/p1/publish",
      "/api/products/bulk",
      "/api/menu/import",
      "/api/wms/master-import",
      "/api/mcp/chatgpt",
      "/api/cron/x",
      "/api/../etc",
    ]) {
      expect(ubahDataBlockReason(path), path).not.toBeNull();
    }
  });

  it("path nyata dicocokkan ke template route", () => {
    expect(matchApiRoute("/api/menu")?.path).toBe("/api/menu");
    expect(matchApiRoute("/api/orders/abc-123/delete")?.path).toBe("/api/orders/{id}/delete");
    expect(matchApiRoute("/api/tidak-ada")).toBeNull();
  });
});

describe("kredensial tidak pernah keluar ke chat", () => {
  it("PIN/password/token di respons route diganti, data lain tetap", () => {
    const out = redactSecrets({ data: { code: "E07", pin: "4821", name: "Rangga", shipping: 5, staff: [{ approvalPin: "1111", newPassword: "x" }], accessToken: "t" } }) as any;
    expect(out.data.code).toBe("E07");
    expect(out.data.name).toBe("Rangga");
    expect(out.data.shipping).toBe(5);
    expect(out.data.pin).not.toBe("4821");
    expect(out.data.staff[0].approvalPin).not.toBe("1111");
    expect(out.data.staff[0].newPassword).not.toBe("x");
    expect(out.accessToken ?? out.data.accessToken).not.toBe("t");
  });

  it("nama field kredensial dikenali tanpa salah tangkap", () => {
    for (const key of ["pin", "pinCode", "pin_code", "approvalPin", "password", "newPassword", "clientSecret", "refresh_token", "otp", "backupCodes"]) {
      expect(isSecretKey(key), key).toBe(true);
    }
    for (const key of ["code", "shipping", "opinion", "name", "pinned", "tokenCount"]) {
      expect(isSecretKey(key), key).toBe(false);
    }
  });
});
