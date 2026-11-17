/* eslint-disable @next/next/no-img-element -- logo unggahan (/garage-uploads) atau platform (/event), webp kecil. */
"use client";

import type { ReactNode } from "react";
import { AtSign, CheckCircle2, CircleDashed, Globe, Lock } from "lucide-react";

// Bantu Owner memahami "apa yang tampil di website" tanpa membuka beranda:
// - FormSection: bagian form dengan judul + tujuan singkat (publik vs internal dibedakan jelas).
// - TalentCardPreview / SponsorCardPreview: pratinjau kartu persis seperti di beranda GIGS.
// - ReadinessChips: kelengkapan (logo, Instagram, tagline) dengan ikon + teks, bukan warna saja.

export function FormSection({
  title,
  hint,
  tone = "public",
  children,
}: {
  title: string;
  hint: string;
  tone?: "public" | "internal" | "plain";
  children: ReactNode;
}) {
  const Icon = tone === "public" ? Globe : tone === "internal" ? Lock : null;
  const border = tone === "public" ? "border-amber-300/35 bg-amber-300/[0.04]" : tone === "internal" ? "border-white/10 bg-black/20" : "border-white/10";
  return (
    <fieldset className={`grid min-w-0 gap-3 rounded-lg border p-3 sm:col-span-2 ${border}`}>
      <legend className="flex items-center gap-1.5 px-1 text-sm font-bold text-zinc-50">
        {Icon ? <Icon size={15} className={tone === "public" ? "text-amber-300" : "text-zinc-400"} aria-hidden /> : null}
        {title}
      </legend>
      <p className="-mt-1 text-xs text-zinc-300">{hint}</p>
      {children}
    </fieldset>
  );
}

function LogoPlate({ src, name, wide = false }: { src: string | null; name: string; wide?: boolean }) {
  return (
    <div className={`flex ${wide ? "aspect-video" : "aspect-square"} w-full items-center justify-center overflow-hidden rounded bg-[#0a0a0a]`}>
      {src ? (
        <img src={src} alt="" className="size-full object-contain p-1.5" />
      ) : (
        <span className="px-2 text-center text-xs text-zinc-400">{name.trim() ? "Logo belum ada" : "Logo"}</span>
      )}
    </div>
  );
}

/** Kartu talent seperti di beranda GIGS. */
export function TalentCardPreview({
  name,
  kindLabel,
  tagline,
  instagram,
  logo,
  time,
  hidden,
}: {
  name: string;
  kindLabel: string;
  tagline: string;
  instagram: string;
  logo: string | null;
  time: string | null;
  hidden: boolean;
}) {
  return (
    <div className="grid gap-1.5" aria-label="Pratinjau kartu di website">
      <p className="text-xs font-semibold text-zinc-300">Pratinjau kartu di website</p>
      <div className={`grid w-40 gap-2 rounded border border-[rgba(225,6,19,0.45)] bg-[#141414] p-2.5 ${hidden ? "opacity-50" : ""}`}>
        <div className="flex items-center justify-between gap-1">
          <span className="font-mono text-[11px] tracking-widest text-[#ff2638]">#01</span>
          <span className="bg-[#ff2638] px-1.5 text-[11px] font-semibold uppercase text-black">{kindLabel}</span>
        </div>
        <LogoPlate src={logo} name={name} />
        <strong className="break-words text-base font-black uppercase leading-tight text-zinc-50">{name.trim() || "Nama talent"}</strong>
        {tagline.trim() ? <span className="-mt-1 break-words text-xs text-zinc-300">{tagline}</span> : null}
        {time ? <span className="text-xs text-zinc-200">{time} WIB</span> : null}
        {instagram.trim() ? (
          <span className="flex items-center gap-1 break-all font-mono text-[11px] text-amber-300">
            <AtSign size={11} aria-hidden /> {instagram.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/[/?#].*$/, "")}
          </span>
        ) : null}
      </div>
      {hidden ? <p className="text-xs text-amber-200">Tidak tampil di website (centang “Tampilkan di website” untuk menayangkan).</p> : null}
    </div>
  );
}

/** Kartu sponsor seperti di bagian "Didukung oleh". */
export function SponsorCardPreview({
  name,
  packageName,
  instagram,
  logo,
  hidden,
}: {
  name: string;
  packageName: string;
  instagram: string;
  logo: string | null;
  hidden: boolean;
}) {
  return (
    <div className="grid gap-1.5" aria-label="Pratinjau kartu sponsor di website">
      <p className="text-xs font-semibold text-zinc-300">Pratinjau di website</p>
      <div className={`grid w-44 gap-1.5 rounded border border-white/15 bg-[#141414] p-2.5 ${hidden ? "opacity-50" : ""}`}>
        <LogoPlate src={logo} name={name} wide />
        <strong className="break-words text-sm font-bold text-zinc-50">{name.trim() || "Nama sponsor"}</strong>
        {packageName.trim() ? <span className="justify-self-start border border-amber-300/60 px-1.5 font-mono text-[11px] uppercase text-amber-300">{packageName}</span> : null}
        {instagram.trim() ? (
          <span className="flex items-center gap-1 break-all font-mono text-[11px] text-amber-300">
            <AtSign size={11} aria-hidden /> {instagram.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/[/?#].*$/, "")}
          </span>
        ) : null}
      </div>
      {hidden ? <p className="text-xs text-amber-200">Belum tampil di website — centang “Tampilkan di website”.</p> : null}
    </div>
  );
}

/** Kelengkapan tampil di website: ikon + teks (tidak bergantung warna). */
export function ReadinessChips({ items }: { items: Array<{ label: string; ok: boolean }> }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Kelengkapan untuk website">
      {items.map((item) => (
        <li
          key={item.label}
          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs ${
            item.ok ? "border-emerald-400/40 text-emerald-200" : "border-amber-300/50 text-amber-200"
          }`}
        >
          {item.ok ? <CheckCircle2 size={12} aria-hidden /> : <CircleDashed size={12} aria-hidden />}
          {item.label}
          <span className="sr-only">{item.ok ? "sudah ada" : "belum ada"}</span>
          {!item.ok ? <span aria-hidden> belum</span> : null}
        </li>
      ))}
    </ul>
  );
}
