"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Loader2, Printer, Wifi } from "lucide-react";

import { WifiJoinQr } from "@/components/garage/wifi/wifi-join-qr";

type Usage = {
  enabled: boolean;
  configured: boolean;
  ssid: string;
  todayLogins: number;
  todayMembers?: number;
  todayGuests?: number;
  recent: Array<{ id: string; kind?: "member" | "guest"; name: string | null; phone: string | null; mac: string | null; createdAt: string }>;
  joinQr?: string;
  routerSync?: { lastSync: string | null; syncedToday: boolean; late: boolean };
};

// Pengaturan → Integrasi: status WiFi member + perintah RouterOS siap salin.
export function WifiSetupPanel() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://domain-garage";
  const host = useMemo(() => {
    try {
      return new URL(origin).hostname;
    } catch {
      return "domain-garage";
    }
  }, [origin]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/wifi/usage", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? "Status WiFi gagal dimuat.");
        setUsage(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Status WiFi gagal dimuat.");
      }
    })();
  }, []);

  const steps = [
    {
      id: "walled",
      label: "1. Izinkan domain Garage sebelum login (walled garden)",
      code: `/ip hotspot walled-garden add dst-host=${host} comment="Garage OS"\n/ip hotspot walled-garden add dst-host=*.${host} comment="Garage OS"`,
    },
    {
      id: "script",
      label: "2. Ambil password harian otomatis (ganti KEY dengan GARAGE_WIFI_ROUTER_KEY)",
      code: `/system script add name=garage-wifi-sync source="/tool fetch url=\\"${origin}/api/wifi/router-script?key=KEY\\" dst-path=garage-wifi.rsc; :delay 2s; /import file-name=garage-wifi.rsc"\n/system scheduler add name=garage-wifi-daily start-time=00:01:00 interval=1d on-event=garage-wifi-sync\n/system scheduler add name=garage-wifi-boot start-time=startup on-event=garage-wifi-sync\n/system script run garage-wifi-sync`,
    },
    {
      id: "login",
      label: "3. Ganti hotspot/login.html di router (Files → hotspot) dengan isi ini",
      code: `<html><head><meta http-equiv="refresh" content="0; url=${origin}/wifi?mac=$(mac)&ip=$(ip)&login=$(link-login-only)&dst=$(link-orig-esc)"></head><body>Membuka WiFi Garage…</body></html>`,
    },
  ];

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  }

  return (
    <section className="rounded-xl border border-[#34343c] bg-[#15151b] p-4" data-testid="wifi-setup-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wifi className="size-5 text-[#f5a742]" aria-hidden />
          <div>
            <h3 className="text-base font-bold text-white">WiFi Gratis Member (MikroTik)</h3>
            <p className="text-xs text-[#c4c4cc]">Pelanggan wajib daftar / login member sebelum internet terbuka.</p>
          </div>
        </div>
        {usage ? (
          <span
            className={`rounded border px-2 py-0.5 text-xs font-bold ${
              usage.enabled && usage.configured
                ? "border-[#22c55e]/45 bg-[#22c55e]/10 text-[#bbf7d0]"
                : "border-[#f5a742]/45 bg-[#f5a742]/10 text-[#ffd79a]"
            }`}
          >
            {!usage.configured ? "Server belum diset" : usage.enabled ? "Aktif" : "Nonaktif"}
          </span>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-sm text-[#ffb3b3]">{error}</p> : null}
      {!usage && !error ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-[#c4c4cc]">
          <Loader2 className="size-4 animate-spin" /> Memuat status…
        </p>
      ) : null}

      {usage ? (
        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1.4fr]">
          <div className="space-y-2">
            <div className="rounded-md border border-[#34343c] bg-[#1b1b22] px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#a9a9b3]">Login WiFi hari ini</p>
              <p className="font-mono text-2xl font-bold tabular-nums text-white">{usage.todayLogins}</p>
              <p className="text-xs text-[#c4c4cc]">
                Member {usage.todayMembers ?? usage.todayLogins} · Tamu (masuk cepat) {usage.todayGuests ?? 0}
              </p>
            </div>
            {!usage.configured ? (
              <p className="rounded-md border border-[#f5a742]/45 bg-[#f5a742]/10 px-3 py-2 text-xs leading-5 text-[#ffd79a]">
                Tambahkan <code>GARAGE_WIFI_SECRET</code> dan <code>GARAGE_WIFI_ROUTER_KEY</code> (min. 16 karakter acak) di{" "}
                <code>.env.production</code> server, lalu deploy ulang.
              </p>
            ) : null}
            {usage.routerSync ? (
              <div
                className={`rounded-md border px-3 py-2 text-xs leading-5 ${
                  usage.routerSync.syncedToday
                    ? "border-[#22c55e]/45 bg-[#22c55e]/10 text-[#bbf7d0]"
                    : usage.routerSync.late
                      ? "border-[#f5a742]/45 bg-[#f5a742]/10 text-[#ffd79a]"
                      : "border-[#34343c] bg-[#1b1b22] text-[#c4c4cc]"
                }`}
                data-testid="wifi-router-sync"
              >
                <p className="font-bold">
                  {usage.routerSync.syncedToday ? "Router sudah mengambil password hari ini" : "Router belum mengambil password hari ini"}
                </p>
                <p>
                  Terakhir diambil:{" "}
                  {usage.routerSync.lastSync
                    ? new Date(usage.routerSync.lastSync).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })
                    : "belum pernah"}
                  {usage.routerSync.late && !usage.routerSync.syncedToday ? " — cek koneksi router / langkah 2." : ""}
                </p>
              </div>
            ) : null}
            {usage.joinQr ? (
              <div className="flex items-center gap-3 rounded-md border border-[#34343c] bg-[#1b1b22] p-2">
                <WifiJoinQr payload={usage.joinQr} ssid={usage.ssid} size={112} />
                <div className="min-w-0 space-y-1 text-xs text-[#c4c4cc]">
                  <p className="font-bold text-white">QR sambung WiFi · {usage.ssid}</p>
                  <p>Scan → otomatis tersambung, lalu login Garage terbuka. QR tetap, password harian diganti router.</p>
                  <a className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[#34343c] px-2 font-semibold text-white hover:border-white" href="/order/qr-print">
                    <Printer className="size-3.5" aria-hidden /> Cetak di halaman QR Meja
                  </a>
                </div>
              </div>
            ) : null}
            <p className="text-xs text-[#a9a9b3]">Aktifkan & atur durasi di Pengaturan → WiFi Member.</p>
            <p className="text-xs leading-5 text-[#a9a9b3]">
              Keamanan: WiFi tamu wajib dipisah (SSID/VLAN sendiri) dari jaringan kasir, POS, dan printer.
            </p>
            <div className="max-h-56 overflow-y-auto rounded-md border border-[#34343c]">
              {usage.recent.length === 0 ? (
                <p className="px-3 py-3 text-sm text-[#a9a9b3]">Belum ada pemakaian.</p>
              ) : (
                <ul className="divide-y divide-[#2a2a32] text-sm">
                  {usage.recent.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="min-w-0 truncate text-white">
                        {row.name ?? (row.kind === "guest" ? "Tamu" : "Member")}
                        <span className="ml-1.5 text-xs text-[#a9a9b3]">
                          {row.kind === "guest" ? `Tamu${row.phone ? ` · ${row.phone}` : ""}` : "Member"}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-xs text-[#a9a9b3]">
                        {new Date(row.createdAt).toLocaleString("id-ID", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: "Asia/Jakarta",
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="space-y-2">
            {steps.map((step) => (
              <div key={step.id} className="rounded-md border border-[#34343c] bg-[#1b1b22] p-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-[#ffd79a]">{step.label}</p>
                  <button
                    type="button"
                    onClick={() => void copy(step.id, step.code)}
                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded border border-[#4a4a54] px-2 text-xs text-white"
                  >
                    {copied === step.id ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    {copied === step.id ? "Tersalin" : "Salin"}
                  </button>
                </div>
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-black/40 p-2 font-mono text-[11px] leading-4 text-[#e4e4e8]">
                  {step.code}
                </pre>
              </div>
            ))}
            <p className="text-xs text-[#a9a9b3]">Panduan lengkap: docs/WIFI-MIKROTIK.md</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
