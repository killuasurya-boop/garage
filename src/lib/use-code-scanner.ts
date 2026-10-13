"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

const NATIVE_FORMATS = ["qr_code", "code_128", "ean_13", "ean_8", "code_39", "upc_a", "upc_e"];

/**
 * Scanner kamera bersama: BarcodeDetector bawaan (QR + barcode) bila ada,
 * selain itu jsQR (QR saja — mis. Chrome Windows). Memindai terus-menerus
 * (bukan berhenti di hasil pertama); hasil yang sama diabaikan 2 detik.
 */
export function useCodeScanner(input: {
  videoRef: RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  onCode: (code: string) => void;
}) {
  const { videoRef, enabled } = input;
  const onCodeRef = useRef(input.onCode);
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<"native" | "jsqr" | null>(null);

  useEffect(() => {
    onCodeRef.current = input.onCode;
  }, [input.onCode]);

  useEffect(() => {
    if (!enabled) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    let last = { code: "", at: 0 };
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera api");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const video = videoRef.current;
        if (stopped || !video) return;
        video.srcObject = stream;
        await video.play();
        const Detector = (window as any).BarcodeDetector;
        let native: any = null;
        if (Detector) {
          try {
            const supported: string[] = (await Detector.getSupportedFormats?.()) ?? NATIVE_FORMATS;
            native = new Detector({ formats: NATIVE_FORMATS.filter((f) => supported.includes(f)) });
          } catch {
            native = null;
          }
        }
        const jsQR = native ? null : (await import("jsqr")).default;
        setEngine(native ? "native" : "jsqr");
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const tick = async () => {
          if (stopped) return;
          const current = videoRef.current;
          if (current && current.readyState >= 2) {
            let code = "";
            try {
              if (native) {
                const codes = await native.detect(current);
                code = codes[0]?.rawValue ?? "";
              } else if (jsQR && ctx && current.videoWidth) {
                // Perkecil frame supaya ringan di tablet.
                const scale = Math.min(1, 640 / current.videoWidth);
                canvas.width = Math.round(current.videoWidth * scale);
                canvas.height = Math.round(current.videoHeight * scale);
                ctx.drawImage(current, 0, 0, canvas.width, canvas.height);
                const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
                code = jsQR(image.data, image.width, image.height)?.data ?? "";
              }
            } catch {
              // frame gagal dibaca — lanjut frame berikutnya
            }
            const now = Date.now();
            if (code && (code !== last.code || now - last.at > 2000)) {
              last = { code, at: now };
              onCodeRef.current(code);
            }
          }
          timer = window.setTimeout(tick, 220);
        };
        void tick();
      } catch {
        setError("Kamera tidak bisa dibuka. Izinkan akses kamera, atau ketik / scan dengan scanner USB.");
      }
    })();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [enabled, videoRef]);

  return { error, engine };
}
