import type { Metadata } from "next";

import { requireModulePageAccess } from "@/lib/page-access";
import { WhatsappInbox } from "@/components/whatsapp/WhatsappInbox";

export const metadata: Metadata = {
  title: "WhatsApp Inbox | Garage OS",
};

// Akses session/DB saat render → opt-out static generation (build tanpa DB live).
export const dynamic = "force-dynamic";

export default async function WhatsappPage() {
  await requireModulePageAccess("whatsapp");

  return (
    <main className="min-h-screen bg-[var(--garage-bg-0)] py-6 px-4">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[var(--garage-fg)] uppercase tracking-tight">
              WhatsApp Inbox
            </h1>
            <span className="text-xs font-mono text-[var(--garage-mute)]">2-way · CS Console</span>
          </div>
          <a
            href="/whatsapp/settings"
            className="rounded-[var(--radius-sm)] bg-[var(--garage-bg-3)] px-3 py-2 text-sm text-[var(--garage-fg)] transition-colors duration-200 hover:bg-[var(--garage-line-2)] cursor-pointer"
          >
            Pengaturan
          </a>
        </div>
        <WhatsappInbox />
      </div>
    </main>
  );
}
