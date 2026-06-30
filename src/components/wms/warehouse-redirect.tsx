"use client";

import { useEffect } from "react";

// Modul "Produk & Gudang" lama digantikan GARAGE WMS (route /warehouse, shell
// sendiri). Saat modul inventory dibuka di Garage OS, arahkan ke WMS.
export function WarehouseRedirect() {
  useEffect(() => {
    window.location.assign("/warehouse");
  }, []);
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
      <span className="size-8 animate-spin rounded-full border-2 border-[#d11a2a] border-t-transparent" />
      <p className="text-sm text-[#b8b8bf]">Membuka GARAGE WMS (Gudang)…</p>
      <a href="/warehouse" className="text-xs font-semibold text-[#f5a742] underline">
        Klik di sini bila tidak otomatis
      </a>
    </div>
  );
}
