"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Award,
  Bell,
  Bot,
  Building2,
  CheckCircle2,
  Clock,
  Cpu,
  ExternalLink,
  Gauge,
  KeyRound,
  Loader2,
  Megaphone,
  MessageCircle,
  Palette,
  Percent,
  Printer,
  Receipt,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Sliders,
  Smartphone,
  Sparkles,
  Users,
  Wallet,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useGarageTheme } from "@/components/garage/theme/garage-theme-provider";
import {
  SETTINGS_CATEGORIES,
  defaultSettingsMap,
  findField,
  type SettingField,
} from "@/lib/garage-settings-schema";
import { isThemePresetId } from "@/lib/garage-theme";

const ICON_MAP: Record<string, typeof Building2> = {
  Building2,
  Cpu,
  Receipt,
  Percent,
  Bell,
  ShieldCheck,
  Clock,
  Sparkles,
  Printer,
  Award,
  Wallet,
  Megaphone,
  Bot,
  MessageCircle,
  Palette,
};

type SettingValue = string | number | boolean;

type OutletOption = { id: string; code: string; name: string };

const ACCESS_LINKS: Array<{
  href: string;
  icon: typeof Users;
  title: string;
  desc: string;
}> = [
  { href: "/control/users", icon: Users, title: "Staff Management", desc: "Tambah, suspend, reset password" },
  { href: "/control/permissions", icon: KeyRound, title: "Role & Permission", desc: "Matrix role × capability" },
  { href: "/control/security", icon: ShieldCheck, title: "Security Center", desc: "Sesi aktif, audit, emergency" },
  { href: "/control/2fa", icon: Smartphone, title: "Two-Factor Auth", desc: "Setup TOTP akun" },
  { href: "/control/health", icon: Gauge, title: "System Health", desc: "DB, backup, checklist" },
];

