"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, MessageCircle } from "lucide-react";

import { waLink } from "@/lib/whatsapp-link";

// Kasir mengecek nomor WA member di depan pelanggan: buka wa.me, lalu tandai aktif.
export function PosMemberWaVerify({ customerId, name, phone }: { customerId: string; name: string; phone: string }) {
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const link = waLink(
    phone,
    `Halo ${name.split(/\s+/)[0] || "Kak"}, ini Garage Coffee. Kami cek nomor WhatsApp member kamu sudah aktif ya. Mohon balas "OK" — terima kasih! 🙏`,
  );

  async function markActive() {
    setState("saving");
    try {
      const res = await fetch(`/api/crm/customers/${customerId}/verify-wa`, { method: "POST" });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-[#8ff0b2]">
        <CheckCircle2 className="size-3.5" /> WA ditandai aktif
      </p>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#25d366]/50 px-2.5 text-xs font-bold text-[#8ff0b2] hover:bg-[#25d366]/12"
        >
          <MessageCircle className="size-3.5" /> Cek WA
        </a>
      ) : (
        <span className="text-xs text-[#ffb3b3]">Nomor bukan WhatsApp valid</span>
      )}
      {link ? (
        <button
          type="button"
          onClick={() => void markActive()}
          disabled={state === "saving"}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#4a4a54] px-2.5 text-xs font-bold text-white hover:bg-white/[0.06] disabled:opacity-60"
        >
          {state === "saving" ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Tandai WA aktif
        </button>
      ) : null}
      {state === "error" ? <span className="w-full text-xs text-[#ffb3b3]">Gagal menyimpan, coba lagi.</span> : null}
    </div>
  );
}
