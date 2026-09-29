#!/usr/bin/env node
// Buat .env.production untuk VPS dari .env.local (rahasia lama dipertahankan
// agar PIN absen, 2FA, dan data terenkripsi tetap valid), lalu kirim ke VPS lewat
// scp. Jalankan di laptop:  node scripts/make-env-production.mjs root@IP_VPS [domain]
// Tidak mencetak nilai rahasia. Password Postgres & secret tambahan dibuat baru.

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const target = process.argv[2];
const domain = process.argv[3] ?? "garagecoffee.id";
if (!target) {
  console.error("Pemakaian: node scripts/make-env-production.mjs root@IP_VPS [domain]");
  process.exit(1);
}

const src = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_0-9]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      let v = l.slice(i + 1).trim();
      if (/^".*"$/.test(v)) v = v.slice(1, -1);
      return [l.slice(0, i), v];
    }),
);
const rnd = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");

// Dipertahankan dari .env.local (data lama bergantung padanya).
const carry = [
  "BETTER_AUTH_SECRET",
  "AI_CONFIG_ENCRYPTION_KEY",
  "ATTENDANCE_PIN_PEPPER",
  "CRON_SECRET",
  "GARAGE_JOB_SECRET",
  "PAYROLL_V2_ENABLED",
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_GARAGE_VECTOR_STORE_ID",
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_MODEL_ID",
  "ELEVENLABS_VOICE_ID",
  "ELEVENLABS_TTS_ENABLED",
  "EDGE_TTS_ENABLED",
  "EDGE_TTS_PITCH",
  "EDGE_TTS_RATE",
  "EDGE_TTS_VOICE",
  "GARAGE_SMART_VOICE_ENABLED",
];

const pgPassword = rnd(18);
const lines = [
  `GARAGE_DOMAIN=${domain}`,
  "POSTGRES_USER=garage",
  `POSTGRES_PASSWORD=${pgPassword}`,
  "POSTGRES_DB=garage",
  `DATABASE_URL=postgresql://garage:${pgPassword}@db:5432/garage`,
  "DATABASE_SSL=false",
  "GARAGE_DB_DRIVER=postgres",
  `BETTER_AUTH_URL=https://${domain}`,
  `GARAGE_PUBLIC_BASE_URL=https://${domain}`,
  `NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL=https://${domain}`,
  "GARAGE_TRUSTED_ORIGINS=",
  "GARAGE_SESSION_EXPIRES_HOURS=24",
  "NEXT_PUBLIC_PRINT_AGENT_URL=http://localhost:9100",
  "GARAGE_SEED_DEMO=false",
  `GARAGE_SEED_PASSWORD=${rnd(18)}`,
  `GARAGE_MEMBER_SEED_PASSWORD=${rnd(18)}`,
  `MEMBER_AUTH_SECRET=${rnd(32)}`,
  `SOCIAL_PUBLISHER_ENCRYPTION_KEY=${rnd(32)}`,
  `GARAGE_POS_API_KEY=${rnd(32)}`,
  "SOCIAL_PUBLISHING_LIVE_ENABLED=false",
  "WHATSAPP_MESSAGING_LIVE_ENABLED=false",
  "MARKETING_SENDER_PROVIDER=simulation",
  "NODE_ENV=production",
  "GARAGE_BACKUP_DIR=/root/garage/backups",
];
const missing = [];
for (const key of carry) {
  if (src[key]) lines.push(`${key}=${src[key]}`);
  else missing.push(key);
}

const tmp = path.join(os.tmpdir(), `garage-env-${process.pid}`);
fs.writeFileSync(tmp, `${lines.join("\n")}\n`, { mode: 0o600 });
try {
  const res = spawnSync("scp", ["-q", tmp, `${target}:/root/garage/.env.production`], { stdio: "inherit" });
  if (res.status !== 0) process.exit(res.status ?? 1);
  spawnSync("ssh", [target, "chmod 600 /root/garage/.env.production"], { stdio: "inherit" });
} finally {
  fs.rmSync(tmp, { force: true });
}
console.log(`OK: .env.production terkirim ke ${target} (${lines.length - missing.length} nilai).`);
if (missing.length) console.log(`Tidak ada di .env.local, dilewati: ${missing.join(", ")}`);
