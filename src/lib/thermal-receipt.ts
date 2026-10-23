// Pembentuk konten struk thermal (ESC/POS-friendly plain text 32 kolom).
//
// ISOMORPHIC: tidak memakai API Node apa pun (hanya Intl + string ops), jadi
// bisa dipanggil di server (route /api/print/thermal legacy) MAUPUN di browser
// (print-client.ts → agen cetak lokal saat app dijalankan di VPS). Satu sumber
// format struk supaya tampilan tidak pernah beda antar jalur cetak.

import { parseTableNumber } from "@/lib/garage-tables";
import { PAYMENT_STATUS_LABEL, paymentBalance, type PaymentStatus } from "@/lib/payment-status";
import { paperColumns, receiptQrMarker, wrapText, type ReceiptLayoutOptions } from "@/lib/receipt-layout";

export interface ThermalReceiptInput {
  invoiceNo?: string | null;
  orderNo?: string | null;
  /** "Meja 06" untuk dine-in; takeaway/delivery tidak dicetak sebagai meja. */
  tableLabel?: string | null;
  queueNo?: number | null;
  createdAt?: string | null;
  outlet?: { name?: string | null; code?: string | null } | null;
  cashier?: { name?: string | null } | null;
  /** Nama pelanggan (dicetak bila bukan placeholder "Guest Customer"/"Tamu"). */
  customer?: { name?: string | null } | null;
  /** Status pembayaran (bawaan: Pending untuk bill sementara, Lunas selain itu). */
  paymentStatus?: PaymentStatus | null;
  /** Jumlah sudah dibayar (bawaan: total bila Lunas, 0 bila Pending). */
  paidAmount?: number | null;
  payment?: {
    method?: string | null;
    cashReceived?: number | null;
    change?: number | null;
  } | null;
  items?: Array<{
    name?: string | null;
    itemName?: string | null;
    variant?: string | null;
    variantLabel?: string | null;
    qty?: number | null;
    unitPrice?: number | null;
    lineTotal?: number | null;
    package?: { groupId: string; entryName: string; packagePrice: number; entryQuantity: number } | null;
  }> | null;
  subtotal?: number | null;
  service?: number | null;
  tax?: number | null;
  discount?: number | null;
  total?: number | null;
  settings?: {
    serviceChargePct?: number | null;
    taxPct?: number | null;
    brandName?: string | null;
    brandTagline?: string | null;
    outletAddress?: string | null;
    outletPhone?: string | null;
    npwp?: string | null;
    receiptFooter?: string | null;
    receiptHeaderText?: string | null;
    receiptShowTaxBreakdown?: boolean | null;
    receiptShowMemberPoints?: boolean | null;
    cashDrawerOnPayment?: boolean | null;
  } | null;
  paymentMethod?: string | null;
  isReprint?: boolean | null;
  reprintAt?: string | null;
  // Bill sementara (belum dibayar) — dicetak dari detail meja sebelum Final Bayar.
  provisional?: boolean | null;
  // Struk khusus Delivery: data antar + ongkir sebagai baris terpisah (di luar penjualan).
  delivery?: {
    customerName?: string | null;
    customerPhone?: string | null;
    address?: string | null;
    courierName?: string | null;
    fee?: number | null;
  } | null;
  memberReward?: {
    level?: string | null;
    memberName?: string | null;
    pointsEarned?: number | null;
    totalPoints?: number | null;
  } | null;
  invoiceWebUrl?: string | null;
}

// ── Chit dapur/bar (tanpa harga) ────────────────────────────────────────────
// Struk perintah masak untuk station. Model "kasir pusat kendali": begitu kasir
// konfirmasi order, chit ini tercetak otomatis ke printer kasir. Dapur & bar
// tinggal ambil kertas & masak — nol interaksi sistem. Item dikelompokkan per
// station (DAPUR / BAR) supaya bisa disobek & dibagi meski 1 printer.

export interface KitchenChitItem {
  name: string;
  variant?: string | null;
  qty: number;
  note?: string | null;
  station: "Dapur" | "Bar" | string;
}

