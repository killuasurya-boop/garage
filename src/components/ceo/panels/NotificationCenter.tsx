"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertOctagon, AlertTriangle, Bell, Info, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { useDashboard } from "../store/dashboardStore";

const catConfig = {
  critical: { icon: AlertOctagon, text: "text-[#ffd0d0]", bg: "bg-[color-mix(in_srgb,var(--garage-red)_22%,transparent)]" },
  warning: { icon: AlertTriangle, text: "text-amber-300", bg: "bg-amber-500/15" },
  info: { icon: Info, text: "text-zinc-200", bg: "bg-white/10" },
} as const;

export function NotificationCenter() {
  const { notifPanelOpen, setNotifPanelOpen, notifications, markAllRead, unreadCount } = useDashboard();

  return (
    <AnimatePresence>
      {notifPanelOpen ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/70"
            onClick={() => setNotifPanelOpen(false)}
          />
          <motion.aside
            initial={{ x: 400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 400, opacity: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 30 }}
            className="fixed right-0 top-0 z-50 flex h-full w-[min(360px,90vw)] flex-col border-l border-white/10 bg-[var(--garage-bg-1)] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-amber-300" />
                <h3 className="font-[var(--garage-font-display)] text-sm font-black uppercase text-zinc-50">
                  Notifikasi
                </h3>
                {unreadCount > 0 ? (
                  <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-200">{unreadCount} baru</span>
                ) : null}
              </div>
              <button onClick={() => setNotifPanelOpen(false)} className="rounded-md p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center justify-end border-b border-white/5 px-4 py-2">
              <button onClick={markAllRead} className="text-[11px] font-semibold uppercase text-amber-300 hover:text-amber-200">
                Tandai terbaca
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {(["critical", "warning", "info"] as const).map((cat) => {
                const list = notifications.filter((n) => n.category === cat);
                if (list.length === 0) return null;
                return (
                  <div key={cat} className="mb-4">
                    <p className="mb-1 px-1 text-[10px] font-semibold uppercase text-zinc-500">
                      {cat === "critical" ? "kritis" : cat === "warning" ? "waspada" : "info"}
                    </p>
                    <ul className="space-y-1.5">
                      {list.map((n) => {
                        const c = catConfig[n.category];
                        const Icon = c.icon;
                        return (
                          <li
                            key={n.id}
                            className={`flex items-start gap-3 rounded-lg border border-white/10 p-2.5 ${n.read ? "opacity-60" : ""}`}
                          >
                            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${c.bg}`}>
                              <Icon className={`h-4 w-4 ${c.text}`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-zinc-100">{n.title}</p>
                              <p className="text-[11px] text-zinc-400">{n.detail}</p>
                              <p className="mt-0.5 text-[10px] text-zinc-500">{formatDistanceToNow(new Date(n.time), { addSuffix: true, locale: idLocale })}</p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
