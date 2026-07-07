"use client";

// Panel setting GPS absen — ramah owner: peta interaktif + input koordinat +
// radius + "Pakai Lokasi Saya". Menggantikan textarea JSON.
// Simpan ke payroll_settings key "gps" lewat PATCH /api/payroll/settings.

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const GpsMapPicker = dynamic(() => import("@/components/payroll/gps-map-picker"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[360px] rounded-xl border border-[var(--garage-bg-3)] flex items-center justify-center text-[var(--garage-mute)] text-sm">
      Memuat peta…
    </div>
  ),
});

interface GpsValue {
  lat: number;
  lng: number;
  radiusMeters: number;
  name?: string;
  address?: string;
}

export function GpsSettingsPanel() {
  const [gps, setGps] = useState<GpsValue>({ lat: 3.316259, lng: 99.148041, radiusMeters: 50 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/payroll/settings");
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error?.message ?? "Gagal memuat");
        const g = json.data.settings?.gps;
        if (g && typeof g.lat === "number") {
          setGps({
            lat: g.lat,
            lng: g.lng,
            radiusMeters: g.radiusMeters ?? 50,
            name: g.name ?? "",
            address: g.address ?? "",
          });
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      setError("Peramban tidak mendukung GPS.");
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps((g) => ({ ...g, lat: pos.coords.latitude, lng: pos.coords.longitude }));
        setGeoLoading(false);
      },
      (err) => {
        setError(`GPS gagal: ${err.message}`);
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/payroll/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: "gps", value: gps }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal simpan");
      setMsg("Lokasi absen tersimpan ✅");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-[var(--garage-mute)] text-sm">Memuat setting GPS…</div>;

  return (
    <div className="rounded-2xl border border-[var(--garage-bg-3)] bg-[var(--garage-bg-1)] p-4 space-y-4">
      <div>
        <h2 className="text-lg font-bold text-[var(--garage-fg)]">Lokasi Absen (Geofence)</h2>
        <p className="text-xs text-[var(--garage-mute)] mt-1">
          Klik peta atau geser pin untuk menaruh titik toko. Karyawan hanya bisa absen
          dalam radius yang ditentukan.
        </p>
      </div>

      <GpsMapPicker
        lat={gps.lat}
        lng={gps.lng}
        radiusMeters={gps.radiusMeters}
        onChange={(lat, lng) => setGps((g) => ({ ...g, lat, lng }))}
      />

      <div className="flex flex-wrap gap-2">
        <button
          onClick={useMyLocation}
          disabled={geoLoading}
          className="px-4 py-2 rounded-lg bg-[var(--garage-amber)] text-black text-sm font-semibold disabled:opacity-50"
        >
          {geoLoading ? "Mengambil GPS…" : "📍 Pakai Lokasi Saya (berdiri di toko)"}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs uppercase text-[var(--garage-mute)]">Latitude</label>
          <input
            type="number"
            step="any"
            value={gps.lat}
            onChange={(e) => setGps((g) => ({ ...g, lat: Number(e.target.value) }))}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-[var(--garage-bg-0)] border border-[var(--garage-bg-3)] text-[var(--garage-fg)] text-sm"
          />
        </div>
        <div>
          <label className="text-xs uppercase text-[var(--garage-mute)]">Longitude</label>
          <input
            type="number"
            step="any"
            value={gps.lng}
            onChange={(e) => setGps((g) => ({ ...g, lng: Number(e.target.value) }))}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-[var(--garage-bg-0)] border border-[var(--garage-bg-3)] text-[var(--garage-fg)] text-sm"
          />
        </div>
        <div>
          <label className="text-xs uppercase text-[var(--garage-mute)]">Radius (meter)</label>
          <input
            type="number"
            min={10}
            max={1000}
            value={gps.radiusMeters}
            onChange={(e) => setGps((g) => ({ ...g, radiusMeters: Number(e.target.value) }))}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-[var(--garage-bg-0)] border border-[var(--garage-bg-3)] text-[var(--garage-fg)] text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs uppercase text-[var(--garage-mute)]">Nama Lokasi</label>
          <input
            value={gps.name ?? ""}
            onChange={(e) => setGps((g) => ({ ...g, name: e.target.value }))}
            placeholder="Contoh: Garage Coffee Pusat"
            className="mt-1 w-full px-3 py-2 rounded-lg bg-[var(--garage-bg-0)] border border-[var(--garage-bg-3)] text-[var(--garage-fg)] text-sm"
          />
        </div>
        <div>
          <label className="text-xs uppercase text-[var(--garage-mute)]">Alamat</label>
          <input
            value={gps.address ?? ""}
            onChange={(e) => setGps((g) => ({ ...g, address: e.target.value }))}
            placeholder="Jl. ..."
            className="mt-1 w-full px-3 py-2 rounded-lg bg-[var(--garage-bg-0)] border border-[var(--garage-bg-3)] text-[var(--garage-fg)] text-sm"
          />
        </div>
      </div>

      {error && <div className="text-sm text-red-400">{error}</div>}
      {msg && <div className="text-sm text-emerald-400">{msg}</div>}

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="px-5 py-2.5 rounded-lg bg-[var(--garage-red)] text-white text-sm font-semibold disabled:opacity-50"
        >
          {saving ? "Menyimpan…" : "Simpan Lokasi Absen"}
        </button>
      </div>
    </div>
  );
}
