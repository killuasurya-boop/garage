/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Garage Thermal Print Server
 * Prints receipts directly to RPP02N (ESC/POS) printer
 * Run: node scripts/thermal-print-server.js
 *
 * Connects to RPP02N via network (TCP) or USB (using node-thermal-printer)
 */

const http = require("http");
const net = require("net");

// ─── Configuration ───────────────────────────────────────────
const PORT = 9100;             // Local server port
const PRINTER_HOST = process.env.PRINTER_HOST || "192.168.100.100";  // RPP02N IP
const PRINTER_PORT = parseInt(process.env.PRINTER_PORT || "9100");    // RPP02N port (RAW)
// ─────────────────────────────────────────────────────────────

// ─── ESC/POS Commands ──────────────────────────────────────
const ESC = "\x1B";
const GS = "\x1D";
const LF = "\x0A";
const ESC_POS = {
  INIT:       ESC + "@",                         // Initialize printer
  ALIGN_C:    ESC + "a\x01",                    // Center align
  ALIGN_L:    ESC + "a\x00",                    // Left align
  ALIGN_R:    ESC + "a\x02",                    // Right align
  BOLD_ON:    ESC + "E\x01",                    // Bold on
  BOLD_OFF:   ESC + "E\x00",                    // Bold off
  DOUBLE_ON:  ESC + "G\x01",                    // Double width on
  DOUBLE_OFF: ESC + "G\x00",                    // Double width off
  UNDERLINE_ON:  ESC + "-\x01",                // Underline on
  UNDERLINE_OFF: ESC + "-\x00",                // Underline off
  FONT_A:     ESC + "M\x00",                    // Font A (12pt)
  FONT_B:     ESC + "M\x01",                    // Font B (9pt)
  TEXT_NORMAL: ESC + "!\x00",                   // Normal text
  TEXT_BOLD:   ESC + "!\x08",                  // Bold
  TEXT_LARGE:  ESC + "!\x30",                  // Double height+width
  TEXT_WIDE:   ESC + "!\x10",                  // Double width
  TEXT_HEIGHT: ESC + "!\x20",                  // Double height
  CUT:         GS + "V\x00",                    // Full cut
  CUT_PARTIAL: GS + "V\x01",                    // Partial cut
  FEED_3:     ESC + "d3",                       // Feed 3 lines
  FEED_5:     ESC + "d5",                       // Feed 5 lines
  FEED_N:     (n) => ESC + "d" + String.fromCharCode(n), // Feed n lines
  OPEN_DRAWER: ESC + "p\x00\x19\xFA",         // Open cash drawer
  BEEP:       ESC + "(",                         // Beep
  BARCODE_HRI: GS + "H\x02",                   // Barcode human readable
  LN:         LF,                                // Line feed
};

// ─── Utilities ──────────────────────────────────────────────
const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

function line(width = 32) {
  return "─".repeat(width);
}

function padRight(text, width = 32) {
  return String(text).slice(0, width).padEnd(width);
}

function padLeft(text, width = 32) {
  return String(text).padStart(width);
}

function fmtDate(iso) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

