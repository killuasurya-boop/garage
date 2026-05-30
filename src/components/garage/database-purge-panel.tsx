"use client";

import { useState } from "react";
import { AlertTriangle, Database, Loader2, Play, ShieldAlert, Trash2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type PurgeTarget = "orders" | "approvals" | "chat";

type PurgeResponse = {
  data: {
    dryRun: boolean;
    retentionDays: number;
    cutoff: string;
    counts: Record<string, number>;
    note: string;
  };
};

const ALL_TARGETS: PurgeTarget[] = ["orders", "approvals", "chat"];

const TARGET_LABEL: Record<PurgeTarget, string> = {
  orders: "Orders selesai",
  approvals: "Approvals selesai",
  chat: "Chat internal",
};

export function DatabasePurgePanel() {
  const [retentionDays, setRetentionDays] = useState(30);
  const [targets, setTargets] = useState<PurgeTarget[]>([...ALL_TARGETS]);
  const [loading, setLoading] = useState<"dry" | "exec" | null>(null);
  const [result, setResult] = useState<PurgeResponse["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleTarget(t: PurgeTarget) {
    setTargets((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  async function call(dryRun: boolean) {
    if (!dryRun) {
      const ok = window.confirm(
        `Hapus permanen data lebih lama dari ${retentionDays} hari di tabel: ${targets.join(", ")}?\n\nAksi ini TIDAK BISA di-undo.`,
      );
      if (!ok) return;
    }
    setLoading(dryRun ? "dry" : "exec");
    setError(null);
    try {
      const res = await fetch("/api/admin/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retentionDays, dryRun, targets }),
      });
      const json = (await res.json()) as PurgeResponse | { error: { message: string } };
      if (!res.ok) {
        const msg = "error" in json ? json.error.message : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setResult((json as PurgeResponse).data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memanggil purge.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <Card className="garage-panel garage-animate-in border-amber-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="size-4 text-amber-300" />
          Maintenance Database — Auto Purge
        </CardTitle>
        <CardDescription>
          Hapus data lama (orders selesai, approvals selesai, chat internal) untuk jaga DB ringan.
          Owner / Admin only. Audit logs <strong>tidak</strong> dihapus.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
          <div>
            <label className="text-[11px] font-bold uppercase text-white/60">Retention (hari)</label>
            <Input
              type="number"
              min={7}
              max={365}
              value={retentionDays}
              onChange={(e) => setRetentionDays(Math.max(7, Math.min(365, Number(e.target.value) || 30)))}
              className="mt-1 h-10 border-[#34343c] bg-black/30"
            />
            <p className="mt-1 text-[10px] text-white/40">Min 7 · Max 365 · Default 30</p>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase text-white/60">Target tabel</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {ALL_TARGETS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTarget(t)}
                  className={`rounded-md border px-3 py-2 text-xs font-bold transition ${
                    targets.includes(t)
                      ? "border-red-400/50 bg-red-500/15 text-red-100"
                      : "border-[#34343c] bg-white/[0.04] text-white/50 hover:text-white"
                  }`}
                >
                  {TARGET_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-amber-400/40 text-amber-200"
            onClick={() => void call(true)}
            disabled={loading !== null || targets.length === 0}
          >
            {loading === "dry" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Play className="mr-2 size-4" />}
            Dry Run (cek jumlah)
          </Button>
          <Button
            type="button"
            className="bg-red-600 text-white hover:bg-red-700"
            onClick={() => void call(false)}
            disabled={loading !== null || targets.length === 0}
          >
            {loading === "exec" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Trash2 className="mr-2 size-4" />}
            Eksekusi Hapus
          </Button>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-100">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="space-y-2 rounded-md border border-[#34343c] bg-black/30 p-3 text-sm">
            <div className="flex items-center gap-2">
              <Badge className={result.dryRun ? "bg-amber-500/20 text-amber-200" : "bg-red-500/20 text-red-200"}>
                {result.dryRun ? "DRY RUN" : "EKSEKUSI"}
              </Badge>
              <span className="text-xs text-white/60">Cutoff: {new Date(result.cutoff).toLocaleString("id-ID")}</span>
            </div>
            <ul className="space-y-1 text-xs">
              {Object.entries(result.counts).map(([k, v]) => (
                <li key={k} className="flex justify-between">
                  <span className="text-white/70">{k}</span>
                  <span className="font-bold text-white">{v} baris</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-white/50">{result.note}</p>
          </div>
        )}

        <div className="flex items-start gap-2 rounded-md border border-[#34343c] bg-black/20 p-3 text-[11px] text-white/60">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-300" />
          <span>
            <strong>Cron otomatis bulanan:</strong> set Vercel Cron / Neon scheduler untuk POST ke{" "}
            <code className="rounded bg-black/40 px-1">/api/admin/purge</code> dengan body{" "}
            <code className="rounded bg-black/40 px-1">{`{"retentionDays":30,"dryRun":false}`}</code>. Endpoint butuh
            session Owner — siapkan service auth token jika dipanggil tanpa browser.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
