"use client";

import { useEffect, useState } from "react";
import { Link2, Plug, Settings as SettingsIcon } from "lucide-react";

import { garageApi } from "@/lib/api-client";

export default function WmsSettingsPage() {
  const [autoConsume, setAutoConsume] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const s = await garageApi.get<{ wmsAutoConsume: boolean }>("/api/wms/settings");
        if (alive) setAutoConsume(s.wmsAutoConsume);
      } catch {
        if (alive) setAutoConsume(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function toggle(next: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const s = await garageApi.post<{ wmsAutoConsume: boolean }>("/api/wms/settings", { wmsAutoConsume: next });
      setAutoConsume(s.wmsAutoConsume);
      setMsg(next ? "Integrasi POS aktif — penjualan akan memotong bahan gudang." : "Integrasi POS dimatikan.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-[22px] font-extrabold text-[#111111]">
          <SettingsIcon className="size-6 text-[#6B7280]" /> Settings
        </h1>
        <p className="text-[13px] text-[#6B7280]">Konfigurasi integrasi WMS dengan Garage OS.</p>
      </div>

      <section className="rounded-xl border border-[#E8E8E8] bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-[14px] font-bold text-[#111111]">
              <Plug className="size-4 text-[#C8102E]" /> Integrasi POS · Auto-Consume
            </p>
            <p className="mt-1 text-[12.5px] text-[#6B7280]">
              Saat kasir menjual menu di Garage OS, WMS otomatis membaca <b>BOM resep</b> dan
              memotong stok bahan gudang (via Internal Order + FEFO). Menu tanpa resep WMS dilewati.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!!autoConsume}
            disabled={autoConsume === null || busy}
            onClick={() => void toggle(!autoConsume)}
            className="relative mt-1 h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50"
            style={{ background: autoConsume ? "#16A34A" : "#D1D5DB" }}
          >
            <span
              className="absolute top-0.5 size-5 rounded-full bg-white transition-all"
              style={{ left: autoConsume ? 22 : 2 }}
            />
          </button>
        </div>
        {msg && <p className="mt-3 text-[12.5px] font-semibold text-[#16A34A]">{msg}</p>}
      </section>

      <section className="rounded-xl border border-[#E8E8E8] bg-white p-4">
        <p className="flex items-center gap-2 text-[14px] font-bold text-[#111111]">
          <Link2 className="size-4 text-[#2563EB]" /> Cara kerja integrasi
        </p>
        <ol className="mt-2 space-y-1.5 text-[12.5px] text-[#6B7280]">
          <li>1. Buat produk (bahan) di <b>Inventory</b> + isi HPP lewat <b>Receiving</b>.</li>
          <li>2. Buat resep WMS di <b>Recipe</b> dengan BOM (nama resep = nama menu POS).</li>
          <li>3. Aktifkan toggle di atas → setiap penjualan POS memotong bahan otomatis.</li>
          <li>4. Pantau hasilnya di <b>Reports</b> (tipe INTERNAL_OUT) &amp; <b>Owner Analytics</b>.</li>
        </ol>
      </section>
    </div>
  );
}
