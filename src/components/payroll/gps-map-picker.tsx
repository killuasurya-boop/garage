"use client";

// Peta interaktif pemilih koordinat absen (Leaflet + OpenStreetMap).
// Gratis, tanpa API key. Klik peta untuk memindah pin; radius tergambar sebagai
// lingkaran. Tombol "Pakai Lokasi Saya" mengisi koordinat via GPS peramban.
//
// Client-only: Leaflet butuh `window`. Dipakai via dynamic import ssr:false.

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Circle, Map as LeafletMap, Marker } from "leaflet";

interface GpsMapPickerProps {
  lat: number;
  lng: number;
  radiusMeters: number;
  onChange: (lat: number, lng: number) => void;
}

export default function GpsMapPicker({ lat, lng, radiusMeters, onChange }: GpsMapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const circleRef = useRef<Circle | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Inisialisasi peta sekali.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      // Pin kustom (hindari broken default marker image di bundler).
      const pinIcon = L.divIcon({
        className: "",
        html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#e83030;border:2px solid #fff;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 22],
      });

      const map = L.map(containerRef.current, {
        center: [lat || -6.2, lng || 106.8],
        zoom: 17,
        scrollWheelZoom: true,
      });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);

      const marker = L.marker([lat || -6.2, lng || 106.8], {
        draggable: true,
        icon: pinIcon,
      }).addTo(map);
      markerRef.current = marker;

      const circle = L.circle([lat || -6.2, lng || 106.8], {
        radius: radiusMeters || 50,
        color: "#e83030",
        fillColor: "#e83030",
        fillOpacity: 0.12,
        weight: 2,
      }).addTo(map);
      circleRef.current = circle;

      const setPoint = (la: number, ln: number) => {
        marker.setLatLng([la, ln]);
        circle.setLatLng([la, ln]);
        onChangeRef.current(la, ln);
      };

      map.on("click", (e: L.LeafletMouseEvent) => setPoint(e.latlng.lat, e.latlng.lng));
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        setPoint(p.lat, p.lng);
      });

      // Fix ukuran setelah mount (kontainer flex/tab).
      setTimeout(() => map.invalidateSize(), 200);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sinkronkan posisi bila koordinat berubah dari luar (input manual / GPS).
  useEffect(() => {
    if (!mapRef.current || !markerRef.current || !circleRef.current) return;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      markerRef.current.setLatLng([lat, lng]);
      circleRef.current.setLatLng([lat, lng]);
      mapRef.current.panTo([lat, lng]);
    }
  }, [lat, lng]);

  // Update radius lingkaran.
  useEffect(() => {
    circleRef.current?.setRadius(radiusMeters || 50);
  }, [radiusMeters]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-xl overflow-hidden border border-[var(--garage-bg-3)]"
      style={{ height: 360 }}
    />
  );
}
