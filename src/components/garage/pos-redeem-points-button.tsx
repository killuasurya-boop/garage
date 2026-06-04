"use client";

// Tombol redeem member point ke diskon di POS. Komponen self-contained:
// modal pilih jumlah point → POST /api/points/redeem (sudah hardening
// idempotency + rate-limit di sisi backend) → callback onRedeemed dipanggil
// dengan amount diskon untuk diaplikasikan ke cart.
//
// Pemakaian (di POS panel member):
//   <PosRedeemPointsButton
//     memberPhone={selectedMember.phone}
//     availablePoints={selectedMember.points}
//     onRedeemed={(discountAmount) => applyDiscount(discountAmount)}
//   />
//
// Endpoint: src/app/api/points/redeem (memberAuth required dari sisi member,
// tapi POS kasir tidak login sbg member — perlu adjustment endpoint kalau
// dipanggil dari kasir; komponen ini default behavior member-mode.)

import { Coins, RefreshCw } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { garageApi, GarageApiError } from "@/lib/api-client";

const MIN_REDEEM = 100;
/** Asumsi default: 1 poin = Rp100 (sesuai pola DISCOUNT_PER_REDEEM_UNIT di garage). */
const POINTS_TO_RUPIAH = 100;

type RedeemResponse = {
  data?: {
    customerId: string;
    pointsRedeemed: number;
    discountAmount: number;
    remainingPoints: number;
  };
};

export function PosRedeemPointsButton({
  availablePoints,
  onRedeemed,
  disabled = false,
}: {
  availablePoints: number;
  onRedeemed?: (discountAmount: number, pointsRedeemed: number, remaining: number) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requested = Math.max(0, Math.floor(Number(points) || 0));
  const valid =
    requested >= MIN_REDEEM &&
    requested <= availablePoints &&
    requested % MIN_REDEEM === 0;
  const previewDiscount = valid ? requested * (POINTS_TO_RUPIAH / MIN_REDEEM) : 0;

  const submit = async () => {
    if (!valid) return;
    setLoading(true);
    setError(null);
    try {
      const res = await garageApi.post<RedeemResponse["data"], { pointsToRedeem: number }>(
        "/api/points/redeem",
        { pointsToRedeem: requested },
        { headers: { "X-Idempotency-Key": crypto.randomUUID() } },
      );
      if (res && onRedeemed) {
        onRedeemed(res.discountAmount, res.pointsRedeemed, res.remainingPoints);
      }
      setOpen(false);
      setPoints("");
    } catch (err) {
      setError(
        err instanceof GarageApiError ? err.message : "Redeem points gagal. Coba lagi.",
      );
    } finally {
      setLoading(false);
    }
  };

  const canRedeem = !disabled && availablePoints >= MIN_REDEEM;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canRedeem}
          className="h-9 gap-2 border-[#f5a742]/55 bg-[#f5a742]/10 px-3 text-xs font-bold uppercase tracking-wider text-[#ffd79a] hover:bg-[#f5a742]/20 disabled:opacity-40"
        >
          <Coins className="size-3.5" />
          Redeem ({availablePoints} pts)
        </Button>
      </DialogTrigger>
      <DialogContent className="border-[#34343c] bg-[#0f0f12] text-[#f4f4f5] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="garage-mono text-[#ffd79a]">Redeem Point Member</DialogTitle>
          <DialogDescription className="text-xs text-[#8f8f99]">
            Min {MIN_REDEEM} pts · kelipatan {MIN_REDEEM} · 1 pt = Rp{POINTS_TO_RUPIAH.toLocaleString("id-ID")}
            <br />
            Tersedia: <strong className="text-[#f0f0f0]">{availablePoints} pts</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label className="garage-mono text-xs text-[#9a9a9a]">Jumlah point</label>
          <Input
            type="number"
            inputMode="numeric"
            min={MIN_REDEEM}
            max={availablePoints}
            step={MIN_REDEEM}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            placeholder={`min ${MIN_REDEEM}`}
            className="h-10 border-[#34343c] bg-white/[0.04] text-base"
          />
          {requested > 0 ? (
            <p className={`text-xs ${valid ? "text-[#bbf7d0]" : "text-[#ffb8b0]"}`}>
              {valid
                ? `Akan jadi diskon Rp${previewDiscount.toLocaleString("id-ID")}`
                : requested > availablePoints
                ? `Melebihi saldo (${availablePoints} pts)`
                : requested < MIN_REDEEM
                ? `Min ${MIN_REDEEM} pts`
                : `Harus kelipatan ${MIN_REDEEM}`}
            </p>
          ) : null}
        </div>

        {error ? (
          <div className="rounded-md border border-[#d11a2a]/40 bg-[#d11a2a]/10 px-3 py-2 text-xs text-[#ffb8b0]">
            {error}
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={loading}
            className="border-[#34343c] bg-transparent text-[#9a9a9a] hover:bg-white/[0.04]"
          >
            Batal
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={!valid || loading}
            className="bg-[#f5a742] text-[#0f0f12] hover:bg-[#ffd79a]"
          >
            {loading ? (
              <>
                <RefreshCw className="mr-1 size-3 animate-spin" />
                Memproses…
              </>
            ) : (
              "Redeem"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
