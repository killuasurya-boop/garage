"use client";

import { Toaster } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DashboardProvider } from "../store/dashboardStore";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { ControlFilterPanel } from "../panels/ControlFilterPanel";
import { NotificationCenter } from "../panels/NotificationCenter";

export function CeoLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <DashboardProvider>
      <div
        className="min-h-screen text-zinc-100"
        style={{
          background:
            "radial-gradient(ellipse 80% 40% at 50% -10%, color-mix(in srgb, var(--garage-red) 12%, transparent) 0%, transparent 70%), radial-gradient(ellipse 60% 30% at 85% 80%, color-mix(in srgb, var(--garage-amber) 8%, transparent) 0%, transparent 70%), var(--garage-bg-0)",
        }}
      >
        <div className="flex">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar />
            <ControlFilterPanel />
            <main className="flex-1">
              <AnimatePresence mode="wait">
                <motion.div
                  key={pathname}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                  className="p-4 md:p-6"
                >
                  {children}
                </motion.div>
              </AnimatePresence>
            </main>
          </div>
        </div>
        <NotificationCenter />
        <Toaster theme="dark" position="bottom-right" richColors />
      </div>
    </DashboardProvider>
  );
}
