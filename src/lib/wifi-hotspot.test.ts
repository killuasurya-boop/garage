import { describe, expect, it } from "vitest";

import { buildRouterScript, dailyWifiPassword, safeHotspotLoginUrl, wifiDateKey } from "@/lib/wifi-hotspot";

describe("wifi hotspot", () => {
  it("password harian deterministik per tanggal WIB & berbeda tiap hari", () => {
    const secret = "garage-secret-1234567890";
    const a = dailyWifiPassword(secret, "2026-10-18");
    expect(a).toMatch(/^[a-z2-9]{10}$/);
    expect(dailyWifiPassword(secret, "2026-10-18")).toBe(a);
    expect(dailyWifiPassword(secret, "2026-10-19")).not.toBe(a);
    expect(dailyWifiPassword("secret-lain-1234567890", "2026-10-18")).not.toBe(a);
    // 23:30 UTC 18 Okt = 06:30 WIB 19 Okt.
    expect(wifiDateKey(new Date("2026-10-18T23:30:00Z"))).toBe("2026-10-19");
  });

  it("skrip RouterOS memuat user/profile, batas sesi, dan meng-escape nilai", () => {
    const script = buildRouterScript({ password: 'abc"; /system reset', sessionHours: 3, sharedUsers: 200, dateKey: "2026-10-18" });
    expect(script).toContain('name="garage-member"');
    expect(script).toContain("session-timeout=3h");
    expect(script).toContain("shared-users=200");
    expect(script).toContain('password="abc system reset"');
    expect(script).not.toContain('";');
  });

  it("alamat login hanya router lokal / host yang diizinkan", () => {
    expect(safeHotspotLoginUrl("http://10.5.50.1/login?x=1")).toBe("http://10.5.50.1/login");
    expect(safeHotspotLoginUrl("http://192.168.88.1/login")).toBe("http://192.168.88.1/login");
    expect(safeHotspotLoginUrl("https://evil.example.com/login")).toBeNull();
    expect(safeHotspotLoginUrl("javascript:alert(1)")).toBeNull();
    expect(safeHotspotLoginUrl("http://wifi.garage/login", "wifi.garage")).toBe("http://wifi.garage/login");
    expect(safeHotspotLoginUrl(null)).toBeNull();
  });
});
