"use client";

import { MoneyText } from "@/components/ds/money-text";
import { StateView, STATE_VIEW_KINDS } from "@/components/ds/state-view";
import { StatusPill } from "@/components/ds/status-pill";
import { contrastRatio, DESIGN_TOKENS, STATUS_TONE_TOKEN, token, WCAG_AA, type StatusTone } from "@/lib/design-tokens";

// U1 — registri hidup design system (PRD §24.6 governance): cek di sini sebelum membuat komponen baru.

const SECTION = "rounded-lg border border-white/10 bg-[var(--gos-bg-surface)] p-4";
const H2 = "font-[var(--garage-font-display)] text-sm font-black uppercase text-[var(--gos-text-primary)]";

function ratioLabel(value: number, min: number) {
  return `${value.toFixed(2)}:1 ${value >= min ? "✓" : "✗"}`;
}

export function DesignSystemGallery() {
  const surface = token("bg.surface").hex;
  const raised = token("bg.raised").hex;
  return (
    <div className="space-y-4" data-testid="design-system-gallery">
      <header>
        <h1 className="font-[var(--garage-font-display)] text-2xl font-black uppercase text-[var(--gos-text-primary)]">Design System · U1</h1>
        <p className="mt-1 text-sm text-[var(--gos-text-secondary)]">
          Token semantik & komponen dasar Garage OS (PRD §24, D-02 gelap). Kontras dihitung langsung — teks wajib ≥ 4.5:1, batas kontrol ≥ 3:1.
        </p>
      </header>

      <section className={SECTION}>
        <h2 className={H2}>Token warna</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase text-[var(--gos-text-secondary)]">
                <th className="px-2 py-1.5">Contoh</th>
                <th className="px-2 py-1.5">Token</th>
                <th className="px-2 py-1.5">CSS</th>
                <th className="px-2 py-1.5">Hex</th>
                <th className="px-2 py-1.5">Kontras di kartu / permukaan naik</th>
                <th className="px-2 py-1.5">Pemakaian</th>
              </tr>
            </thead>
            <tbody>
              {DESIGN_TOKENS.map((t) => {
                const min = t.group === "control" ? WCAG_AA.nonText : WCAG_AA.text;
                const checkable = t.group === "text" || t.group === "status" || t.group === "control";
                return (
                  <tr key={t.name} className="border-t border-white/5 align-top text-[var(--gos-text-primary)]">
                    <td className="px-2 py-1.5">
                      <span className="block size-6 rounded border border-white/20" style={{ background: t.hex }} aria-hidden="true" />
                    </td>
                    <td className="px-2 py-1.5 font-mono text-xs">{t.name}</td>
                    <td className="px-2 py-1.5 font-mono text-xs text-[var(--gos-text-secondary)]">{t.cssVar}</td>
                    <td className="px-2 py-1.5 font-mono text-xs">{t.hex}</td>
                    <td className="px-2 py-1.5 font-mono text-xs">
                      {checkable ? `${ratioLabel(contrastRatio(t.hex, surface), min)} · ${ratioLabel(contrastRatio(t.hex, raised), min)}` : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-xs text-[var(--gos-text-secondary)]">{t.use}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>StatusPill — ikon + teks</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {(Object.keys(STATUS_TONE_TOKEN) as StatusTone[]).map((tone) => (
            <StatusPill key={tone} tone={tone}>
              {{ success: "Sesuai", warning: "Menunggu verifikasi", danger: "Selisih kurang", info: "Informasi", neutral: "Draft" }[tone]}
            </StatusPill>
          ))}
        </div>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>MoneyText — rupiah</h2>
        <div className="mt-3 grid max-w-sm grid-cols-2 gap-x-4 gap-y-1 text-sm text-[var(--gos-text-secondary)]">
          <span>Kas seharusnya</span>
          <MoneyText value={2_066_000} align="right" />
          <span>Selisih</span>
          <MoneyText value={-16_000} signed align="right" />
          <span>Lebih</span>
          <MoneyText value={3_000} signed align="right" />
          <span>Belum ada</span>
          <MoneyText value={null} align="right" />
        </div>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>StateView — keadaan wajib layar kritis (§24.8)</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {STATE_VIEW_KINDS.map((state) => (
            <StateView key={state} state={state} compact onRetry={state === "error" || state === "stale" ? () => undefined : undefined} />
          ))}
        </div>
      </section>
    </div>
  );
}
