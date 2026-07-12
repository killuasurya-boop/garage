import type { ReactNode } from "react";

export type WhatsappConversation = {
  id: string;
  phoneNumber: string;
  customerId: string | null;
  customerName: string | null;
  assignedTo: string | null;
  status: string;
  unreadCount: number;
  lastInboundAt: string | null;
  lastMessagePreview: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WhatsappMessage = {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  messageType: string;
  body: string | null;
  templateName: string | null;
  status: string;
  providerMessageId: string | null;
  createdBy: string | null;
  createdAt: string;
};

export function CropMark() {
  return (
    <span aria-hidden className="pointer-events-none absolute h-3 w-3 text-[var(--garage-line-2)]">
      <span className="absolute left-0 top-0 h-3 w-px bg-current" />
      <span className="absolute left-0 top-0 h-px w-3 bg-current" />
      <span className="absolute right-0 top-0 h-3 w-px bg-current" />
      <span className="absolute right-0 top-0 h-px w-3 bg-current" />
      <span className="absolute left-0 bottom-0 h-3 w-px bg-current" />
      <span className="absolute left-0 bottom-0 h-px w-3 bg-current" />
      <span className="absolute right-0 bottom-0 h-3 w-px bg-current" />
      <span className="absolute right-0 bottom-0 h-px w-3 bg-current" />
    </span>
  );
}

export function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "baru";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}j`;
  return `${Math.floor(h / 24)}h`;
}

export function CropPanel({ children }: { children: ReactNode }) {
  return (
    <div className="relative rounded-[var(--radius-xl)] border border-[var(--garage-line)] bg-[var(--garage-bg-1)]">
      <CropMark />
      {children}
    </div>
  );
}
