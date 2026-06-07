"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Handshake,
  AlertCircle,
  CheckCircle2,
  Lock,
  Plus,
  Coffee,
  RefreshCw,
} from "lucide-react";

type StaffRef = { name: string; role: string } | null;

type HandoverLog = {
  id: string;
  fromShift: string;
  toShift: string;
  cashInDrawer: number;
  notes: string | null;
  status: "pending_validation" | "validated" | "disputed";
  disputeReason: string | null;
  validatedAt: string | null;
  createdAt: string;
  fromStaff: StaffRef;
  toStaff: StaffRef;
};

const SHIFT_OPTIONS = ["pagi", "sore", "malam"] as const;
type Shift = (typeof SHIFT_OPTIONS)[number];

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function TeamShiftHandover() {
  const [logs, setLogs] = useState<HandoverLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fromShift, setFromShift] = useState<Shift>("pagi");
  const [toShift, setToShift] = useState<Shift>("sore");
  const [cashInput, setCashInput] = useState("");
  const [notesInput, setNotesInput] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hr/team/handover");
      if (!res.ok) throw new Error("Gagal memuat operan shift");
      const data = await res.json();
      setLogs(data.handovers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat operan shift");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLogs();
  }, [fetchLogs]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cash = parseInt(cashInput);
    if (!Number.isFinite(cash) || cash < 0) {
      setError("Nominal kas harus angka positif.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/hr/team/handover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          fromShift,
          toShift,
          cashInDrawer: cash,
          notes: notesInput.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? (typeof data?.error === "string" ? data.error : "Gagal menyimpan operan"));
      }
      setShowNewForm(false);
      setCashInput("");
      setNotesInput("");
      fetchLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan operan");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (id: string, action: "validate" | "dispute") => {
    let reason: string | undefined;
    if (action === "dispute") {
      const input = window.prompt("Alasan selisih / sengketa:");
      if (!input || input.trim().length < 3) return;
      reason = input.trim();
    }
    try {
      const res = await fetch("/api/hr/team/handover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "validate" ? { action, id } : { action, id, reason },
        ),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? (typeof data?.error === "string" ? data.error : "Gagal memproses operan"));
      }
      fetchLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memproses operan");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Handshake className="size-5 text-primary" />
            Operan Shift & Laci Kasir
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Protokol serah terima nominal uang kasir dan catatan operasional antar shift.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={fetchLogs}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Segarkan
          </Button>
          {!showNewForm && (
            <Button onClick={() => setShowNewForm(true)} className="gap-2 font-bold shadow-sm">
              <Plus className="size-4" /> Operan Baru
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {showNewForm && (
        <Card className="border-primary/30 shadow-md">
          <CardHeader className="bg-muted/30 border-b">
            <CardTitle className="text-base flex items-center gap-2 text-primary">
              <Lock className="size-4" /> Formulir Serah Terima Kasir
            </CardTitle>
            <CardDescription>
              Laporkan nominal akhir di laci kasir untuk divalidasi kasir shift berikutnya.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Shift Saat Ini</label>
                  <select
                    value={fromShift}
                    onChange={(e) => setFromShift(e.target.value as Shift)}
                    className="w-full px-3 py-2 bg-background border rounded-md text-sm capitalize"
                  >
                    {SHIFT_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Diserahkan ke Shift</label>
                  <select
                    value={toShift}
                    onChange={(e) => setToShift(e.target.value as Shift)}
                    className="w-full px-3 py-2 bg-background border rounded-md text-sm capitalize"
                  >
                    {SHIFT_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">
                    Sisa Uang Laci (Rupiah)
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={cashInput}
                    onChange={(e) => setCashInput(e.target.value)}
                    placeholder="500000"
                    className="w-full px-4 py-2 bg-background border rounded-md text-sm"
                  />
                </div>
                <div className="space-y-2 md:row-span-1">
                  <label className="text-sm font-semibold text-foreground">Catatan (Opsional)</label>
                  <textarea
                    rows={2}
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    placeholder="Mesin EDC lemot, stok susu low fat sisa 1 liter..."
                    className="w-full px-4 py-2 bg-background border rounded-md text-sm resize-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t mt-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowNewForm(false)}
                  disabled={submitting}
                >
                  Batal
                </Button>
                <Button type="submit" className="font-bold" disabled={submitting}>
                  {submitting ? "Menyimpan..." : "Kirim Operan"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">
            <RefreshCw className="size-6 animate-spin mx-auto mb-2 opacity-50" /> Memuat operan shift...
          </div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground border rounded-lg bg-card">
            Belum ada catatan operan shift.
          </div>
        ) : (
          logs.map((log) => (
            <Card
              key={log.id}
              className={`overflow-hidden transition-all hover:shadow-md ${
                log.status === "pending_validation"
                  ? "border-orange-500/50 shadow-[0_0_10px_rgba(249,115,22,0.1)]"
                  : ""
              }`}
            >
              <div className="flex flex-col md:flex-row">
                <div
                  className={`md:w-1/3 p-4 border-b md:border-b-0 md:border-r flex flex-col justify-center items-center text-center ${
                    log.status === "pending_validation"
                      ? "bg-orange-500/5"
                      : log.status === "disputed"
                      ? "bg-destructive/5"
                      : "bg-muted/30"
                  }`}
                >
                  <div className="flex items-center gap-3 text-sm font-bold text-foreground capitalize">
                    <span>{log.fromShift}</span>
                    <span className="text-muted-foreground">→</span>
                    <span>{log.toShift}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1 mb-3">
                    {formatDate(log.createdAt)}
                  </div>

                  {log.status === "validated" && (
                    <Badge className="bg-emerald-500 hover:bg-emerald-600 gap-1">
                      <CheckCircle2 className="size-3" /> Tervalidasi
                    </Badge>
                  )}
                  {log.status === "pending_validation" && (
                    <Badge variant="outline" className="text-orange-500 border-orange-500 gap-1">
                      <AlertCircle className="size-3" /> Menunggu Validasi
                    </Badge>
                  )}
                  {log.status === "disputed" && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertCircle className="size-3" /> Selisih / Sengketa
                    </Badge>
                  )}
                </div>

                <div className="md:w-2/3 p-4 sm:p-5 flex flex-col sm:flex-row gap-6 justify-between items-start sm:items-center bg-card">
                  <div className="space-y-3 flex-1">
                    <div className="flex items-start gap-4">
                      <div className="p-2 bg-muted rounded-md text-muted-foreground">
                        <Lock className="size-5" />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                          Uang Laci Kasir
                        </p>
                        <p className="text-xl font-black text-foreground">
                          {formatRupiah(log.cashInDrawer)}
                        </p>
                      </div>
                    </div>
                    {log.notes && (
                      <div className="flex items-start gap-4">
                        <div className="p-2 bg-muted rounded-md text-muted-foreground">
                          <Coffee className="size-5" />
                        </div>
                        <div>
                          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                            Catatan Operasional
                          </p>
                          <p className="text-sm text-foreground/80">{log.notes}</p>
                        </div>
                      </div>
                    )}
                    {log.disputeReason && (
                      <div className="text-xs text-destructive">
                        <strong>Alasan sengketa:</strong> {log.disputeReason}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-4 pt-2">
                      <span>
                        <strong>Diserahkan:</strong> {log.fromStaff?.name ?? "—"}
                      </span>
                      <span>
                        <strong>Diterima:</strong> {log.toStaff?.name ?? "—"}
                      </span>
                    </div>
                  </div>

                  {log.status === "pending_validation" && (
                    <div className="flex flex-row sm:flex-col gap-2 w-full sm:w-auto mt-4 sm:mt-0">
                      <Button
                        size="sm"
                        className="w-full bg-emerald-500 hover:bg-emerald-600 font-bold"
                        onClick={() => handleAction(log.id, "validate")}
                      >
                        Terima & Validasi
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-destructive border-destructive/50 hover:bg-destructive/10"
                        onClick={() => handleAction(log.id, "dispute")}
                      >
                        Laporkan Selisih
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
