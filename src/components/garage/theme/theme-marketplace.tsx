"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Check,
  Download,
  Monitor,
  Palette,
  RotateCcw,
  Smartphone,
  Sparkles,
  Tablet,
  Upload,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useGarageTheme } from "@/components/garage/theme/garage-theme-provider";
import {
  GARAGE_OS_THEME_MVP_SAVE_MESSAGE,
  GARAGE_MVP_OS_PRESET_IDS,
  GARAGE_OS_THEME_PRESET_OPTIONS,
  THEME_PRESETS,
  getArchiveGarageOsThemePresets,
  getPreset,
  isMvpGarageOsPreset,
  themeFromPreset,
  themeToCssVars,
  type GarageTheme,
  type ThemeColorTokens,
  type ThemePreset,
  type ThemeUITokens,
} from "@/lib/garage-theme";

const COLOR_FIELDS: Array<{
  key: keyof ThemeColorTokens;
  label: string;
  hint: string;
}> = [
  { key: "primary", label: "Primary", hint: "Tombol utama, ring, link aktif" },
  { key: "primaryBright", label: "Primary Bright", hint: "Hover state, destructive" },
  { key: "primaryDeep", label: "Primary Deep", hint: "Shadow / depth variant" },
  { key: "accent", label: "Accent", hint: "Highlight operasional (amber)" },
  { key: "bg0", label: "Background", hint: "Surface paling gelap / page bg" },
  { key: "bg1", label: "Sidebar / Popover", hint: "Surface elevasi 1" },
  { key: "bg2", label: "Card", hint: "Surface elevasi 2" },
  { key: "bg3", label: "Secondary / Muted", hint: "Hover, secondary button" },
  { key: "line", label: "Border", hint: "Garis pemisah, input border" },
  { key: "fg", label: "Foreground", hint: "Body text utama" },
  { key: "dim", label: "Dim", hint: "Muted text readable" },
  { key: "mute", label: "Mute", hint: "Hint, placeholder" },
  { key: "silver", label: "Silver", hint: "Chrome highlight" },
];

const UI_SLIDERS: Array<{
  key: keyof ThemeUITokens;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  hint: string;
}> = [
  { key: "radius", label: "Sudut", min: 0.1, max: 1.5, step: 0.05, unit: "rem", hint: "Border-radius global" },
  { key: "fontScale", label: "Skala Font", min: 0.85, max: 1.25, step: 0.05, unit: "×", hint: "Multiplier ukuran text" },
  { key: "sidebarWidth", label: "Sidebar", min: 200, max: 340, step: 4, unit: "px", hint: "Lebar sidebar default" },
  { key: "animationSpeed", label: "Animasi", min: 0, max: 1, step: 0.05, unit: "", hint: "0 = no motion, 1 = full" },
  { key: "glassBlur", label: "Glass Blur", min: 0, max: 1, step: 0.05, unit: "", hint: "Backdrop blur effect" },
];

type Device = "desktop" | "tablet" | "mobile" | "pos";

function ThemePresetCard({
  preset,
  isActive,
  savingPreset,
  hint,
  onApply,
}: {
  preset: ThemePreset;
  isActive: boolean;
  savingPreset: string | null;
  hint?: string;
  onApply: (presetId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onApply(preset.id)}
      className={`group relative overflow-hidden rounded-lg border p-4 text-left transition ${
        isActive
          ? "border-[var(--primary)] ring-2 ring-[var(--primary)]/40"
          : "border-[var(--border)] hover:border-[var(--primary)]/60"
      }`}
      style={{
        background: `linear-gradient(135deg, ${preset.colors.bg1}, ${preset.colors.bg0})`,
        color: preset.colors.fg,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">{preset.label}</div>
          {hint ? (
            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--primary)]">
              {hint}
            </div>
          ) : (
            <div
              className="mt-0.5 text-[10px] uppercase tracking-wider"
              style={{ color: preset.colors.mute }}
            >
              {preset.vibe}
            </div>
          )}
        </div>
        {isActive ? (
          <Badge
            className="border-0 text-[10px]"
            style={{
              background: preset.colors.primary,
              color: "#fff",
            }}
          >
            <Check className="mr-0.5 h-3 w-3" />
            {savingPreset === preset.id ? "Saving" : "Active"}
          </Badge>
        ) : null}
      </div>
      <p className="mt-2 text-xs leading-relaxed" style={{ color: preset.colors.dim }}>
        {preset.description}
      </p>
      <div className="mt-3 flex gap-1.5">
        {[
          preset.colors.primary,
          preset.colors.accent,
          preset.colors.silver,
          preset.colors.bg2,
          preset.colors.line,
        ].map((color, index) => (
          <span
            key={`${preset.id}-c${index}`}
            className="h-5 w-5 rounded-full border"
            style={{
              background: color,
              borderColor: preset.colors.line,
            }}
          />
        ))}
      </div>
    </button>
  );
}

