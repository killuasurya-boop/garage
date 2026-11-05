"use client";

// Garage POS Theme Studio (POS V6, papan 08). Preferensi TAMPILAN per perangkat:
// tema, ukuran teks, tampilan katalog, foto produk, posisi keranjang, sidebar, kurangi gerakan,
// layar penuh. Semua perubahan langsung terlihat (live preview) dan tersimpan otomatis.
// Tidak menyentuh keranjang, harga, transaksi, atau data apa pun di server.
import { useEffect, useState } from "react";
import { Maximize, Minimize, RotateCcw } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { CashierThemePresetGrid, DEFAULT_CASHIER_THEME, type CashierThemeMode } from "../garage-app-pickers";
import { defaultCashierPosSettings, type CashierPosSettings } from "../garage-app-helpers";
import { enterFullscreen, exitFullscreen, fullscreenSupported, isFullscreen, onFullscreenChange } from "../order/v5/fullscreen";

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
}: {
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
