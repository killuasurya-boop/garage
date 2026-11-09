"use client";

// Registri hidup Crystal V5 (/control/design-system): token + semua varian komponen dasar.
import { Armchair, Bell, Coffee, Home, ShoppingBag } from "lucide-react";
import { useState } from "react";

import { CRYSTAL_TOKENS } from "@/lib/crystal-tokens";

import { CrystalBadge, CrystalButton, CrystalCard, CrystalChip, CrystalIcon, CrystalSheet, CrystalSkeleton, StatusDot } from "./crystal";

const VARIANTS = ["default", "elevated", "active", "disabled", "error", "loading"] as const;

export function CrystalGallery() {
  const [sheet, setSheet] = useState(false);
  const [chip, setChip] = useState("Semua");
  return (
    <div className="gc-root space-y-6 rounded-2xl p-4 sm:p-6" data-testid="crystal-gallery">
      <header>
        <p className="gc-eyebrow">Garage Crystal V5</p>
        <h2 className="gc-display mt-2 text-3xl">
          Black Crystal <span className="gc-accent">Red Laser</span>
        </h2>
        <p className="gc-muted mt-2 text-sm">Satu bahasa visual untuk order, pilih meja, menu, member, dan sidebar.</p>
      </header>

      <section aria-label="Token">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {CRYSTAL_TOKENS.map((t) => (
            <div key={t.name} className="text-xs">
              <div className="h-12 rounded-xl border border-white/10" style={{ background: t.hex }} />
              <p className="mt-1 font-semibold">{t.name}</p>
              <p className="gc-muted font-mono">{t.hex}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Glass" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {VARIANTS.map((v) => (
          <CrystalCard key={v} variant={v} className="grid h-24 place-items-center text-sm font-semibold">
            {v}
          </CrystalCard>
        ))}
        <CrystalCard laser selected className="grid h-24 place-items-center text-sm font-semibold">
          selected + laser
        </CrystalCard>
      </section>

      <section aria-label="Tombol" className="flex flex-wrap items-center gap-3">
        <CrystalButton tone="primary">Pilih Meja</CrystalButton>
        <CrystalButton>Lihat Menu</CrystalButton>
        <CrystalButton tone="ghost">Ghost</CrystalButton>
        <CrystalButton tone="primary" loading>
          Memproses
        </CrystalButton>
        <CrystalButton disabled>Belum tersedia</CrystalButton>
        <CrystalButton tone="icon" aria-label="Notifikasi">
          <Bell className="size-5" />
        </CrystalButton>
        <CrystalButton onClick={() => setSheet(true)}>Buka sheet</CrystalButton>
      </section>

      <section aria-label="Chip & badge" className="flex flex-wrap items-center gap-2">
        {["Semua", "Tersedia", "Terisi", "Reservasi"].map((c) => (
          <CrystalChip key={c} active={chip === c} onClick={() => setChip(c)}>
            {c}
          </CrystalChip>
        ))}
        <CrystalBadge>Signature</CrystalBadge>
        <CrystalBadge tone="gold">Unggulan</CrystalBadge>
        <CrystalBadge tone="neutral">Belum tersedia</CrystalBadge>
      </section>

      <section aria-label="Status & ikon" className="flex flex-wrap items-center gap-4 text-sm">
        <StatusDot color="var(--gc-emerald)" label="Tersedia" />
        <StatusDot color="var(--gc-laser)" label="Terisi" />
        <StatusDot color="var(--gc-blue)" label="Reservasi" />
        <StatusDot color="var(--gc-amber)" label="Sedang dipilih" />
        {[Home, Coffee, Armchair, ShoppingBag].map((Icon, i) => (
          <CrystalIcon key={i} active={i === 0}>
            <Icon className="size-5" />
          </CrystalIcon>
        ))}
      </section>

      <section aria-label="Skeleton" className="grid grid-cols-3 gap-3">
        <CrystalSkeleton className="h-20" />
        <CrystalSkeleton className="h-20" />
        <CrystalSkeleton className="h-20" />
      </section>

      <CrystalSheet open={sheet} onClose={() => setSheet(false)} title="Contoh sheet">
        <p className="gc-display text-2xl">Meja 08</p>
        <p className="gc-muted mt-1 text-sm">Lantai 1 · Tersedia</p>
        <CrystalButton tone="primary" className="mt-4 w-full" onClick={() => setSheet(false)}>
          Tutup
        </CrystalButton>
      </CrystalSheet>
    </div>
  );
}
