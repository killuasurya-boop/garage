import { describe, expect, it } from "vitest";

import { buildRouterScript, dailyGuestWifiPassword, dailyWifiPassword, normalizeGuestPhone, routerSyncState, safeHotspotLoginUrl, wifiDateKey, wifiJoinQrPayload } from "@/lib/wifi-hotspot";

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

describe("QR sambung WiFi", () => {
  it("format standar tanpa password; karakter khusus di-escape", () => {
    expect(wifiJoinQrPayload("GARAGE Free WiFi")).toBe("WIFI:T:nopass;S:GARAGE Free WiFi;;");
    expect(wifiJoinQrPayload(' Garage;Kopi:"VIP",\\ ')).toBe('WIFI:T:nopass;S:Garage\\;Kopi\\:\\"VIP\\"\\,\\\\;;');
    expect(wifiJoinQrPayload("x")).not.toMatch(/P:/);
  });
});

describe("status sinkron router", () => {
  const now = new Date("2026-11-17T03:00:00Z"); // 10.00 WIB
  it("sinkron hari ini (WIB) = aman; kemarin / belum pernah + lewat 00.30 = peringatan", () => {
    expect(routerSyncState("2026-11-16T17:01:00Z", now)).toMatchObject({ syncedToday: true, late: false }); // 00.01 WIB 17 Nov
    expect(routerSyncState("2026-11-16T16:59:00Z", now)).toMatchObject({ syncedToday: false, late: true }); // 23.59 WIB 16 Nov
    expect(routerSyncState(null, now)).toMatchObject({ lastSync: null, syncedToday: false, late: true });
    // 00.10 WIB: belum lewat batas 00.30 → belum peringatan.
    expect(routerSyncState("2026-11-15T17:01:00Z", new Date("2026-11-16T17:10:00Z"))).toMatchObject({ syncedToday: false, late: false });
  });
});

describe("WiFi masuk cepat (tamu)", () => {
  it("password tamu harian beda dari member & berganti tiap hari", () => {
    const secret = "garage-secret-1234567890";
    const guest = dailyGuestWifiPassword(secret, "2026-11-18");
    expect(guest).toMatch(/^[a-z2-9]{10}$/);
    expect(guest).not.toBe(dailyWifiPassword(secret, "2026-11-18"));
    expect(dailyGuestWifiPassword(secret, "2026-11-19")).not.toBe(guest);
  });

  it("nomor WA: 08/62/+62 dinormalkan, selain itu ditolak", () => {
    expect(normalizeGuestPhone("0812-3456-7890")).toBe("081234567890");
    expect(normalizeGuestPhone("+62 812 3456 7890")).toBe("081234567890");
    expect(normalizeGuestPhone("6281234567890")).toBe("081234567890");
    expect(normalizeGuestPhone("021555123")).toBeNull();
    expect(normalizeGuestPhone("0812")).toBeNull();
  });

  it("skrip router: user tamu + batas sesi sendiri; bila dimatikan user tamu dinonaktifkan", () => {
    const withGuest = buildRouterScript({ password: "memberpass", sessionHours: 3, sharedUsers: 200, dateKey: "2026-11-18", guest: { password: "guestpass", sessionHours: 1 } });
    expect(withGuest).toContain('name="garage-member"');
    expect(withGuest).toContain('name="garage-guest"');
    expect(withGuest).toMatch(/profile set \[find name="garage-member"\] shared-users=200 session-timeout=3h/);
    expect(withGuest).toMatch(/profile set \[find name="garage-guest"\] shared-users=200 session-timeout=1h/);
    expect(withGuest).toContain('password="guestpass"');
    const noGuest = buildRouterScript({ password: "memberpass", sessionHours: 3, sharedUsers: 200, dateKey: "2026-11-18", guest: null });
    expect(noGuest).not.toContain('password="guestpass"');
    expect(noGuest).toMatch(/find name="garage-guest"\] disabled=yes/);
  });
});
