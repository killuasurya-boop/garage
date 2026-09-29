// Pulihkan database lokal (PGlite) dari backup.
//
// Dua format didukung:
//   1. Folder salinan harian  backups/garage-YYYYMMDD-HHMMSS-pglite   (scripts/backup.mjs,
//      task "Garage OS Backup Harian" — juga salinan offsite di Google Drive)
//   2. Arsip lama             backups/auto/*.tar.gz
//
//   npm run db:restore                               → tampilkan daftar backup
//   npm run db:restore -- <folder-atau-file-backup>  → pulihkan
//
// WAJIB: server Garage (port 3001) sudah MATI. Folder .pglite-data lama TIDAK
// dihapus — diganti nama menjadi .pglite-data.before-restore-<waktu>.

import fs from "node:fs";
import net from "node:net";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";

const root = process.cwd();
const dataDir = process.env.PGLITE_DATA_DIR?.trim() || path.join(root, ".pglite-data");
const backupRoot = path.join(root, "backups");
const archiveDir = path.join(backupRoot, "auto");

function listBackups() {
  const dirs = fs.existsSync(backupRoot)
    ? fs
        .readdirSync(backupRoot, { withFileTypes: true })
        .filter((d) => d.isDirectory() && /^garage-\d{8}-\d{6}-pglite$/.test(d.name))
        .map((d) => path.join("backups", d.name))
    : [];
  const archives = fs.existsSync(archiveDir)
    ? fs
        .readdirSync(archiveDir)
        .filter((f) => f.endsWith(".tar.gz"))
        .map((f) => path.join("backups", "auto", f))
    : [];
  return [...dirs, ...archives].sort((a, b) => path.basename(b).localeCompare(path.basename(a)));
}

function sizeMb(target) {
  const stat = fs.statSync(target);
  if (!stat.isDirectory()) return stat.size / 1024 / 1024;
  let total = 0;
  for (const entry of fs.readdirSync(target, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) total += fs.statSync(path.join(entry.parentPath ?? entry.path, entry.name)).size;
  }
  return total / 1024 / 1024;
}

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

const arg = process.argv[2];
if (!arg) {
  const backups = listBackups();
  console.log(backups.length ? "Backup tersedia (terbaru dulu):" : "Belum ada backup di folder backups/.");
  for (const b of backups) console.log(`  ${b}  (${sizeMb(path.join(root, b)).toFixed(1)} MB)`);
  if (backups.length) console.log(`\nPulihkan: npm run db:restore -- "${backups[0]}"`);
  process.exit(0);
}

const source = [arg, path.join(root, arg), path.join(backupRoot, arg), path.join(archiveDir, arg)].find((p) =>
  fs.existsSync(p),
);
if (!source) {
  console.error(`Backup tidak ditemukan: ${arg}`);
  process.exit(1);
}
if (await portInUse(3001)) {
  console.error("Server masih jalan di port 3001. Matikan dulu servernya, lalu ulangi.");
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
if (fs.existsSync(dataDir)) {
  const aside = `${dataDir}.before-restore-${stamp}`;
  fs.renameSync(dataDir, aside);
  console.log(`Database lama disimpan di: ${aside}`);
}

let db;
if (fs.statSync(source).isDirectory()) {
  fs.cpSync(source, dataDir, { recursive: true });
  fs.rmSync(path.join(dataDir, "postmaster.pid"), { force: true });
  db = new PGlite({ dataDir });
} else {
  const blob = new Blob([fs.readFileSync(source)]);
  db = new PGlite({ dataDir, loadDataDir: blob });
}
await db.waitReady;
const { rows } = await db.query(
  `select (select count(*)::int from "user") as users, (select count(*)::int from orders) as orders`,
);
await db.close();
console.log(
  `Pulih dari ${path.basename(source)} → ${dataDir} (akun: ${rows[0]?.users ?? 0}, order: ${rows[0]?.orders ?? 0}).`,
);
console.log("Jalankan: npm run db:migrate:runner  lalu nyalakan server lagi.");
