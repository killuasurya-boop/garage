"use client";

// Portal Mitra — panduan foto produk di langkah "Foto & kirim".
// Contoh memakai SATU foto menu Garage asli; versi "hindari" dibuat dengan efek CSS (gelap/buram/terlalu jauh),
// jadi tidak ada aset tambahan. Plus cek otomatis foto yang dipilih mitra (hanya saran, tidak memblokir).

import Image from "next/image";
import { useEffect, useState } from "react";
import { Check, Crop, ImageIcon, Lightbulb, Sun, X } from "lucide-react";

import { photoQualityHints, type PhotoStats } from "@/lib/partner-product-submission";

const SAMPLE = "/menu-photos/cemilan-kentang-balado.webp";

const EXAMPLES: Array<{ key: string; good: boolean; label: string; imageClass: string; frameClass?: string }> = [
  { key: "good", good: true, label: "Terang, di tengah", imageClass: "" },
  { key: "dark", good: false, label: "Terlalu gelap", imageClass: "brightness-[0.28] saturate-50" },
  { key: "blur", good: false, label: "Buram", imageClass: "blur-[3px] scale-110" },
  { key: "far", good: false, label: "Terlalu jauh", imageClass: "scale-[0.42]", frameClass: "bg-[#5b5249]" },
];

const TIPS = [
  { icon: Sun, text: "Cahaya terang (siang / lampu putih), tanpa flash keras." },
  { icon: Crop, text: "Foto kotak, produk di tengah dan memenuhi ±70% bingkai." },
  { icon: ImageIcon, text: "Latar rapi. Tanpa tulisan harga, watermark, atau kolase." },
];

export function PhotoGuide({ compact }: { compact: boolean }) {
  const body = (
    <div>
      <ul className="grid grid-cols-4 gap-2" aria-label="Contoh foto produk">
        {EXAMPLES.map((example) => (
          <li key={example.key} className="min-w-0">
            <div className={`relative aspect-square overflow-hidden rounded-lg border-2 ${example.good ? "border-[#22c55e]" : "border-[#ff5a66]/70"} ${example.frameClass ?? "bg-black"}`}>
              <Image src={SAMPLE} alt="" fill sizes="96px" className={`object-cover ${example.imageClass}`} />
              <span
                className={`absolute top-1 left-1 grid size-5 place-items-center rounded-full ${example.good ? "bg-[#15803d] text-white" : "bg-[#b91c1c] text-white"}`}
                aria-hidden
              >
                {example.good ? <Check className="size-3.5" strokeWidth={3} /> : <X className="size-3.5" strokeWidth={3} />}
              </span>
            </div>
            <p className={`mt-1 text-center text-xs leading-tight font-semibold ${example.good ? "text-[#bbf7d0]" : "text-[#ffd0d4]"}`}>
              <span className="sr-only">{example.good ? "Contoh bagus: " : "Hindari: "}</span>
              {example.label}
            </p>
          </li>
        ))}
      </ul>
      <ul className="mt-3 grid gap-1.5 text-sm text-[#e4e4e8]">
        {TIPS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-2">
            <Icon className="mt-0.5 size-4 shrink-0 text-[#ffd08a]" aria-hidden /> {text}
          </li>
        ))}
      </ul>
    </div>
  );
  if (!compact) {
    return (
      <section aria-label="Contoh foto yang baik" className="rounded-xl border border-[#3a3a42] bg-[#1d1d23] p-3">
        <p className="mb-2 flex items-center gap-2 text-sm font-bold text-white">
          <Lightbulb className="size-4 text-[#ffd08a]" aria-hidden /> Contoh foto yang baik
        </p>
        {body}
      </section>
    );
  }
  // Sudah ada foto: panduan dilipat agar ringkasan & tombol kirim tetap dekat.
  return (
    <details className="group rounded-xl border border-[#3a3a42] bg-[#1d1d23] px-3 py-2">
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-[#e4e4e8] [&::-webkit-details-marker]:hidden">
        <Lightbulb className="size-4 text-[#ffd08a]" aria-hidden /> Lihat contoh foto yang baik
        <span className="ml-auto text-xs text-[#b8b8bf] group-open:hidden">Buka</span>
        <span className="ml-auto hidden text-xs text-[#b8b8bf] group-open:inline">Tutup</span>
      </summary>
      <div className="pt-2 pb-1">{body}</div>
    </details>
  );
}

/** Baca ukuran & kecerahan rata-rata foto di browser (dikecilkan ke 32×32, cepat & tanpa unggah). */
async function readPhotoStats(url: string): Promise<PhotoStats | null> {
  const img = new window.Image();
  img.decoding = "async";
  img.src = url;
  try {
    await img.decode();
  } catch {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { width: img.naturalWidth, height: img.naturalHeight, meanLuma: 128, p90Luma: 200 };
  ctx.drawImage(img, 0, 0, 32, 32);
  const { data } = ctx.getImageData(0, 0, 32, 32);
  const lumas: number[] = [];
  for (let i = 0; i < data.length; i += 4) lumas.push(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
  lumas.sort((a, b) => a - b);
  const meanLuma = lumas.reduce((sum, l) => sum + l, 0) / lumas.length;
  return { width: img.naturalWidth, height: img.naturalHeight, meanLuma, p90Luma: lumas[Math.floor(lumas.length * 0.9)] };
}

/** Saran untuk foto yang baru dipilih mitra. Tidak tampil apa pun bila foto sudah baik / belum ada. */
export function PhotoQualityNotice({ previewUrl }: { previewUrl: string | null }) {
  const [result, setResult] = useState<{ url: string; hints: string[] } | null>(null);
  useEffect(() => {
    if (!previewUrl) return;
    let cancelled = false;
    void readPhotoStats(previewUrl).then((stats) => {
      if (!cancelled) setResult({ url: previewUrl, hints: stats ? photoQualityHints(stats) : [] });
    });
    return () => {
      cancelled = true;
    };
  }, [previewUrl]);
  if (!previewUrl || result?.url !== previewUrl) return null;
  if (!result.hints.length) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm font-semibold text-[#bbf7d0]">
        <Check className="size-4 shrink-0" aria-hidden /> Foto terlihat bagus.
      </p>
    );
  }
  return (
    <div role="status" className="rounded-lg border border-[#f59e0b]/60 bg-[#2a1d0a] px-3 py-2 text-sm text-[#fde68a]">
      <p className="font-semibold text-[#ffe2b0]">Saran foto (tetap boleh dikirim):</p>
      <ul className="mt-1 grid list-disc gap-0.5 pl-5">
        {result.hints.map((hint) => (
          <li key={hint}>{hint}</li>
        ))}
      </ul>
    </div>
  );
}
