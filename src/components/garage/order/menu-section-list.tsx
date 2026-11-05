"use client";

import type { ReactNode } from "react";

import type { MenuItem } from "@/lib/garage-api-types";

import { MENU_GRID_CLASS, MenuCard } from "./menu-card";
import { categoryIcon, itemCartQty } from "./order-ui";

export type MenuGroup = {
  category: string;
  count: number;
  sections: { name: string; items: MenuItem[] }[];
};

// Kategori → sub-seksi (field `section`), urutan mengikuti data menu dari server.
export function buildMenuGroups(items: MenuItem[]): MenuGroup[] {
  const groups = new Map<string, Map<string, MenuItem[]>>();
  for (const item of items) {
    const sections = groups.get(item.category) ?? new Map<string, MenuItem[]>();
    const sectionName = item.section?.trim() || item.category;
    sections.set(sectionName, [...(sections.get(sectionName) ?? []), item]);
    groups.set(item.category, sections);
  }
  return Array.from(groups, ([category, sections]) => {
    const list = Array.from(sections, ([name, sectionItems]) => ({ name, items: sectionItems }));
    return { category, count: list.reduce((sum, s) => sum + s.items.length, 0), sections: list };
  });
}

export function categorySectionId(category: string) {
  return `menu-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

export function MenuSectionList({
  groups,
  cart,
  bestSellerSet,
  onAdd,
  onOpen,
  renderItem,
  gridClassName = MENU_GRID_CLASS,
  v5 = false,
}: {
  /** Menu V5: kartu & grid sendiri, judul bergaris merah. Kosong = kartu lama. */
  renderItem?: (item: MenuItem, index: number) => ReactNode;
  gridClassName?: string;
  v5?: boolean;
  groups: MenuGroup[];
  cart: Record<string, number>;
  bestSellerSet: Set<string>;
  onAdd: (itemId: string, variantId: string, delta: number) => void;
  onOpen: (item: MenuItem) => void;
}) {
  return (
    <>
      {groups.map((group) => {
        // Sub-judul hanya untuk kategori besar dengan >1 sub-seksi (mis. Kopi Susu /
        // Americano). Kategori kecil (Makanan 5 item) jadi terlalu ramai bila dipecah.
        const showSubheads = group.sections.length > 1 && group.count >= 8;
        return (
          <section
            key={group.category}
            id={categorySectionId(group.category)}
            data-order-section={group.category}
            className="scroll-mt-[124px] pt-7"
          >
            <div className={`flex items-center gap-2.5 pb-2.5 ${v5 ? "" : "border-b border-garage-line"}`}>
              {v5 ? null : categoryIcon(group.category, "size-5 text-garage-amber")}
              <h2 className={v5 ? "gm5-title gm5-section-title text-[22px] leading-none text-white" : "garage-display text-[22px] leading-none tracking-wide text-white"}>
                {group.category}
              </h2>
              <span className="ml-auto font-mono text-xs font-semibold tabular-nums text-garage-dim">
                {group.count} menu
              </span>
            </div>
            {/* Tanpa sub-judul: semua item kategori dalam SATU grid (bukan grid per
                sub-seksi, yang membuat kartu tampil satu per baris). */}
            {(showSubheads
              ? group.sections
              : [{ name: group.category, items: group.sections.flatMap((section) => section.items) }]
            ).map((section) => (
              <div key={section.name} role="group" aria-label={showSubheads ? section.name : undefined}>
                {showSubheads ? (
                  <p aria-hidden className="mb-2.5 mt-5 text-[13px] font-semibold uppercase tracking-wider text-garage-dim">
                    {section.name}
                  </p>
                ) : null}
                <div className={`${gridClassName} ${showSubheads ? "" : "mt-4"}`}>
                  {section.items.map((item, index) => renderItem ? renderItem(item, index) : (
                    <MenuCard
                      key={item.id}
                      item={item}
                      popular={bestSellerSet.has(item.id)}
                      cartQty={itemCartQty(item, cart)}
                      onAdd={(variantId, delta) => onAdd(item.id, variantId, delta)}
                      onOpen={() => onOpen(item)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>
        );
      })}
    </>
  );
}