export function SettingsManager({
  initialSettings,
  initialGlobalSettings,
  initialOverrideKeys,
  outlets,
  embedded = false,
}: {
  initialSettings: Record<string, SettingValue>;
  initialGlobalSettings: Record<string, SettingValue>;
  initialOverrideKeys: string[];
  outlets: OutletOption[];
  /**
   * Saat true: dirender di dalam shell lain (mis. modul Pengaturan OS).
   * Outer padding & mini-breadcrumb header di-skip karena parent yang handle.
   */
  embedded?: boolean;
}) {
  const { setPreset } = useGarageTheme();
  const [activeCategory, setActiveCategory] = useState<string>(
    SETTINGS_CATEGORIES[0].id,
  );
  const [activeOutletId, setActiveOutletId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, SettingValue>>(initialSettings);
  const [globalValues, setGlobalValues] =
    useState<Record<string, SettingValue>>(initialGlobalSettings);
  const [overrideKeys, setOverrideKeys] = useState<Set<string>>(
    new Set(initialOverrideKeys),
  );
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const category = useMemo(
    () => SETTINGS_CATEGORIES.find((cat) => cat.id === activeCategory),
    [activeCategory],
  );

  // Guard: peringatkan saat reload/tutup tab kalau masih ada perubahan unsaved.
  useEffect(() => {
    if (dirty.size === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty.size]);

  function updateField(key: string, value: SettingValue) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setDirty((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    setSuccess(null);
  }

  function resetField(key: string) {
    const field = findField(key);
    if (!field) return;
    updateField(key, field.defaultValue);
  }

  async function save() {
    if (!dirty.size) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    const updates: Record<string, SettingValue> = {};
    for (const key of dirty) updates[key] = values[key];

    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outletId: activeOutletId, updates }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error?.message ?? "Gagal menyimpan setting.");
        return;
      }
      const scopeLabel = activeOutletId
        ? `outlet ${outlets.find((o) => o.id === activeOutletId)?.code ?? ""}`
        : "global";
      setSuccess(`${json.data.saved} setting tersimpan ke ${scopeLabel}.`);
      const themePreset = updates.garageOsThemePreset;
      if (typeof themePreset === "string" && isThemePresetId(themePreset)) {
        setPreset(themePreset);
      }
      setDirty(new Set());
      // Re-fetch untuk update overrideKeys
      void reloadScope(activeOutletId);
    } catch {
      setError("Gagal terhubung ke server. Cek koneksi lalu coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  async function reloadScope(outletId: string | null) {
    const params = new URLSearchParams();
    if (outletId) params.set("outletId", outletId);
    try {
      const res = await fetch(`/api/admin/settings?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = await res.json();
      setValues(json.data.settings);
      setGlobalValues(json.data.globalSettings);
      setOverrideKeys(new Set(json.data.overrideKeys));
      setDirty(new Set());
    } catch {
      setError("Gagal memuat setting. Cek koneksi lalu coba lagi.");
    }
  }

  async function switchOutlet(outletId: string | null) {
    if (dirty.size > 0 && !confirm("Ada perubahan unsaved. Lanjut ganti outlet?")) {
      return;
    }
    setActiveOutletId(outletId);
    await reloadScope(outletId);
  }

  async function revertOverride(key: string) {
    if (!activeOutletId) return;
    if (!confirm(`Hapus override outlet untuk "${key}"? Akan kembali ke nilai global.`)) {
      return;
    }
    try {
      const res = await fetch("/api/admin/settings", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outletId: activeOutletId, keys: [key] }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json?.error?.message ?? "Gagal hapus override.");
        return;
      }
      await reloadScope(activeOutletId);
    } catch {
      setError("Gagal terhubung ke server. Cek koneksi lalu coba lagi.");
    }
  }

  function resetAll() {
    if (!confirm("Reset semua setting di kategori ini ke default?")) return;
    if (!category) return;
    const defaults = defaultSettingsMap();
    const next = { ...values };
    const newDirty = new Set(dirty);
    for (const field of category.fields) {
      next[field.key] = defaults[field.key];
      newDirty.add(field.key);
    }
    setValues(next);
    setDirty(newDirty);
  }

  const dirtyInCategory = useMemo(() => {
    if (!category) return 0;
    return category.fields.filter((field) => dirty.has(field.key)).length;
  }, [category, dirty]);

  const normalizedQuery = query.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!normalizedQuery) return [];
    return SETTINGS_CATEGORIES.flatMap((cat) =>
      cat.fields
        .filter(
          (f) =>
            f.label.toLowerCase().includes(normalizedQuery) ||
            f.key.toLowerCase().includes(normalizedQuery) ||
            (f.hint ?? "").toLowerCase().includes(normalizedQuery),
        )
        .map((f) => ({ field: f, categoryLabel: cat.label })),
    );
  }, [normalizedQuery]);

  function renderField(field: SettingField) {
    return (
      <FieldRow
        key={field.key}
        field={field}
        value={values[field.key] ?? field.defaultValue}
        globalValue={globalValues[field.key] ?? field.defaultValue}
        dirty={dirty.has(field.key)}
        scope={activeOutletId ? "outlet" : "global"}
        hasOutletOverride={overrideKeys.has(field.key)}
        onChange={(value) => updateField(field.key, value)}
        onReset={() => resetField(field.key)}
        onRevertOverride={
          activeOutletId ? () => revertOverride(field.key) : undefined
        }
      />
    );
  }

  return (
    <div className={embedded ? "" : "px-4 py-8 lg:px-10"}>
      <div className={embedded ? "flex flex-col gap-6" : "mx-auto flex max-w-[1500px] flex-col gap-6"}>
        <header className="flex flex-col gap-3 border-b border-[var(--border)] pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            {embedded ? null : (
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-[var(--primary)]">
                <Sliders className="h-3.5 w-3.5" />
                Garage Control · Pengaturan Sistem
              </div>
            )}
            <h1
              className={`font-semibold ${
                embedded ? "text-lg lg:text-xl" : "mt-2 text-3xl"
              }`}
            >
              {activeOutletId
                ? `Konfigurasi Outlet ${outlets.find((o) => o.id === activeOutletId)?.code ?? ""}`
                : "Konfigurasi Global"}
            </h1>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {SETTINGS_CATEGORIES.length} kategori · {Object.keys(values).length} setting key.
              {activeOutletId
                ? ` Outlet override muncul saat berbeda dari global (${overrideKeys.size} key di-override).`
                : " Perubahan langsung apply ke seluruh Garage OS."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Outlet picker */}
            <Select
              value={activeOutletId ?? "__global__"}
              onValueChange={(value) =>
                switchOutlet(value === "__global__" ? null : value)
              }
            >
              <SelectTrigger className="w-full border-[var(--border)] bg-[var(--background)] sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__global__">🌐 Global (semua outlet)</SelectItem>
                {outlets.map((outlet) => (
                  <SelectItem key={outlet.id} value={outlet.id}>
                    🏪 {outlet.code} · {outlet.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {dirty.size > 0 ? (
              <Badge className="border-amber-700 bg-amber-950/60 text-amber-300">
                {dirty.size} unsaved
              </Badge>
            ) : null}
            <Button
              onClick={save}
              disabled={!dirty.size || saving}
              className="flex-1 bg-[var(--primary)] text-white hover:opacity-90 sm:flex-none"
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Simpan {dirty.size > 0 ? `(${dirty.size})` : ""}
            </Button>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          {/* Mobile / tablet: dropdown kategori + akses cepat collapsible */}
          <div className="flex flex-col gap-3 lg:hidden">
            <Select value={activeCategory} onValueChange={setActiveCategory}>
              <SelectTrigger className="border-[var(--border)] bg-[var(--card)]">
                <SelectValue placeholder="Pilih kategori konfigurasi" />
              </SelectTrigger>
              <SelectContent>
                {SETTINGS_CATEGORIES.map((cat) => {
                  const dirtyCount = cat.fields.filter((f) => dirty.has(f.key)).length;
                  return (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.label}
                      {dirtyCount > 0 ? ` · ${dirtyCount} unsaved` : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <details className="rounded-md border border-[var(--border)] bg-[var(--card)]">
              <summary className="cursor-pointer select-none px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
                User &amp; Access
              </summary>
              <div className="grid grid-cols-2 gap-1 p-2 pt-0">
                {ACCESS_LINKS.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="flex items-center gap-2 rounded-md border border-[var(--border)] px-2 py-2 text-[var(--foreground)] transition hover:bg-[var(--secondary)]"
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate text-xs font-medium">{link.title}</span>
                    </Link>
                  );
                })}
              </div>
            </details>
          </div>

          {/* Desktop: sidebar nav */}
          <Card className="hidden self-start border-[var(--border)] bg-[var(--card)] lg:block">
            <CardContent className="p-2">
              {/* User & Access quick links — modul terpisah tapi konseptual masih bagian "pengaturan" */}
              <div className="mb-2">
                <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
                  User &amp; Access
                </div>
                {ACCESS_LINKS.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="group flex items-center gap-3 rounded-md px-3 py-2 text-[var(--foreground)] transition hover:bg-[var(--secondary)]"
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{link.title}</div>
                        <div className="text-[10px] truncate text-[var(--muted-foreground)]">
                          {link.desc}
                        </div>
                      </div>
                      <ExternalLink className="h-3 w-3 opacity-0 transition group-hover:opacity-60" />
                    </Link>
                  );
                })}
              </div>

              <div className="my-2 border-t border-[var(--border)]" />

              <div className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
                Konfigurasi Sistem
              </div>
              <nav className="flex flex-col gap-0.5">
                {SETTINGS_CATEGORIES.map((cat) => {
                  const Icon = ICON_MAP[cat.icon] ?? Sliders;
                  const isActive = cat.id === activeCategory;
                  const dirtyCount = cat.fields.filter((f) => dirty.has(f.key)).length;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setActiveCategory(cat.id)}
                      className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-left transition ${
                        isActive
                          ? "bg-[var(--primary)] text-white"
                          : "hover:bg-[var(--secondary)] text-[var(--foreground)]"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{cat.label}</div>
                        <div
                          className={`text-[10px] truncate ${
                            isActive ? "opacity-80" : "text-[var(--muted-foreground)]"
                          }`}
                        >
                          {cat.fields.length} setting
                        </div>
                      </div>
                      {dirtyCount > 0 ? (
                        <span
                          className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                            isActive
                              ? "bg-white text-[var(--primary)]"
                              : "bg-amber-500 text-white"
                          }`}
                        >
                          {dirtyCount}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </nav>
            </CardContent>
          </Card>

          {/* Form panel */}
          <div className="flex flex-col gap-4">
            {error ? (
              <div className="rounded-md border border-rose-800 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
                {error}
              </div>
            ) : null}
            {success ? (
              <div className="flex items-center gap-2 rounded-md border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
                <CheckCircle2 className="h-4 w-4" />
                {success}
              </div>
            ) : null}

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari setting di semua kategori… (pajak, struk, shift, theme)"
                className="border-[var(--border)] bg-[var(--background)] pl-9 pr-9"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Bersihkan pencarian"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            {normalizedQuery ? (
              <Card className="border-[var(--border)] bg-[var(--card)]">
                <CardHeader>
                  <h2 className="text-xl font-semibold">Hasil pencarian</h2>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    {searchResults.length} setting cocok dengan “{query.trim()}”.
                  </p>
                </CardHeader>
                <CardContent>
                  {searchResults.length === 0 ? (
                    <p className="text-sm text-[var(--muted-foreground)]">
                      Tidak ada setting yang cocok. Coba kata kunci lain.
                    </p>
                  ) : (
                    <div className="grid gap-4">
                      {searchResults.map(({ field, categoryLabel }) => (
                        <div key={field.key}>
                          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
                            {categoryLabel}
                          </div>
                          {renderField(field)}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : category ? (
              <Card className="border-[var(--border)] bg-[var(--card)]">
                <CardHeader className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">{category.label}</h2>
                    <p className="text-sm text-[var(--muted-foreground)]">
                      {category.description}
                    </p>
                  </div>
                  {dirtyInCategory > 0 ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={resetAll}
                      className="border-[var(--border)]"
                    >
                      <RotateCcw className="mr-2 h-3.5 w-3.5" /> Reset kategori ke default
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4">
                    {category.fields.map((field) => renderField(field))}
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>

        {dirty.size > 0 ? (
          <div className="sticky bottom-3 z-20">
            <div className="flex flex-col gap-3 rounded-lg border border-[var(--primary)]/50 bg-[var(--card)]/95 px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.55)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm">
                <span className="size-2 shrink-0 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(245,167,66,0.7)]" />
                <span className="font-semibold text-[var(--foreground)]">
                  {dirty.size} perubahan belum disimpan
                  {activeOutletId
                    ? ` · outlet ${outlets.find((o) => o.id === activeOutletId)?.code ?? ""}`
                    : " · global"}
                </span>
              </div>
              <Button
                onClick={save}
                disabled={!dirty.size || saving}
                className="w-full bg-[var(--primary)] text-white hover:opacity-90 sm:w-auto"
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Simpan {dirty.size} perubahan
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FieldRow({
  field,
  value,
  globalValue,
  dirty,
  scope,
  hasOutletOverride,
  onChange,
  onReset,
  onRevertOverride,
}: {
  field: SettingField;
  value: SettingValue;
  globalValue: SettingValue;
  dirty: boolean;
  scope: "global" | "outlet";
  hasOutletOverride: boolean;
  onChange: (value: SettingValue) => void;
  onReset: () => void;
  onRevertOverride?: () => void;
}) {
  const showInheritedHint = scope === "outlet" && !hasOutletOverride && !dirty;
  const showOverrideBadge = scope === "outlet" && hasOutletOverride;
  return (
    <div
      className={`rounded-md border p-4 transition ${
        dirty
          ? "border-amber-700/60 bg-amber-950/10"
          : showOverrideBadge
            ? "border-purple-700/60 bg-purple-950/10"
            : "border-[var(--border)] bg-[var(--popover)]"
      }`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="lg:max-w-md">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm font-semibold">{field.label}</label>
            {dirty ? (
              <Badge className="border-amber-700 bg-amber-950/60 text-[10px] text-amber-300">
                modified
              </Badge>
            ) : null}
            {showOverrideBadge ? (
              <Badge className="border-purple-700 bg-purple-950/60 text-[10px] text-purple-300">
                outlet override
              </Badge>
            ) : null}
            {showInheritedHint ? (
              <Badge
                variant="outline"
                className="border-zinc-700 bg-zinc-950 text-[10px] text-zinc-400"
              >
                inherited from global
              </Badge>
            ) : null}
          </div>
          {field.hint ? (
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">{field.hint}</p>
          ) : null}
          {showOverrideBadge && globalValue !== value ? (
            <p className="mt-1 text-[11px] text-purple-300/80">
              Global value:{" "}
              <code className="rounded bg-[var(--card)] px-1">{String(globalValue)}</code>
            </p>
          ) : null}
          <code className="mt-1 inline-block text-[10px] text-[var(--muted-foreground)] opacity-60">
            {field.key}
          </code>
        </div>
        <div className="flex items-center gap-2 lg:w-72 lg:shrink-0">
          <FieldInput field={field} value={value} onChange={onChange} />
          {dirty ? (
            <Button
              size="icon"
              variant="ghost"
              onClick={onReset}
              title="Reset ke default"
              className="h-8 w-8"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          {showOverrideBadge && onRevertOverride ? (
            <Button
              size="icon"
              variant="ghost"
              onClick={onRevertOverride}
              title="Hapus override outlet, kembali ke global"
              className="h-8 w-8 text-purple-400 hover:bg-purple-950/40"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: SettingField;
  value: SettingValue;
  onChange: (value: SettingValue) => void;
}) {
  if (field.type === "boolean") {
    return (
      <label className="flex w-full cursor-pointer items-center justify-between rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2">
        <span className="text-xs text-[var(--muted-foreground)]">
          {value ? "Aktif" : "Nonaktif"}
        </span>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 accent-[var(--primary)]"
        />
      </label>
    );
  }

  if (field.type === "number") {
    return (
      <div className="relative w-full">
        <Input
          type="number"
          value={Number(value)}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(event) => onChange(Number(event.target.value))}
          className="border-[var(--border)] bg-[var(--background)] pr-12"
        />
        {field.unit ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)]">
            {field.unit}
          </span>
        ) : null}
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <Select value={String(value)} onValueChange={(v) => onChange(v)}>
        <SelectTrigger className="w-full border-[var(--border)] bg-[var(--background)]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(field.options ?? []).map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (field.type === "textarea") {
    return (
      <Textarea
        value={String(value)}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="w-full border-[var(--border)] bg-[var(--background)]"
      />
    );
  }

  return (
    <Input
      value={String(value)}
      onChange={(event) => onChange(event.target.value)}
      className="w-full border-[var(--border)] bg-[var(--background)]"
    />
  );
}
