"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { garageApi } from "@/lib/api-client";
import type { WmsNotification } from "@/lib/wms-types";

export function WmsNotificationsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [items, setItems] = useState<WmsNotification[]>([]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void garageApi.get<WmsNotification[]>("/api/wms/notifications").then((d) => {
      if (alive) setItems(d);
    }).catch(() => {});
    return () => { alive = false; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col bg-white shadow-[-16px_0_50px_rgba(0,0,0,.28)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#E8E8E8] px-4 py-3">
          <p className="text-[15px] font-bold text-[#111111]">Notifikasi WMS</p>
          <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-md hover:bg-[#F8F9FB]">
            <X className="size-4" />
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto p-3">
          {items.length === 0 ? (
            <li className="py-10 text-center text-[13px] text-[#6B7280]">Tidak ada alert aktif.</li>
          ) : (
            items.map((n) => {
              const border =
                n.level === "critical" ? "#DC2626" : n.level === "warning" ? "#D97706" : "#2563EB";
              return (
                <li key={n.id} className="mb-2">
                  <Link
                    href={n.href}
                    onClick={onClose}
                    className="block rounded-lg border border-[#E8E8E8] bg-[#F8F9FB] px-3 py-2.5 hover:bg-white"
                    style={{ borderLeftWidth: 3, borderLeftColor: border }}
                  >
                    <p className="text-[12px] font-bold text-[#111111]">{n.title}</p>
                    <p className="mt-0.5 text-[12.5px] text-[#6B7280]">{n.text}</p>
                  </Link>
                </li>
              );
            })
          )}
        </ul>
      </aside>
    </div>
  );
}