// ─── Build Thermal Receipt Buffer ─────────────────────────────
function buildThermalReceipt(receipt) {
  const W = 32; // 58mm paper width in chars
  const lines = [];

  // Init
  lines.push(ESC_POS.INIT);

  // Header - BRAND
  lines.push(ESC_POS.ALIGN_C);
  lines.push(ESC_POS.TEXT_LARGE + ESC_POS.BOLD_ON);
  lines.push("GARAGE");
  lines.push(ESC_POS.TEXT_NORMAL + ESC_POS.BOLD_OFF + ESC_POS.LN);
  lines.push("Coffee & Motor");
  lines.push(ESC_POS.LN);

  // Outlet
  lines.push(padRight(receipt.outlet?.name || "GARAGE Outlet", W));
  lines.push(padRight(receipt.outlet?.code || "", W));
  lines.push(ESC_POS.LN);

  // Separator
  lines.push(ESC_POS.ALIGN_L);
  lines.push(line(W));
  lines.push(ESC_POS.LN);

  // Meta info
  lines.push(`Invoice : ${receipt.invoiceNo || "-"}`);
  lines.push(`Order   : ${receipt.orderNo || "-"}`);
  lines.push(`Tanggal : ${fmtDate(receipt.createdAt)}`);
  lines.push(`Kasir   : ${receipt.cashier?.name || "-"}`);
  lines.push(line(W));
  lines.push(ESC_POS.LN);

  // Items
  lines.push(ESC_POS.BOLD_ON + padRight("Item", W - 9) + padLeft("Total", 9) + ESC_POS.BOLD_OFF);
  lines.push(line(W));
  for (const item of receipt.items || []) {
    const name = `${item.name || item.itemName || "Item"}`;
    const variant = item.variant || item.variantLabel || "";
    const qty = item.qty || 1;
    const total = currency.format(item.lineTotal || item.unitPrice * qty);

    // Item name (may wrap)
    const itemLine = `  ${name}${variant ? ` (${variant})` : ""}`;
    const lines_item = [];
    for (let i = 0; i < itemLine.length; i += W) {
      lines_item.push(itemLine.slice(i, i + W));
    }
    lines.push(...lines_item);

    // Qty x price = total
    const pricePerUnit = currency.format(item.unitPrice || 0);
    lines.push(padRight(`  ${qty}x ${pricePerUnit}`, W - 9) + padLeft(total, 9));
    lines.push(ESC_POS.LN);
  }

  lines.push(line(W));
  lines.push(ESC_POS.LN);

  // Totals
  lines.push(padRight("Subtotal", W - 12) + padLeft(currency.format(receipt.subtotal || 0), 12));
  lines.push(padRight("Service (5%)", W - 12) + padLeft(currency.format(receipt.service || 0), 12));
  if ((receipt.discount || 0) > 0) {
    lines.push(padRight("Diskon", W - 12) + padLeft("-" + currency.format(receipt.discount), 12));
  }
  lines.push(line(W));
  lines.push(ESC_POS.BOLD_ON + ESC_POS.TEXT_WIDE +
    padRight("TOTAL", W - 14) + padLeft(currency.format(receipt.total || 0), 14) +
    ESC_POS.TEXT_NORMAL + ESC_POS.BOLD_OFF);
  lines.push(ESC_POS.LN);

  // Cash received & change (for Cash payment)
  const paymentData = receipt.payment || {};
  if ((paymentData.cashReceived || 0) > 0) {
    lines.push(ESC_POS.LN);
    lines.push(padRight("Tunai", W - 12) + padLeft(currency.format(paymentData.cashReceived), 12));
    lines.push(padRight("Kembalian", W - 12) + padLeft(currency.format(paymentData.change || 0), 12));
  }

  lines.push(ESC_POS.LN);
  lines.push(line(W));
  lines.push(ESC_POS.ALIGN_C);
  lines.push("Terima kasih atas kunjungan Anda!");
  lines.push(ESC_POS.LN);
  if (receipt.invoiceWebUrl) {
    lines.push(receipt.invoiceWebUrl);
    lines.push(ESC_POS.LN);
  }
  lines.push(ESC_POS.LN);
  lines.push(ESC_POS.LN);

  // Cut paper
  lines.push(ESC_POS.FEED_5);
  lines.push(ESC_POS.CUT);

  // Join all lines into a single string buffer
  return lines.join("\n");
}

// ─── Print via Network (RAW TCP) ─────────────────────────────
function printViaNetwork(buffer) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.setTimeout(8000);

    client.connect(PRINTER_PORT, PRINTER_HOST, () => {
      client.write(Buffer.from(buffer, "utf8"), () => {
        client.end();
        resolve({ success: true, printer: `${PRINTER_HOST}:${PRINTER_PORT}` });
      });
    });

    client.on("error", (err) => {
      reject(new Error(`Network print failed: ${err.message}. Check IP ${PRINTER_HOST}:${PRINTER_PORT}`));
    });

    client.on("timeout", () => {
      client.destroy();
      reject(new Error(`Printer connection timeout: ${PRINTER_HOST}:${PRINTER_PORT}`));
    });
  });
}

// ─── HTTP Server ─────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Health check
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", printer: `${PRINTER_HOST}:${PRINTER_PORT}` }));
    return;
  }

  // Print endpoint
  if (req.method === "POST" && (url.pathname === "/print" || url.pathname === "/print/thermal")) {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const data = JSON.parse(body);
        const receipt = data.receipt;

        if (!receipt) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing receipt data" }));
          return;
        }

        const buffer = buildThermalReceipt(receipt);
        await printViaNetwork(buffer);

        console.log(`[${new Date().toISOString()}] Printed: ${receipt.invoiceNo || receipt.orderNo} -> ${PRINTER_HOST}:${PRINTER_PORT}`);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          invoiceNo: receipt.invoiceNo,
          printer: `${PRINTER_HOST}:${PRINTER_PORT}`,
        }));
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Print error:`, err.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Status endpoint
  if (req.method === "GET" && url.pathname === "/print/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      printer: `${PRINTER_HOST}:${PRINTER_PORT}`,
      ready: true,
    }));
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`\n🔥 Garage Thermal Print Server`);
  console.log(`   Port: http://localhost:${PORT}`);
  console.log(`   Printer: ${PRINTER_HOST}:${PRINTER_PORT} (RPP02N)`);
  console.log(`   Endpoints:`);
  console.log(`   POST /print        → Print thermal receipt`);
  console.log(`   GET  /health        → Health check`);
  console.log(`   GET  /print/status  → Printer status`);
  console.log(`\n   Env: PRINTER_HOST, PRINTER_PORT\n`);
});

server.on("error", (err) => {
  console.error(`Server error: ${err.message}`);
  process.exit(1);
});
