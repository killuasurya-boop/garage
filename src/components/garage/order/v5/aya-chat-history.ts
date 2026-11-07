// Riwayat percakapan Tanya AYA selama sesi aktif (sessionStorage, per outlet & meja).
// Kartu menu TIDAK disimpan utuh: hanya id-nya, lalu dibaca ulang dari data menu terbaru
// (harga/stok selalu mutakhir; menu yang sudah hilang/habis tidak ditampilkan lagi).
import type { MenuItem } from "@/lib/garage-api-types";

import type { AyaAction, AyaLink, AyaNav } from "./aya-menu-assistant";

export type AyaChatMessage = {
  id: number;
  from: "aya" | "user";
  text: string;
  items?: MenuItem[];
  action?: AyaAction;
  nav?: AyaNav;
  links?: AyaLink[];
  /** Pesan kendala dengan tombol "Coba lagi" (berisi pertanyaan yang diulang, atau "menu" = muat ulang menu). */
  retry?: string;
  at: Date;
};

type StoredMessage = Omit<AyaChatMessage, "items" | "at"> & { itemIds?: string[]; at: string };

export const AYA_CHAT_MAX_MESSAGES = 40;

export function ayaChatKey(scope: string) {
  return `garage:aya-chat:v1:${scope}`;
}

export function serializeAyaChat(messages: readonly AyaChatMessage[]): string {
  const stored: StoredMessage[] = messages.slice(-AYA_CHAT_MAX_MESSAGES).map(({ items, at, ...rest }) => ({
    ...rest,
    itemIds: items?.map((item) => item.id),
    at: at.toISOString(),
  }));
  return JSON.stringify(stored);
}

export function parseAyaChat(raw: string | null, items: readonly MenuItem[]): AyaChatMessage[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredMessage[];
    if (!Array.isArray(parsed) || !parsed.length) return null;
    const byId = new Map(items.map((item) => [item.id, item]));
    return parsed
      .filter((row) => row && (row.from === "aya" || row.from === "user") && typeof row.text === "string")
      .slice(-AYA_CHAT_MAX_MESSAGES)
      .map(({ itemIds, at, ...rest }) => {
        const found = (itemIds ?? []).map((id) => byId.get(id)).filter((item): item is MenuItem => Boolean(item && item.stock !== "sold_out"));
        const date = new Date(at);
        return { ...rest, text: rest.text.slice(0, 600), items: found.length ? found : undefined, at: Number.isNaN(date.getTime()) ? new Date() : date };
      });
  } catch {
    return null;
  }
}

export function readAyaChat(scope: string, items: readonly MenuItem[]) {
  try {
    return parseAyaChat(window.sessionStorage.getItem(ayaChatKey(scope)), items);
  } catch {
    return null;
  }
}

export function writeAyaChat(scope: string, messages: readonly AyaChatMessage[]) {
  try {
    window.sessionStorage.setItem(ayaChatKey(scope), serializeAyaChat(messages));
  } catch {
    /* sessionStorage penuh / diblokir: riwayat cukup di memori */
  }
}

export function clearAyaChat(scope: string) {
  try {
    window.sessionStorage.removeItem(ayaChatKey(scope));
  } catch {
    /* abaikan */
  }
}
