import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

const pilotTables = ["01", "25", "50"];
const mode = process.argv.includes("--rollout") ? "rollout" : "pilot";
const lanBaseUrl = (
  process.env.PILOT_LAN_URL ??
  process.env.GARAGE_PUBLIC_BASE_URL ??
  process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL ??
  process.env.BETTER_AUTH_URL ??
  "http://192.168.110.142:3001"
).replace(/\/+$/, "");

function appUrl(path: string) {
  return `${lanBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function section(title: string, rows: string[]) {
  console.log("");
  console.log(title);
  console.log("-".repeat(title.length));
  for (const row of rows) {
    console.log(row);
  }
}

function numbered(rows: string[]) {
  return rows.map((row, index) => `${index + 1}. ${row}`);
}

function printPilotGuide() {
  console.log("GARAGE QR PILOT UAT - 3 MEJA");
  console.log(`Target LAN: ${lanBaseUrl}`);

  section("Pre-shift wajib", numbered([
    "Jalankan npm.cmd run lint.",
    "Jalankan npm.cmd run build.",
    "Jalankan $env:SMOKE_BASE_URL=\"http://127.0.0.1:3001\"; npm.cmd run smoke.",
    "Jalankan npm.cmd run readiness:audit dan pastikan READINESS STATUS: GO.",
    `Buka ${appUrl("/order/qr-print?tables=01,25,50")}.`,
    "Print dan tempel QR hanya untuk meja 01, 25, 50.",
    "Brief kasir memakai docs/garage-qr-cashier-sop.md.",
  ]));

  section("URL pilot", [
    `Print pilot: ${appUrl("/order/qr-print?tables=01,25,50")}`,
    `POS kasir: ${appUrl("/pos")}`,
    ...pilotTables.map((table) => `Meja ${table}: ${appUrl(`/order?table=${table}&source=qr_table`)}`),
  ]);

  section("Skenario 1 shift", [
    "Meja 01: Guest order -> kasir Reject. Expected: tidak ada kitchen ticket, audit tercatat.",
    "Meja 25: Guest order -> kasir Accept. Expected: kitchen ticket terbentuk.",
    "Meja 50: Member order -> kasir Paid. Expected: kitchen ticket, payment, dan points member diproses.",
    "Semua order: invoice WhatsApp fallback wa.me tersedia.",
    "Panel QR Control: cek total QR, paid, SLA >3m, meja aktif, reject reason, dan repeat customer.",
    "Catat issue di docs/garage-production-readiness-audit.md dengan step, expected, actual, screenshot, severity.",
  ]);

  section("Gate setelah shift", [
    "GO full rollout: tidak ada P0/P1, kasir paham flow, kitchen ticket benar, invoice wa.me muncul.",
    "Conditional: hanya P2/P3; boleh lanjut terbatas sambil fix minor.",
    "No-Go: ada salah meja, payment salah, kitchen ticket dobel/hilang, atau customer/kasir terblokir.",
  ]);

  section("Jika GO", numbered([
    "Jalankan ulang npm.cmd run readiness:audit.",
    `Buka ${appUrl("/order/qr-print")}.`,
    "Print dan tempel QR meja 01-50.",
    "Pantau 1 shift pertama dari panel QR Orders di POS.",
  ]));
}

function printRolloutGuide() {
  console.log("GARAGE QR ROLLOUT - 50 MEJA");
  console.log(`Target LAN: ${lanBaseUrl}`);

  section("Syarat sebelum 50 meja", [
    "Pilot meja 01, 25, 50 selesai minimal 1 shift.",
    "Tidak ada issue P0/P1 yang masih open.",
    "Kasir bisa proses QR order kurang dari 15 detik.",
    "Reject tidak membuat kitchen ticket; Accept/Paid membuat ticket dengan benar.",
    "npm.cmd run readiness:audit menghasilkan READINESS STATUS: GO.",
  ]);

  section("URL rollout", [
    `Print semua QR: ${appUrl("/order/qr-print")}`,
    `POS kasir: ${appUrl("/pos")}`,
    "Audit issue log: docs/garage-production-readiness-audit.md",
    "SOP kasir: docs/garage-qr-cashier-sop.md",
  ]);

  section("Monitoring shift pertama", [
    "Kasir standby di panel QR Orders.",
    "Supervisor pantau QR Control: pending SLA, reject reason, top meja, repeat customer.",
    "Supervisor cek order meja acak: 01, 10, 25, 35, 50.",
    "Jika muncul P0/P1, hentikan QR meja terdampak dan perbaiki sebelum lanjut.",
  ]);
}

if (mode === "rollout") {
  printRolloutGuide();
} else {
  printPilotGuide();
}
