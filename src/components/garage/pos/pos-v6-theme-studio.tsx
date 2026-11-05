"use client";

// Garage POS Theme Studio (POS V6, papan 08). Preferensi TAMPILAN per perangkat:
// tema, ukuran teks, tampilan katalog, foto produk, posisi keranjang, sidebar, kurangi gerakan,
// layar penuh. Semua perubahan langsung terlihat (live preview) dan tersimpan otomatis.
// Tidak menyentuh keranjang, harga, transaksi, atau data apa pun di server.
import { useEffect, useState, useSyncExternalStore } from "react";
import { AlertTriangle, Maximize, Minimize, RotateCcw } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { CashierThemePresetGrid, DEFAULT_CASHIER_THEME, type CashierThemeMode } from "../garage-app-pickers";
import { defaultCashierPosSettings, type CashierPosSettings } from "../garage-app-helpers";
import { enterFullscreen, exitFullscreen, fullscreenSupported, isFullscreen, onFullscreenChange } from "../order/v5/fullscreen";
import {
  customThemeIssues,
  readThemeCustom,
  readThemeCustomServer,
  sanitizeThemeCustom,
  subscribeThemeCustom,
  themeCustomCss,
  writeThemeCustom,
  type PosThemeCustom,
} from "./pos-v6-theme-custom";

/** <style> global berisi override warna lanjutan (berlaku juga di dialog/lembar yang di-portal). */
export function PosV6ThemeCustomStyle() {
  const custom = useSyncExternalStore(subscribeThemeCustom, readThemeCustom, readThemeCustomServer);
  const css = themeCustomCss(custom);
  return css ? <style data-pos-theme-custom>{css}</style> : null;
}

const COLOR_FIELDS: Array<{ key: "primary" | "background" | "surface" | "border"; label: string; fallback: string }> = [
  { key: "primary", label: "Warna utama", fallback: "#b5121b" },
  { key: "background", label: "Latar", fallback: "#f8f6f4" },
  { key: "surface", label: "Permukaan kartu", fallback: "#ffffff" },
  { key: "border", label: "Garis", fallback: "#e4dddb" },
];

