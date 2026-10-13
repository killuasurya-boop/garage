/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { AlertTriangle, ArrowLeft, Download, FileDown, Printer } from "lucide-react";

import {
  QR_TABLE_NUMBERS,
  garageQrOrderUrl,
  isLocalQrBaseUrl,
  normalizeGarageBaseUrl,
  normalizeQrTableNumber,
} from "@/lib/garage-qr";
import { getActiveTableNumbers } from "@/lib/garage-service";

export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Cetak QR Meja | GARAGE OS",
};

type QrPrintPageProps = {
  searchParams: Promise<{
    print?: string | string[];
    tables?: string | string[];
  }>;
};

// "?tables=01,02,05-08" → daftar meja unik. Tanpa parameter → semua meja aktif.
function parseTableSelection(rawTables?: string | string[]) {
  const rawValue = Array.isArray(rawTables) ? rawTables.join(",") : rawTables;
  if (!rawValue?.trim()) return null;
  const tables: string[] = [];
  for (const part of rawValue.split(",")) {
    const range = part.trim().match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])].sort((a, b) => a - b);
      for (let value = from; value <= to; value += 1) {
        const table = normalizeQrTableNumber(value);
        if (table) tables.push(table);
      }
      continue;
    }
    const table = normalizeQrTableNumber(part);
    if (table) tables.push(table);
  }
  return tables.length ? Array.from(new Set(tables)).sort() : null;
}

async function activeTablesOrAll() {
  try {
    return await getActiveTableNumbers();
  } catch {
    return QR_TABLE_NUMBERS;
  }
}

function configuredBaseRaw() {
  return (
    process.env.GARAGE_PUBLIC_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL?.trim() ||
    ""
  );
}

