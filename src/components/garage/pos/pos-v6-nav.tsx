"use client";

// Daftar menu POS dari model `posNavModel` (src/lib/pos-nav.ts): sidebar ringkas + lembar "Lainnya".
// Komponen ini hanya tampilan; aksi dikerjakan handler `onSelect` milik pos-view.
import type { ReactNode } from "react";
import {
  CalendarClock, ChefHat, ClipboardCheck, ClipboardList, Clock, Coins, Contact, Ellipsis, FileText, Handshake, History,
  LayoutGrid, Monitor, PackageX, Palette, QrCode, Receipt, RefreshCw, Settings, ShoppingCart, Timer, TrendingUp,
  TriangleAlert, Users, Volume2, Wallet, type LucideIcon,
} from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { PosNavGroup, PosNavId, PosNavItem } from "@/lib/pos-nav";

import type { CashierThemeMode } from "../garage-app-pickers";
import { PosV6NavItem } from "./pos-v6";

/** Kunci ikon model (kebab-case) → ikon lucide unik. "more" = tombol Lainnya. */
export const POS_NAV_ICONS: Record<string, LucideIcon> = {
  "shopping-cart": ShoppingCart,
  "qr-code": QrCode,
  "layout-grid": LayoutGrid,
  clock: Clock,
  receipt: Receipt,
  "chef-hat": ChefHat,
  "package-x": PackageX,
  timer: Timer,
  wallet: Wallet,
  handshake: Handshake,
  "trending-up": TrendingUp,
  "clipboard-check": ClipboardCheck,
  "clipboard-list": ClipboardList,
  "volume-2": Volume2,
  monitor: Monitor,
  palette: Palette,
  settings: Settings,
  "refresh-cw": RefreshCw,
  "file-text": FileText,
  history: History,
  "calendar-clock": CalendarClock,
  coins: Coins,
  "triangle-alert": TriangleAlert,
  contact: Contact,
  users: Users,
  more: Ellipsis,
};

function NavButton({ item, onSelect, active }: { item: PosNavItem; onSelect: (id: PosNavId) => void; active?: boolean }) {
  return (
    <PosV6NavItem
      icon={POS_NAV_ICONS[item.icon]}
      label={item.label}
      shortcut={item.shortcut}
      count={item.count}
      dot={item.dot}
      testId={item.testId}
      active={active}
      onClick={() => onSelect(item.id)}
    />
  );
}

export function PosV6NavList({ items, onSelect, activeId }: { items: PosNavItem[]; onSelect: (id: PosNavId) => void; activeId?: PosNavId }) {
  return (
    <>
      {items.map((item) => (
        <NavButton key={item.id} item={item} onSelect={onSelect} active={item.id === activeId} />
      ))}
    </>
  );
}

export function PosV6NavGroups({ groups, onSelect, extra }: { groups: PosNavGroup[]; onSelect: (id: PosNavId) => void; extra?: Partial<Record<PosNavId, ReactNode>> }) {
  return (
    <>
      {groups.map((group) => (
        <section key={group.id} className="pos-v6-more-group" aria-label={group.label}>
          <h3 className="pos-v6-more-group-title">{group.label}</h3>
          <div className="grid gap-0.5">
            {group.items.map((item) => {
              const custom = extra?.[item.id];
              return custom ? <div key={item.id}>{custom}</div> : <NavButton key={item.id} item={item} onSelect={onSelect} />;
            })}
          </div>
        </section>
      ))}
    </>
  );
}

export function PosV6MoreSheet({
  open, onOpenChange, theme, groups, onSelect, themeSwatches,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: CashierThemeMode;
  groups: PosNavGroup[];
  onSelect: (id: PosNavId) => void;
  themeSwatches: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        data-cashier-theme-scope={theme}
        className="pos-v6-more-sheet garage-scroll w-[min(90vw,360px)] gap-0 overflow-y-auto border-[var(--pos-chrome-line)] bg-[var(--pos-chrome-bg)] p-4 text-[var(--pos-chrome-fg)]"
      >
        <SheetHeader className="p-0 pb-3">
          <SheetTitle className="text-[var(--pos-chrome-fg)]">Lainnya</SheetTitle>
          <SheetDescription className="text-[var(--pos-chrome-muted)]">Menu yang tidak dipakai tiap transaksi.</SheetDescription>
        </SheetHeader>
        <div className="grid gap-3">
          <PosV6NavGroups
            groups={groups}
            extra={{ "mode-tampilan": themeSwatches }}
            onSelect={(id) => {
              onOpenChange(false);
              onSelect(id);
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
