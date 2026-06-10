import type { Metadata } from "next";

import {
  MemberOrderPage,
  type CustomerOrderQrContext,
} from "@/components/garage/member-order-page";
import type { MenuItem } from "@/lib/garage-api-types";
import { getBestSellerMenuItemIds, getMenuData } from "@/lib/garage-service";

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
  const tableLabel = rawTable
    ? rawTable.toLowerCase().startsWith("meja")
      ? rawTable
      : `Meja ${rawTable}`
    : orderType === "dine-in"
      ? "Meja QR"
      : "Take away";

  return {
    tableLabel,
    orderType,
    source,
    outletId: uuidOrUndefined(firstParam(params, "outletId")),
    campaign: firstParam(params, "campaign")?.trim() || undefined,
  };
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

async function getInitialMenuItems(): Promise<MenuItem[] | undefined> {
  try {
    return await getMenuData();
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
  const [initialMenuItems, bestSellerIds] = await Promise.all([
    getInitialMenuItems(),
    getBestSellerMenuItemIds().catch(() => [] as string[]),
  ]);
  return (
    <MemberOrderPage
      initialQrContext={buildQrContext(params)}
      initialReturnPath={buildReturnPath(params)}
      initialSearchQuery={buildInitialSearchQuery(params)}
      initialMenuItems={initialMenuItems}
      bestSellerIds={bestSellerIds}
    />
  );
}
