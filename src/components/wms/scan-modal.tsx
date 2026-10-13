"use client";

import { useRef, useState } from "react";
import { Camera, X } from "lucide-react";

import { useCodeScanner } from "@/lib/use-code-scanner";
import { parseWmsScan } from "@/lib/wms-scan";

/** Modal scan barcode/QR (kamera: BarcodeDetector / jsQR) + fallback ketik manual / scanner USB. */
export function ScanModal({ onDetect, onCancel, title = "Scan Barcode / QR" }: { onDetect: (v: string) => void; onCancel: () => void; title?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manual, setManual] = useState("");
  // Label penerimaan "SKU|BATCH" → kirim SKU-nya saja ke pemanggil.
  const emit = (raw: string) => {
    const { code } = parseWmsScan(raw);
    if (code) onDetect(code);
  };
  const { error: err, engine } = useCodeScanner({ videoRef, enabled: true, onCode: emit });
  const detectRef = { current: emit };
  const supported = !err;

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-xl border border-[#E8E8E8] bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-[14px] font-bold text-[#111111]"><Camera className="size-4 text-[#C8102E]" /> {title}</p>
          <button type="button" onClick={onCancel} className="grid size-7 place-items-center rounded-md text-[#6B7280] hover:bg-[#F8F9FB]"><X className="size-4" /></button>
        </div>
        {supported && (
          <>
            <div className="overflow-hidden rounded-lg bg-black">
              <video ref={videoRef} playsInline muted className="h-52 w-full object-cover" />
            </div>
            <p className="mt-2 text-center text-[12px] text-[#6B7280]">{engine === "jsqr" ? "Arahkan kamera ke QR (barcode batang: ketik manual / scanner USB)." : "Arahkan kamera ke QR/barcode."}</p>
          </>
        )}
        {/* Fallback / alternatif: ketik SKU atau barcode manual */}
        <div className="mt-3 flex gap-2">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && manual.trim()) { detectRef.current(manual.trim()); } }}
            placeholder="atau ketik SKU / barcode"
            className="h-9 flex-1 rounded-md border border-[#E8E8E8] px-3 text-[13px] font-mono outline-none focus:border-[#C8102E]"
            autoFocus={!supported}
          />
          <button type="button" disabled={!manual.trim()} onClick={() => detectRef.current(manual.trim())} className="rounded-md bg-[#2F3136] px-3 text-[12px] font-semibold text-white hover:bg-black disabled:opacity-50">OK</button>
        </div>
        {err && <p className="mt-2 text-[12.5px] text-[#DC2626]">{err}</p>}
      </div>
    </div>
  );
}
