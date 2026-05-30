"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Info,
  MessageCircle,
  Printer,
  ShieldAlert,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

type RuleItem = {
  icon: typeof Info;
  title: string;
  body: string;
};

const RULES: RuleItem[] = [
  {
    icon: CircleDollarSign,
    title: "Buka & tutup shift",
    body:
      "Wajib buka shift sebelum mulai jualan (catat modal awal). Tutup shift di akhir kerja: hitung kas fisik, cetak PDF laporan, serahkan ke owner/supervisor.",
  },
  {
    icon: Printer,
    title: "Cetak struk ulang",
    body:
      'Customer minta struk ulang? Pakai tombol "Cetak Struk Ulang" di History Penjualan. Jangan buat order baru. Maks 3x cetak ulang per order (tercatat di audit log).',
  },
  {
    icon: MessageCircle,
    title: "Kirim invoice ke customer",
    body:
      'Customer minta bukti digital (untuk reimburse kantor/dompet digital)? Pilih satu: (a) "Kirim WhatsApp" — kirim link interaktif langsung; (b) "Salin Link Invoice" — paste manual; (c) "Download PDF" — kirim file PDF formal.',
  },
  {
    icon: ShieldAlert,
    title: "Refund, void, & koreksi",
    body:
      "Refund atau void WAJIB dapat approval supervisor (lewat menu Approvals). Untuk koreksi salah input dalam <5 menit, kasir bisa langsung void dengan catatan jelas di notes — semua aksi tercatat di audit log.",
  },
];

export function CashierRulesPanel({
  defaultOpen = false,
}: {
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className="border-amber-500/30 bg-amber-500/[0.04]">
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-amber-200 hover:bg-amber-500/[0.06]"
        >
          <span className="flex items-center gap-2">
            <Info className="h-4 w-4" />
            Panduan Kasir — Aturan Standar
          </span>
          {open ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
        {open && (
          <div className="space-y-2 border-t border-amber-500/20 px-4 py-3">
            {RULES.map((rule) => {
              const Icon = rule.icon;
              return (
                <div
                  key={rule.title}
                  className="flex items-start gap-3 rounded-md border border-amber-500/15 bg-amber-500/[0.04] p-3"
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold text-amber-200">{rule.title}</p>
                    <p className="mt-0.5 leading-relaxed text-amber-100/80">
                      {rule.body}
                    </p>
                  </div>
                </div>
              );
            })}
            <p className="mt-2 text-[11px] italic text-amber-200/60">
              Pelanggaran berulang dicek lewat audit log oleh supervisor.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function quickWhatsAppLink(
  phone: string | null | undefined,
  message: string,
): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d]/g, "");
  if (cleaned.length < 8) return null;
  // Normalisasi: kalau diawali "0" → ganti dengan "62" (Indonesia)
  const normalized = cleaned.startsWith("0")
    ? `62${cleaned.slice(1)}`
    : cleaned.startsWith("62")
      ? cleaned
      : cleaned;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
