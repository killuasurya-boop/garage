"use client";

import React, { useEffect, useRef, useState } from "react";
import { QrCode } from "lucide-react";

interface InvoiceQrProps {
  url: string;
  size?: number;
}

export function InvoiceQrCode({ url, size = 144 }: InvoiceQrProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    import("qrcode").then((qrcodeMod) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const baseUrl =
        typeof window !== "undefined" ? window.location.origin : "https://garage.id";
      const fullUrl = url.startsWith("http") ? url : `${baseUrl}${url}`;

      // qrcode's default export is toCanvas
      const toCanvas = (
        qrcodeMod.default as unknown as (
          canvas: HTMLCanvasElement,
          text: string,
          opts?: {
            width?: number;
            margin?: number;
            color?: { dark?: string; light?: string };
            errorCorrectionLevel?: string;
          }
        ) => Promise<unknown>
      );

      toCanvas(canvas, fullUrl, {
        width: size,
        margin: 1,
        color: {
          dark: "#111827",
          light: "#ffffff",
        },
        errorCorrectionLevel: "M",
      }).then(() => setLoaded(true)).catch(() => setLoaded(false));
    }).catch(() => setLoaded(false));
  }, [url, size]);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="rounded-md border border-[#34343c] bg-white p-2">
        {loaded ? (
          <canvas ref={canvasRef} width={size} height={size} className="block" />
        ) : (
          <div
            className="flex items-center justify-center"
            style={{ width: size, height: size }}
          >
            <QrCode
              className="text-gray-800"
              style={{ width: size * 0.5, height: size * 0.5 } as React.CSSProperties}
            />
          </div>
        )}
      </div>
      <span className="font-mono text-[9px] text-[#8f8f99]">Scan untuk tracking</span>
    </div>
  );
}