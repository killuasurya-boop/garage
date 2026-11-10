// =============================================================================
// Aturan suara Production Hub (Smart Notification V2) — murni, diuji unit.
// - Perangkat stasiun hanya bersuara untuk stasiunnya sendiri (Bar ≠ Dapur),
//   walau tampilan diganti ke "Semua" (temuan F-05).
// - Tiket baru dalam satu refresh = SATU tone + satu voice per stasiun (bukan per item).
// - "Pesanan siap" hanya saat SEMUA tiket aktif pesanan itu siap, dan hanya di
//   perangkat yang tiketnya menjadi siap terakhir (temuan F-04).
// - Muat pertama (prev = null) tidak pernah berbunyi (refresh/reconnect aman).
// =============================================================================

export type HubSoundArea = "all" | "Bar" | "Food";

export type HubSoundTicket = {
  ticketNo: string;
  orderId: string | null;
  orderNo: string | null;
  station: "Bar" | "Food";
  status: string;
  table: string;
  channel: string;
  readyAt: string | null;
  handoverAt: string | null;
};

export type HubSoundEvent =
  | { type: "new"; station: "Bar" | "Food"; ticketNos: string[]; table: string | null; orderNo: string | null; key: string }
  | { type: "online_new"; ticketNo: string; channel: string; key: string }
  | { type: "cooking"; ticketNo: string; station: "Bar" | "Food"; table: string; key: string }
  | { type: "order_ready"; orderKey: string; table: string; orderNo: string | null; key: string };

/** Area suara perangkat: stasiun akun bila ada, selain itu area tampilan (Owner/Manajer/kasir). */
export function soundAreaFor(stationOfDevice: HubSoundArea, viewArea: HubSoundArea): HubSoundArea {
  return stationOfDevice === "all" ? viewArea : stationOfDevice;
}

export function inSoundArea(area: HubSoundArea, station: string) {
  return area === "all" || area === station;
}

function orderKeyOf(ticket: HubSoundTicket) {
  return ticket.orderId ?? ticket.orderNo ?? ticket.ticketNo;
}

export function hubSoundEvents(
  prev: Map<string, string> | null,
  tickets: HubSoundTicket[],
  area: HubSoundArea,
  isOnline: (channel: string) => boolean,
): HubSoundEvent[] {
  if (!prev) return [];
  const events: HubSoundEvent[] = [];
  const freshByStation = new Map<"Bar" | "Food", HubSoundTicket[]>();
  const readyKeys = new Set<string>();

  for (const t of tickets) {
    if (!inSoundArea(area, t.station)) continue;
    const before = prev.get(t.ticketNo);
    if (!before) {
      const list = freshByStation.get(t.station) ?? [];
      list.push(t);
      freshByStation.set(t.station, list);
      if (isOnline(t.channel)) events.push({ type: "online_new", ticketNo: t.ticketNo, channel: t.channel, key: `hub:online:${t.ticketNo}` });
      continue;
    }
    if (before === "queue" && t.status === "cooking") {
      events.push({ type: "cooking", ticketNo: t.ticketNo, station: t.station, table: t.table, key: `hub:cook:${t.ticketNo}` });
    } else if (before !== "ready" && t.status === "ready") {
      const orderKey = orderKeyOf(t);
      const siblings = tickets.filter((other) => orderKeyOf(other) === orderKey);
      if (!siblings.every((other) => other.status === "ready")) continue; // stasiun lain belum siap
      const key = `hub:order-ready:${orderKey}:${t.readyAt ?? t.ticketNo}`;
      if (readyKeys.has(orderKey)) continue;
      readyKeys.add(orderKey);
      events.push({ type: "order_ready", orderKey, table: t.table, orderNo: t.orderNo, key });
    }
  }

  for (const [station, list] of freshByStation) {
    const ticketNos = list.map((t) => t.ticketNo).sort();
    const single = list.length === 1 ? list[0] : null;
    events.unshift({
      type: "new",
      station,
      ticketNos,
      table: single?.table ?? null,
      orderNo: single?.orderNo ?? null,
      key: `hub:new:${station}:${ticketNos.join(",")}`,
    });
  }
  return events;
}

/** Tiket yang baru lewat SLA di area suara → satu kunci tone (null = tidak bunyi). */
export function lateToneKey(prevLate: Set<string>, lateIds: Set<string>, visible: Set<string>): string | null {
  const fresh = [...lateIds].filter((id) => !prevLate.has(id) && visible.has(id)).sort();
  return fresh.length ? `hub:late:${fresh.join(",")}` : null;
}
