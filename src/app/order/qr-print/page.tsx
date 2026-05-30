import type { Metadata } from "next";
import Image from "next/image";
import QRCode from "qrcode";

import {
  QR_TABLE_NUMBERS,
  garageQrOrderUrl,
  isLocalQrBaseUrl,
  normalizeGarageBaseUrl,
  normalizeQrTableNumber,
} from "@/lib/garage-qr";

export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Print QR Meja | GARAGE POS",
};

type QrPrintPageProps = {
  searchParams: Promise<{
    print?: string | string[];
    tables?: string | string[];
  }>;
};

function selectedTables(rawTables?: string | string[]) {
  const rawValue = Array.isArray(rawTables) ? rawTables.join(",") : rawTables;
  if (!rawValue) {
    return QR_TABLE_NUMBERS;
  }

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
  return {
    baseUrl,
    configured: Boolean(raw),
    warning: !raw || isLocalQrBaseUrl(baseUrl),
  };
}

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function shouldAutoPrint(value?: string | string[]) {
  const raw = firstParam(value)?.toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

async function qrCard(baseUrl: string, table: string) {
  const url = garageQrOrderUrl(baseUrl, table);
  const svg = await QRCode.toString(url, {
    type: "svg",
    width: 260,
    margin: 2,
    errorCorrectionLevel: "M",
    color: {
      dark: "#111116",
      light: "#ffffff",
    },
  });

  return { table, url, svg };
}

export default async function QrPrintPage({ searchParams }: QrPrintPageProps) {
  const params = await searchParams;
  const base = publicBaseInfo();
  const tables = selectedTables(params.tables);
  const autoPrint = shouldAutoPrint(params.print);
  const isPilot = tables.length < QR_TABLE_NUMBERS.length;
  const cards = await Promise.all(tables.map((table) => qrCard(base.baseUrl, table)));

  return (
    <main className="qr-print-page">
      <header className="print-header">
        <div className="print-title">
          <div className="brand-row">
            <Image
              src="/garage-brand/logo-website.png"
              alt="GARAGE Coffee & Motor"
              width={1024}
              height={325}
              priority
              sizes="196px"
              className="brand-logo"
            />
            <span className="brand-divider" />
            <span className="qr-fixed-badge">QR Tetap</span>
          </div>
          <h1>{isPilot ? `QR Pilot ${tables.length} Meja` : "QR Menu 50 Meja"}</h1>
          <p className="base-url">Base URL: {base.baseUrl}</p>
          <p className="base-url">Payload tetap: /order?table=XX&amp;source=qr_table</p>
          <p className="base-url">Meja: {tables.join(", ")}</p>
        </div>
        <a className="back-link" href="/pos">
          Kembali ke POS
        </a>
      </header>
      <div className="print-actions">
        <button className="print-now" type="button" data-print-now>
          Cetak sekarang
        </button>
      </div>

      {base.warning ? (
        <section className="base-warning">
          Base URL QR masih fallback/local. Jangan print QR permanen sebelum
          `GARAGE_PUBLIC_BASE_URL` dan `NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL` memakai URL LAN/outlet tetap.
        </section>
      ) : null}

      <section className="qr-grid" aria-label="QR menu per meja">
        {cards.map((card) => (
          <article
            className="qr-card"
            key={card.table}
            aria-label={`QR menu Meja ${card.table}`}
          >
            <div className="qr-card-top">
              <Image
                src="/garage-brand/logo-website.png"
                alt="GARAGE"
                width={1024}
                height={325}
                sizes="108px"
                className="card-logo"
              />
              <span>QR Tetap</span>
            </div>
            <div className="table-band">
              <span>Meja</span>
              <strong>{card.table}</strong>
            </div>
            <p className="scan-label">Scan untuk order</p>
            <div className="qr-frame">
              <div
                className="qr-svg"
                dangerouslySetInnerHTML={{ __html: card.svg }}
              />
            </div>
            <p className="qr-url">{card.url}</p>
            <div className="card-footer">
              <span>GARAGE Coffee & Motor</span>
              <strong>{card.table}</strong>
            </div>
          </article>
        ))}
      </section>

      <style>{`
        .qr-print-page {
          min-height: 100vh;
          background:
            radial-gradient(circle at 12% 0%, rgba(209, 26, 42, 0.12), transparent 32%),
            linear-gradient(180deg, #f7f3ec, #ece4d8);
          color: #171412;
          padding: 24px;
          font-family: Arial, Helvetica, sans-serif;
        }

        .print-header {
          align-items: center;
          display: flex;
          gap: 16px;
          justify-content: space-between;
          margin: 0 auto 18px;
          max-width: 1180px;
        }

        .print-title {
          min-width: 0;
        }

        .brand-row {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 12px;
        }

        .brand-logo {
          display: block;
          height: auto;
          width: 196px;
        }

        .brand-divider {
          background: #d11a2a;
          display: block;
          height: 24px;
          width: 2px;
        }

        .qr-fixed-badge {
          border: 1px solid #d11a2a;
          color: #d11a2a;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.18em;
          padding: 7px 9px;
          text-transform: uppercase;
        }

        h1 {
          font-size: clamp(28px, 4vw, 52px);
          letter-spacing: -0.02em;
          line-height: 0.95;
          margin: 0;
          text-transform: uppercase;
        }

        .base-url {
          color: #5f554b;
          font-size: 13px;
          font-weight: 700;
          margin: 8px 0 0;
          overflow-wrap: anywhere;
        }

        .base-warning {
          background: #fff4d6;
          border: 1px solid #f5a742;
          color: #5c3d00;
          font-size: 13px;
          font-weight: 800;
          line-height: 1.5;
          margin: 0 auto 18px;
          max-width: 1180px;
          padding: 12px 14px;
        }

        .back-link {
          align-items: center;
          background: #171412;
          color: #ffffff;
          display: inline-flex;
          font-size: 13px;
          font-weight: 800;
          min-height: 42px;
          padding: 0 14px;
          text-decoration: none;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .print-actions {
          display: flex;
          justify-content: flex-end;
          margin: -8px auto 18px;
          max-width: 1180px;
        }

        .print-now {
          background: #d11a2a;
          border: 0;
          color: #ffffff;
          cursor: pointer;
          font-size: 13px;
          font-weight: 900;
          min-height: 42px;
          padding: 0 16px;
          text-transform: uppercase;
        }

        .qr-grid {
          display: grid;
          gap: 14px;
          grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
          margin: 0 auto;
          max-width: 1180px;
        }

        .qr-card {
          background: #ffffff;
          border: 2px solid #151515;
          box-shadow: 0 18px 36px rgba(0, 0, 0, 0.12);
          display: flex;
          flex-direction: column;
          min-height: 330px;
          padding: 12px;
          position: relative;
          text-align: center;
        }

        .qr-card::before {
          background: linear-gradient(90deg, #d11a2a, #f5a742, #111116);
          content: "";
          height: 5px;
          inset: 0 0 auto;
          position: absolute;
        }

        .qr-card-top {
          align-items: center;
          display: flex;
          gap: 8px;
          justify-content: space-between;
          margin-top: 7px;
          min-height: 34px;
        }

        .card-logo {
          display: block;
          height: auto;
          width: 108px;
        }

        .qr-card-top span,
        .card-footer span {
          color: #5f554b;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.15em;
          text-transform: uppercase;
        }

        .table-band {
          align-items: end;
          background: #111116;
          color: #ffffff;
          display: grid;
          grid-template-columns: 1fr auto;
          margin-top: 12px;
          padding: 10px 12px;
          text-align: left;
        }

        .table-band span {
          color: #b8b8bf;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }

        .table-band strong {
          color: #ffffff;
          font-size: 42px;
          line-height: 0.85;
        }

        .scan-label {
          color: #d11a2a;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.2em;
          margin: 12px 0 10px;
          text-transform: uppercase;
        }

        .qr-frame {
          align-items: center;
          align-self: center;
          background: #ffffff;
          border: 1px solid #d8d0c4;
          display: flex;
          justify-content: center;
          padding: 8px;
        }

        .qr-svg {
          height: 168px;
          width: 168px;
        }

        .qr-svg svg {
          display: block;
          height: 100%;
          width: 100%;
        }

        .qr-url {
          color: #5f554b;
          font-size: 9px;
          font-weight: 700;
          line-height: 1.25;
          margin: 10px 0 0;
          overflow-wrap: anywhere;
        }

        .card-footer {
          align-items: center;
          border-top: 1px solid #d8d0c4;
          display: flex;
          justify-content: space-between;
          margin-top: auto;
          padding-top: 10px;
        }

        .card-footer strong {
          color: #d11a2a;
          font-size: 18px;
        }

        @media print {
          @page {
            margin: 9mm;
          }

          .qr-print-page {
            background: #ffffff;
            padding: 0;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }

          .print-header {
            margin-bottom: 7mm;
            max-width: none;
          }

          .brand-logo {
            width: 42mm;
          }

          h1 {
            font-size: 24pt;
          }

          .base-warning {
            max-width: none;
          }

          .back-link {
            display: none;
          }

          .print-actions {
            display: none;
          }

          .qr-grid {
            gap: 4mm;
            grid-template-columns: repeat(4, 1fr);
            max-width: none;
          }

          .qr-card {
            break-inside: avoid;
            box-shadow: none;
            min-height: 68mm;
            padding: 3.5mm;
          }

          .card-logo {
            width: 29mm;
          }

          .table-band {
            margin-top: 3mm;
            padding: 2.5mm 3mm;
          }

          .table-band strong {
            font-size: 28pt;
          }

          .scan-label {
            font-size: 8pt;
            margin: 3mm 0 2mm;
          }

          .qr-svg {
            height: 36mm;
            width: 36mm;
          }

          .qr-url {
            font-size: 5.8pt;
          }
        }
      `}</style>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (() => {
              const printNow = () => window.print();
              document.querySelector("[data-print-now]")?.addEventListener("click", printNow);
              ${autoPrint ? "window.setTimeout(printNow, 350);" : ""}
            })();
          `,
        }}
      />
    </main>
  );
}