export interface KitchenChitInput {
  orderNo?: string | null;
  queueNo?: number | null;
  tableLabel?: string | null;
  orderType?: string | null;
  createdAt?: string | null;
  cashierName?: string | null;
  waiterName?: string | null;
  // Nama pemesan (tamu) — dicetak menonjol di bawah nomor meja supaya
  // bar/dapur/waiter tahu porsi ini milik siapa. Kosong = baris tidak dicetak.
  customerName?: string | null;
  // Delivery: dicetak di setiap chit supaya kurir/kasir tidak salah antar.
  customerPhone?: string | null;
  deliveryAddress?: string | null;
  // Detail tambahan tiket (owner, Okt 2026) — semua opsional.
  /** Catatan order umum (bukan per item). */
  orderNote?: string | null;
  /** 2+ = pesanan tambahan di meja yang sama. */
  addonSequence?: number | null;
  /** "high"/"rush"/"urgent" → banner PRIORITAS. */
  priority?: string | null;
  /** Target menit produksi (SLA) → jam target siap. */
  targetMinutes?: number | null;
  /** Petugas yang mencetak + waktu cetak (cetak manual dari kasir). */
  printedBy?: string | null;
  printedAt?: string | null;
  items: KitchenChitItem[];
}

function orderTypeLabel(raw: string): string {
  const key = String(raw ?? "").trim().toLowerCase();
  const map: Record<string, string> = {
    "dine-in": "Dine-in",
    dinein: "Dine-in",
    takeaway: "Takeaway",
    "take-away": "Takeaway",
    delivery: "Delivery",
    qr_table: "QR Meja",
    qr_takeaway: "QR Takeaway",
    "qr table": "Menu digital",
    qr: "Menu digital (QR)",
    pos: "Kasir (POS)",
    instagram: "Instagram",
    campaign: "Campaign",
  };
  return map[key] ?? String(raw ?? "").trim();
}

