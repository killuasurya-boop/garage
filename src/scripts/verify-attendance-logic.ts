/**
 * Verifikasi fungsi murni lib/attendance.ts tanpa menyentuh DB.
 * Jalankan: npx tsx src/scripts/verify-attendance-logic.ts
 */
import {
  hashPin,
  pinHashEquals,
  haversineMeters,
  jakartaDateKey,
  jakartaMinutesOfDay,
  parseClockMinutes,
  evaluatePunchStatus,
  computeWorkedStats,
  formatWorkedHours,
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
} from "../lib/attendance";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\n[1] PIN hashing");
const h1 = hashPin("1234");
const h2 = hashPin("1234");
const h3 = hashPin("1235");
check("deterministik (PIN sama -> hash sama)", h1 === h2);
check("PIN beda -> hash beda", h1 !== h3);
check("panjang hash 64 hex (sha256)", /^[0-9a-f]{64}$/.test(h1));
check("pinHashEquals true utk sama", pinHashEquals(h1, h2));
check("pinHashEquals false utk beda", !pinHashEquals(h1, h3));

console.log("\n[2] Timezone WIB");
// 2026-05-31T19:00:00Z = 2026-06-01 02:00 WIB -> hari sudah ganti ke 06-01
const lateNight = new Date("2026-05-31T19:00:00Z");
check("hari ganti setelah 17:00 WIB", jakartaDateKey(lateNight) === "2026-06-01", jakartaDateKey(lateNight));
// 2026-05-31T10:00:00Z = 17:00 WIB -> masih 05-31
const daytime = new Date("2026-05-31T10:00:00Z");
check("siang WIB tetap tanggal sama", jakartaDateKey(daytime) === "2026-05-31", jakartaDateKey(daytime));
check("jakartaMinutesOfDay 17:00", jakartaMinutesOfDay(daytime) === 17 * 60, String(jakartaMinutesOfDay(daytime)));
check("parseClockMinutes 08:30 -> 510", parseClockMinutes("08:30") === 510);
check("parseClockMinutes invalid -> null", parseClockMinutes("99:99") === null);

console.log("\n[3] Geofence haversine");
// ~111m per 0.001 derajat latitude
const d = haversineMeters(-6.2000, 106.8000, -6.2010, 106.8000);
check("≈111m utk 0.001° lat", Math.abs(d - 111) < 5, `${Math.round(d)}m`);
check("jarak 0 utk titik sama", haversineMeters(-6.2, 106.8, -6.2, 106.8) === 0);

console.log("\n[4] Shift compliance");
// shift mulai 08:00, grace 10m. punch 08:05 WIB = 01:05Z -> on_time
const inOnTime = new Date("2026-05-31T01:05:00Z");
check(
  "Clock In 08:05 (grace) -> on_time",
  evaluatePunchStatus({ action: "in", punchAt: inOnTime, startTime: "08:00", endTime: "16:00" }) === "on_time",
);
// punch 08:15 WIB = 01:15Z -> late
const inLate = new Date("2026-05-31T01:15:00Z");
check(
  "Clock In 08:15 -> late",
  evaluatePunchStatus({ action: "in", punchAt: inLate, startTime: "08:00", endTime: "16:00" }) === "late",
);
// out 15:40 WIB = 08:40Z, end 16:00 grace 10m -> sebelum 15:50 -> early_leave
const outEarly = new Date("2026-05-31T08:40:00Z");
check(
  "Clock Out 15:40 -> early_leave",
  evaluatePunchStatus({ action: "out", punchAt: outEarly, startTime: "08:00", endTime: "16:00" }) === "early_leave",
);
// out 16:00 WIB = 09:00Z -> on_time
const outOk = new Date("2026-05-31T09:00:00Z");
check(
  "Clock Out 16:00 -> on_time",
  evaluatePunchStatus({ action: "out", punchAt: outOk, startTime: "08:00", endTime: "16:00" }) === "on_time",
);
check(
  "tanpa jadwal -> normal",
  evaluatePunchStatus({ action: "in", punchAt: inLate, startTime: null, endTime: null }) === "normal",
);

console.log("\n[5] Jam kerja (pairing in/out)");
const stats = computeWorkedStats([
  // Hari 1: in 08:00, out 16:00 WIB -> 8 jam
  { action: "in", timestamp: new Date("2026-05-31T01:00:00Z"), status: "on_time" },
  { action: "out", timestamp: new Date("2026-05-31T09:00:00Z"), status: "on_time" },
  // Hari 2: in 09:00 WIB, lupa out -> unpaired, present
  { action: "in", timestamp: new Date("2026-06-01T02:00:00Z"), status: "late" },
]);
check("presentDays = 2", stats.presentDays === 2, String(stats.presentDays));
check("workedMinutes = 480 (8 jam)", stats.workedMinutes === 480, String(stats.workedMinutes));
check("lateCount = 1", stats.lateCount === 1, String(stats.lateCount));
check("unpairedCount = 1 (in tanpa out)", stats.unpairedCount === 1, String(stats.unpairedCount));
check("formatWorkedHours(480) = '8j 0m'", formatWorkedHours(480) === "8j 0m", formatWorkedHours(480));
check("formatWorkedHours(95) = '1j 35m'", formatWorkedHours(95) === "1j 35m", formatWorkedHours(95));

console.log("\n[6] Rate limit");
const key = "verify-test";
resetRateLimit(key);
check("awal: allowed", checkRateLimit(key).allowed);
for (let i = 0; i < 8; i++) recordFailedAttempt(key);
const locked = checkRateLimit(key);
check("setelah 8 gagal: locked", !locked.allowed, `retryAfter=${locked.retryAfterSec}`);
resetRateLimit(key);
check("setelah reset: allowed lagi", checkRateLimit(key).allowed);

console.log(`\nHasil: ${pass} lulus, ${fail} gagal.`);
process.exit(fail === 0 ? 0 : 1);
