"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  Info,
  Link2,
  Package,
  Plug,
  RefreshCw,
  Settings as SettingsIcon,
  ShoppingCart,
  Snowflake,
  ThermometerSnowflake,
} from "lucide-react";

import { garageApi } from "@/lib/api-client";
import { WMS_PUTAWAY_ZONES } from "@/lib/wms-receiving-utils";
import type { WmsBridgeSyncResult } from "@/lib/wms-bridge";
import type { WmsConfig } from "@/lib/wms-types";

type WmsSettings = WmsConfig & { wmsAutoConsume: boolean };

type SettingsTab = "pos" | "sync" | "stock" | "notif" | "reorder" | "coldchain" | "about";

const TABS: Array<{ id: SettingsTab; label: string; icon: typeof Plug }> = [
  { id: "pos", label: "Integrasi POS", icon: Plug },
  { id: "sync", label: "Sinkron OS", icon: RefreshCw },
  { id: "stock", label: "Stok & Expiry", icon: AlertTriangle },
  { id: "notif", label: "Notifikasi", icon: Bell },
  { id: "reorder", label: "Reorder", icon: ShoppingCart },
  { id: "coldchain", label: "Cold Chain", icon: ThermometerSnowflake },
  { id: "about", label: "Tentang", icon: Info },
];

const DEFAULT_SETTINGS: WmsSettings = {
  wmsAutoConsume: false,
  expiryStrict: true,
  defaultPutAway: "DRY",
  notifyLowStock: true,
  notifyColdChain: true,
  reorderLeadDays: 14,
};

function WmsToggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative h-[22px] w-[38px] shrink-0 rounded-full transition disabled:opacity-50"
      style={{ background: checked ? "#C8102E" : "#D1D5DB" }}
    >
      <span
        className="absolute top-[2px] size-[18px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-all"
        style={{ left: checked ? 18 : 2 }}
      />
    </button>
  );
}

