"use client";

import { useState } from "react";
import { CheckCheck, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { garageApi, GarageApiError } from "@/lib/api-client";

type SweepResult = {
  total: number;
  autoApproved: number;
  skipped: number;
  decisions: Array<{
    id: string;
    type: string;
    amount: number;
    decision: "auto_approved" | "skipped";
    reason: string;
  }>;
};

export function ApprovalsAutoSweepPanel({ onSwept }: { onSwept?: () => void }) {
  const [result, setResult] = useState<SweepResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSweep = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await garageApi.post<SweepResult>("/api/approvals/auto-sweep", {});
      setResult(res);
      onSwept?.();
    } catch (err) {
      setError(err instanceof GarageApiError ? err.message : "Gagal menjalankan sweep.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="garage-panel garage-animate-in">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="h-4 w-4 text-[#ffd08a]" />
          Auto-approval sweep
        </CardTitle>
        <CardDescription className="text-xs text-[#b8b8bf]">
          Approve otomatis expense di bawah threshold yang dikonfigurasi di Settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button
          type="button"
          size="sm"
          onClick={() => void handleSweep()}
          disabled={loading}
          className="garage-press h-9 w-full border-[#ffd08a]/40 bg-[#ffd08a]/15 text-xs font-bold text-[#ffd08a] hover:bg-[#ffd08a]/25"
          variant="outline"
        >
          <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
          {loading ? "Memproses…" : "Jalankan sweep sekarang"}
        </Button>
        {error ? (
          <p className="text-[11px] text-[#ff8a93]">{error}</p>
        ) : null}
        {result ? (
          <div className="grid grid-cols-3 gap-1.5">
            <div className="rounded-md border border-[#34343c] bg-[#0f0f14] p-2">
              <p className="garage-mono text-[9px] uppercase text-[#b8b8bf]">Pending</p>
              <p className="mt-1 text-lg font-black text-white">{result.total}</p>
            </div>
            <div className="rounded-md border border-[#22c55e]/30 bg-[#22c55e]/10 p-2">
              <p className="garage-mono text-[9px] uppercase text-[#bbf7d0]">Auto-approved</p>
              <p className="mt-1 text-lg font-black text-white">{result.autoApproved}</p>
            </div>
            <div className="rounded-md border border-[#f5a742]/30 bg-[#f5a742]/10 p-2">
              <p className="garage-mono text-[9px] uppercase text-[#ffd08a]">Skipped</p>
              <p className="mt-1 text-lg font-black text-white">{result.skipped}</p>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
