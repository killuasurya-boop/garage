"use client";

// Kontrol status mitra langsung dari daftar (Owner/Manajer): chip status → menu aksi yang sah (partnerStatusActions)
// → dialog berisi akibat, pesanan berjalan, syarat yang kurang, alasan wajib. Jalur & hak akses dicek ulang server.

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { PARTNER_STATUS_REASONS, partnerStatusActions, type PartnerStatusAction } from "@/lib/partner-hub-rules";

import { api, Btn, Chip, inputCls } from "./desk-shared";

export const PARTNER_STATUS_LABEL: Record<string, string> = { draft: "Draft", verifikasi: "Verifikasi", disetujui: "Disetujui", aktif: "Aktif", dibekukan: "Dibekukan", nonaktif: "Nonaktif" };

export type StatusPartner = {
  id: string;
  name: string;
  status: string;
  readiness?: { total: number; done: number; missing: string[] };
  activeOrders?: number;
  productActiveCount?: number;
};

const tone = (status: string) => (status === "aktif" ? "green" : status === "dibekukan" || status === "nonaktif" ? "red" : "amber");

export function PartnerStatusControl({
  partner,
  role,
  busy,
  run,
  onOpenDetail,
}: {
  partner: StatusPartner;
  role: string;
  busy: string | null;
  run: (key: string, fn: () => Promise<unknown>, ok: string) => Promise<void>;
  onOpenDetail: () => void;
}) {
  const actions = partnerStatusActions(partner.status, role);
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<PartnerStatusAction | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!actions.length) return <Chip tone={tone(partner.status)}>{PARTNER_STATUS_LABEL[partner.status] ?? partner.status}</Chip>;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Status ${partner.name}: ${PARTNER_STATUS_LABEL[partner.status]}. Ubah status`}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-bold ${
          tone(partner.status) === "green"
            ? "border-[#22c55e]/60 bg-[#14532d] text-[#bbf7d0]"
            : tone(partner.status) === "red"
              ? "border-[#ff5a66]/60 bg-[#3f1d22] text-[#fecdd3]"
              : "border-[#f5a742]/60 bg-[#3a2a10] text-[#ffd79a]"
        }`}
      >
        {PARTNER_STATUS_LABEL[partner.status] ?? partner.status}
        <ChevronDown className="size-4" aria-hidden />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-30 mt-1 grid min-w-[240px] gap-1 rounded-xl border border-[#3a3a42] bg-[#16161a] p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.5)]">
          {actions.map((a) => (
            <button
              key={a.kind}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                setAction(a);
              }}
              className={`min-h-11 rounded-lg px-3 text-left text-sm font-semibold hover:bg-white/10 ${a.kind === "deactivate" ? "text-[#ffb3b8]" : a.kind === "activate" ? "text-[#86efac]" : "text-[#f4f4f5]"}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      ) : null}
      {action ? (
        <StatusDialog
          partner={partner}
          action={action}
          busy={busy === `sa-${partner.id}`}
          onClose={() => setAction(null)}
          onOpenDetail={() => {
            setAction(null);
            onOpenDetail();
          }}
          onConfirm={(reason) =>
            void run(
              `sa-${partner.id}`,
              () => api(`/api/partners/${partner.id}/status-action`, { method: "POST", body: JSON.stringify({ kind: action.kind, reason }) }),
              `${partner.name}: ${action.label} berhasil.`,
            ).then(() => setAction(null))
          }
        />
      ) : null}
    </div>
  );
}

function StatusDialog({
  partner,
  action,
  busy,
  onClose,
  onConfirm,
  onOpenDetail,
}: {
  partner: StatusPartner;
  action: PartnerStatusAction;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  onOpenDetail: () => void;
}) {
  const [choice, setChoice] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const reason = [choice, note.trim()].filter(Boolean).join(" — ");
  // Sama dengan server: aktivasi (termasuk "Aktifkan lagi" dari Dibekukan) selalu dicek syaratnya.
  const missing = action.kind === "activate" ? partner.readiness?.missing ?? [] : [];
  const blocked = missing.length > 0;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby={`sd-${partner.id}`} onClick={onClose}>
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-[#3a3a42] bg-[#17171c] p-5 text-[#f4f4f5] shadow-[0_24px_60px_rgba(0,0,0,0.6)]" onClick={(e) => e.stopPropagation()}>
        <h2 id={`sd-${partner.id}`} className="text-lg font-black text-white">
          {action.label}: {partner.name}
        </h2>
        <p className="mt-1 text-sm text-[#d4d4d8]">
          {PARTNER_STATUS_LABEL[partner.status]} → <b>{PARTNER_STATUS_LABEL[action.path[action.path.length - 1]]}</b>
        </p>
        <p className="mt-3 rounded-lg border border-[#3a3a42] bg-black/20 p-3 text-sm leading-relaxed">{action.effect}</p>
        <ul className="mt-2 grid gap-1 text-sm text-[#d4d4d8]">
          <li>Produk aktif: {partner.productActiveCount ?? 0}</li>
          <li>Pesanan berjalan: {partner.activeOrders ?? 0}{partner.activeOrders ? " (tetap diselesaikan mitra)" : ""}</li>
        </ul>
        {blocked ? (
          <div className="mt-3 rounded-lg border border-[#f5a742]/50 bg-[#2a1d0a] p-3">
            <p className="text-sm font-bold text-[#ffd79a]">Belum bisa diaktifkan — lengkapi dulu:</p>
            <ul className="mt-1 grid gap-1 text-sm text-[#ffe2b0]">
              {missing.map((m) => (
                <li key={m}>✗ {m}</li>
              ))}
            </ul>
            <div className="mt-2">
              <Btn tone="primary" onClick={onOpenDetail}>
                Lengkapi di Kelola
              </Btn>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-4 text-sm font-semibold text-white">Alasan (wajib, tercatat di log)</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PARTNER_STATUS_REASONS[action.kind].map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={choice === r}
                  onClick={() => setChoice(choice === r ? null : r)}
                  className={`min-h-11 rounded-lg border px-3 text-sm font-semibold ${choice === r ? "border-[#ff5a66] bg-[#3a1015] text-white" : "border-[#3a3a42] text-[#e4e4e8] hover:bg-white/10"}`}
                >
                  {r}
                </button>
              ))}
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Catatan tambahan (opsional)" className={`${inputCls} mt-2`} aria-label="Catatan tambahan" />
          </>
        )}
        <div className="sticky -bottom-5 -mx-5 mt-4 flex flex-wrap justify-end gap-2 border-t border-[#2a2a30] bg-[#17171c] px-5 py-3">
          <Btn onClick={onClose}>Batal</Btn>
          {!blocked ? (
            <Btn tone={action.kind === "deactivate" || action.kind === "freeze" ? "danger" : "primary"} busy={busy} disabled={reason.trim().length < 3} onClick={() => onConfirm(reason)}>
              {action.label}
            </Btn>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const FILTERS = [
  ["all", "Semua"],
  ["aktif", "Aktif"],
  ["siap", "Belum aktif"],
  ["dibekukan", "Dibekukan"],
  ["nonaktif", "Nonaktif"],
] as const;
export type PartnerFilter = (typeof FILTERS)[number][0];

export function matchesPartnerFilter(status: string, filter: PartnerFilter) {
  if (filter === "all") return true;
  if (filter === "siap") return ["draft", "verifikasi", "disetujui"].includes(status);
  return status === filter;
}

export function PartnerStatusFilter({ partners, value, onChange }: { partners: Array<{ status: string }>; value: PartnerFilter; onChange: (f: PartnerFilter) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter status mitra">
      {FILTERS.map(([id, label]) => {
        const count = partners.filter((p) => matchesPartnerFilter(p.status, id)).length;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={value === id}
            onClick={() => onChange(id)}
            className={`min-h-11 rounded-lg border px-3 text-sm font-semibold ${value === id ? "border-[#ff5a66] bg-[#3a1015] text-white" : "border-[#3a3a42] text-[#e4e4e8] hover:bg-white/10"}`}
          >
            {label} <span className="text-xs text-[#d4d4d8]">({count})</span>
          </button>
        );
      })}
    </div>
  );
}
