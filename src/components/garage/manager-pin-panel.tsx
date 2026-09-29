"use client";

import { useState } from "react";
import { Check, Delete, KeyRound, RefreshCw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { garageApi } from "@/lib/api-client";
import { REJECT_REASON_TEMPLATES } from "@/lib/approval-rules";

type Decision = "approved" | "rejected";

/**
 * Panel PIN Manajer/Owner untuk memutus pengajuan langsung di tablet kasir.
 * Pemutus dicatat atas nama pemilik PIN (lihat /api/approvals/[id]/pin).
 */
export function ManagerPinPanel({
  approvalId,
  onDecided,
  onCancel,
  allowReject = true,
}: {
  approvalId: string;
  onDecided: (status: Decision, decidedByName: string | null) => void;
  onCancel?: () => void;
  allowReject?: boolean;
}) {
  const [pin, setPin] = useState("");
  const [mode, setMode] = useState<Decision>("approved");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function press(digit: string) {
    setError(null);
    setPin((current) => (current.length >= 8 ? current : current + digit));
  }

  async function submit() {
    if (pin.length < 4) {
      setError("PIN minimal 4 digit.");
      return;
    }
    if (mode === "rejected" && reason.trim().length < 5) {
      setError("Alasan menolak wajib diisi minimal 5 karakter.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await garageApi.post<{ status: Decision; decidedByName: string | null }>(
        `/api/approvals/${encodeURIComponent(approvalId)}/pin`,
        { pin, status: mode, reasonDecided: reason.trim() || undefined },
      );
      onDecided(result.status, result.decidedByName);
    } catch (err) {
      setPin("");
      setError(err instanceof Error ? err.message : "PIN gagal diverifikasi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-[#f5a742]/45 bg-[#f5a742]/8 p-3">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-[#f5a742]" />
        <p className="text-sm font-bold text-white">PIN Manajer / Owner</p>
      </div>
      <p className="text-xs text-[#d6d6dc]">
        Serahkan tablet ke Manajer. Keputusan tercatat atas nama pemilik PIN.
      </p>
      <p className="text-[11px] text-[#b8b8bf]">
        Belum punya PIN atau ingin ganti? Owner/Manajer atur di dashboard: menu ⋯ → PIN persetujuan.
      </p>

      {allowReject ? (
        <div className="grid grid-cols-2 gap-1 rounded-md border border-[#34343c] bg-black/30 p-1">
          {(["approved", "rejected"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setMode(value);
                setError(null);
              }}
              className={`garage-press rounded px-2 py-2 text-xs font-bold ${
                mode === value
                  ? value === "approved"
                    ? "bg-[#22c55e] text-black"
                    : "bg-[#d11a2a] text-white"
                  : "text-[#d6d6dc] hover:bg-white/[0.05]"
              }`}
            >
              {value === "approved" ? "Setujui" : "Tolak"}
            </button>
          ))}
        </div>
      ) : null}

      {mode === "rejected" ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1">
            {REJECT_REASON_TEMPLATES.map((tpl) => (
              <button
                key={tpl}
                type="button"
                onClick={() => setReason(tpl)}
                className="rounded-md border border-[#34343c] bg-white/[0.05] px-2 py-1 text-[11px] text-[#d6d6dc] hover:border-[#f5a742]/55"
              >
                {tpl}
              </button>
            ))}
          </div>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Wajib: alasan menolak..."
            className="w-full rounded-md border border-[#34343c] bg-white/[0.06] p-2 text-sm text-white"
          />
        </div>
      ) : null}

      <div
        aria-label="PIN"
        className="flex h-12 items-center justify-center gap-2 rounded-md border border-[#4a4a54] bg-black/40"
      >
        {pin.length === 0 ? (
          <span className="text-xs text-[#8f8f99]">Masukkan PIN</span>
        ) : (
          Array.from({ length: pin.length }).map((_, index) => (
            <span key={index} className="size-2.5 rounded-full bg-[#ffd79a]" />
          ))
        )}
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => press(digit)}
            disabled={submitting}
            className="garage-press h-12 rounded-md border border-[#34343c] bg-white/[0.06] text-lg font-bold text-white hover:bg-white/[0.1]"
          >
            {digit}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPin("")}
          disabled={submitting}
          className="garage-press h-12 rounded-md border border-[#34343c] bg-white/[0.03] text-xs font-semibold text-[#d6d6dc]"
        >
          Hapus
        </button>
        <button
          type="button"
          onClick={() => press("0")}
          disabled={submitting}
          className="garage-press h-12 rounded-md border border-[#34343c] bg-white/[0.06] text-lg font-bold text-white hover:bg-white/[0.1]"
        >
          0
        </button>
        <button
          type="button"
          aria-label="Hapus satu digit"
          onClick={() => setPin((current) => current.slice(0, -1))}
          disabled={submitting}
          className="garage-press flex h-12 items-center justify-center rounded-md border border-[#34343c] bg-white/[0.03] text-[#d6d6dc]"
        >
          <Delete className="size-5" />
        </button>
      </div>

      {error ? <p className="text-xs font-semibold text-[#ffc2c8]">{error}</p> : null}

      <div className="flex gap-2">
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            className="garage-press h-11 flex-1 border-[#4a4a54]"
            onClick={onCancel}
            disabled={submitting}
          >
            Kembali
          </Button>
        ) : null}
        <Button
          type="button"
          className={`garage-press h-11 flex-1 gap-1.5 font-bold ${
            mode === "approved"
              ? "bg-[#22c55e] text-black hover:bg-[#34d76b]"
              : "bg-[#d11a2a] text-white hover:bg-[#e72c3c]"
          }`}
          onClick={() => void submit()}
          disabled={submitting || pin.length < 4}
        >
          {submitting ? (
            <RefreshCw className="size-4 animate-spin" />
          ) : mode === "approved" ? (
            <Check className="size-4" />
          ) : (
            <X className="size-4" />
          )}
          {mode === "approved" ? "Setujui dengan PIN" : "Tolak dengan PIN"}
        </Button>
      </div>
    </div>
  );
}
