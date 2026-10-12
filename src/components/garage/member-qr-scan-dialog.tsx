"use client";

import { Camera, Loader2, QrCode } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Scan QR kartu member (owner, Okt 2026) — syarat pakai poin di kasir.
 * Kamera: BarcodeDetector bawaan bila ada, selain itu jsQR (Chrome Windows
 * belum punya BarcodeDetector). Scanner USB/2D mengetik isi QR + Enter ke kolom.
 */
export function MemberQrScanDialog({
  open,
  busy,
  error,
  onDetect,
  onOpenChange,
}: {
  open: boolean;
  busy: boolean;
  error: string | null;
  onDetect: (payload: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const detectRef = useRef(onDetect);
  const busyRef = useRef(busy);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [manual, setManual] = useState("");

  useEffect(() => {
    detectRef.current = onDetect;
    busyRef.current = busy;
  }, [onDetect, busy]);

  useEffect(() => {
    if (!open || !cameraOn) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    let lastPayload = "";
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const Detector = (window as any).BarcodeDetector;
        const native = Detector ? new Detector({ formats: ["qr_code"] }) : null;
        const jsQR = native ? null : (await import("jsqr")).default;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const tick = async () => {
          if (stopped) return;
          const video = videoRef.current;
          if (video && video.readyState >= 2 && !busyRef.current) {
            let payload = "";
            try {
              if (native) {
                const codes = await native.detect(video);
                payload = codes[0]?.rawValue ?? "";
              } else if (jsQR && ctx && video.videoWidth) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                ctx.drawImage(video, 0, 0);
                const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
                payload = jsQR(image.data, image.width, image.height)?.data ?? "";
              }
            } catch {
              // frame gagal dibaca — coba frame berikutnya
            }
            if (payload && payload !== lastPayload) {
              lastPayload = payload;
              detectRef.current(payload);
            }
          }
          timer = window.setTimeout(tick, 250);
        };
        void tick();
      } catch {
        setCameraError("Kamera tidak bisa dibuka. Izinkan kamera di Chrome, atau pakai scanner/ketik kode member.");
        setCameraOn(false);
      }
    })();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [open, cameraOn]);

  function close(next: boolean) {
    if (!next) {
      setCameraOn(false);
      setManual("");
      setCameraError(null);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="border-[#34343c] bg-[#16161b] text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="size-5 text-[#f5a742]" />
            Scan QR member
          </DialogTitle>
          <DialogDescription className="text-[#c4c4cc]">
            Minta member menunjukkan QR di kartu / aplikasi member. Poin hanya bisa dipakai setelah QR terverifikasi.
          </DialogDescription>
        </DialogHeader>

        {cameraOn ? (
          <div className="overflow-hidden rounded-lg border border-[#34343c] bg-black">
            <video ref={videoRef} playsInline muted className="h-56 w-full object-cover" />
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="garage-press h-12 w-full border-[#f5a742]/50 text-[#ffd08a]"
            onClick={() => {
              setCameraError(null);
              setCameraOn(true);
            }}
          >
            <Camera className="mr-2 size-4" />
            Buka kamera
          </Button>
        )}

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (manual.trim()) onDetect(manual.trim());
          }}
        >
          <Input
            value={manual}
            onChange={(event) => setManual(event.target.value)}
            placeholder="Scanner QR / kode member"
            aria-label="Isi QR atau kode member"
            autoFocus
            className="h-11 border-[#4a4a54] bg-black/30 font-mono text-sm"
          />
          <Button type="submit" className="h-11 shrink-0 bg-[#d11a2a] px-4 hover:bg-[#b51624]" disabled={!manual.trim() || busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Verifikasi"}
          </Button>
        </form>

        {busy ? <p className="text-sm text-[#e4e4e7]">Memverifikasi QR…</p> : null}
        {error || cameraError ? (
          <p role="alert" className="rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 px-3 py-2 text-sm text-[#ffc9cb]">
            {error ?? cameraError}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
