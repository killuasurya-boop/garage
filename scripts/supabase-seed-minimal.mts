// Seed minimal ke Supabase: 1 outlet + akun owner (Better Auth) untuk login pertama.
// Idempoten via ON CONFLICT — aman dijalankan berulang.
//
// Pakai:
//   DATABASE_URL='postgresql://...supabase.com:5432/postgres' \
//   OWNER_EMAIL='owner@garagecoffee.id' \
//   OWNER_NAME='Owner Garage' \
//   OWNER_PASSWORD='<PIN/password kuat>' \
//     npx tsx scripts/supabase-seed-minimal.mts

import pkg from "pg";
import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";
const { Client } = pkg;

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL kosong");
const email = process.env.OWNER_EMAIL ?? "owner@garagecoffee.id";
const name = process.env.OWNER_NAME ?? "Owner Garage";
const password = process.env.OWNER_PASSWORD;
if (!password) throw new Error("OWNER_PASSWORD kosong (jangan hardcode)");

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

// 1. Outlet
const outletCode = "TEBING-TINGGI";
const { rows: outletRows } = await client.query<{ id: string }>(
  `INSERT INTO outlets (code, name, timezone)
   VALUES ($1, $2, 'Asia/Jakarta')
   ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code
   RETURNING id`,
  [outletCode, "Garage Coffee & Motor - Tebing Tinggi"],
);
const outletId = outletRows[0].id;
console.log(`✅ Outlet ${outletCode} (id=${outletId})`);

// 2. User (Better Auth "user" table)
const userId = randomUUID();
const { rows: userRows } = await client.query<{ id: string }>(
  `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
   VALUES ($1, $2, $3, true, now(), now())
   ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
   RETURNING id`,
  [userId, name, email],
);
const finalUserId = userRows[0].id;
console.log(`✅ User ${email} (id=${finalUserId})`);

// 3. Account (Better Auth credential)
const hashed = await hashPassword(password);
await client.query(
  `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
   VALUES ($1, $2, 'credential', $3, $4, now(), now())
   ON CONFLICT (provider_id, account_id) DO UPDATE SET password = EXCLUDED.password`,
  [randomUUID(), email, finalUserId, hashed],
);
console.log(`✅ Credential account`);

// 4. Staff profile — role Owner / CEO
await client.query(
  `INSERT INTO staff_profiles (user_id, outlet_id, role, shift_label, device_label, status)
   VALUES ($1, $2, 'Owner / CEO', 'Full', 'Owner', 'active')
   ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active'`,
  [finalUserId, outletId],
);
console.log(`✅ Staff profile Owner`);

// 5. Cash session dev (agar POS bisa langsung dipakai test)
await client.query(
  `INSERT INTO cash_sessions (code, opening_cash, expected_cash, outlet_id, opened_by, status)
   VALUES ($1, 0, 0, $2, $3, 'open')
   ON CONFLICT (code) DO NOTHING`,
  [`CS-INIT-${new Date().toISOString().slice(0, 10)}`, outletId, finalUserId],
);
console.log(`✅ Cash session dev`);

await client.end();
console.log(`\n🎉 SEED SELESAI. Login: ${email} / <password kamu>`);
console.log(`   Outlet ID: ${outletId}`);
console.log(`   User ID:   ${finalUserId}`);
