/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";

import {
  QR_TABLE_NUMBERS,
  garageQrOrderUrl,
  isLocalQrBaseUrl,
  normalizeGarageBaseUrl,
  normalizeQrTableNumber,
} from "@/lib/garage-qr";

export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Manajemen QR Meja | GARAGE POS",
};

type QrPrintPageProps = {
  searchParams: Promise<{
    print?: string | string[];
    tables?: string | string[];
  }>;
};

function selectedTables(rawTables?: string | string[]) {
  const rawValue = Array.isArray(rawTables) ? rawTables.join(",") : rawTables;
  if (!rawValue) return QR_TABLE_NUMBERS;
  const tables = rawValue
    .split(",")
    .map(normalizeQrTableNumber)
    .filter((table): table is string => Boolean(table));
  return tables.length ? Array.from(new Set(tables)) : QR_TABLE_NUMBERS;
}

function configuredBaseRaw() {
  return (
    process.env.GARAGE_PUBLIC_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL?.trim() ||
    ""
  );
}

function publicBaseInfo() {
  const raw = configuredBaseRaw();
  const baseUrl = normalizeGarageBaseUrl(raw || "http://127.0.0.1:3001");
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
  const base = publicBaseInfo();
  const tables = selectedTables(params.tables);
  const autoPrint = shouldAutoPrint(params.print);
  const isPilot = tables.length < QR_TABLE_NUMBERS.length;
  const cards = tables.map((table) => qrCard(base.baseUrl, table));
  const pdfHref = isPilot
    ? `/api/customer/qr-cards/pdf?tables=${tables.join(",")}`
    : `/api/customer/qr-cards/pdf`;

  return (
    <main className="qr-mgr">
      <header className="mgr-header">
        <div className="mgr-title">
          <span className="mgr-eyebrow">GARAGE COFFEE &amp; MOTOR</span>
          <h1>Manajemen QR Meja</h1>
          <p className="mgr-sub">
            {isPilot ? `QR Pilot ${tables.length} Meja` : "Semua 50 meja"} · Kartu siap
            cetak (logo + nomor meja + QR).
          </p>
        </div>
        <a className="back-link" href="/pos">
          Kembali ke POS
        </a>
      </header>

      <section className="mgr-info">
        <div className="info-cell">
          <span className="info-label">Base URL (tujuan scan)</span>
          <span className="info-value">{base.baseUrl}</span>
        </div>
        <div className="info-cell">
          <span className="info-label">Meja</span>
          <span className="info-value">{tables.length} kartu</span>
        </div>
        <div className="info-cell">
          <span className="info-label">Payload</span>
          <span className="info-value">/order?table=XX</span>
        </div>
      </section>

      {base.warning ? (
        <section className="base-warning">
          ⚠ Base URL QR masih <b>local/fallback</b> ({base.baseUrl}). QR ini TIDAK bisa
          discan HP lain. Set <code>GARAGE_PUBLIC_BASE_URL</code> &amp;{" "}
          <code>NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL</code> ke IP LAN tetap (mis.
          http://192.168.100.33:3001), rebuild, baru cetak QR permanen.
        </section>
      ) : null}

      <div className="mgr-actions">
        <a className="btn btn-pdf" href={pdfHref} data-pdf>
          ⬇ Unduh PDF Siap Cetak
        </a>
        <button className="btn btn-png" type="button" data-dl-all>
          ⬇ Unduh Semua PNG
        </button>
        <button className="btn btn-print" type="button" data-print-now>
          🖨 Cetak Langsung
        </button>
        <span className="actions-hint">
          PDF = 1 file untuk percetakan · PNG = gambar kartu per meja (HD)
        </span>
      </div>

      <section className="card-grid" aria-label="Kartu QR per meja">
        {cards.map((card) => (
          <article className="card-item" key={card.table}>
            <img
              className="card-svg"
              src={card.cardUrl}
              alt={`Kartu QR Meja ${card.table}`}
              data-card
              data-table={card.table}
              data-src={card.cardUrl}
              loading="lazy"
            />
            <button
              className="btn-dl-one"
              type="button"
              data-dl-png
              data-table={card.table}
              data-src={card.cardUrl}
            >
              ⬇ Unduh PNG Meja {card.table}
            </button>
          </article>
        ))}
      </section>

      <style>{`
        .qr-mgr {
          min-height: 100vh;
          background: linear-gradient(180deg, #f7f3ec, #ece4d8);
          color: #171412;
          font-family: Arial, Helvetica, sans-serif;
          padding: 24px;
        }
        .mgr-header {
          align-items: center;
          display: flex;
          gap: 16px;
          justify-content: space-between;
          margin: 0 auto 14px;
          max-width: 1180px;
        }
        .mgr-eyebrow {
          color: #d11a2a;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.22em;
        }
        .mgr-title h1 {
          font-size: clamp(24px, 3.4vw, 40px);
          letter-spacing: -0.02em;
          margin: 4px 0 4px;
          text-transform: uppercase;
        }
        .mgr-sub { color: #5f554b; font-size: 13px; font-weight: 700; margin: 0; }
        .back-link {
          background: #171412; color: #fff; font-size: 13px; font-weight: 800;
          min-height: 42px; padding: 12px 14px; text-decoration: none; text-transform: uppercase;
          white-space: nowrap;
        }
        .mgr-info {
          display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          margin: 0 auto 12px; max-width: 1180px;
        }
        .info-cell {
          background: #fff; border: 1px solid #e0d8cc; border-radius: 8px;
          display: flex; flex-direction: column; gap: 3px; padding: 10px 12px;
        }
        .info-label { color: #9a9086; font-size: 10px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
        .info-value { color: #171412; font-size: 14px; font-weight: 800; overflow-wrap: anywhere; }
        .base-warning {
          background: #fff4d6; border: 1px solid #f5a742; border-radius: 8px; color: #5c3d00;
          font-size: 13px; line-height: 1.5; margin: 0 auto 14px; max-width: 1180px; padding: 12px 14px;
        }
        .base-warning code { background: #00000010; padding: 1px 4px; }
        .mgr-actions {
          align-items: center; display: flex; flex-wrap: wrap; gap: 10px;
          margin: 0 auto 18px; max-width: 1180px;
        }
        .btn {
          border: 0; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 900;
          min-height: 46px; padding: 12px 18px; text-decoration: none; text-transform: uppercase;
          display: inline-flex; align-items: center; gap: 6px;
        }
        .btn-pdf { background: #d11a2a; color: #fff; }
        .btn-png { background: #171412; color: #fff; }
        .btn-print { background: #fff; border: 1px solid #171412; color: #171412; }
        .btn:hover { filter: brightness(1.08); }
        .actions-hint { color: #7a7065; font-size: 12px; font-weight: 700; }
        .card-grid {
          display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
          margin: 0 auto; max-width: 1180px;
        }
        .card-item { display: flex; flex-direction: column; gap: 8px; }
        .card-svg {
          background: #fff; border: 1px solid #e0d8cc; border-radius: 10px;
          box-shadow: 0 14px 30px rgba(0,0,0,0.10); display: block; height: auto; width: 100%;
        }
        .btn-dl-one {
          background: #111116; border: 1px solid #d11a2a; border-radius: 6px; color: #ffd7db;
          cursor: pointer; font-size: 11px; font-weight: 800; letter-spacing: 0.04em;
          padding: 9px 8px; text-transform: uppercase;
        }
        .btn-dl-one:hover { background: #1c1c22; }

        @media print {
          @page { margin: 8mm; }
          .qr-mgr { background: #fff; padding: 0; }
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
              const printNow = () => window.print();
              document.querySelector("[data-print-now]")?.addEventListener("click", printNow);

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
                  const scale = 2.5; // 540x840 -> 1350x2100 (tajam untuk cetak)
                  const canvas = document.createElement("canvas");
                  canvas.width = 540 * scale;
                  canvas.height = 840 * scale;
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
                  const label = b.textContent;
                  b.textContent = "Menyiapkan...";
                  try { await cardToPng(b.getAttribute("data-src"), b.getAttribute("data-table")); }
                  catch (e) { alert("Gagal unduh PNG meja " + b.getAttribute("data-table")); }
                  b.textContent = label; b.disabled = false;
                });
              });

              const all = document.querySelector("[data-dl-all]");
              if (all) {
                all.addEventListener("click", async function () {
                  const cards = Array.prototype.slice.call(document.querySelectorAll("[data-card]"));
                  all.disabled = true;
                  const label = all.textContent;
                  for (let i = 0; i < cards.length; i++) {
                    all.textContent = "Mengunduh " + (i + 1) + "/" + cards.length + "...";
                    try { await cardToPng(cards[i].getAttribute("data-src"), cards[i].getAttribute("data-table")); }
                    catch (e) { /* lanjut meja berikutnya */ }
                    await new Promise(function (r) { setTimeout(r, 500); });
                  }
                  all.textContent = label; all.disabled = false;
                });
              }

              ${autoPrint ? "window.setTimeout(printNow, 500);" : ""}
            })();
          `,
        }}
      />
    </main>
  );
}
