"use client";

import { useEffect, useState } from "react";
import { MapPin, Plus, Trash2, Shield, Compass, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LocationConfig {
  id: string;
  name: string;
  type: string; // 'presensi' or 'kunjungan'
  latitude: number;
  longitude: number;
  radius: number;
  address: string | null;
}

export function TeamLocationsManager() {
  const [locations, setLocations] = useState<LocationConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [type, setType] = useState("presensi");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [radius, setRadius] = useState("100");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function fetchLocations() {
    try {
      setLoading(true);
      const res = await fetch("/api/hr/team/locations");
      const data = await res.json();
      if (data.locations) {
        setLocations(data.locations);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLocations();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !latitude || !longitude) return;

    try {
      setSubmitting(true);
      const res = await fetch("/api/hr/team/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type,
          latitude,
          longitude,
          radius,
          address,
        }),
      });
      if (res.ok) {
        setName("");
        setLatitude("");
        setLongitude("");
        setRadius("100");
        setAddress("");
        setShowAddForm(false);
        fetchLocations();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Apakah Anda yakin ingin menghapus lokasi ini?")) return;

    try {
      const res = await fetch("/api/hr/team/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      if (res.ok) {
        fetchLocations();
      }
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-[#27272a] pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <MapPin className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-zinc-100">Lokasi Presensi & Kunjungan Servis</h3>
            <p className="text-xs text-zinc-400">Pengaturan koordinat GPS geofencing outlet dan kunjungan servis eksternal.</p>
          </div>
        </div>

        <Button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold gap-2 border border-amber-400/20"
        >
          <Plus className="size-4" />
          Tambah Lokasi
        </Button>
      </div>

      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 space-y-4 backdrop-blur-md">
          <h4 className="text-sm font-semibold text-zinc-200">Tambah Koordinat Lokasi Baru</h4>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">Nama Titik Lokasi</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Outlet Pusat Garage Coffee"
                className="bg-zinc-950/50 border-zinc-800 text-zinc-200 focus:border-amber-500"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">Tipe Penguncian Lokasi</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full h-10 px-3 rounded-md bg-zinc-950/50 border border-zinc-800 text-zinc-200 focus:border-amber-500 text-sm focus:outline-none"
              >
                <option value="presensi">Presensi Absensi Outlet Utama</option>
                <option value="kunjungan">Kunjungan Servis Luar / Mekanik Panggilan</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">Garis Lintang (Latitude)</label>
              <Input
                type="number"
                step="any"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="Contoh: -6.2088"
                className="bg-zinc-950/50 border-zinc-800 text-zinc-200 focus:border-amber-500"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">Garis Bujur (Longitude)</label>
              <Input
                type="number"
                step="any"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="Contoh: 106.8456"
                className="bg-zinc-950/50 border-zinc-800 text-zinc-200 focus:border-amber-500"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">Radius Toleransi (Meter)</label>
              <Input
                type="number"
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
                className="bg-zinc-950/50 border-zinc-800 text-zinc-200 focus:border-amber-500"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400">Alamat Lengkap Titik Lokasi</label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Contoh: Jl. Slamet Riyadi No.10, Jakarta Timur"
              className="bg-zinc-950/50 border-zinc-800 text-zinc-200 focus:border-amber-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowAddForm(false)}
              className="text-zinc-400 hover:text-zinc-200"
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold gap-2 border border-amber-400/20"
            >
              {submitting ? "Menyimpan..." : "Simpan Lokasi"}
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="py-12 text-center text-zinc-500">Memuat konfigurasi geofence...</div>
      ) : locations.length === 0 ? (
        <div className="bg-zinc-900/20 border border-zinc-800/50 rounded-xl p-12 text-center text-zinc-500 space-y-2">
          <Compass className="size-8 mx-auto text-zinc-600" />
          <p className="font-medium text-zinc-400">Belum ada lokasi geofence</p>
          <p className="text-xs">Titik presensi dan servis kunjungan GPS akan tercatat di sini.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {locations.map((item) => (
            <div
              key={item.id}
              className="bg-zinc-900/30 hover:bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-5 transition-all flex flex-col justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border inline-flex items-center gap-1 ${
                    item.type === "presensi"
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                  }`}>
                    <Navigation className="size-2.5" />
                    {item.type === "presensi" ? "Absensi Outlet" : "Servis Kunjungan"}
                  </span>
                  <h4 className="font-semibold text-zinc-100 text-sm">{item.name}</h4>
                </div>

                <div className="text-xs text-zinc-400 space-y-1 font-mono">
                  <div>Lat: {item.latitude}</div>
                  <div>Lng: {item.longitude}</div>
                  <div>Radius Toleransi: {item.radius} meter</div>
                </div>

                {item.address && <p className="text-zinc-500 text-xs">{item.address}</p>}
              </div>

              <div className="flex justify-end border-t border-zinc-800/50 pt-3">
                <Button
                  onClick={() => handleDelete(item.id)}
                  size="sm"
                  variant="ghost"
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 gap-1.5 px-3"
                >
                  <Trash2 className="size-4" />
                  Hapus
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