// Tanpa GARAGE_PUBLIC_BASE_URL → pakai alamat yang sedang dibuka (sama dengan
// /api/customer/qr-card), bukan 127.0.0.1:3001 yang tidak bisa dibuka HP tamu.
async function publicBaseInfo() {
  const raw = configuredBaseRaw();
  let fallback = "http://127.0.0.1:3000";
  if (!raw) {
    const h = await headers();
    const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host");
    const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    if (host) fallback = `${proto}://${host}`;
  }
  const baseUrl = normalizeGarageBaseUrl(raw || fallback);
  return { baseUrl, configured: Boolean(raw), warning: !raw || isLocalQrBaseUrl(baseUrl) };
}

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function shouldAutoPrint(value?: string | string[]) {
  const raw = firstParam(value)?.toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function qrCard(baseUrl: string, table: string) {
  return {
    table,
    url: garageQrOrderUrl(baseUrl, table),
    cardUrl: `/api/customer/qr-card?table=${table}`,
  };
}

export default async function QrPrintPage({ searchParams }: QrPrintPageProps) {
  const params = await searchParams;
  const base = await publicBaseInfo();
  const requested = parseTableSelection(params.tables);
  const activeTables = await activeTablesOrAll();
  const tables = requested ?? activeTables;
  const autoPrint = shouldAutoPrint(params.print);
  const cards = tables.map((table) => qrCard(base.baseUrl, table));
  const pdfHref = `/api/customer/qr-cards/pdf?tables=${tables.join(",")}`;
  const selectionValue = Array.isArray(params.tables) ? params.tables.join(",") : params.tables ?? "";
  // QR menu takeaway (meja kasir / pintu / brosur): /order tanpa meja → otomatis Take away.
  const takeawayUrl = new URL("/order?source=qr_takeaway", base.baseUrl).toString();
  const takeawayQr = await QRCode.toDataURL(takeawayUrl, { width: 480, margin: 2, errorCorrectionLevel: "M" });

  return (
    <main className="qr-mgr">
      <header className="mgr-header">
        <div className="mgr-title">
          <span className="mgr-eyebrow">GARAGE COFFEE &amp; MOTOR</span>
          <h1>Cetak QR Meja</h1>
          <p className="mgr-sub">
            {requested ? `${tables.length} meja dipilih` : `${tables.length} meja aktif`} · kartu siap cetak
            (logo + nomor meja + QR).
          </p>
        </div>
        <div className="mgr-nav">
          <a className="back-link" href="/os?module=settings">
            <ArrowLeft size={16} aria-hidden /> Atur meja
          </a>
          <a className="back-link" href="/pos">
            Kembali ke POS
          </a>
        </div>
      </header>

      <section className="mgr-info">
        <div className="info-cell">
          <span className="info-label">Tujuan scan</span>
          <span className="info-value">{base.baseUrl}/order?table=XX</span>
        </div>
        <div className="info-cell">
          <span className="info-label">Jumlah kartu</span>
          <span className="info-value">{tables.length} kartu</span>
        </div>
        <form className="info-cell select-form" method="get">
          <label className="info-label" htmlFor="qr-tables">
            Pilih meja (mis. 01,05,10-12)
          </label>
          <div className="select-row">
            <input
              id="qr-tables"
              name="tables"
              defaultValue={selectionValue}
              placeholder={`Kosong = ${activeTables.length} meja aktif`}
              inputMode="numeric"
              autoComplete="off"
            />
            <button className="qr-btn qr-btn-ghost" type="submit">
              Tampilkan
            </button>
          </div>
        </form>
      </section>

      {base.warning ? (
        <section className="base-warning" role="alert">
          <AlertTriangle size={18} aria-hidden />
          <span>
            Alamat QR masih <b>lokal/fallback</b> ({base.baseUrl}) — QR ini <b>tidak bisa</b> discan HP lain.
            Set <code>GARAGE_PUBLIC_BASE_URL</code> &amp; <code>NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL</code> ke alamat
            outlet (mis. https://garagecoffee.id), lalu cetak ulang.
          </span>
        </section>
      ) : null}

      <div className="mgr-actions">
        <a className="qr-btn qr-btn-pdf" href={pdfHref}>
          <FileDown size={17} aria-hidden /> Unduh PDF siap cetak
        </a>
        <button className="qr-btn qr-btn-ghost" type="button" data-print-now>
          <Printer size={17} aria-hidden /> Cetak langsung
        </button>
        <button className="qr-btn qr-btn-ghost" type="button" data-dl-all>
          <Download size={17} aria-hidden /> Unduh semua PNG
        </button>
        <span className="actions-hint" data-status role="status">
          Untuk percetakan: pakai PDF. PNG cocok untuk 1–5 meja (HP bisa memblokir banyak unduhan).
        </span>
      </div>

      <section className="takeaway-qr" aria-label="QR menu takeaway">
        <img src={takeawayQr} alt="QR menu takeaway" width={160} height={160} />
        <div className="takeaway-text">
          <span className="info-label">QR Menu Takeaway / Counter</span>
          <p>Untuk meja kasir, pintu masuk, atau brosur. Tamu memesan sebagai <b>Take away</b> (bukan dine-in).</p>
          <span className="info-value">{takeawayUrl}</span>
          <a className="qr-btn qr-btn-ghost" href={takeawayQr} download="GARAGE-QR-Menu-Takeaway.png">
            <Download size={16} aria-hidden /> Unduh PNG
          </a>
        </div>
      </section>

      <section className="card-grid" aria-label="Kartu QR per meja">
        {cards.map((card) => (
          <article className="card-item" key={card.table}>
            {/* Tanpa lazy-load: "Cetak langsung" mencetak semua kartu sekaligus. */}
            <img
              className="card-svg"
              src={card.cardUrl}
              alt={`Kartu QR Meja ${card.table}`}
              data-card
              data-table={card.table}
              data-src={card.cardUrl}
              decoding="async"
            />
            <button
              className="btn-dl-one"
              type="button"
              data-dl-png
              data-table={card.table}
              data-src={card.cardUrl}
            >
              <Download size={14} aria-hidden /> PNG Meja {card.table}
            </button>
          </article>
        ))}
      </section>

      <style>{`
        .qr-mgr {
          min-height: 100vh;
          background: #08080a;
          border-top: 4px solid #d11a2a;
          color: #f4f4f5;
          font-family: var(--font-space-grotesk), "Space Grotesk", system-ui, sans-serif;
          padding: 24px 16px;
        }
        .mgr-header {
          align-items: flex-end; display: flex; flex-wrap: wrap; gap: 16px;
          justify-content: space-between; margin: 0 auto 16px; max-width: 1180px;
        }
        .mgr-eyebrow { color: #ff5a66; font-size: 11px; font-weight: 800; letter-spacing: 0.22em; }
        .mgr-title h1 { font-size: clamp(26px, 3.4vw, 40px); font-weight: 800; letter-spacing: -0.01em; margin: 4px 0; }
        .mgr-sub { color: #b8b8bf; font-size: 14px; margin: 0; }
        .mgr-nav { display: flex; flex-wrap: wrap; gap: 8px; }
        .back-link {
          align-items: center; background: #19191e; border: 1px solid #34343c; border-radius: 8px;
          color: #f4f4f5; display: inline-flex; font-size: 14px; font-weight: 700; gap: 6px;
          min-height: 44px; padding: 0 14px; text-decoration: none;
        }
        .back-link:hover { border-color: #f4f4f5; }
        .mgr-info {
          display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          margin: 0 auto 12px; max-width: 1180px;
        }
        .info-cell {
          background: #121216; border: 1px solid #2a2a30; border-radius: 8px;
          display: flex; flex-direction: column; gap: 4px; padding: 10px 12px;
        }
        .info-label { color: #b8b8bf; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
        .info-value { color: #f4f4f5; font-size: 14px; font-weight: 700; overflow-wrap: anywhere; }
        .select-row { display: flex; gap: 8px; }
        .select-row input {
          background: #08080a; border: 1px solid #3a3a42; border-radius: 6px; color: #f4f4f5;
          flex: 1; font-family: var(--font-jetbrains-mono), monospace; font-size: 14px; min-height: 44px;
          min-width: 0; padding: 0 10px;
        }
        .select-row input:focus { border-color: #f4f4f5; outline: none; }
        .base-warning {
          align-items: flex-start; background: rgba(245, 167, 66, 0.12); border: 1px solid rgba(245, 167, 66, 0.55);
          border-radius: 8px; color: #ffd08a; display: flex; font-size: 13px; gap: 10px; line-height: 1.5;
          margin: 0 auto 14px; max-width: 1180px; padding: 12px 14px;
        }
        .base-warning code { background: rgba(255,255,255,0.08); border-radius: 4px; color: #fff; padding: 1px 4px; }
        .takeaway-qr {
          align-items: center; background: #121216; border: 1px solid #2a2a30; border-radius: 8px;
          display: flex; flex-wrap: wrap; gap: 16px; margin: 0 auto 18px; max-width: 1180px; padding: 12px;
        }
        .takeaway-qr img { background: #fff; border-radius: 6px; padding: 6px; }
        .takeaway-text { display: flex; flex: 1; flex-direction: column; gap: 6px; min-width: 220px; }
        .takeaway-text p { color: #d4d4d8; font-size: 14px; margin: 0; }
        .takeaway-text .qr-btn { align-self: flex-start; }
        @media print { .takeaway-qr { display: none; } }
        .mgr-actions {
          align-items: center; display: flex; flex-wrap: wrap; gap: 10px;
          margin: 0 auto 18px; max-width: 1180px;
        }
        .qr-btn {
          align-items: center; border: 1px solid transparent; border-radius: 8px; cursor: pointer;
          display: inline-flex; font-size: 14px; font-weight: 700; gap: 8px; min-height: 46px;
          letter-spacing: normal; padding: 0 16px; text-decoration: none; text-transform: none;
        }
        .qr-btn:disabled { cursor: wait; opacity: 0.6; }
        .qr-btn-pdf { background: #d11a2a; color: #fff; }
        .qr-btn-pdf:hover { background: #ff2a3a; }
        .qr-btn-ghost { background: #19191e; border-color: #3a3a42; color: #f4f4f5; }
        .qr-btn-ghost:hover { border-color: #f4f4f5; }
        .actions-hint { color: #b8b8bf; font-size: 13px; }
        .actions-hint[data-tone="error"] { color: #ffb3b3; }
        .card-grid {
          display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          margin: 0 auto; max-width: 1180px;
        }
        .card-item { display: flex; flex-direction: column; gap: 8px; }
        .card-svg {
          aspect-ratio: 600 / 900; background: #fff; border-radius: 10px; display: block;
          height: auto; width: 100%;
        }
        .btn-dl-one {
          align-items: center; background: #19191e; border: 1px solid #3a3a42; border-radius: 6px;
          color: #f4f4f5; cursor: pointer; display: inline-flex; font-size: 13px; font-weight: 700;
          gap: 6px; justify-content: center; min-height: 44px; padding: 0 8px;
        }
        .btn-dl-one:hover { border-color: #f4f4f5; }

        @media print {
          @page { margin: 8mm; }
          .qr-mgr { background: #fff; border: 0; color: #111; padding: 0; }
          .mgr-header, .mgr-info, .base-warning, .mgr-actions, .btn-dl-one, .back-link {
            display: none !important;
          }
          .card-grid { gap: 6mm; grid-template-columns: repeat(3, 1fr); max-width: none; }
          .card-item { gap: 0; }
          .card-svg { border: none; box-shadow: none; break-inside: avoid; }
        }
      `}</style>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            (() => {
              const status = document.querySelector("[data-status]");
              const setStatus = (text, tone) => {
                if (!status) return;
                status.textContent = text;
                if (tone) status.setAttribute("data-tone", tone); else status.removeAttribute("data-tone");
              };
              // Cetak hanya setelah SEMUA kartu termuat (kalau tidak, kartu kosong ikut tercetak).
              async function printNow() {
                const imgs = Array.prototype.slice.call(document.querySelectorAll("[data-card]"));
                setStatus("Menyiapkan " + imgs.length + " kartu untuk dicetak…");
                await Promise.all(imgs.map(function (img) {
                  return img.decode ? img.decode().catch(function () {}) : Promise.resolve();
                }));
                const broken = imgs.filter(function (img) { return !img.complete || img.naturalWidth === 0; });
                if (broken.length) {
                  setStatus("Kartu meja " + broken.map(function (img) { return img.getAttribute("data-table"); }).join(", ") + " gagal dimuat. Muat ulang halaman lalu coba lagi.", "error");
                  return;
                }
                setStatus("Siap dicetak.");
                window.print();
              }
              document.querySelector("[data-print-now]")?.addEventListener("click", function () { void printNow(); });

              async function cardToPng(svgUrl, table) {
                const res = await fetch(svgUrl, { cache: "no-store" });
                if (!res.ok) throw new Error("gagal ambil kartu");
                const svgText = await res.text();
                const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
                const svgObjUrl = URL.createObjectURL(svgBlob);
                try {
                  const img = new Image();
                  img.decoding = "sync";
                  await new Promise(function (resolve, reject) {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = svgObjUrl;
                  });
                  const scale = 2.5; // 600x900 -> 1500x2250 (tajam untuk cetak)
                  const canvas = document.createElement("canvas");
                  canvas.width = 600 * scale;
                  canvas.height = 900 * scale;
                  const ctx = canvas.getContext("2d");
                  ctx.fillStyle = "#ffffff";
                  ctx.fillRect(0, 0, canvas.width, canvas.height);
                  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                  const pngBlob = await new Promise(function (r) { canvas.toBlob(r, "image/png"); });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(pngBlob);
                  a.download = "GARAGE-QR-Meja-" + table + ".png";
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
                } finally {
                  URL.revokeObjectURL(svgObjUrl);
                }
              }

              document.querySelectorAll("[data-dl-png]").forEach(function (b) {
                b.addEventListener("click", async function () {
                  b.disabled = true;
                  const label = b.innerHTML;
                  b.textContent = "Menyiapkan…";
                  try { await cardToPng(b.getAttribute("data-src"), b.getAttribute("data-table")); }
                  catch (e) { setStatus("Gagal unduh PNG meja " + b.getAttribute("data-table") + ". Coba lagi.", "error"); }
                  b.innerHTML = label; b.disabled = false;
                });
              });

              const all = document.querySelector("[data-dl-all]");
              if (all) {
                all.addEventListener("click", async function () {
                  const cards = Array.prototype.slice.call(document.querySelectorAll("[data-card]"));
                  all.disabled = true;
                  const failed = [];
                  for (let i = 0; i < cards.length; i++) {
                    setStatus("Mengunduh PNG " + (i + 1) + "/" + cards.length + "…");
                    try { await cardToPng(cards[i].getAttribute("data-src"), cards[i].getAttribute("data-table")); }
                    catch (e) { failed.push(cards[i].getAttribute("data-table")); }
                    await new Promise(function (r) { setTimeout(r, 500); });
                  }
                  all.disabled = false;
                  if (failed.length) {
                    setStatus("Selesai, tapi meja " + failed.join(", ") + " gagal. Untuk banyak meja pakai Unduh PDF.", "error");
                  } else {
                    setStatus(cards.length + " PNG selesai diunduh. Jika browser memblokir sebagian, pakai Unduh PDF.");
                  }
                });
              }

              ${autoPrint ? "void printNow();" : ""}
            })();
          `,
        }}
      />
    </main>
  );
}
