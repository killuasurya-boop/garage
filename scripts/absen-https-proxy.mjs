// Proxy HTTPS khusus absen karyawan di jaringan toko.
//
//   npm run absen:https          # https://<IP-LAN>:3443/absen  →  http://127.0.0.1:3001
//
// Kenapa: kamera & GPS di HP hanya jalan di HTTPS, sedangkan `next start` hanya
// HTTP dan server Garage cukup terikat ke 127.0.0.1. Proxy ini HANYA membuka
// halaman absen (+ aset statis) ke Wi-Fi — modul kasir/owner tetap tertutup.
//
// Sertifikat self-signed dibuat otomatis di certs/absen/ (tanpa OpenSSL) dan
// diperbarui bila IP LAN berubah. HP akan menampilkan peringatan sekali per
// perangkat → pilih "Lanjutkan / Proceed".
//
// Env: ABSEN_HTTPS_PORT (default 3443), ABSEN_TARGET (default http://127.0.0.1:3001)

import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CERT_DIR = path.join(ROOT, "certs", "absen");
const PORT = Number(process.env.ABSEN_HTTPS_PORT || 3443);
const TARGET = new URL(process.env.ABSEN_TARGET || "http://127.0.0.1:3001");
const CERT_DAYS = 365;

// ---------------------------------------------------------------------------
// Sertifikat self-signed (DER/ASN.1 minimal, RSA-2048 + SHA-256)
// ---------------------------------------------------------------------------

function derLength(n) {
  if (n < 0x80) return Buffer.from([n]);
  const bytes = [];
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
const tlv = (tag, content) => Buffer.concat([Buffer.from([tag]), derLength(content.length), content]);
const seq = (...items) => tlv(0x30, Buffer.concat(items));
const set = (...items) => tlv(0x31, Buffer.concat(items));
const derNull = () => Buffer.from([0x05, 0x00]);
const utf8 = (s) => tlv(0x0c, Buffer.from(s, "utf8"));
const octets = (buf) => tlv(0x04, buf);
const bitString = (buf) => tlv(0x03, Buffer.concat([Buffer.from([0x00]), buf]));
const explicit = (n, content) => tlv(0xa0 + n, content);

function oid(dotted) {
  const parts = dotted.split(".").map(Number);
  const bytes = [parts[0] * 40 + parts[1]];
  for (const p of parts.slice(2)) {
    const chunk = [];
    let v = p;
    do {
      chunk.unshift(v & 0x7f);
      v = Math.floor(v / 128);
    } while (v > 0);
    for (let i = 0; i < chunk.length - 1; i++) chunk[i] |= 0x80;
    bytes.push(...chunk);
  }
  return tlv(0x06, Buffer.from(bytes));
}

function positiveInteger(buf) {
  const body = buf[0] & 0x80 ? Buffer.concat([Buffer.from([0x00]), buf]) : buf;
  return tlv(0x02, body);
}

function utcTime(date) {
  const p = (n) => String(n).padStart(2, "0");
  const s = `${p(date.getUTCFullYear() % 100)}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`;
  return tlv(0x17, Buffer.from(s, "ascii"));
}

function toPem(label, der) {
  const b64 = der.toString("base64").match(/.{1,64}/g).join("\n");
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
}

/** Buat sertifikat self-signed untuk daftar IP + localhost. */
export function createSelfSignedCert(ips, now = new Date()) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const sha256WithRsa = seq(oid("1.2.840.113549.1.1.11"), derNull());
  const name = seq(set(seq(oid("2.5.4.3"), utf8("Garage Absen"))));
  const notBefore = new Date(now.getTime() - 60 * 60 * 1000);
  const notAfter = new Date(now.getTime() + CERT_DAYS * 86_400_000);

  const altNames = [
    tlv(0x82, Buffer.from("localhost", "ascii")), // dNSName
    ...["127.0.0.1", ...ips].map((ip) => tlv(0x87, Buffer.from(ip.split(".").map(Number)))), // iPAddress
  ];
  const extensions = seq(
    seq(oid("2.5.29.17"), octets(seq(...altNames))), // subjectAltName
    seq(oid("2.5.29.19"), octets(seq())), // basicConstraints: bukan CA
    seq(oid("2.5.29.15"), tlv(0x01, Buffer.from([0xff])), octets(tlv(0x03, Buffer.from([0x05, 0xa0])))), // keyUsage (critical)
    seq(oid("2.5.29.37"), octets(seq(oid("1.3.6.1.5.5.7.3.1")))), // extKeyUsage: serverAuth
  );

  const tbs = seq(
    explicit(0, tlv(0x02, Buffer.from([0x02]))), // v3
    positiveInteger(crypto.randomBytes(16)),
    sha256WithRsa,
    name,
    seq(utcTime(notBefore), utcTime(notAfter)),
    name,
    publicKey.export({ type: "spki", format: "der" }),
    explicit(3, extensions),
  );
  const signature = crypto.sign("sha256", tbs, privateKey);
  const certDer = seq(tbs, sha256WithRsa, bitString(signature));

  return {
    cert: toPem("CERTIFICATE", certDer),
    key: privateKey.export({ type: "pkcs8", format: "pem" }),
  };
}