function SettingRow({
  title,
  description,
  children,
  border = true,
}: {
  title: string;
  description: string;
  children: ReactNode;
  border?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-3.5 ${border ? "border-b border-[#F1F2F4]" : ""}`}
    >
      <div>
        <p className="text-[13px] font-semibold text-[#111111]">{title}</p>
        <p className="mt-0.5 text-[11.5px] text-[#6B7280]">{description}</p>
      </div>
      {children}
    </div>
  );
}

export default function WmsSettingsPage() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<SettingsTab>("pos");
  const [settings, setSettings] = useState<WmsSettings | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<WmsBridgeSyncResult | null>(null);
  const [reorderDraft, setReorderDraft] = useState(14);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const s = await garageApi.get<WmsSettings>("/api/wms/settings");
        if (alive) {
          setSettings(s);
          setReorderDraft(s.reorderLeadDays);
        }
      } catch {
        if (alive) setSettings(DEFAULT_SETTINGS);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (searchParams.get("sync") === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab("sync");
      void runSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function patchSettings(patch: Partial<WmsSettings>, key: string, successMsg?: string) {
    setBusyKey(key);
    setMsg(null);
    try {
      const next = await garageApi.post<WmsSettings>("/api/wms/settings", patch);
      setSettings(next);
      setReorderDraft(next.reorderLeadDays);
      if (successMsg) setMsg(successMsg);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setBusyKey(null);
    }
  }

  async function runSync() {
    setSyncBusy(true);
    setMsg(null);
    try {
      const res = await garageApi.post<WmsBridgeSyncResult>("/api/wms/sync", {});
      setSyncResult(res);
      setMsg(
        `Sinkron selesai: ${res.products.created} produk baru, ${res.products.updated} diperbarui, ${res.recipes.created + res.recipes.updated} resep.`,
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Gagal sinkron.");
    } finally {
      setSyncBusy(false);
    }
  }

  async function saveReorderLeadDays() {
    const value = Math.min(90, Math.max(1, Math.round(reorderDraft)));
    setReorderDraft(value);
    await patchSettings({ reorderLeadDays: value }, "reorderLeadDays", `Lead time reorder disimpan: ${value} hari.`);
  }

  const loading = settings === null;

  return (
    <div className="pb-10">
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-[22px] font-extrabold tracking-[-0.01em] text-[#111111]">
          <SettingsIcon className="size-6 text-[#6B7280]" /> Settings
        </h1>
        <p className="mt-0.5 text-[13px] text-[#6B7280]">Konfigurasi integrasi WMS dengan Garage OS.</p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[236px_minmax(0,1fr)] lg:gap-[18px]">
        {/* Mobile tab picker */}
        <div className="lg:hidden">
          <label className="mb-1.5 block text-[11px] font-semibold text-[#6B7280]">Kategori</label>
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value as SettingsTab)}
            className="h-10 w-full rounded-lg border border-[#E8E8E8] bg-white px-3 text-[13px] font-semibold text-[#374151] outline-none focus:border-[#C8102E]"
          >
            {TABS.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.label}
              </option>
            ))}
          </select>
        </div>

        {/* Desktop tab sidebar */}
        <nav className="sticky top-3.5 hidden rounded-xl border border-[#E8E8E8] bg-white p-2 lg:block">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-current={active ? "page" : undefined}
                className="relative mb-0.5 flex w-full items-center gap-2.5 rounded-[9px] px-3 py-2.5 text-left transition-colors last:mb-0"
                style={{ background: active ? "#FDF1F3" : "transparent" }}
              >
                <span
                  className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-[3px] bg-[#C8102E] transition-opacity"
                  style={{ opacity: active ? 1 : 0 }}
                />
                <Icon className="size-[17px] shrink-0" style={{ color: active ? "#C8102E" : "#9CA3AF" }} />
                <span className="text-[12.5px] font-semibold" style={{ color: active ? "#C8102E" : "#374151" }}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="flex flex-col gap-4">
          {activeTab === "pos" && (
            <section className="rounded-xl border border-[#E8E8E8] bg-white p-[22px]">
              <h2 className="mb-1 text-[15px] font-bold text-[#111111]">Integrasi POS · Auto-Consume</h2>
              <p className="mb-4 text-[12px] text-[#6B7280]">
                Saat kasir menjual menu di Garage OS, WMS membaca BOM resep WMS atau fallback menu_recipes OS, lalu
                memotong stok gudang (Internal Order + FEFO).
              </p>
              <SettingRow
                title="Auto-Consume dari POS"
                description="Penjualan kasir otomatis memotong bahan gudang sesuai resep."
                border={false}
              >
                <WmsToggle
                  checked={!!settings?.wmsAutoConsume}
                  disabled={loading || busyKey === "wmsAutoConsume"}
                  label="Auto-Consume dari POS"
                  onChange={(next) =>
                    void patchSettings(
                      { wmsAutoConsume: next },
                      "wmsAutoConsume",
                      next ? "Integrasi POS aktif — penjualan akan memotong bahan gudang." : "Integrasi POS dimatikan.",
                    )
                  }
                />
              </SettingRow>
            </section>
          )}

          {activeTab === "sync" && (
            <section className="rounded-xl border border-[#E8E8E8] bg-white p-[22px]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="flex items-center gap-2 text-[15px] font-bold text-[#111111]">
                    <RefreshCw className="size-4 text-[#C8102E]" /> Sinkron Garage OS → WMS
                  </h2>
                  <p className="mt-1 text-[12.5px] text-[#6B7280]">
                    Salin SKU dari <b>inventory_items</b> ke <b>wms_product</b> dan resep menu POS ke{" "}
                    <b>wms_recipe</b>. Metadata selalu diperbarui; stok WMS yang sudah ada tidak ditimpa.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={syncBusy}
                  onClick={() => void runSync()}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#C8102E] px-3.5 py-2 text-[12px] font-bold text-white shadow-[0_2px_8px_rgba(200,16,46,0.25)] hover:bg-[#A50D26] disabled:opacity-50"
                >
                  <RefreshCw className={`size-3.5 ${syncBusy ? "animate-spin" : ""}`} />
                  {syncBusy ? "Sinkron…" : "Sinkron Sekarang"}
                </button>
              </div>
              {syncResult && (
                <dl className="mt-4 grid grid-cols-2 gap-2 text-[12px] text-[#6B7280] sm:grid-cols-4">
                  <div className="rounded-lg bg-[#F8F9FB] px-2 py-1.5">
                    <dt>Produk baru</dt>
                    <dd className="font-bold text-[#111]">{syncResult.products.created}</dd>
                  </div>
                  <div className="rounded-lg bg-[#F8F9FB] px-2 py-1.5">
                    <dt>Produk update</dt>
                    <dd className="font-bold text-[#111]">{syncResult.products.updated}</dd>
                  </div>
                  <div className="rounded-lg bg-[#F8F9FB] px-2 py-1.5">
                    <dt>Resep sync</dt>
                    <dd className="font-bold text-[#111]">{syncResult.recipes.created + syncResult.recipes.updated}</dd>
                  </div>
                  <div className="rounded-lg bg-[#F8F9FB] px-2 py-1.5">
                    <dt>Terakhir</dt>
                    <dd className="font-bold text-[#111]">{new Date(syncResult.syncedAt).toLocaleString("id-ID")}</dd>
                  </div>
                </dl>
              )}
            </section>
          )}

          {activeTab === "stock" && (
            <section className="rounded-xl border border-[#E8E8E8] bg-white p-[22px]">
              <h2 className="mb-1 text-[15px] font-bold text-[#111111]">Stok & Expiry</h2>
              <p className="mb-2 text-[12px] text-[#6B7280]">Atur kebijakan expiry dan zona put-away default saat receiving.</p>
              <SettingRow
                title="Enforce Expiry Strict (FEFO)"
                description="Blokir pengeluaran batch yang sudah expired; wajib keluarkan batch terdekat expired dulu."
              >
                <WmsToggle
                  checked={!!settings?.expiryStrict}
                  disabled={loading || busyKey === "expiryStrict"}
                  label="Enforce Expiry Strict"
                  onChange={(next) =>
                    void patchSettings(
                      { expiryStrict: next },
                      "expiryStrict",
                      next ? "FEFO strict aktif — batch expired diblokir." : "FEFO strict dimatikan.",
                    )
                  }
                />
              </SettingRow>
              <div className="pt-3.5">
                <label className="mb-1.5 block text-[11px] font-semibold text-[#6B7280]">Zona put-away default</label>
                <select
                  value={settings?.defaultPutAway ?? "DRY"}
                  disabled={loading || busyKey === "defaultPutAway"}
                  onChange={(e) =>
                    void patchSettings(
                      { defaultPutAway: e.target.value },
                      "defaultPutAway",
                      `Zona default: ${e.target.value}.`,
                    )
                  }
                  className="w-full max-w-xs rounded-lg border border-[#E8E8E8] bg-white px-3 py-2.5 text-[13px] font-semibold text-[#374151] outline-none focus:border-[#C8102E] disabled:opacity-50"
                >
                  {WMS_PUTAWAY_ZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </select>
              </div>
            </section>
          )}

          {activeTab === "notif" && (
            <section className="rounded-xl border border-[#E8E8E8] bg-white p-[22px]">
              <h2 className="mb-4 text-[15px] font-bold text-[#111111]">Preferensi Notifikasi</h2>
              <SettingRow title="Alert Low Stock" description="Notifikasi saat stok ≤ minimum yang ditentukan.">
                <WmsToggle
                  checked={!!settings?.notifyLowStock}
                  disabled={loading || busyKey === "notifyLowStock"}
                  label="Alert Low Stock"
                  onChange={(next) =>
                    void patchSettings(
                      { notifyLowStock: next },
                      "notifyLowStock",
                      next ? "Alert low stock aktif." : "Alert low stock dimatikan.",
                    )
                  }
                />
              </SettingRow>
              <SettingRow title="Alert Cold Chain" description="Push saat suhu keluar dari zona aman." border={false}>
                <WmsToggle
                  checked={!!settings?.notifyColdChain}
                  disabled={loading || busyKey === "notifyColdChain"}
                  label="Alert Cold Chain"
                  onChange={(next) =>
                    void patchSettings(
                      { notifyColdChain: next },
                      "notifyColdChain",
                      next ? "Alert cold chain aktif." : "Alert cold chain dimatikan.",
                    )
                  }
                />
              </SettingRow>
            </section>
          )}

          {activeTab === "reorder" && (
            <section className="rounded-xl border border-[#E8E8E8] bg-white p-[22px]">
              <h2 className="mb-1 text-[15px] font-bold text-[#111111]">Smart Reorder</h2>
              <p className="mb-4 text-[12px] text-[#6B7280]">
                Lead time pembelian default untuk perhitungan saran reorder (1–90 hari).
              </p>
              <div className="max-w-xs">
                <label htmlFor="reorder-lead-days" className="mb-1.5 block text-[11px] font-semibold text-[#6B7280]">
                  Lead time reorder (hari)
                </label>
                <div className="flex gap-2">
                  <input
                    id="reorder-lead-days"
                    type="number"
                    min={1}
                    max={90}
                    value={reorderDraft}
                    disabled={loading || busyKey === "reorderLeadDays"}
                    onChange={(e) => setReorderDraft(Number(e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveReorderLeadDays();
                    }}
                    className="w-full rounded-lg border border-[#E8E8E8] px-3 py-2.5 text-[13px] font-semibold text-[#374151] outline-none focus:border-[#C8102E] disabled:opacity-50"
                  />
                  <button
                    type="button"
                    disabled={loading || busyKey === "reorderLeadDays"}
                    onClick={() => void saveReorderLeadDays()}
                    className="shrink-0 rounded-lg bg-[#C8102E] px-3.5 py-2 text-[12px] font-bold text-white hover:bg-[#A50D26] disabled:opacity-50"
                  >
                    Simpan
                  </button>
                </div>
              </div>
            </section>
          )}

          {activeTab === "coldchain" && (
            <section className="rounded-xl border border-[#E8E8E8] bg-white p-[22px]">
              <h2 className="mb-1 text-[15px] font-bold text-[#111111]">Cold Chain & IoT</h2>
              <p className="mb-4 text-[12px] text-[#6B7280]">
                Pantau suhu chiller & freezer. Sensor IoT mengirim bacaan suhu ke WMS secara berkala.
              </p>
              <div className="flex items-center gap-3 rounded-lg border border-[#E8E8E8] bg-[#F8F9FB] p-3.5">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[#EFF4FF] text-[#2563EB]">
                  <Snowflake className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-[#111111]">Cold Chain Monitor</p>
                  <p className="text-[11.5px] text-[#6B7280]">Grafik tren suhu & alert zona aman chiller/freezer.</p>
                </div>
                <Link
                  href="/warehouse/cold-chain"
                  className="shrink-0 rounded-lg bg-[#C8102E] px-3 py-2 text-[12px] font-bold text-white hover:bg-[#A50D26]"
                >
                  Buka Monitor →
                </Link>
              </div>
              <div className="mt-4 rounded-lg border border-dashed border-[#E8E8E8] bg-[#FAFBFC] px-3.5 py-3">
                <p className="text-[12px] font-semibold text-[#374151]">Webhook IoT</p>
                <p className="mt-1 text-[11.5px] text-[#6B7280]">
                  Sensor mengirim bacaan suhu via{" "}
                  <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px] text-[#C8102E]">
                    POST /api/wms/cold-chain
                  </code>{" "}
                  dengan body{" "}
                  <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px] text-[#374151]">
                    {"{ unitCode, tempC }"}
                  </code>
                  .
                </p>
              </div>
            </section>
          )}

          {activeTab === "about" && (
            <section className="rounded-xl border border-[#E8E8E8] bg-white p-[22px]">
              <p className="flex items-center gap-2 text-[15px] font-bold text-[#111111]">
                <Link2 className="size-4 text-[#C8102E]" /> Cara kerja integrasi
              </p>
              <ol className="mt-3 space-y-2 text-[12.5px] text-[#6B7280]">
                <li className="flex gap-2">
                  <span className="font-bold text-[#C8102E]">1.</span>
                  <span>
                    Jalankan <b>Sinkron OS → WMS</b> agar SKU & resep POS masuk ke WMS.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-[#C8102E]">2.</span>
                  <span>
                    Isi HPP lewat <b>Receiving</b> bila unit cost OS belum akurat.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-[#C8102E]">3.</span>
                  <span>
                    Aktifkan <b>Auto-Consume</b> → penjualan POS memotong bahan otomatis.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-[#C8102E]">4.</span>
                  <span>
                    Pantau di <b>Reports</b> (INTERNAL_OUT) & <b>Owner Analytics</b>.
                  </span>
                </li>
              </ol>
              <div className="mt-5 flex items-center gap-3 rounded-lg bg-[#2F3136] px-4 py-3.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-white/10 text-[#F26478]">
                  <Package className="size-[18px]" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-white">GARAGE WMS · Integrasi Garage OS</p>
                  <p className="text-[11px] text-[#9CA3AF]">POS → resep BOM → potong stok gudang (FEFO)</p>
                </div>
              </div>
            </section>
          )}

          {msg && (
            <p
              className="text-[12.5px] font-semibold"
              style={{ color: msg.includes("Gagal") ? "#DC2626" : "#16A34A" }}
            >
              {msg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
