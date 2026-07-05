"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, Package, ScanLine } from "lucide-react";

import { garageApi } from "@/lib/api-client";
import type { WmsProductRow } from "@/lib/wms-types";

/* eslint-disable @typescript-eslint/no-explicit-any */

type ScanHistory = { code: string; name: string; at: string };

export default function WmsScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [products, setProducts] = useState<WmsProductRow[]>([]);
  const [mode, setMode] = useState<"sku" | "barcode" | "qr">("sku");
  const [result, setResult] = useState<WmsProductRow | null>(null);
  const [history, setHistory] = useState<ScanHistory[]>([]);
  const [manual, setManual] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void garageApi.get<WmsProductRow[]>("/api/wms/products").then(setProducts).catch(() => {});
  }, []);

  const lookup = useCallback(
    (code: string) => {
      const q = code.trim().toLowerCase();
      const hit =
        products.find((p) => p.sku.toLowerCase() === q) ??
        products.find((p) => (p.barcode ?? "").toLowerCase() === q) ??
        products.find((p) => p.name.toLowerCase().includes(q));
      if (hit) {
        setResult(hit);
        setHistory((h) => [{ code, name: hit.name, at: new Date().toLocaleTimeString("id-ID") }, ...h].slice(0, 8));
      } else {
        setResult(null);
        setErr(`Tidak ditemukan: ${code}`);
      }
    },
    [products],
  );

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    void (async () => {
      const Detector = (window as any).BarcodeDetector;
      if (!Detector) {
        setErr("BarcodeDetector tidak didukung — gunakan input manual.");
        return;
      }
      const detector = new Detector({
        formats: ["qr_code", "code_128", "ean_13", "ean_8", "code_39", "upc_a", "upc_e"],
      });
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0 && codes[0].rawValue) {
              lookup(String(codes[0].rawValue));
              return;
            }
          } catch {
            /* frame gagal */
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setErr("Kamera tidak tersedia. Izinkan akses kamera atau ketik manual.");
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [lookup]);

  return (
    <div className="-m-6 min-h-[calc(100vh-60px)] bg-[#181818] text-white">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <Link href="/warehouse/inventory" className="flex items-center gap-2 text-[13px] text-white/70 hover:text-white">
          <ArrowLeft className="size-4" /> Inventory
        </Link>
        <p className="flex items-center gap-2 text-[14px] font-bold">
          <ScanLine className="size-4 text-[#C8102E]" /> Scan Barcode
        </p>
        <span className="w-16" />
      </div>

      <div className="flex flex-wrap justify-center gap-2 px-4 py-3">
        {(["sku", "barcode", "qr"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-full px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide ${
              mode === m ? "bg-[#C8102E] text-white" : "bg-white/10 text-white/60"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="relative mx-auto max-w-lg px-4">
        <div className="relative overflow-hidden rounded-xl bg-black">
          <video ref={videoRef} playsInline muted className="aspect-[4/3] w-full object-cover opacity-90" />
          <span className="pointer-events-none absolute inset-4 border-2 border-[#C8102E]/80" style={{ borderRadius: 8 }} />
          <span
            className="pointer-events-none absolute inset-x-8 h-0.5 bg-[#C8102E] shadow-[0_0_12px_#C8102E]"
            style={{ animation: "wms-scanline 2.4s ease-in-out infinite", top: "45%" }}
          />
        </div>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-[12px] text-white/50">
          <Camera className="size-3.5" /> Mode {mode.toUpperCase()} — arahkan ke label produk
        </p>

        <div className="mt-3 flex gap-2">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && manual.trim()) {
                setErr(null);
                lookup(manual.trim());
              }
            }}
            placeholder="Ketik SKU / barcode manual"
            className="h-10 flex-1 rounded-lg border border-white/15 bg-white/5 px-3 font-mono text-[13px] text-white outline-none focus:border-[#C8102E]"
          />
          <button
            type="button"
            disabled={!manual.trim()}
            onClick={() => {
              setErr(null);
              lookup(manual.trim());
            }}
            className="rounded-lg bg-[#C8102E] px-4 text-[12px] font-bold disabled:opacity-40"
          >
            Cari
          </button>
        </div>
        {err && <p className="mt-2 text-center text-[12px] text-[#FCA5A5]">{err}</p>}
      </div>

      {history.length > 0 && (
        <div className="mx-auto mt-5 max-w-lg px-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">Riwayat scan</p>
          <div className="space-y-1.5">
            {history.map((h, i) => (
              <div key={`${h.code}-${i}`} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-[12px]">
                <span className="font-mono text-[#FCA5A5]">{h.code}</span>
                <span className="truncate text-white/70">{h.name}</span>
                <span className="text-white/35">{h.at}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {result && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 rounded-t-2xl border-t border-[#E8E8E8] bg-white p-5 text-[#111111] shadow-[0_-16px_50px_rgba(0,0,0,.28)]"
          style={{ animation: "wms-sheet-up 0.38s cubic-bezier(.22,1,.36,1)" }}
        >
          <p className="font-mono text-[12px] font-bold text-[#C8102E]">{result.sku}</p>
          <p className="mt-1 text-[18px] font-extrabold">{result.name}</p>
          <p className="mt-1 text-[13px] text-[#6B7280]">
            Stok: <b className="text-[#111]">{result.onHand}</b> {result.unit} · HPP {result.hpp}
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => router.push(`/warehouse/inventory?wh=&q=${encodeURIComponent(result.sku)}`)}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#C8102E] py-2.5 text-[13px] font-bold text-white"
            >
              <Package className="size-4" /> Buka di Inventory
            </button>
            <button type="button" onClick={() => setResult(null)} className="rounded-lg border border-[#E8E8E8] px-4 text-[13px] font-semibold">
              Tutup
            </button>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes wms-scanline {
          0%, 100% { transform: translateY(-80px); opacity: 0.4; }
          50% { transform: translateY(80px); opacity: 1; }
        }
        @keyframes wms-sheet-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
