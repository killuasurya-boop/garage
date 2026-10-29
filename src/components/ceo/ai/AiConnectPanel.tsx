"use client";

// Owner AI Connect (blueprint V3 §3.1–3.3, AI-01/AI-02): status jujur per dimensi, wizard
// sambung ChatGPT, kode verifikasi sekali pakai, saklar jeda/ubah data, daftar & cabut koneksi.
// Tidak ada tombol palsu "auto install" — setup dilakukan di ChatGPT web oleh Owner.
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, KeyRound, PlugZap, RefreshCw, ShieldOff, Unplug } from "lucide-react";

import { PageHeader } from "@/components/ceo/layout/PageHeader";
import { Panel } from "@/components/ceo/layout/Panel";
import { StatusPill } from "@/components/ds/status-pill";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { StatusTone } from "@/lib/design-tokens";
import type { AiStatus } from "@/lib/owner-ai-status";

type Connection = {
  id: string;
  clientName: string;
  clientRef: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastVerifiedAt: string | null;
  lastReadOkAt: string | null;
  lastWriteOkAt: string | null;
  revokedAt: string | null;
};

type StatusResponse = {
  status: AiStatus;
  connections: Connection[];
  dataAsOf: string;
  mcpUrl: string | null;
  settings: { paused: boolean; writeEnabled: boolean };
};

type Challenge = { code: string; expiresAt: string; createdAt: number };

const TONE: Record<string, StatusTone> = {
  ONLINE: "success",
  VERIFIED: "success",
  READ_WRITE: "success",
  IDLE: "neutral",
  RUNNING: "info",
  PAUSED: "warning",
  NEEDS_REVERIFY: "warning",
  NEVER_VERIFIED: "warning",
  READ_ONLY: "warning",
  UNKNOWN: "neutral",
  OFFLINE: "danger",
  NEEDS_2FA: "danger",
  BLOCKED: "danger",
  FAILED: "danger",
  REVOKED: "danger",
};

const STATE_LABEL: Record<string, string> = {
  ONLINE: "Online",
  PAUSED: "Dijeda",
  OFFLINE: "Offline",
  VERIFIED: "Terverifikasi",
  NEEDS_2FA: "Perlu 2FA",
  NEEDS_REVERIFY: "Perlu verifikasi ulang",
  NEVER_VERIFIED: "Belum diverifikasi",
  REVOKED: "Dicabut",
  READ_WRITE: "Baca & ubah",
  READ_ONLY: "Hanya baca",
  BLOCKED: "Terblokir",
  UNKNOWN: "Belum terbukti",
  IDLE: "Diam",
  RUNNING: "Berjalan",
  FAILED: "Gagal",
};

const CHIP_TONE: Record<AiStatus["chip"]["state"], StatusTone> = {
  AI_VERIFIED: "success",
  AI_STANDBY: "warning",
  AI_RUNNING: "info",
  AI_ERROR: "danger",
  AI_NOT_SETUP: "neutral",
};

const dateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" }) : "—";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", headers: { "content-type": "application/json" }, ...init });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!res.ok || !json || json.data === undefined) throw new Error(json?.error?.message ?? `Gagal (${res.status}).`);
  return json.data;
}

function Tile({ title, state, detail, extra }: { title: string; state: string; detail: string; extra?: string | null }) {
  return (
    <div className="flex min-h-[132px] flex-col gap-2 rounded-lg border border-white/10 bg-[var(--garage-bg-3)] p-4">
      <p className="text-[11px] font-semibold uppercase text-zinc-400">{title}</p>
      <StatusPill tone={TONE[state] ?? "neutral"} className="self-start">
        {STATE_LABEL[state] ?? state}
      </StatusPill>
      <p className="text-xs leading-5 text-zinc-300">{detail}</p>
      {extra ? <p className="mt-auto text-[11px] text-zinc-400">{extra}</p> : null}
    </div>
  );
}

function Step({ no, title, done, children }: { no: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className={`grid size-7 shrink-0 place-items-center rounded-full border text-xs font-black ${
          done ? "border-[var(--gos-status-success)] text-[var(--gos-status-success)]" : "border-white/20 text-zinc-300"
        }`}
        aria-hidden="true"
      >
        {done ? <Check className="size-3.5" /> : no}
      </span>
      <div className="min-w-0 flex-1 space-y-2 pb-4">
        <p className="text-sm font-semibold text-zinc-100">
          {title}
          {done ? <span className="sr-only"> (selesai)</span> : null}
        </p>
        {children}
      </div>
    </li>
  );
}