export function lanIPv4s() {
  return Object.values(os.networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((e) => e.family === "IPv4" && !e.internal && !e.address.startsWith("169.254."))
    .map((e) => e.address);
}

/** Pakai sertifikat yang ada bila masih mencakup semua IP & belum hampir habis; bila tidak, buat ulang. */
export function ensureCert(ips, dir = CERT_DIR, now = new Date()) {
  const certPath = path.join(dir, "cert.pem");
  const keyPath = path.join(dir, "key.pem");
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    const cert = fs.readFileSync(certPath);
    const x509 = new crypto.X509Certificate(cert);
    const coversAll = ips.every((ip) => x509.checkIP(ip));
    const daysLeft = (new Date(x509.validTo).getTime() - now.getTime()) / 86_400_000;
    if (coversAll && daysLeft > 30) return { cert, key: fs.readFileSync(keyPath), renewed: false };
  }
  const fresh = createSelfSignedCert(ips, now);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(certPath, fresh.cert);
  fs.writeFileSync(keyPath, fresh.key, { mode: 0o600 });
  return { cert: fresh.cert, key: fresh.key, renewed: true };
}

// ---------------------------------------------------------------------------
// Proxy: hanya jalur absen yang diteruskan
// ---------------------------------------------------------------------------

const STATIC_FILE = /^\/[\w.-]+\.(png|jpe?g|svg|ico|webp|webmanifest|txt)$/i;

export function isAllowedPath(pathname) {
  return (
    pathname === "/absen" ||
    pathname.startsWith("/api/absen/") ||
    pathname.startsWith("/_next/") ||
    STATIC_FILE.test(pathname)
  );
}

function handle(req, res) {
  const url = new URL(req.url ?? "/", "https://absen.local");
  if (url.pathname === "/") {
    res.writeHead(302, { location: "/absen" });
    res.end();
    return;
  }
  if (!isAllowedPath(url.pathname)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Hanya halaman absen yang tersedia di jaringan ini. Buka /absen.");
    return;
  }

  const headers = { ...req.headers };
  // IP HP asli (timpa, jangan percaya header dari klien) → dipakai rate-limit PIN.
  headers["x-forwarded-for"] = req.socket.remoteAddress?.replace(/^::ffff:/, "") ?? "unknown";
  headers["x-forwarded-proto"] = "https";
  headers["x-forwarded-host"] = req.headers.host ?? "";
  headers.host = TARGET.host;

  const upstream = http.request(
    {
      protocol: TARGET.protocol,
      hostname: TARGET.hostname,
      port: TARGET.port,
      method: req.method,
      // Teruskan path yang SUDAH dinormalisasi (yang dicek allowlist), bukan req.url mentah.
      path: url.pathname + url.search,
      headers,
    },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end("Server Garage belum menyala. Nyalakan server kasir, lalu coba lagi.");
  });
  req.pipe(upstream);
}

function main() {
  const ips = lanIPv4s();
  const { cert, key, renewed } = ensureCert(ips);
  const server = https.createServer({ cert, key }, handle);
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Proxy absen HTTPS aktif → ${TARGET.origin}${renewed ? " (sertifikat baru dibuat)" : ""}`);
    for (const ip of ips) console.log(`  Buka di HP karyawan: https://${ip}:${PORT}/absen`);
    if (ips.length === 0) console.log("  (Tidak ada IP LAN — sambungkan PC ke Wi-Fi toko.)");
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
