// Wrapper agar tool preview bisa menjalankan build standalone dengan env benar.
// next dev (Turbopack) nyangkut di loader pada proyek ini; verifikasi UI ber-auth
// dilakukan lewat standalone build. Port dikunci 3001 supaya cocok dengan
// BETTER_AUTH_URL (cookie host-only). .env.local dimuat via dotenv (strip quotes).
process.env.PORT = "3001";
process.env.HOSTNAME = process.env.HOSTNAME || "127.0.0.1";
require("dotenv").config({ path: ".env.local" });
require("path");
require(require("path").join(process.cwd(), ".next", "standalone", "server.js"));