export function buildKitchenChitContent(
  input: KitchenChitInput,
  options: ReceiptLayoutOptions = {},
): string {
  // Lebar kolom mengikuti kertas perangkat: 58 mm = 32, 80 mm = 48.
  const W = paperColumns(options.width);
  const clean = (value: string | null | undefined) =>
    String(value ?? "").replace(/\s+/g, " ").trim();
  const center = (value: string) => {
    const text = clean(value).slice(0, W);
    const left = Math.max(0, Math.floor((W - text.length) / 2));
    return `${" ".repeat(left)}${text}`;
  };
  const fmtDate = (iso: string | null | undefined) =>
    iso
      ? new Intl.DateTimeFormat("id-ID", {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: "Asia/Jakarta",
        }).format(new Date(iso))
      : "-";

  // "Label : nilai" — nilai panjang dibungkus ke baris berikut, tidak dipotong.
  const field = (label: string, value: string) => {
    const prefix = `${label.padEnd(6)}: `;
    return wrapText(value, W - prefix.length).map((part, index) =>
      `${index === 0 ? prefix : " ".repeat(prefix.length)}${part}`,
    );
  };
  const fmtTime = (iso: string) =>
    new Intl.DateTimeFormat("id-ID", { timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(iso));

  // Urutan station: Dapur dulu, lalu Bar, lalu lainnya.
  const order = ["Dapur", "Bar"];
  const stations = Array.from(new Set(input.items.map((i) => i.station))).sort(
    (a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    },
  );

  const blocks: string[] = [];
  for (const station of stations) {
    const items = input.items.filter((i) => i.station === station);
    if (items.length === 0) continue;
    // "Langsung" (mineral, rokok) tidak diproduksi Bar/Dapur → blok pengingat untuk kasir.
    const handover = station === "Langsung";

    const rows: string[] = [];
    rows.push("=".repeat(W));
    rows.push(center(handover ? "*** SERAHKAN KASIR ***" : `*** ${clean(station).toUpperCase()} ***`));
    rows.push("=".repeat(W));
    if (input.queueNo != null) {
      rows.push(center(`ANTRIAN  #${input.queueNo}`));
      rows.push("=".repeat(W));
    }
    if ((input.addonSequence ?? 1) > 1) {
      rows.push(center(`+ TAMBAHAN KE-${input.addonSequence} +`));
    }
    if (/^(high|rush|urgent|tinggi)$/i.test(clean(input.priority))) {
      rows.push(center("!! PRIORITAS !!"));
    }
    // Nomor meja dibuat banner besar agar dapur/bar langsung tahu tujuan antar.
    const chitTable = parseTableNumber(input.tableLabel ?? null);
    if (chitTable) {
      rows.push(center(`>>> MEJA ${chitTable} <<<`));
      rows.push("-".repeat(W));
    } else {
      rows.push(`Meja  : ${clean(input.tableLabel) || "-"}`.slice(0, W));
    }
    const customer = clean(input.customerName);
    // "Guest Customer" = placeholder POS tanpa nama → tidak dicetak.
    if (customer && customer.toLowerCase() !== "guest customer") {
      rows.push(center(`NAMA: ${customer.toUpperCase()}`));
      rows.push("-".repeat(W));
    }
    const address = clean(input.deliveryAddress);
    if (address) {
      rows.push(center("*** DELIVERY ***"));
      // Alamat dipecah per 32 kolom — tidak dipotong.
      for (let i = 0; i < address.length; i += W - 7) {
        rows.push(`${i === 0 ? "Antar: " : "       "}${address.slice(i, i + W - 7)}`);
      }
      const phone = clean(input.customerPhone);
      if (phone) rows.push(`WA    : ${phone}`.slice(0, W));
      rows.push("-".repeat(W));
    }
    if (input.orderType) {
      rows.push(...field("Tipe", orderTypeLabel(input.orderType)));
    }
    rows.push(...field("Order", clean(input.orderNo) || "-"));
    rows.push(`Waktu : ${fmtDate(input.createdAt)}`.slice(0, W));
    const target = input.targetMinutes && input.createdAt
      ? new Date(new Date(input.createdAt).getTime() + input.targetMinutes * 60_000).toISOString()
      : null;
    if (target) {
      rows.push(`Target: ${input.targetMinutes} mnt (${fmtTime(target)})`.slice(0, W));
    }
    if (input.waiterName) {
      rows.push(...field("Waiter", clean(input.waiterName)));
    }
    if (clean(input.cashierName)) {
      rows.push(...field("Kasir", clean(input.cashierName)));
    }
    if (clean(input.printedBy)) {
      rows.push(...field("Cetak", `${fmtTime(input.printedAt ?? new Date().toISOString())} ${clean(input.printedBy)}`));
    } else if (!clean(input.cashierName)) {
      rows.push("Kasir : -");
    }
    rows.push("-".repeat(W));

    for (const item of items) {
      const name = clean(item.name).toUpperCase();
      const variant = clean(item.variant);
      const variantText =
        variant && variant.toLowerCase() !== "regular" ? ` (${variant})` : "";
      const qty = item.qty || 1;
      // Nama item di baris sendiri, teks tegas untuk juru masak.
      rows.push(`${qty}x ${name}${variantText}`.slice(0, W));
      const note = clean(item.note);
      if (note) {
        // Catatan dipecah per baris, tidak dipotong.
        for (const part of wrapText(note, W - 6)) rows.push(`   >> ${part}`);
      }
    }

    rows.push("-".repeat(W));
    const totalQty = items.reduce((sum, item) => sum + (item.qty || 1), 0);
    rows.push(`Jumlah: ${totalQty} item (${items.length} menu)`.slice(0, W));
    const orderNote = clean(input.orderNote);
    if (orderNote) {
      rows.push("Catatan order:");
      for (const part of wrapText(orderNote, W - 2)) rows.push(`  ${part}`);
    }
    rows.push("-".repeat(W));
    rows.push("");
    rows.push("");
    blocks.push(rows.join("\r\n"));
  }

  if (blocks.length === 0) return "";
  return blocks.join("\r\n") + "\r\n";
}

export function buildThermalContent(
  receipt: ThermalReceiptInput,
  options: ReceiptLayoutOptions = {},
): string {
  const currency = new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  });
  const fmt = (v: number | null | undefined) => currency.format(v ?? 0);
  const fmtDate = (iso: string | null | undefined) =>
    iso ? new Intl.DateTimeFormat("id-ID", {
      dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jakarta",
    }).format(new Date(iso)) : "-";
  // 58 mm = 32 kolom (default), 80 mm = 48 kolom — tata letak ikut lebar kertas.
  const W = paperColumns(options.width);

  const line = () => "-".repeat(W);
  const clean = (value: string | null | undefined) =>
    String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();
  const center = (value: string) => {
    const text = clean(value).slice(0, W);
    const left = Math.max(0, Math.floor((W - text.length) / 2));
    return `${" ".repeat(left)}${text}`;
  };
  // Teks panjang (mis. alamat outlet) dipecah per kata menjadi beberapa baris
  // tengah, bukan dipotong di 32 karakter.
  const centerWrapped = (value: string) => {
    const lines: string[] = [];
    let current = "";
    for (const word of clean(value).split(" ")) {
      if (!word) continue;
      const next = current ? `${current} ${word}` : word;
      if (next.length > W && current) {
        lines.push(center(current));
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(center(current));
    return lines;
  };
  const row = (left: string, right: string) => {
    const price = clean(right).slice(0, 13);
    const labelWidth = W - price.length;
    return clean(left).slice(0, labelWidth).padEnd(labelWidth) + price;
  };

  const rows: string[] = [];

  // REPRINT badge — muncul di paling atas struk untuk audit & cegah double-spending.
  if (receipt.isReprint) {
    rows.push("=".repeat(W));
    rows.push(center("*** CETAK ULANG ***"));
    if (receipt.reprintAt) {
      rows.push(center(fmtDate(receipt.reprintAt)));
    }
    rows.push("=".repeat(W));
    rows.push("");
  }

  // BILL SEMENTARA badge — tagihan belum dibayar, bukan bukti pembayaran.
  if (receipt.provisional) {
    rows.push("=".repeat(W));
    rows.push(center("*** BILL SEMENTARA ***"));
    rows.push(center("BELUM DIBAYAR"));
    rows.push("=".repeat(W));
    rows.push("");
  }

  // Custom multi-line header dari settings — kalau di-isi, replace brand + address default.
  const customHeader = (receipt.settings?.receiptHeaderText ?? "").trim();
  if (customHeader) {
    for (const headerLine of customHeader.split(/\r?\n/)) {
      const trimmed = headerLine.trim();
      if (trimmed) rows.push(center(trimmed.slice(0, W)));
    }
  } else {
    rows.push(center(receipt.settings?.brandName || "GARAGE"));
    rows.push(center(receipt.settings?.brandTagline || "Coffee · Tebing Tinggi"));
    if (receipt.settings?.outletAddress) {
      rows.push(...centerWrapped(receipt.settings.outletAddress));
    }
  }
  if (receipt.settings?.outletPhone) {
    rows.push(center(receipt.settings.outletPhone));
  }
  if (receipt.settings?.npwp) {
    rows.push(center(`NPWP ${receipt.settings.npwp}`));
  }
  if (receipt.outlet?.code) {
    rows.push(center(receipt.outlet.code));
  }
  rows.push(line());
  if (receipt.queueNo != null) {
    rows.push(center(`ANTRIAN  #${receipt.queueNo}`));
    rows.push(line());
  }
  const receiptTable = parseTableNumber(receipt.tableLabel ?? null);
  if (receiptTable) {
    rows.push(center(`MEJA ${receiptTable}`));
    rows.push(line());
  }
  rows.push(`Order : ${clean(receipt.orderNo) || "-"}`.slice(0, W));
  rows.push(`Inv   : ${clean(receipt.invoiceNo) || "-"}`.slice(0, W));
  rows.push(`Waktu : ${fmtDate(receipt.createdAt)}`.slice(0, W));
  rows.push(`Kasir : ${clean(receipt.cashier?.name) || "-"}`.slice(0, W));
  const customerName = clean(receipt.customer?.name);
  if (customerName && !receipt.delivery && !/^(guest customer|tamu|pelanggan)$/i.test(customerName)) {
    for (const [index, part] of wrapText(customerName, W - 8).entries()) {
      rows.push(`${index === 0 ? "Nama  : " : "        "}${part}`.slice(0, W));
    }
  }
  rows.push(line());

  // Blok DELIVERY: nama, WA, alamat utuh (dibungkus per kata), kurir.
  const delivery = receipt.delivery;
  if (delivery) {
    rows.push("=".repeat(W));
    rows.push(center("*** DELIVERY ***"));
    rows.push("=".repeat(W));
    const customer = clean(delivery.customerName);
    if (customer) rows.push(`Nama  : ${customer}`.slice(0, W));
    const phone = clean(delivery.customerPhone);
    if (phone) rows.push(`WA    : ${phone}`.slice(0, W));
    const address = clean(delivery.address);
    if (address) {
      let current = "";
      let first = true;
      const flush = () => {
        rows.push(`${first ? "Alamat: " : "        "}${current}`);
        first = false;
        current = "";
      };
      for (const word of address.split(" ")) {
        const next = current ? `${current} ${word}` : word;
        if (next.length > W - 8 && current) {
          flush();
          current = word.slice(0, W - 8);
        } else {
          current = next.slice(0, W - 8);
        }
      }
      if (current) flush();
    }
    const courier = clean(delivery.courierName);
    rows.push(`Kurir : ${courier || "-"}`.slice(0, W));
    rows.push(line());
  }

  // Paket event: satu baris "1x <nama paket>  <harga final>" + isi paket tanpa harga.
  const printedPackages = new Set<string>();
  for (const item of receipt.items || []) {
    if (item.package) {
      const pkg = item.package;
      if (printedPackages.has(pkg.groupId)) continue;
      printedPackages.add(pkg.groupId);
      const members = (receipt.items || []).filter((row) => row.package?.groupId === pkg.groupId);
      const pkgTotal = members.reduce((sum, row) => sum + (row.lineTotal || (row.unitPrice || 0) * (row.qty || 1)), 0);
      // Jumlah paket dari total ÷ harga paket (benar juga untuk bill pisahan/refund sebagian).
      const pkgQty = pkg.packagePrice > 0 ? Math.max(1, Math.round(pkgTotal / pkg.packagePrice)) : pkg.entryQuantity;
      const pkgTotalText = fmt(pkgTotal);
      const pkgLines = wrapText(`${pkgQty}x ${clean(pkg.entryName)}`, W - pkgTotalText.length - 1);
      rows.push(row(pkgLines[0] ?? "", pkgTotalText));
      for (const extra of pkgLines.slice(1)) rows.push(`   ${extra}`.slice(0, W));
      for (const member of members) {
        const memberVariant = clean(member.variant || member.variantLabel);
        const perPackage = Math.max(1, Math.round((member.qty || 1) / Math.max(1, pkgQty)));
        const label = `${perPackage > 1 ? `${perPackage}x ` : ""}${clean(member.name || member.itemName || "Item")}${memberVariant && memberVariant !== "Regular" ? ` ${memberVariant}` : ""}`;
        for (const [index, part] of wrapText(label, W - 5).entries()) rows.push(`${index === 0 ? "   - " : "     "}${part}`.slice(0, W));
      }
      continue;
    }
    const name = clean(item.name || item.itemName || "Item");
    const variant = clean(item.variant || item.variantLabel);
    const qty = item.qty || 1;
    const price = item.unitPrice || 0;
    const total = item.lineTotal || price * qty;
    const variantText = variant && variant !== "Regular" ? ` ${variant}` : "";
    // Nama item panjang dibungkus ke baris berikut — tidak pernah terpotong,
    // dan harga baris selalu utuh di kanan baris pertama.
    const totalText = fmt(total);
    const nameLines = wrapText(`${qty}x ${name}${variantText}`, W - totalText.length - 1);
    rows.push(row(nameLines[0] ?? "", totalText));
    for (const extra of nameLines.slice(1)) rows.push(`   ${extra}`.slice(0, W));
    rows.push(`   @ ${fmt(price)}`.slice(0, W));
  }

  rows.push(line());
  // showTaxBreakdown: default true. Kalau false, hide line service & PB1 (tetap include di total).
  const showTaxBreakdown = receipt.settings?.receiptShowTaxBreakdown !== false;
  if (showTaxBreakdown) {
    rows.push(row("Subtotal", fmt(receipt.subtotal)));
    if ((receipt.service || 0) > 0) {
      rows.push(row(`Service ${receipt.settings?.serviceChargePct ?? 5}%`, fmt(receipt.service)));
    }
    if ((receipt.tax || 0) > 0) {
      rows.push(row(`PB1 ${receipt.settings?.taxPct ?? 10}%`, fmt(receipt.tax)));
    }
  }
  if ((receipt.discount || 0) > 0) {
    rows.push(row("Diskon", `-${fmt(receipt.discount)}`));
  }
  const deliveryFee = receipt.delivery?.fee ?? 0;
  if (deliveryFee > 0) {
    // Ongkir terpisah dari harga menu (sudah termasuk di TOTAL).
    rows.push(row("Ongkir delivery", fmt(deliveryFee)));
  }
  rows.push(row("TOTAL", fmt(receipt.total)));

  // Status pembayaran terpisah dari metode (owner, Okt 2026).
  const status: PaymentStatus = receipt.paymentStatus ?? (receipt.provisional ? "pending" : "paid");
  const balance = paymentBalance(receipt.total || 0, status, receipt.paidAmount);
  const method = clean(receipt.payment?.method || receipt.paymentMethod);
  rows.push(line());
  rows.push(row("STATUS", PAYMENT_STATUS_LABEL[status].toUpperCase()));
  rows.push(row("Metode", status === "pending" && !balance.paid ? "-" : method || "-"));
  rows.push(row("Dibayar", fmt(balance.paid)));
  if (status === "pending" && balance.balanceDue > 0) {
    rows.push(row("Sisa tagihan", fmt(balance.balanceDue)));
  }

  const cash = receipt.payment?.cashReceived;
  if (status === "paid" && cash && cash > 0) {
    rows.push(row("Tunai", fmt(cash)));
    rows.push(row("Kembali", fmt(receipt.payment?.change || 0)));
  }

  // Member reward block — wired ke setting receiptShowMemberPoints.
  const showMemberPoints = receipt.settings?.receiptShowMemberPoints !== false;
  if (showMemberPoints && receipt.memberReward?.memberName) {
    rows.push(line());
    rows.push(center(`Member: ${clean(receipt.memberReward.memberName).slice(0, W - 8)}`));
    if (receipt.memberReward.level) {
      rows.push(center(`Tier: ${clean(receipt.memberReward.level)}`));
    }
    if ((receipt.memberReward.pointsEarned ?? 0) > 0) {
      rows.push(row("Poin +", String(receipt.memberReward.pointsEarned)));
    }
    if ((receipt.memberReward.totalPoints ?? 0) > 0) {
      rows.push(row("Total poin", String(receipt.memberReward.totalPoints)));
    }
  }

  rows.push(line());
  rows.push(...centerWrapped(receipt.settings?.receiptFooter || "TERIMA KASIH"));
  if (receipt.isReprint) {
    rows.push(...centerWrapped("(salinan struk - bukan transaksi baru)"));
  }
  if (receipt.provisional) {
    rows.push(...centerWrapped("(bukan bukti pembayaran)"));
  }
  if (receipt.invoiceWebUrl) {
    // QR tracking invoice (owner, Okt 2026): pelanggan scan untuk cek status
    // pesanan & invoice. Link teks tetap dicetak sebagai cadangan.
    const invoiceUrl = absoluteInvoiceUrl(receipt.invoiceWebUrl);
    rows.push("");
    rows.push(center("SCAN UNTUK CEK PESANAN"));
    rows.push(receiptQrMarker(invoiceUrl));
    rows.push(...centerWrapped("Status pesanan & invoice"));
    rows.push(center("Atau buka link:"));
    // Link utuh (dipecah per baris, tidak dipotong) agar bisa diketik ulang.
    for (const part of splitUrl(invoiceUrl, W)) rows.push(center(part));
  }
  rows.push("");

  let output = rows.join("\r\n");

  // Wire: cashDrawerOnPayment → ESC/POS drawer kick command setelah print.
  // Standard kick code (Epson-compatible): ESC p m t1 t2 → 1B 70 00 19 FA.
  // Hanya fire kalau setting on AND payment method = cash AND bukan reprint.
  const shouldKickDrawer =
    receipt.settings?.cashDrawerOnPayment !== false &&
    (receipt.paymentMethod ?? "").toLowerCase() === "cash" &&
    !receipt.isReprint &&
    !receipt.provisional;
  if (shouldKickDrawer) {
    const drawerKick = "\x1B\x70\x00\x19\xFA";
    output = output + "\r\n" + drawerKick;
  }

  return output;
}

/** Link invoice relatif ("/invoice/…") → absolut memakai origin aplikasi. */
function absoluteInvoiceUrl(url: string) {
  const value = url.trim();
  if (/^https?:\/\//i.test(value)) return value;
  const origin = typeof globalThis.location?.origin === "string" ? globalThis.location.origin : "";
  return `${origin}${value.startsWith("/") ? "" : "/"}${value}`;
}

/** Pecah URL panjang per `width` karakter (URL tidak punya spasi untuk dibungkus). */
function splitUrl(url: string, width: number) {
  const parts: string[] = [];
  for (let i = 0; i < url.length; i += width) parts.push(url.slice(i, i + width));
  return parts;
}