export function AiConnectPanel() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<{ id?: string; label: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const next = await api<StatusResponse>("/api/owner-ai/status", { signal: controller.signal });
      setData(next);
      setError(null);
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError((err as Error).message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  // Muat awal + segarkan: 5 dtk saat kode verifikasi aktif, 60 dtk biasa; berhenti saat tab tersembunyi.
  const codeActive = Boolean(challenge) && secondsLeft > 0;
  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const interval = codeActive ? 5_000 : 60_000;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, interval);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [load, codeActive]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!challenge) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.round((new Date(challenge.expiresAt).getTime() - Date.now()) / 1000)));
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [challenge]);

  // Verifikasi berhasil setelah kode dibuat → kode tidak ditampilkan lagi (diturunkan dari data).
  const verifiedAt = data?.status.link.lastVerifiedAt ?? null;
  const verifiedSinceCode = Boolean(challenge && verifiedAt && new Date(verifiedAt).getTime() >= challenge.createdAt - 1_000);
  const showCode = Boolean(challenge) && secondsLeft > 0 && !verifiedSinceCode;

  async function makeChallenge() {
    setBusy("challenge");
    try {
      const created = await api<Omit<Challenge, "createdAt">>("/api/owner-ai/connection/challenge", { method: "POST" });
      setChallenge({ ...created, createdAt: Date.now() });
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function toggleSetting(key: "mcpChatgptPaused" | "mcpChatgptWriteEnabled", value: boolean) {
    setBusy(key);
    try {
      await api("/api/admin/settings", { method: "POST", body: JSON.stringify({ updates: { [key]: value } }) });
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function copyUrl() {
    if (!data?.mcpUrl) return;
    await navigator.clipboard.writeText(data.mcpUrl).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  }

  const status = data?.status;
  const active = data?.connections.filter((c) => !c.revokedAt) ?? [];
  const gatewayOk = status?.gateway.state === "ONLINE";

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="AI CONNECT"
        title="Koneksi ChatGPT"
        subtitle="Sambungkan, buktikan, dan kendalikan akses ChatGPT ke Garage OS. Status hanya hijau bila terbukti."
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-1.5">
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} /> Segarkan
          </Button>
        }
      />

      {error ? (
        <p role="alert" className="rounded-md border border-[color-mix(in_srgb,var(--gos-status-danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--gos-status-danger)_10%,transparent)] px-3 py-2 text-sm text-zinc-100">
          {error}
        </p>
      ) : null}

      {!data ? (
        <Panel>
          <p className="text-sm text-zinc-400">{loading ? "Memuat status koneksi…" : "Status belum bisa dimuat."}</p>
        </Panel>
      ) : (
        <>
          <Panel
            title="Status saat ini"
            subtitle={`Data per ${dateTime(data.dataAsOf)} WIB`}
            actions={
              <StatusPill tone={CHIP_TONE[status!.chip.state]} className="whitespace-nowrap">
                {status!.chip.label}
              </StatusPill>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Tile title="Server MCP" state={status!.gateway.state} detail={status!.gateway.detail} />
              <Tile title="Identitas Owner" state={status!.identity.state} detail={status!.identity.detail} />
              <Tile
                title="Link ChatGPT"
                state={status!.link.state}
                detail={status!.link.detail}
                extra={status!.link.lastVerifiedAt ? `Terakhir: ${dateTime(status!.link.lastVerifiedAt)}` : null}
              />
              <Tile title="Akses tool" state={status!.toolAccess.state} detail={status!.toolAccess.detail} />
              <Tile title="Eksekusi" state={status!.execution.state} detail={status!.execution.detail} />
            </div>
          </Panel>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <Panel title="Sambungkan & verifikasi" subtitle="Ikuti urutan ini sekali; verifikasi ulang tiap 24 jam bila diminta.">
              <ol className="mt-1">
                <Step no={1} title="Cek server" done={gatewayOk}>
                  <p className="text-xs leading-5 text-zinc-300">{status!.gateway.detail}</p>
                </Step>
                <Step no={2} title="Salin URL MCP" done={copied}>
                  {data.mcpUrl ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="min-w-0 max-w-full break-all rounded border border-white/10 bg-black/30 px-2 py-1.5 font-mono text-xs text-zinc-100">
                        {data.mcpUrl}
                      </code>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void copyUrl()}>
                        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Tersalin" : "Salin"}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-300">URL belum tersedia — server MCP belum aktif.</p>
                  )}
                </Step>
                <Step no={3} title="Tambahkan di ChatGPT web" done={active.length > 0}>
                  <p className="text-xs leading-5 text-zinc-300">
                    Di ChatGPT web: Settings → Apps & Connectors → buat connector baru (custom MCP), tempel URL di atas, pilih OAuth, lalu
                    login dengan akun Owner + kode 2FA. Fitur ini tergantung paket ChatGPT Anda; aplikasi HP belum tentu bisa.
                  </p>
                  <Button asChild size="sm" variant="outline" className="gap-1.5">
                    <a href="https://chatgpt.com" target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="size-3.5" /> Buka ChatGPT web
                    </a>
                  </Button>
                  <p className="text-[11px] text-zinc-400">
                    {active.length ? `${active.length} koneksi ChatGPT terdeteksi.` : "Belum ada ChatGPT yang tersambung."}
                  </p>
                </Step>
                <Step no={4} title="Buktikan dengan kode sekali pakai" done={status!.link.state === "VERIFIED"}>
                  {showCode && challenge ? (
                    <div className="space-y-2 rounded-lg border border-[color-mix(in_srgb,var(--garage-amber,#f5a742)_50%,transparent)] bg-black/30 p-3">
                      <p className="font-mono text-3xl font-black tracking-[0.2em] text-zinc-50" aria-live="polite">
                        {challenge.code}
                      </p>
                      <p className="text-xs leading-5 text-zinc-300">
                        Di ChatGPT ketik: <span className="font-semibold text-zinc-100">“Verifikasi koneksi Garage OS dengan kode {challenge.code}”</span>.
                        Berlaku {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")} lagi, sekali pakai. Halaman ini menunggu
                        bukti dari ChatGPT.
                      </p>
                    </div>
                  ) : (
                    <Button size="sm" className="gap-1.5" onClick={() => void makeChallenge()} disabled={busy === "challenge" || !gatewayOk}>
                      <KeyRound className="size-3.5" /> {challenge && !verifiedSinceCode ? "Kode kedaluwarsa — buat baru" : "Buat kode verifikasi"}
                    </Button>
                  )}
                </Step>
                <Step no={5} title="Terhubung & terbukti" done={status!.link.state === "VERIFIED"}>
                  <p className="text-xs leading-5 text-zinc-300">
                    {status!.link.state === "VERIFIED"
                      ? `Terverifikasi ${dateTime(status!.link.lastVerifiedAt)}. Verifikasi ulang sebelum ${dateTime(status!.link.reverifyDueAt)}.`
                      : "Selesai setelah ChatGPT memanggil garage_verify_connection dengan kode di atas."}
                  </p>
                </Step>
              </ol>
            </Panel>

            <div className="space-y-5">
              <Panel title="Kendali Owner" subtitle="Berlaku seketika, tanpa restart. POS & dashboard tetap jalan.">
                <div className="space-y-3">
                  <SettingRow
                    label="Jeda semua akses ChatGPT"
                    hint="Kill switch: semua panggilan ChatGPT ditolak sampai dilanjutkan."
                    checked={data.settings.paused}
                    busy={busy === "mcpChatgptPaused"}
                    onChange={(value) => void toggleSetting("mcpChatgptPaused", value)}
                  />
                  <SettingRow
                    label="ChatGPT boleh mengubah data"
                    hint="Mati = hanya membaca. Hidup = ubah data selalu lewat preview + konfirmasi; aksi kritis butuh kode 2FA."
                    checked={data.settings.writeEnabled}
                    busy={busy === "mcpChatgptWriteEnabled"}
                    onChange={(value) => void toggleSetting("mcpChatgptWriteEnabled", value)}
                  />
                </div>
              </Panel>

              <Panel
                title="Koneksi ChatGPT"
                subtitle="Dicabut = token lama langsung ditolak; ChatGPT harus login + 2FA ulang."
                actions={
                  active.length ? (
                    <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => setRevokeTarget({ label: "semua koneksi ChatGPT" })}>
                      <ShieldOff className="size-3.5" /> Cabut semua
                    </Button>
                  ) : null
                }
              >
                {data.connections.length ? (
                  <ul className="max-h-80 space-y-2 overflow-y-auto overscroll-contain pr-1">
                    {data.connections.map((c) => (
                      <li key={c.id} className="rounded-md border border-white/10 bg-[var(--garage-bg-3)] p-3 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold text-zinc-100">
                            <PlugZap className="mr-1 inline size-3.5" aria-hidden="true" />
                            {c.clientName} <span className="font-mono text-zinc-400">{c.clientRef}</span>
                          </p>
                          {c.revokedAt ? (
                            <StatusPill tone="danger">Dicabut</StatusPill>
                          ) : (
                            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setRevokeTarget({ id: c.id, label: `${c.clientName} ${c.clientRef}` })}>
                              <Unplug className="size-3.5" /> Cabut
                            </Button>
                          )}
                        </div>
                        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-zinc-300">
                          <dt className="text-zinc-400">Pertama</dt>
                          <dd>{dateTime(c.firstSeenAt)}</dd>
                          <dt className="text-zinc-400">Terakhir aktif</dt>
                          <dd>{dateTime(c.lastSeenAt)}</dd>
                          <dt className="text-zinc-400">Terverifikasi</dt>
                          <dd>{dateTime(c.lastVerifiedAt)}</dd>
                          <dt className="text-zinc-400">Baca / ubah terbukti</dt>
                          <dd>
                            {c.lastReadOkAt ? "baca ✓" : "baca —"} · {c.lastWriteOkAt ? "ubah ✓" : "ubah —"}
                          </dd>
                          {c.revokedAt ? (
                            <>
                              <dt className="text-zinc-400">Dicabut</dt>
                              <dd>{dateTime(c.revokedAt)}</dd>
                            </>
                          ) : null}
                        </dl>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-zinc-400">Belum ada koneksi. Ikuti langkah 1–4.</p>
                )}
              </Panel>
            </div>
          </div>
        </>
      )}

      <RevokeDialog
        key={revokeTarget ? (revokeTarget.id ?? "all") : "closed"}
        target={revokeTarget}
        onClose={() => setRevokeTarget(null)}
        onDone={() => {
          setRevokeTarget(null);
          void load();
        }}
      />
    </div>
  );
}

function SettingRow({
  label,
  hint,
  checked,
  busy,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  busy: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-white/10 bg-[var(--garage-bg-3)] p-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-zinc-100">{label}</p>
        <p className="mt-0.5 text-xs leading-5 text-zinc-400">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={busy}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition disabled:opacity-50 ${
          checked ? "border-[var(--garage-red)] bg-[color-mix(in_srgb,var(--garage-red)_70%,transparent)]" : "border-white/20 bg-white/10"
        }`}
      >
        <span className={`inline-block size-5 rounded-full bg-zinc-50 shadow transition motion-reduce:transition-none ${checked ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    </div>
  );
}

function RevokeDialog({
  target,
  onClose,
  onDone,
}: {
  target: { id?: string; label: string } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [alasan, setAlasan] = useState("");
  const [kode, setKode] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setErr(null);
    try {
      await api("/api/owner-ai/connections/revoke", {
        method: "POST",
        body: JSON.stringify({ connectionId: target?.id, alasan, kode2fa: kode }),
      });
      onDone();
    } catch (error) {
      setErr((error as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cabut {target?.label}?</DialogTitle>
          <DialogDescription>
            Token yang sedang dipegang ChatGPT langsung ditolak. Data bisnis, POS, dan dashboard tidak berubah. Untuk tersambung lagi, ChatGPT
            harus login Owner + 2FA ulang.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="text-zinc-300">Alasan</span>
            <Input value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="mis. HP hilang / tidak dipakai lagi" />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-zinc-300">Kode 2FA (6 angka)</span>
            <Input
              value={kode}
              onChange={(e) => setKode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              className="font-mono tracking-[0.3em]"
            />
          </label>
          {err ? (
            <p role="alert" className="text-sm text-[var(--gos-status-danger)]">
              {err}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Batal
          </Button>
          <Button variant="destructive" onClick={() => void submit()} disabled={pending || alasan.trim().length < 3 || kode.length !== 6}>
            Cabut koneksi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
