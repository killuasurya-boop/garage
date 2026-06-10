// Pembentuk konten struk thermal (ESC/POS-friendly plain text 32 kolom).
//
// ISOMORPHIC: tidak memakai API Node apa pun (hanya Intl + string ops), jadi
// bisa dipanggil di server (route /api/print/thermal legacy) MAUPUN di browser
// (print-client.ts → agen cetak lokal saat app dijalankan di VPS). Satu sumber
// format struk supaya tampilan tidak pernah beda antar jalur cetak.

export interface ThermalReceiptInput {
  invoiceNo?: string | null;
  orderNo?: string | null;
  createdAt?: string | null;
  outlet?: { name?: string | null; code?: string | null } | null;
  cashier?: { name?: string | null } | null;
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
  memberReward?: {
    level?: string | null;
    memberName?: string | null;
    pointsEarned?: number | null;
    totalPoints?: number | null;
  } | null;
  invoiceWebUrl?: string | null;
}

export function buildThermalContent(receipt: ThermalReceiptInput): string {
  const currency = new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  });
  const fmt = (v: number | null | undefined) => currency.format(v ?? 0);
  const fmtDate = (iso: string | null | undefined) =>
    iso ? new Intl.DateTimeFormat("id-ID", {
      dateStyle: "short", timeStyle: "short",
    }).format(new Date(iso)) : "-";
  const W = 32; // 57/58mm thermal paper, Generic/Text driver.

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

  // Custom multi-line header dari settings — kalau di-isi, replace brand + address default.
  const customHeader = (receipt.settings?.receiptHeaderText ?? "").trim();
  if (customHeader) {
    for (const headerLine of customHeader.split(/\r?\n/)) {
      const trimmed = headerLine.trim();
      if (trimmed) rows.push(center(trimmed.slice(0, W)));
    }
  } else {
    rows.push(center(receipt.settings?.brandName || "GARAGE"));
    rows.push(center(receipt.settings?.brandTagline || "Coffee & Motor"));
    if (receipt.settings?.outletAddress) {
      rows.push(center(receipt.settings.outletAddress));
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
  rows.push(`Order : ${clean(receipt.orderNo) || "-"}`.slice(0, W));
  rows.push(`Inv   : ${clean(receipt.invoiceNo) || "-"}`.slice(0, W));
  rows.push(`Waktu : ${fmtDate(receipt.createdAt)}`.slice(0, W));
  rows.push(`Kasir : ${clean(receipt.cashier?.name) || "-"}`.slice(0, W));
  rows.push(line());

  for (const item of receipt.items || []) {
    const name = clean(item.name || item.itemName || "Item");
    const variant = clean(item.variant || item.variantLabel);
    const qty = item.qty || 1;
    const price = item.unitPrice || 0;
    const total = item.lineTotal || price * qty;
    const variantText = variant && variant !== "Regular" ? ` ${variant}` : "";
    rows.push(row(`${qty}x ${name}${variantText}`, fmt(total)));
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
  rows.push(row("TOTAL", fmt(receipt.total)));

  const cash = receipt.payment?.cashReceived;
  if (cash && cash > 0) {
    rows.push(line());
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
  rows.push(center(receipt.settings?.receiptFooter || "TERIMA KASIH"));
  if (receipt.isReprint) {
    rows.push(center("(salinan struk — bukan transaksi baru)"));
  }
  if (receipt.invoiceWebUrl) {
    rows.push("");
    rows.push(center("Cek invoice online:"));
    rows.push(center(clean(receipt.invoiceWebUrl).slice(0, W)));
  }
  rows.push("");

  let output = rows.join("\r\n");

  // Wire: cashDrawerOnPayment → ESC/POS drawer kick command setelah print.
  // Standard kick code (Epson-compatible): ESC p m t1 t2 → 1B 70 00 19 FA.
  // Hanya fire kalau setting on AND payment method = cash AND bukan reprint.
  const shouldKickDrawer =
    receipt.settings?.cashDrawerOnPayment !== false &&
    (receipt.paymentMethod ?? "").toLowerCase() === "cash" &&
    !receipt.isReprint;
  if (shouldKickDrawer) {
    const drawerKick = "\x1B\x70\x00\x19\xFA";
    output = output + "\r\n" + drawerKick;
  }

  return output;
}
