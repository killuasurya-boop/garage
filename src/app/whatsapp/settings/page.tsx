import type { Metadata } from "next";
import { WhatsappSettingsCard } from "@/components/whatsapp/WhatsappSettingsCard";

export const metadata: Metadata = {
  title: "WhatsApp Settings | Garage OS",
};

export default function WhatsappSettingsPage() {
  return (
    <main className="min-h-screen bg-[var(--garage-bg-0)] py-6 px-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-[var(--garage-fg)] uppercase tracking-tight">
            WhatsApp Settings
          </h1>
          <a
            href="/whatsapp"
            className="rounded-[var(--radius-sm)] bg-[var(--garage-bg-3)] px-3 py-2 text-sm text-[var(--garage-fg)] transition-colors duration-200 hover:bg-[var(--garage-line-2)] cursor-pointer"
          >
            ← Inbox
          </a>
        </div>
        <WhatsappSettingsCard />
      </div>
    </main>
  );
}
