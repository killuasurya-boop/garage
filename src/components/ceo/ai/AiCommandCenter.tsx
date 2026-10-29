"use client";

// Owner AI Command Center (blueprint V3 AI-04/05/06/07, ADR-001): pilih perintah → isi → hasil.
// Perintah yang mengubah uang/stok/identitas (R2/R3) selalu: preview (belum dijalankan) → Owner
// menyetujui ringkasan yang sama persis (+ kode 2FA untuk R3) → receipt bersidik. Mesin = ChatGPT.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Play, RefreshCw, Search, ShieldCheck, X } from "lucide-react";

import { formToArgs, SchemaForm, type FormValues, type JsonSchema } from "@/components/ceo/ai/SchemaForm";
import { PageHeader } from "@/components/ceo/layout/PageHeader";
import { Panel } from "@/components/ceo/layout/Panel";
import { StatusPill } from "@/components/ds/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { StatusTone } from "@/lib/design-tokens";

type Tool = {
  name: string;
  title: string;
  description: string;
  risk: "R0" | "R1" | "R2" | "R3";
  write: boolean;
  needsConfirmation: boolean;
  inputSchema: JsonSchema;
};
type Domain = { id: string; no: number; label: string; tools: Tool[] };

type Preview = {
  status: "PERLU_KONFIRMASI";
  operasiId: string;
  risiko: string;
  ringkasan: Record<string, unknown>;
  argumen: Record<string, unknown>;
  konfirmasi: string;
  berlakuSampai: string;
  butuhKode2fa?: boolean;
};
type Receipt = {
  operasiId: string;
  tool: string;
  risiko: string;
  sumber: string;
  dijalankan: string;
  sidikArgumen: string;
  sidikHasil: string;
};
type Operation = {
  operationId: string;
  tool: string;
  risiko: string;
  sumber: string;
  status: string;
  dibuat: string;
  dijalankan: string | null;
  sidikHasil: string | null;
  error: string | null;
};

const RISK: Record<Tool["risk"], { tone: StatusTone; label: string }> = {
  R0: { tone: "neutral", label: "R0 · Baca" },
  R1: { tone: "info", label: "R1 · Ubah ringan" },
  R2: { tone: "warning", label: "R2 · Uang/stok — perlu setuju" },
  R3: { tone: "danger", label: "R3 · Kritis — setuju + 2FA" },
};
const OP_TONE: Record<string, StatusTone> = { EXECUTED: "success", PENDING: "warning", FAILED: "danger", UNKNOWN: "danger" };
const OP_LABEL: Record<string, string> = { EXECUTED: "Berhasil", PENDING: "Menunggu setuju", FAILED: "Gagal", UNKNOWN: "Tidak pasti" };

const dateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "short", timeStyle: "medium" }) : "—";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", headers: { "content-type": "application/json" }, ...init });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { code?: string; message?: string } } | null;
  if (!res.ok || !json || json.data === undefined) {
    const err = new Error(json?.error?.message ?? `Gagal (${res.status}).`) as Error & { code?: string };
    err.code = json?.error?.code;
    throw err;
  }
  return json.data;
}