export function ThemeMarketplace() {
  const { theme, setPreset, setColor, setUI, setTheme, resetTheme } = useGarageTheme();
  const [activeDevice, setActiveDevice] = useState<Device>("desktop");
  const [importError, setImportError] = useState<string | null>(null);
  const [savingPreset, setSavingPreset] = useState<string | null>(null);
  const [showArchivePresets, setShowArchivePresets] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mvpPresets = useMemo(
    () => GARAGE_MVP_OS_PRESET_IDS.map((presetId) => getPreset(presetId)),
    [],
  );
  const archivePresets = useMemo(() => getArchiveGarageOsThemePresets(), []);
  const mvpHints = useMemo(
    () => new Map(GARAGE_OS_THEME_PRESET_OPTIONS.map((option) => [option.value, option.hint])),
    [],
  );

  const activePreset = useMemo(
    () => THEME_PRESETS.find((preset) => preset.id === theme.presetId),
    [theme.presetId],
  );

  function exportTheme() {
    const blob = new Blob([JSON.stringify(theme, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `garage-theme-${theme.presetId}-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  async function importTheme(file: File) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<GarageTheme>;
      if (!parsed.presetId || !parsed.colors || !parsed.ui) {
        throw new Error("File theme tidak valid.");
      }
      const baseTheme = themeFromPreset(parsed.presetId);
      setTheme({
        presetId: parsed.presetId,
        colors: { ...theme.colors, ...parsed.colors },
        ui: { ...theme.ui, ...parsed.ui },
        semantic: baseTheme.semantic,
        typography: baseTheme.typography,
        effects: baseTheme.effects,
        components: baseTheme.components,
      });
      setImportError(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Gagal import file.");
    }
  }

  const applyPreset = useCallback(
    async (presetId: string) => {
      setPreset(presetId);
      setImportError(null);
      if (!isMvpGarageOsPreset(presetId)) {
        setImportError(
          `Preview arsip saja — tidak disimpan ke outlet. ${GARAGE_OS_THEME_MVP_SAVE_MESSAGE}`,
        );
        return;
      }
      setSavingPreset(presetId);
      try {
        const res = await fetch("/api/admin/settings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            outletId: null,
            updates: { garageOsThemePreset: presetId },
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(json?.error?.message ?? "Gagal menyimpan tema.");
        }
      } catch (error) {
        setImportError(
          error instanceof Error ? error.message : "Gagal menyimpan tema.",
        );
      } finally {
        setSavingPreset(null);
      }
    },
    [setPreset],
  );

  return (
    <div className="px-4 py-8 lg:px-10">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6">
        <header className="flex flex-col gap-3 border-b border-[var(--border)] pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-[var(--primary)]">
              <Palette className="h-3.5 w-3.5" />
              Garage Control · Theme Marketplace
            </div>
            <h1 className="mt-2 text-3xl font-semibold">Theme Engine</h1>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Pilih preset, customize warna & layout, preview multi-device. Perubahan
              langsung apply ke seluruh app — tanpa reload.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Import
            </Button>
            <Button variant="outline" onClick={exportTheme}>
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
            <Button variant="outline" onClick={resetTheme}>
              <RotateCcw className="mr-2 h-4 w-4" /> Reset Default
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) importTheme(file);
                event.target.value = "";
              }}
            />
          </div>
        </header>

        {importError ? (
          <div className="rounded-md border border-rose-800 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
            {importError}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
          <div className="flex flex-col gap-6">
            {/* Preset cards */}
            <Card className="border-[var(--border)] bg-[var(--card)]">
              <CardHeader>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Sparkles className="h-4 w-4 text-[var(--primary)]" />
                  Tema Operasional MVP
                </h2>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {mvpPresets.length} tema kurasi untuk outlet — konsisten, profesional, siap operasional.
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
                  {mvpPresets.map((preset) => (
                    <ThemePresetCard
                      key={preset.id}
                      preset={preset}
                      isActive={preset.id === theme.presetId}
                      savingPreset={savingPreset}
                      hint={mvpHints.get(preset.id)}
                      onApply={(presetId) => void applyPreset(presetId)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-[var(--border)] bg-[var(--card)]">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold">Preset arsip & eksperimental</h2>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {archivePresets.length} tema tambahan untuk eksplorasi desain — tidak direkomendasikan untuk produksi.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowArchivePresets((current) => !current)}
                  >
                    <ChevronDown
                      className={`mr-2 size-4 transition ${showArchivePresets ? "rotate-180" : ""}`}
                    />
                    {showArchivePresets ? "Sembunyikan" : "Tampilkan arsip"}
                  </Button>
                </div>
              </CardHeader>
              {showArchivePresets ? (
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {archivePresets.map((preset) => (
                      <ThemePresetCard
                        key={preset.id}
                        preset={preset}
                        isActive={preset.id === theme.presetId}
                        savingPreset={savingPreset}
                        onApply={(presetId) => void applyPreset(presetId)}
                      />
                    ))}
                  </div>
                </CardContent>
              ) : null}
            </Card>

            {/* Customization */}
            <Card className="border-[var(--border)] bg-[var(--card)]">
              <CardHeader>
                <Tabs defaultValue="colors">
                  <TabsList className="bg-[var(--secondary)]">
                    <TabsTrigger value="colors">Warna</TabsTrigger>
                    <TabsTrigger value="ui">UI Tweaks</TabsTrigger>
                  </TabsList>
                  <TabsContent value="colors" className="mt-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {COLOR_FIELDS.map((field) => (
                        <label
                          key={field.key}
                          className="flex items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--popover)] p-2.5"
                        >
                          <input
                            type="color"
                            value={theme.colors[field.key]}
                            onChange={(event) => setColor(field.key, event.target.value)}
                            className="h-10 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold uppercase tracking-wider">
                              {field.label}
                            </div>
                            <div className="truncate text-[10px] text-[var(--muted-foreground)]">
                              {field.hint}
                            </div>
                          </div>
                          <Input
                            value={theme.colors[field.key]}
                            onChange={(event) => setColor(field.key, event.target.value)}
                            className="w-24 border-[var(--border)] bg-[var(--background)] text-xs font-mono"
                          />
                        </label>
                      ))}
                    </div>
                  </TabsContent>
                  <TabsContent value="ui" className="mt-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      {UI_SLIDERS.map((field) => {
                        const value = theme.ui[field.key];
                        if (typeof value !== "number") return null;
                        return (
                          <div
                            key={field.key}
                            className="rounded-md border border-[var(--border)] bg-[var(--popover)] p-3"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold uppercase tracking-wider">
                                {field.label}
                              </span>
                              <span className="text-xs font-mono text-[var(--primary)]">
                                {value}
                                {field.unit}
                              </span>
                            </div>
                            <input
                              type="range"
                              min={field.min}
                              max={field.max}
                              step={field.step}
                              value={value}
                              onChange={(event) =>
                                setUI(
                                  field.key,
                                  Number(event.target.value) as never,
                                )
                              }
                              className="mt-2 w-full accent-[var(--primary)]"
                            />
                            <div className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                              {field.hint}
                            </div>
                          </div>
                        );
                      })}
                      <label className="flex cursor-pointer items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--popover)] p-3">
                        <input
                          type="checkbox"
                          checked={theme.ui.compactMode}
                          onChange={(event) =>
                            setUI("compactMode", event.target.checked)
                          }
                          className="h-4 w-4 accent-[var(--primary)]"
                        />
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wider">
                            Compact Mode
                          </div>
                          <div className="text-[10px] text-[var(--muted-foreground)]">
                            Padding & spacing lebih rapat untuk POS tablet.
                          </div>
                        </div>
                      </label>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardHeader>
            </Card>
          </div>

          {/* Live preview */}
          <Card className="sticky top-6 self-start border-[var(--border)] bg-[var(--card)]">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Live Preview</h2>
                <div className="flex gap-1 rounded-md border border-[var(--border)] bg-[var(--popover)] p-1">
                  {(
                    [
                      { id: "desktop", icon: Monitor, label: "Desktop" },
                      { id: "tablet", icon: Tablet, label: "Tablet" },
                      { id: "mobile", icon: Smartphone, label: "Mobile" },
                      { id: "pos", icon: Monitor, label: "POS" },
                    ] as Array<{
                      id: Device;
                      icon: typeof Monitor;
                      label: string;
                    }>
                  ).map((device) => {
                    const Icon = device.icon;
                    const isActive = activeDevice === device.id;
                    return (
                      <button
                        key={device.id}
                        type="button"
                        onClick={() => setActiveDevice(device.id)}
                        title={device.label}
                        className={`flex h-7 w-9 items-center justify-center rounded transition ${
                          isActive
                            ? "bg-[var(--primary)] text-white"
                            : "text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">
                Mock UI mirror tampilan dashboard + POS dengan tema aktif.
              </p>
            </CardHeader>
            <CardContent>
              <DevicePreview device={activeDevice} theme={theme} />
              {activePreset ? (
                <div className="mt-3 rounded-md border border-[var(--border)] bg-[var(--popover)] p-3 text-xs">
                  <div className="font-semibold">{activePreset.label}</div>
                  <div className="text-[var(--muted-foreground)]">
                    {activePreset.description}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DevicePreview({ device, theme }: { device: Device; theme: GarageTheme }) {
  const dims =
    device === "mobile"
      ? { width: 320, height: 540 }
      : device === "tablet"
        ? { width: 480, height: 600 }
        : device === "pos"
          ? { width: 520, height: 620 }
          : { width: 560, height: 600 };

  // Scope theme vars cuma ke div ini biar preview independen — sebenarnya
  // theme aktif juga udah inject ke <html>, jadi ini cuma reinforce.
  const vars = themeToCssVars(theme) as React.CSSProperties;

  return (
    <div className="overflow-auto rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
      <div
        style={{
          ...vars,
          width: dims.width,
          minHeight: dims.height,
          background: "var(--background)",
          color: "var(--foreground)",
          fontSize: `${theme.ui.fontScale}rem`,
        }}
        className="relative mx-auto overflow-hidden rounded-lg border"
      >
        {device === "pos" ? <PosMockup /> : <DashboardMockup />}
      </div>
    </div>
  );
}

function DashboardMockup() {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ background: "var(--sidebar)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="h-7 w-7 rounded-md"
            style={{
              background:
                "linear-gradient(135deg, var(--primary), var(--accent))",
            }}
          />
          <div>
            <div className="text-xs font-semibold">GARAGE OS</div>
            <div className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
              Owner Dashboard
            </div>
          </div>
        </div>
        <div
          className="h-7 w-7 rounded-full"
          style={{ background: "var(--secondary)" }}
        />
      </div>

      <div className="flex flex-1">
        {/* Sidebar */}
        <div
          className="flex w-32 flex-col gap-1 border-r p-2 text-[10px]"
          style={{ background: "var(--sidebar)", borderColor: "var(--border)" }}
        >
          {["Dashboard", "POS", "Kitchen", "Inventory", "Finance"].map((item, i) => (
            <div
              key={item}
              className="rounded-md px-2 py-1.5"
              style={{
                background: i === 0 ? "var(--primary)" : "transparent",
                color: i === 0 ? "#fff" : "var(--foreground)",
                opacity: i === 0 ? 1 : 0.8,
              }}
            >
              {item}
            </div>
          ))}
        </div>

        {/* Main */}
        <div className="flex-1 p-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Revenue", value: "Rp 42.8M", trend: "+12%" },
              { label: "Orders", value: "1,284", trend: "+5%" },
              { label: "Low Stock", value: "7 SKU", trend: "watch" },
              { label: "Pending Approval", value: "3", trend: "now" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-md border p-2"
                style={{
                  background: "var(--card)",
                  borderColor: "var(--border)",
                }}
              >
                <div
                  className="text-[9px] uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {stat.label}
                </div>
                <div className="mt-0.5 text-sm font-bold">{stat.value}</div>
                <div
                  className="mt-0.5 text-[9px]"
                  style={{ color: "var(--primary)" }}
                >
                  {stat.trend}
                </div>
              </div>
            ))}
          </div>

          <div
            className="mt-2 rounded-md border p-3"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider">
              Aktivitas Terbaru
            </div>
            {["Order #1284 dibayar", "Kitchen siap T-12", "Approval void diterima"].map(
              (item, i) => (
                <div
                  key={item}
                  className="flex items-center justify-between border-t py-1.5 text-[10px] first:border-t-0"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span>{item}</span>
                  <span style={{ color: "var(--muted-foreground)" }}>{i + 1}m</span>
                </div>
              ),
            )}
          </div>

          <button
            type="button"
            className="mt-2 w-full rounded-md py-1.5 text-[10px] font-semibold"
            style={{
              background: "var(--primary)",
              color: "#fff",
            }}
          >
            Buka Module
          </button>
        </div>
      </div>
    </div>
  );
}

function PosMockup() {
  return (
    <div className="flex h-full flex-col">
      <div
        className="flex items-center justify-between border-b px-3 py-2"
        style={{ background: "var(--sidebar)", borderColor: "var(--border)" }}
      >
        <div className="text-xs font-bold">POS · T-12</div>
        <div className="text-[10px]" style={{ color: "var(--accent)" }}>
          Kasir aktif
        </div>
      </div>
      <div className="flex flex-1">
        <div className="flex-1 grid grid-cols-2 gap-1.5 p-2">
          {[
            "Es Kopi Susu",
            "Nasi Goreng",
            "Ayam Richeese",
            "Croffle",
            "Matcha Latte",
            "Mie Goreng",
          ].map((item, i) => (
            <button
              key={item}
              type="button"
              className="rounded-md border p-2 text-left"
              style={{
                background: "var(--card)",
                borderColor: "var(--border)",
              }}
            >
              <div
                className="mb-1 h-10 rounded"
                style={{
                  background:
                    i % 2 === 0
                      ? "linear-gradient(135deg, var(--primary), var(--accent))"
                      : "var(--secondary)",
                }}
              />
              <div className="text-[10px] font-semibold">{item}</div>
              <div
                className="text-[9px]"
                style={{ color: "var(--muted-foreground)" }}
              >
                Rp 22.000
              </div>
            </button>
          ))}
        </div>
        <div
          className="w-40 border-l p-2"
          style={{ background: "var(--popover)", borderColor: "var(--border)" }}
        >
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider">
            Cart
          </div>
          {[
            { name: "Es Kopi Susu (Cold)", qty: 2, total: "Rp 44.000" },
            { name: "Nasi Goreng (Pedas)", qty: 1, total: "Rp 32.000" },
          ].map((line) => (
            <div
              key={line.name}
              className="border-b py-1 text-[9px]"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="font-semibold">{line.name}</div>
              <div
                className="flex justify-between"
                style={{ color: "var(--muted-foreground)" }}
              >
                <span>× {line.qty}</span>
                <span>{line.total}</span>
              </div>
            </div>
          ))}
          <div className="mt-2 flex justify-between text-[10px] font-bold">
            <span>Total</span>
            <span style={{ color: "var(--primary)" }}>Rp 76.000</span>
          </div>
          <button
            type="button"
            className="mt-2 w-full rounded-md py-1.5 text-[10px] font-bold"
            style={{ background: "var(--primary)", color: "#fff" }}
          >
            Bayar
          </button>
        </div>
      </div>
    </div>
  );
}