/** Owner/Manajer: warna & radius kustom dengan pratinjau dan cek kontras (tema terang saja). */
function AdvancedThemeEditor({ theme }: { theme: CashierThemeMode }) {
  const saved = useSyncExternalStore(subscribeThemeCustom, readThemeCustom, readThemeCustomServer);
  const [draft, setDraft] = useState<PosThemeCustom>(saved);
  const issues = customThemeIssues(draft);
  const dirty = JSON.stringify(sanitizeThemeCustom(draft)) !== JSON.stringify(saved);
  if (theme === "garage-default") {
    return <p className="text-sm opacity-80">Pengaturan lanjutan berlaku untuk tema terang. Pilih tema selain Garage Dark.</p>;
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {COLOR_FIELDS.map((field) => (
          <label key={field.key} className="pos-v6-color-field">
            <input
              type="color"
              value={draft[field.key] ?? field.fallback}
              onChange={(event) => setDraft((d) => ({ ...d, [field.key]: event.target.value }))}
              aria-label={field.label}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">{field.label}</span>
              <span className="block font-mono text-xs opacity-75">{draft[field.key] ?? "bawaan tema"}</span>
            </span>
          </label>
        ))}
      </div>
      <label className="pos-v6-studio-row">
        <span className="pos-v6-studio-label">Radius sudut</span>
        <span className="flex items-center gap-3">
          <input
            type="range"
            min={8}
            max={20}
            step={1}
            value={draft.radius ?? 14}
            onChange={(event) => setDraft((d) => ({ ...d, radius: Number(event.target.value) }))}
            aria-label="Radius sudut"
            className="w-36 accent-[var(--pos-accent)]"
          />
          <span className="w-10 font-mono text-sm">{draft.radius ?? 14}px</span>
        </span>
      </label>
      {/* Pratinjau mini memakai nilai draf */}
      <div
        className="pos-v6-custom-preview flex items-center gap-3 p-3"
        style={{ background: draft.background ?? "var(--pos-bg)", borderRadius: (draft.radius ?? 14) + 2 }}
        aria-label="Pratinjau warna"
      >
        <span className="flex-1 border p-2.5 text-sm font-bold" style={{ background: draft.surface ?? "var(--pos-surface)", borderColor: draft.border ?? "var(--pos-border)", borderRadius: draft.radius ?? 14, color: "#211b1c" }}>
          Nasi Goreng
          <span className="block font-mono" style={{ color: draft.primary ?? "var(--pos-price)" }}>Rp 15.000</span>
        </span>
        <span className="px-4 py-2.5 text-sm font-bold" style={{ background: draft.primary ?? "var(--pos-accent)", color: "#fff", borderRadius: Math.max(8, (draft.radius ?? 14) - 4) }}>
          Bayar
        </span>
      </div>
      {issues.length ? (
        <ul className="pos-v6-custom-issues space-y-1 text-sm font-semibold" role="alert">
          {issues.map((issue) => (
            <li key={issue} className="flex gap-1.5">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {issue}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="pos-v6-btn-primary" disabled={!dirty || issues.length > 0} onClick={() => writeThemeCustom(draft)}>
          Terapkan warna
        </button>
        <button
          type="button"
          className="pos-v6-btn-outline"
          onClick={() => {
            setDraft({});
            writeThemeCustom({});
          }}
        >
          <RotateCcw className="size-4" aria-hidden /> Kembalikan warna tema
        </button>
      </div>
    </div>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <div className="pos-v6-studio-row">
      <p className="pos-v6-studio-label">{label}</p>
      <div className="pos-v6-seg" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button key={option.value} type="button" role="radio" aria-checked={value === option.value} data-active={value === option.value} onClick={() => onChange(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, detail, checked, onChange }: { label: string; detail?: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="pos-v6-studio-row pos-v6-studio-toggle">
      <span>
        <span className="pos-v6-studio-label">{label}</span>
        {detail ? <span className="block text-xs opacity-75">{detail}</span> : null}
      </span>
      <input type="checkbox" role="switch" className="pos-v6-switch" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

export function PosV6ThemeStudio({
  open,
  onOpenChange,
  theme,
  onThemeChange,
  settings,
  onSettingsChange,
  canCustomize = false,
}: {
  /** Owner/Manajer: tampilkan pengaturan warna lanjutan. */
  canCustomize?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: CashierThemeMode;
  onThemeChange: (theme: CashierThemeMode) => void;
  settings: CashierPosSettings;
  onSettingsChange: (patch: Partial<CashierPosSettings>) => void;
}) {
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    // Kemampuan browser hanya diketahui di client.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanFullscreen(fullscreenSupported());
    const sync = () => setFullscreen(isFullscreen());
    sync();
    return onFullscreenChange(sync);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-cashier-theme-scope={theme} className="pos-v6-studio max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Garage POS Theme Studio</DialogTitle>
          <DialogDescription>Atur tampilan POS di perangkat ini. Perubahan langsung terlihat dan tersimpan otomatis — keranjang & transaksi tidak berubah.</DialogDescription>
        </DialogHeader>

        <section aria-labelledby="pos-v6-studio-theme" className="space-y-2">
          <h3 id="pos-v6-studio-theme" className="pos-v6-studio-h">Tema</h3>
          <CashierThemePresetGrid value={theme} onChange={onThemeChange} layout="cards" />
        </section>

        <section aria-labelledby="pos-v6-studio-layout" className="space-y-1">
          <h3 id="pos-v6-studio-layout" className="pos-v6-studio-h">Tampilan</h3>
          <Segmented
            label="Ukuran teks"
            value={settings.textSize}
            onChange={(textSize) => onSettingsChange({ textSize })}
            options={[
              { value: "small", label: "Kecil" },
              { value: "normal", label: "Sedang" },
              { value: "large", label: "Besar" },
            ]}
          />
          <Segmented
            label="Katalog produk"
            value={settings.productView}
            onChange={(productView) => onSettingsChange({ productView })}
            options={[
              { value: "visual", label: "Visual" },
              { value: "compact", label: "Ringkas" },
              { value: "list", label: "Daftar" },
            ]}
          />
          <Segmented
            label="Posisi keranjang"
            value={settings.billLayout}
            onChange={(billLayout) => onSettingsChange({ billLayout })}
            options={[
              { value: "right", label: "Kanan" },
              { value: "bottom", label: "Bawah" },
            ]}
          />
          <Segmented
            label="Sidebar (layar lebar)"
            value={settings.sidebarMode}
            onChange={(sidebarMode) => onSettingsChange({ sidebarMode })}
            options={[
              { value: "full", label: "Penuh" },
              { value: "compact", label: "Ikon saja" },
            ]}
          />
          <Toggle label="Foto produk" detail="Matikan untuk katalog lebih padat di perangkat lambat." checked={settings.showPhotos} onChange={(showPhotos) => onSettingsChange({ showPhotos })} />
          <Toggle label="Kurangi gerakan" detail="Animasi POS dimatikan (pengaturan perangkat juga dihormati)." checked={settings.reducedMotion} onChange={(reducedMotion) => onSettingsChange({ reducedMotion })} />
        </section>

        {canCustomize ? (
          <section aria-labelledby="pos-v6-studio-advanced" className="space-y-2">
            <h3 id="pos-v6-studio-advanced" className="pos-v6-studio-h">Lanjutan (Owner/Manajer)</h3>
            <p className="text-xs opacity-80">Warna khusus perangkat ini. Nilai yang kontrasnya kurang (WCAG AA) tidak bisa diterapkan.</p>
            <AdvancedThemeEditor theme={theme} />
          </section>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          {canFullscreen ? (
            <button type="button" className="pos-v6-btn-outline" onClick={() => void (fullscreen ? exitFullscreen() : enterFullscreen())}>
              {fullscreen ? <Minimize className="size-4" aria-hidden /> : <Maximize className="size-4" aria-hidden />}
              {fullscreen ? "Keluar layar penuh" : "Layar penuh (kiosk)"}
            </button>
          ) : null}
          <button
            type="button"
            className="pos-v6-btn-outline"
            onClick={() => {
              onThemeChange(DEFAULT_CASHIER_THEME);
              onSettingsChange({
                textSize: defaultCashierPosSettings.textSize,
                productView: defaultCashierPosSettings.productView,
                billLayout: defaultCashierPosSettings.billLayout,
                sidebarMode: defaultCashierPosSettings.sidebarMode,
                showPhotos: defaultCashierPosSettings.showPhotos,
                reducedMotion: defaultCashierPosSettings.reducedMotion,
              });
            }}
          >
            <RotateCcw className="size-4" aria-hidden /> Reset default
          </button>
          <button type="button" className="pos-v6-btn-primary ml-auto" onClick={() => onOpenChange(false)}>
            Selesai
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
