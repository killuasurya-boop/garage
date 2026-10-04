import type { Metadata } from "next";

import {
  MemberOrderPage,
  type CustomerOrderQrContext,
} from "@/components/garage/member-order-page";
import type { MenuItem } from "@/lib/garage-api-types";
import { resolveOrderCampaign } from "@/lib/order-campaign";
import { requireGarageSession } from "@/lib/server-auth";
import { parseTableNumber, tableLabelFor } from "@/lib/garage-tables";
import {
  getActiveTableNumbers,
  getBestSellerMenuItemIds,
  getCustomerOrderBillingSettings,
  getCustomerOrderingStatus,
  getMenuData,
} from "@/lib/garage-service";

export const metadata: Metadata = {
  title: "Digital Menu - Garage Coffee & Motor",
  description: "QR digital menu Garage Coffee & Motor untuk guest, member, dan invoice WhatsApp.",
};

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function uuidOrUndefined(value?: string) {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : undefined;
}

function buildQrContext(params: SearchParams): CustomerOrderQrContext {
  const rawTable = firstParam(params, "tableLabel") ?? firstParam(params, "table");
  const rawSource = firstParam(params, "source");
  const source =
    rawSource === "instagram" || rawSource === "campaign" || rawSource === "qr_takeaway"
      ? rawSource
      : "qr_table";
  const orderType = source === "qr_takeaway" ? "takeaway" : "dine-in";
  // Dine-in: nomor meja dirapikan ("6" → "Meja 06"). Nomor tidak valid/tidak ada
  // ditandai sejak halaman dibuka (bukan baru ditolak saat checkout).
  const tableNumber = orderType === "dine-in" ? parseTableNumber(rawTable ?? null) : null;
  const tableLabel =
    orderType !== "dine-in"
      ? "Take away"
      : tableNumber
        ? tableLabelFor(tableNumber)
        : "Meja ?";
  const tableIssue =
    orderType === "dine-in" && !tableNumber
      ? rawTable
        ? `Nomor meja "${rawTable.slice(0, 12)}" tidak dikenali. Scan ulang QR di meja Anda atau minta bantuan kasir.`
        : "QR ini tidak menyertakan nomor meja. Scan QR yang menempel di meja Anda atau minta bantuan kasir."
      : undefined;

  return {
    tableLabel,
    orderType,
    source,
    outletId: uuidOrUndefined(firstParam(params, "outletId")),
    campaign: resolveOrderCampaign((key) => firstParam(params, key)),
    tableIssue,
  };
}

// Meja valid tapi dinonaktifkan di Atur Meja → beri tahu sebelum pelanggan memilih menu.
async function withActiveTableCheck(context: CustomerOrderQrContext): Promise<CustomerOrderQrContext> {
  if (context.orderType !== "dine-in" || context.tableIssue) return context;
  const tableNumber = parseTableNumber(context.tableLabel);
  if (!tableNumber) return context;
  try {
    const active = await getActiveTableNumbers(context.outletId);
    if (!active.includes(tableNumber)) {
      return {
        ...context,
        tableIssue: `${context.tableLabel} sedang tidak dipakai. Silakan pindah ke meja lain atau minta bantuan kasir.`,
      };
    }
  } catch {
    // DB tidak terjangkau → validasi tetap terjadi di server saat checkout.
  }
  return context;
}

function buildReturnPath(params: SearchParams) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    } else if (value) {
      query.set(key, value);
    }
  }
  const queryString = query.toString();
  return queryString ? `/order?${queryString}` : "/order";
}

function buildInitialSearchQuery(params: SearchParams) {
  return (firstParam(params, "q") ?? firstParam(params, "item") ?? "").trim().slice(0, 80);
}

// Mode waiter (/order?table=5&mode=waiter dari aplikasi waiter): hanya aktif bila ada
// sesi staf yang sah. Tanpa sesi → halaman tetap menu pelanggan biasa.
async function getStaffOrder(params: SearchParams) {
  if (firstParam(params, "mode") !== "waiter") return null;
  try {
    const session = await requireGarageSession(["Owner", "Manajer", "Kasir", "Waiter"]);
    if (!session.data) return null;
    return { name: session.data.user.name, backHref: "/os?module=waiter" };
  } catch {
    return null;
  }
}

async function getInitialMenuItems(): Promise<MenuItem[] | undefined> {
  try {
    return await getMenuData({ channel: "digital" });
  } catch {
    return undefined;
  }
}

export default async function OrderPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const qrContext = await withActiveTableCheck(buildQrContext(params));
  const [initialMenuItems, bestSellerIds, billing, ordering, staffOrder] = await Promise.all([
    getInitialMenuItems(),
    getBestSellerMenuItemIds().catch(() => [] as string[]),
    // Pengaturan tagihan outlet (service/PB1/pembulatan) → total di HP pelanggan
    // sama dengan yang ditagih kasir.
    getCustomerOrderBillingSettings(qrContext.outletId).catch(() => undefined),
    // Shift kasir buka? → banner "Belum buka" sejak awal, bukan baru saat checkout.
    getCustomerOrderingStatus(qrContext.outletId).catch(() => undefined),
    getStaffOrder(params),
  ]);
  return (
    <MemberOrderPage
      initialQrContext={qrContext}
      initialReturnPath={buildReturnPath(params)}
      initialSearchQuery={buildInitialSearchQuery(params)}
      initialMenuItems={initialMenuItems}
      bestSellerIds={bestSellerIds}
      billing={billing}
      initialOrderingOpen={ordering?.open}
      staffOrder={staffOrder}
    />
  );
}
