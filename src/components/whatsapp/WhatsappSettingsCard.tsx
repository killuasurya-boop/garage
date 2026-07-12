"use client";

import { useEffect, useState } from "react";

type IntegrationCheck = { key: string; label: string; ok: boolean; severity: string };
type IntegrationResource = {
  resourceType: string;
  accountName: string | null;
  status: string;
  metadata?: { displayPhoneNumber?: string };
};
type WhatsappIntegration = {
  provider: string;
  label: string;
  status: string;
  configured: boolean;
  readiness: { ready: boolean; canPublish: boolean; checks: IntegrationCheck[] };
  resources: IntegrationResource[];
};

export function WhatsappSettingsCard() {
  const [integration, setIntegration] = useState<WhatsappIntegration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const [recipient, setRecipient] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/integrations");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "Gagal memuat integrasi.");
      const found = (data.data ?? []).find((i: WhatsappIntegration) => i.provider === "whatsapp");
      setIntegration(found ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/integrations/whatsapp/test", { method: "POST" });
      const data = await res.json();
      setTestResult(res.ok ? "Koneksi WhatsApp OK." : data?.error?.message || "Gagal.");
      if (res.ok) load();
    } catch (e) {
      setTestResult(e instanceof Error ? e.message : "Terjadi kesalahan.");
    } finally {
      setTesting(false);
    }
  }

  async function sendTest() {
    if (!recipient.trim() || !templateName.trim()) {
      setSendResult("Nomor tujuan & nama template wajib diisi.");
      return;
    }
    setSendingTest(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/messaging/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: recipient.trim(),
          templateName: templateName.trim(),
          idempotencyKey: crypto.randomUUID(),
          templateParameters: [],
        }),
      });
      const data = await res.json();
      setSendResult(res.ok ? "Pesan uji masuk antrian." : data?.error?.message || "Gagal.");
    } catch (e) {
      setSendResult(e instanceof Error ? e.message : "Terjadi kesalahan.");
    } finally {
      setSendingTest(false);
    }
  }

  const verifiedPhone = integration?.resources?.[0]?.metadata?.displayPhoneNumber;

  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius-xl)] border border-[var(--garage-line)] bg-[var(--garage-bg-1)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[var(--garage-fg)]">WhatsApp Cloud API</h2>
            <p className="font-mono text-xs text-[var(--garage-mute)]">
              {integration?.status === "connected"
                ? `Terhubung · ${verifiedPhone ?? integration.resources?.[0]?.accountName ?? ""}`
                : integration?.status ?? "belum dikonfigurasi"}
            </p>
          </div>
          <button
            type="button"
            onClick={testConnection}
            disabled={testing}
            className="min-h-11 rounded-[var(--radius-sm)] bg-[var(--garage-red)] px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--garage-red-bright)] disabled:opacity-60 cursor-pointer"
          >
            {testing ? "Mengecek…" : "Test Connection"}
          </button>
        </div>

        {error ? <p className="mt-3 text-sm text-[var(--garage-red-bright)]">{error}</p> : null}
        {testResult ? (
          <p className="mt-3 text-sm text-[var(--garage-dim)]">{testResult}</p>
        ) : null}

        {integration?.readiness?.checks?.length ? (
          <ul className="mt-4 space-y-2">
            {integration.readiness.checks.map((c) => (
              <li key={c.key} className="flex items-center gap-2 text-sm">
                <span
                  className={`h-2 w-2 rounded-full ${
                    c.ok ? "bg-[var(--garage-success)]" : "bg-[var(--garage-red)]"
                  }`}
                  aria-hidden
                />
                <span className="text-[var(--garage-dim)]">{c.label}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="rounded-[var(--radius-xl)] border border-[var(--garage-line)] bg-[var(--garage-bg-1)] p-4">
        <h2 className="text-lg font-bold text-[var(--garage-fg)]">Kirim Pesan Uji</h2>
        <p className="mb-3 text-xs text-[var(--garage-mute)]">
          Kirim template ke nomor internal untuk verifikasi pengiriman.
        </p>
        <div className="flex flex-col gap-2">
          <input
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="Nomor tujuan (6281…)"
            className="w-full rounded-[var(--radius-sm)] border border-[var(--garage-line)] bg-[var(--garage-bg-0)] px-3 py-2 text-sm text-[var(--garage-fg)] outline-none focus-visible:border-[var(--garage-amber)]"
          />
          <input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Nama template (mis. hello_world)"
            className="w-full rounded-[var(--radius-sm)] border border-[var(--garage-line)] bg-[var(--garage-bg-0)] px-3 py-2 text-sm text-[var(--garage-fg)] outline-none focus-visible:border-[var(--garage-amber)]"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={sendTest}
              disabled={sendingTest}
              className="min-h-11 rounded-[var(--radius-sm)] bg-[var(--garage-bg-3)] px-4 py-2 text-sm font-semibold text-[var(--garage-fg)] transition-colors duration-200 hover:bg-[var(--garage-line-2)] disabled:opacity-60 cursor-pointer"
            >
              {sendingTest ? "Mengirim…" : "Kirim Uji"}
            </button>
          </div>
        </div>
        {sendResult ? (
          <p className="mt-3 text-sm text-[var(--garage-dim)]">{sendResult}</p>
        ) : null}
      </section>
    </div>
  );
}
