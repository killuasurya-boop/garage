"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, CircleAlert, Copy, KeyRound, LoaderCircle, Plus, ShieldOff } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { garageApi } from "@/lib/api-client";

type Scope = "owner" | "manajer" | "readonly";
type KeyRow = {
  id: string;
  label: string;
  prefix: string;
  scope: Scope;
  outletName: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  useCount: number;
  createdAt: string;
  status: "aktif" | "dicabut" | "kedaluwarsa";
};

const SCOPE_INFO: Record<Scope, { label: string; note: string }> = {
  owner: { label: "Owner penuh", note: "Semua fitur, termasuk uang (void/refund, pengeluaran, gaji). Aksi langsung jalan, tercatat di Audit." },
  manajer: { label: "Manajer", note: "Operasional & keuangan seperti Manajer (tanpa pengaturan inti Owner)." },
  readonly: { label: "Baca-saja", note: "Hanya melihat data & laporan lewat REST GET. Tidak bisa MCP / mengubah data." },
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }) : "—";

/**
 * Pengaturan → Integrasi: API key untuk agent AI (OpenClaw / Hermes) yang
 * mengendalikan Garage OS lewat WhatsApp / Telegram. Owner (login langsung) saja.
 */
export function AgentApiKeysPanel() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("OpenClaw WhatsApp");
  const [scope, setScope] = useState<Scope>("owner");
  const [expires, setExpires] = useState<"30" | "90" | "365" | "none">("90");
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<{ key: string; label: string; scope: Scope } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await garageApi.get<{ keys: KeyRow[] }>("/api/agent-keys", { cache: "no-store" });
      setKeys(data.keys);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat API key.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const result = await garageApi.post<{ key: string }>("/api/agent-keys", {
        label: label.trim(),
        scope,
        expiresInDays: expires === "none" ? null : Number(expires),
      });
      setFresh({ key: result.key, label: label.trim(), scope });
      setCreating(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat API key.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(row: KeyRow) {
    if (!window.confirm(`Cabut API key "${row.label}"? Agent yang memakainya langsung kehilangan akses.`)) return;
    setError(null);
    try {
      await garageApi.post(`/api/agent-keys/${row.id}/revoke`, {});
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mencabut API key.");
    }
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Browser menolak salin otomatis — pilih teks lalu salin manual.");
    }
  }

  const mcpConfig = fresh
    ? JSON.stringify({ mcpServers: { "garage-os": { url: `${origin}/api/mcp`, headers: { Authorization: `Bearer ${fresh.key}` } } } }, null, 2)
    : "";
  const curl = fresh ? `curl -H "Authorization: Bearer ${fresh.key}" ${origin}/api/agent/v1/tools/ringkasan_hari_ini` : "";

  return (
    <section className="space-y-3 rounded-lg border border-[#3a3a44] bg-[#16161c] p-4" data-testid="agent-api-keys">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-bold text-white">
            <Bot className="size-5 text-[#f5a742]" aria-hidden /> API Key Agent AI
          </h3>
          <p className="mt-1 text-sm text-[#c4c4cc]">
            Untuk OpenClaw / Hermes agar bisa mengontrol Garage OS lewat WhatsApp & Telegram (MCP <code className="text-[#ffd79a]">/api/mcp</code> atau REST{" "}
            <code className="text-[#ffd79a]">/api/agent/v1</code>). Key hanya tampil sekali.
          </p>
        </div>
        <Button type="button" size="sm" className="garage-press min-h-10 gap-1.5 bg-[#c41a1a] text-white hover:bg-[#e83030]" onClick={() => setCreating((v) => !v)}>
          <Plus className="size-4" aria-hidden /> Buat key
        </Button>
      </div>

      {error ? (
        <Alert className="border-red-500/40 bg-red-500/10">
          <CircleAlert className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {creating ? (
        <div className="grid gap-3 rounded-md border border-[#34343c] bg-[#111116] p-3 sm:grid-cols-3">
          <label className="text-sm text-[#d4d4d8]">
            Nama key
            <input
              value={label}
              maxLength={60}
              onChange={(e) => setLabel(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-[#3a3a44] bg-[#17171d] px-3 text-sm text-white"
            />
          </label>
          <label className="text-sm text-[#d4d4d8]">
            Hak akses
            <select value={scope} onChange={(e) => setScope(e.target.value as Scope)} className="mt-1 h-10 w-full rounded-md border border-[#3a3a44] bg-[#17171d] px-3 text-sm text-white">
              {(Object.keys(SCOPE_INFO) as Scope[]).map((s) => (
                <option key={s} value={s}>
                  {SCOPE_INFO[s].label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-[#d4d4d8]">
            Berlaku
            <select value={expires} onChange={(e) => setExpires(e.target.value as typeof expires)} className="mt-1 h-10 w-full rounded-md border border-[#3a3a44] bg-[#17171d] px-3 text-sm text-white">
              <option value="30">30 hari</option>
              <option value="90">90 hari</option>
              <option value="365">1 tahun</option>
              <option value="none">Tanpa batas</option>
            </select>
          </label>
          <p className="text-sm text-[#ffd79a] sm:col-span-3">{SCOPE_INFO[scope].note}</p>
          <div className="flex justify-end gap-2 sm:col-span-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setCreating(false)}>
              Batal
            </Button>
            <Button type="button" size="sm" disabled={busy || label.trim().length < 2} onClick={() => void create()} className="gap-1.5 bg-[#c41a1a] text-white hover:bg-[#e83030]">
              {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />} Buat
            </Button>
          </div>
        </div>
      ) : null}

      {fresh ? (
        <div className="space-y-2 rounded-md border border-[#f5a742]/60 bg-[#f5a742]/10 p-3" role="status">
          <p className="text-sm font-bold text-[#ffd79a]">
            Key &quot;{fresh.label}&quot; ({SCOPE_INFO[fresh.scope].label}) — salin sekarang, tidak akan ditampilkan lagi.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-black/40 px-2 py-1.5 text-xs text-white" data-testid="agent-key-value">
              {fresh.key}
            </code>
            <Button type="button" size="sm" variant="outline" onClick={() => void copy(fresh.key, "key")} className="gap-1">
              <Copy className="size-3.5" aria-hidden /> {copied === "key" ? "Tersalin" : "Salin key"}
            </Button>
          </div>
          {fresh.scope !== "readonly" ? (
            <div>
              <p className="text-xs font-semibold text-[#d4d4d8]">Konfigurasi MCP (OpenClaw / Hermes):</p>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-black/40 p-2 text-xs text-[#e4e4e8]">{mcpConfig}</pre>
              <Button type="button" size="sm" variant="outline" onClick={() => void copy(mcpConfig, "mcp")} className="mt-1 gap-1">
                <Copy className="size-3.5" aria-hidden /> {copied === "mcp" ? "Tersalin" : "Salin konfigurasi MCP"}
              </Button>
            </div>
          ) : null}
          <p className="break-all text-xs text-[#c4c4cc]">Tes cepat: {curl}</p>
          <Button type="button" size="sm" variant="ghost" onClick={() => setFresh(null)}>
            Sudah saya simpan
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-[#2a2a32]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-[#22222a] text-[#e4e4e8]">
            <tr>
              <th className="px-3 py-2 font-semibold">Nama</th>
              <th className="px-3 py-2 font-semibold">Akses</th>
              <th className="px-3 py-2 font-semibold">Key</th>
              <th className="px-3 py-2 font-semibold">Terakhir dipakai</th>
              <th className="px-3 py-2 font-semibold">Berlaku s/d</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-[#c4c4cc]">
                  Memuat…
                </td>
              </tr>
            ) : keys.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-[#c4c4cc]">
                  Belum ada API key agent.
                </td>
              </tr>
            ) : (
              keys.map((row) => (
                <tr key={row.id} className="border-t border-[#2a2a32] text-[#e4e4e8]">
                  <td className="px-3 py-2 font-semibold">{row.label}</td>
                  <td className="px-3 py-2">{SCOPE_INFO[row.scope]?.label ?? row.scope}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.prefix}…</td>
                  <td className="px-3 py-2 text-xs">
                    {fmt(row.lastUsedAt)}
                    {row.useCount ? ` · ${row.useCount}×` : ""}
                  </td>
                  <td className="px-3 py-2 text-xs">{row.expiresAt ? fmt(row.expiresAt) : "Tanpa batas"}</td>
                  <td className="px-3 py-2">
                    <Badge className={row.status === "aktif" ? "border-[#22c55e]/45 bg-[#22c55e]/12 text-[#bbf7d0]" : "border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#ffc2c8]"}>
                      {row.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {row.status === "aktif" ? (
                      <Button type="button" size="sm" variant="outline" className="gap-1 text-[#ffc2c8]" onClick={() => void revoke(row)}>
                        <ShieldOff className="size-3.5" aria-hidden /> Cabut
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[#a1a1aa]">
        Simpan key di pengaturan rahasia agent. Bila bocor, cabut di sini — langsung tidak berlaku. Semua aksi agent tercatat di Audit dengan nama
        &quot;Agent &lt;nama key&gt;&quot;.
      </p>
    </section>
  );
}
