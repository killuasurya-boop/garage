"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";

import { SettingsManager } from "@/components/garage/admin/settings-manager";

type SettingValue = string | number | boolean;
type OutletOption = { id: string; code: string; name: string };

type ScopeData = {
  settings: Record<string, SettingValue>;
  globalSettings: Record<string, SettingValue>;
  overrideKeys: string[];
};

/**
 * Wrapper untuk mengambil global system settings + daftar outlet via API,
 * lalu render <SettingsManager embedded /> di dalam shell parent (mis. modul
 * Pengaturan OS). Dipakai untuk konsolidasi /control/settings ke /os.
 *
 * Login/auth tidak diubah — API yang dipanggil tetap pakai requirePermission
 * di server. Kalau user nggak punya akses, panel ini akan menampilkan pesan
 * error yang sesuai.
 */
export function GlobalSettingsPanel() {
  const [scope, setScope] = useState<ScopeData | null>(null);
  const [outlets, setOutlets] = useState<OutletOption[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [scopeRes, outletsRes] = await Promise.all([
          fetch("/api/admin/settings", { cache: "no-store", credentials: "same-origin" }),
          fetch("/api/outlets/list", { cache: "no-store", credentials: "same-origin" }),
        ]);
        if (!scopeRes.ok) {
          const body = await scopeRes.json().catch(() => null);
          throw new Error(
            body?.error?.message ??
              `Gagal memuat global settings (${scopeRes.status}).`,
          );
        }
        if (!outletsRes.ok) {
          const body = await outletsRes.json().catch(() => null);
          throw new Error(
            body?.error?.message ??
              `Gagal memuat daftar outlet (${outletsRes.status}).`,
          );
        }
        const scopeJson = await scopeRes.json();
        const outletsJson = await outletsRes.json();
        if (cancelled) return;
        setScope({
          settings: scopeJson.data.settings,
          globalSettings: scopeJson.data.globalSettings,
          overrideKeys: scopeJson.data.overrideKeys ?? [],
        });
        setOutlets(outletsJson.data.outlets ?? []);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Gagal memuat data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-[#b8b8bf]">
          <Loader2 className="size-5 animate-spin text-[#f5a742]" />
          <p className="text-sm">Memuat pengaturan sistem global…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 p-4 text-[#f4f4f5]">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#ff6b75]" />
        <div>
          <p className="text-sm font-semibold">Tidak bisa memuat pengaturan sistem</p>
          <p className="mt-1 text-xs text-[#d0d0d6]">{error}</p>
          <p className="mt-2 text-[11px] text-[#8f8f99]">
            Cek role akun kamu — Pengaturan Sistem hanya untuk Owner / Admin.
          </p>
        </div>
      </div>
    );
  }

  if (!scope || !outlets) return null;

  return (
    <SettingsManager
      embedded
      initialSettings={scope.settings}
      initialGlobalSettings={scope.globalSettings}
      initialOverrideKeys={scope.overrideKeys}
      outlets={outlets}
    />
  );
}