function JsonView({ value }: { value: unknown }) {
  return (
    <pre className="max-h-72 overflow-auto overscroll-contain whitespace-pre-wrap break-words rounded-md border border-white/10 bg-black/30 p-3 font-mono text-[11px] leading-5 text-zinc-200">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function AiCommandCenter() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Tool | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [kode2fa, setKode2fa] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const loadOperations = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const data = await api<{ operations: Operation[] }>("/api/owner-ai/operations?limit=30", { signal: controller.signal });
      setOperations(data.operations);
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => {
      void api<{ domains: Domain[] }>("/api/owner-ai/commands")
        .then((data) => setDomains(data.domains))
        .catch((err: Error) => setError(err.message));
      void loadOperations();
    }, 0);
    return () => {
      window.clearTimeout(first);
      abortRef.current?.abort();
    };
  }, [loadOperations]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return domains;
    return domains
      .map((d) => ({ ...d, tools: d.tools.filter((t) => `${t.name} ${t.title} ${t.description} ${d.label}`.toLowerCase().includes(q)) }))
      .filter((d) => d.tools.length);
  }, [domains, query]);

  function choose(tool: Tool) {
    setSelected(tool);
    setValues({});
    setResult(null);
    setPreview(null);
    setReceipt(null);
    setKode2fa("");
    setError(null);
  }

  async function run(confirm?: Preview) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      // Konfirmasi memakai argumen dari PREVIEW (yang disetujui), bukan isian form terbaru.
      const args = confirm ? confirm.argumen : formToArgs(selected.inputSchema, values);
      const data = await api<{ result: unknown }>("/api/owner-ai/commands", {
        method: "POST",
        body: JSON.stringify({ tool: selected.name, args, konfirmasi: confirm?.konfirmasi ?? null, kode2fa: confirm?.butuhKode2fa ? kode2fa : null }),
      });
      const res = data.result as { status?: string; receipt?: Receipt; hasil?: unknown };
      if (res?.status === "PERLU_KONFIRMASI") {
        setPreview(res as Preview);
        setResult(null);
      } else if (res?.status === "BERHASIL" && res.receipt) {
        setReceipt(res.receipt);
        setResult(res.hasil);
        setPreview(null);
        setKode2fa("");
      } else {
        setResult(res);
        setPreview(null);
      }
      void loadOperations();
    } catch (err) {
      setError((err as Error).message);
      // Token dipakai/kedaluwarsa/argumen berubah → preview lama tidak berlaku.
      const code = (err as { code?: string }).code ?? "";
      if (/^CONFIRMATION_/.test(code)) setPreview(null);
      void loadOperations();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="AI COMMAND CENTER"
        title="Perintah Owner"
        subtitle="Mesin yang sama dengan ChatGPT: ubah uang/stok/identitas selalu lewat ringkasan → persetujuan Anda → bukti (receipt)."
        actions={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void loadOperations()}>
            <RefreshCw className="size-3.5" /> Segarkan
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Panel title="Daftar perintah" subtitle={`${domains.reduce((n, d) => n + d.tools.length, 0)} perintah di ${domains.length} modul`}>
          <label className="mb-3 flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-2">
            <Search className="size-3.5 text-zinc-400" aria-hidden="true" />
            <span className="sr-only">Cari perintah</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari: harga, stok, setoran…"
              className="h-9 min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
            />
          </label>
          <div className="max-h-[32rem] space-y-3 overflow-y-auto overscroll-contain pr-1">
            {filtered.map((domain) => (
              <section key={domain.id}>
                <p className="mb-1 text-[11px] font-semibold uppercase text-zinc-400">
                  M{String(domain.no).padStart(2, "0")} · {domain.label}
                </p>
                <ul className="space-y-1">
                  {domain.tools.map((tool) => (
                    <li key={tool.name}>
                      <button
                        type="button"
                        onClick={() => choose(tool)}
                        aria-pressed={selected?.name === tool.name}
                        className={`flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition ${
                          selected?.name === tool.name
                            ? "border-[var(--garage-red)] bg-[color-mix(in_srgb,var(--garage-red)_14%,transparent)] text-zinc-50"
                            : "border-white/10 bg-[var(--garage-bg-3)] text-zinc-200 hover:border-white/25"
                        }`}
                      >
                        <span className="min-w-0 truncate">{tool.title}</span>
                        <span className="shrink-0 font-mono text-[10px] text-zinc-400">{tool.risk}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {!filtered.length ? <p className="text-xs text-zinc-400">Tidak ada perintah yang cocok.</p> : null}
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel
            title={selected ? selected.title : "Pilih perintah"}
            subtitle={selected ? selected.name : "Pilih dari daftar di kiri."}
            actions={selected ? <StatusPill tone={RISK[selected.risk].tone}>{RISK[selected.risk].label}</StatusPill> : null}
          >
            {selected ? (
              <div className="space-y-4">
                <p className="text-sm leading-6 text-zinc-300">{selected.description}</p>
                <SchemaForm schema={selected.inputSchema} values={values} onChange={setValues} disabled={busy || Boolean(preview)} />
                {!preview ? (
                  <Button className="gap-1.5" onClick={() => void run()} disabled={busy}>
                    <Play className="size-3.5" /> {selected.needsConfirmation ? "Lihat ringkasan perubahan" : selected.write ? "Jalankan" : "Tampilkan"}
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-zinc-400">Perintah baca (R0) langsung tampil. Perintah ubah tetap meminta persetujuan Anda.</p>
            )}
            {error ? (
              <p role="alert" className="mt-3 rounded-md border border-[color-mix(in_srgb,var(--gos-status-danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--gos-status-danger)_10%,transparent)] px-3 py-2 text-sm text-zinc-100">
                {error}
              </p>
            ) : null}
          </Panel>

          {preview ? (
            <Panel title="Ringkasan — BELUM dijalankan" subtitle={`Berlaku sampai ${dateTime(preview.berlakuSampai)} · sekali pakai`}>
              <div className="space-y-3">
                <JsonView value={preview.ringkasan && Object.keys(preview.ringkasan).length ? preview.ringkasan : preview.argumen} />
                {preview.butuhKode2fa ? (
                  <label className="flex max-w-xs flex-col gap-1">
                    <span className="text-xs font-semibold text-zinc-200">Kode 2FA (6 angka)</span>
                    <Input
                      value={kode2fa}
                      onChange={(e) => setKode2fa(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      className="font-mono tracking-[0.3em]"
                      placeholder="123456"
                    />
                  </label>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="gap-1.5"
                    onClick={() => void run(preview)}
                    disabled={busy || (preview.butuhKode2fa ? kode2fa.length !== 6 : false)}
                  >
                    <ShieldCheck className="size-3.5" /> Setujui & jalankan
                  </Button>
                  <Button variant="outline" className="gap-1.5" onClick={() => setPreview(null)} disabled={busy}>
                    <X className="size-3.5" /> Batal
                  </Button>
                </div>
              </div>
            </Panel>
          ) : null}

          {receipt ? (
            <Panel title="Receipt" actions={<StatusPill tone="success">Berhasil</StatusPill>}>
              <dl className="grid gap-x-4 gap-y-1 text-xs text-zinc-300 sm:grid-cols-[10rem_minmax(0,1fr)]">
                <dt className="text-zinc-400">Operasi</dt>
                <dd className="break-all font-mono">{receipt.operasiId}</dd>
                <dt className="text-zinc-400">Dijalankan</dt>
                <dd>{dateTime(receipt.dijalankan)} WIB · {receipt.sumber === "garage_owner_ui" ? "layar Owner" : "ChatGPT"}</dd>
                <dt className="text-zinc-400">Sidik argumen</dt>
                <dd className="break-all font-mono">{receipt.sidikArgumen}</dd>
                <dt className="text-zinc-400">Sidik hasil</dt>
                <dd className="break-all font-mono">{receipt.sidikHasil}</dd>
              </dl>
            </Panel>
          ) : null}

          {result !== null && result !== undefined ? (
            <Panel title="Hasil">
              <JsonView value={result} />
            </Panel>
          ) : null}
        </div>
      </div>

      <Panel title="Timeline operasi" subtitle="Semua perubahan R2/R3 dari ChatGPT & layar ini, terbaru dulu.">
        {operations.length ? (
          <div className="max-h-96 overflow-auto overscroll-contain">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="sticky top-0 bg-[var(--garage-bg-2)] text-zinc-400">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Waktu</th>
                  <th className="py-2 pr-3 font-semibold">Perintah</th>
                  <th className="py-2 pr-3 font-semibold">Sumber</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 font-semibold">Sidik hasil</th>
                </tr>
              </thead>
              <tbody className="text-zinc-200">
                {operations.map((op) => (
                  <tr key={op.operationId} className="border-t border-white/5 align-top">
                    <td className="whitespace-nowrap py-2 pr-3">{dateTime(op.dijalankan ?? op.dibuat)}</td>
                    <td className="py-2 pr-3">
                      <span className="font-mono">{op.tool}</span> <span className="text-zinc-400">{op.risiko}</span>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3">{op.sumber === "garage_owner_ui" ? "Layar Owner" : "ChatGPT"}</td>
                    <td className="py-2 pr-3">
                      <StatusPill tone={OP_TONE[op.status] ?? "neutral"}>{OP_LABEL[op.status] ?? op.status}</StatusPill>
                      {op.error ? <p className="mt-1 max-w-xs text-[11px] text-zinc-400">{op.error}</p> : null}
                    </td>
                    <td className="py-2 font-mono text-[11px] text-zinc-400">{op.sidikHasil ? `${op.sidikHasil.slice(0, 12)}…` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-zinc-400">
            <CheckCircle2 className="size-4" aria-hidden="true" /> Belum ada operasi ubah data.
          </p>
        )}
      </Panel>
    </div>
  );
}
