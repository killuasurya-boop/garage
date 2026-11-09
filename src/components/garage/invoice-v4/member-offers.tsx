"use client";

import { useState } from "react";
import { BadgeCheck, Bell, BellOff, Check, Copy, Crown, Gift, Lock, Star, Ticket } from "lucide-react";

import type { CustomerOffer, TierBenefit, TierShowcase } from "@/lib/customer-offers";
import { trackCxEvent } from "@/lib/cx-events";

const BENEFIT_ICON = { points: Star, redeem: Ticket, "member-promo": Gift, welcome: BadgeCheck } as const;

export function BenefitIcon({ benefitKey, className }: { benefitKey: string; className?: string }) {
  const Icon = BENEFIT_ICON[benefitKey as keyof typeof BENEFIT_ICON] ?? Gift;
  return <Icon className={className} aria-hidden />;
}

function shortDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
}

/** Satu voucher/promo nyata. Kode hanya untuk member yang berhak. */
export function EligibleVoucherCard({ offer, token }: { offer: CustomerOffer; token: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <article className="iv-offer flex h-full flex-col gap-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="iv-pill" data-tone={offer.kind === "welcome" ? "awaiting" : offer.kind === "personal" ? "outline" : "muted"}>
          {offer.kind === "welcome" ? "Welcome Reward" : offer.kind === "personal" ? "Voucher Pribadi" : "Promo Member"}
        </span>
        {offer.expiringSoon ? <span className="text-[12px] font-semibold text-[var(--iv-amber)]">Segera berakhir</span> : null}
      </div>
      <h3 className="iv-heading text-[17px] leading-snug">{offer.benefit}</h3>
      <p className="line-clamp-2 text-[13px] text-[var(--iv-text-2)]">{offer.title}</p>
      <ul className="mt-auto grid gap-0.5 text-[12px] text-[var(--iv-text-3)]">
        {offer.terms.map((term) => (
          <li key={term}>• {term}</li>
        ))}
      </ul>
      {offer.code ? (
        <button
          type="button"
          className="iv-code mt-1 self-start"
          onClick={async () => {
            trackCxEvent(token, "voucher_viewed");
            try {
              await navigator.clipboard.writeText(offer.code ?? "");
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            } catch {
              /* kode tetap terlihat */
            }
          }}
          aria-label={`Salin kode ${offer.code}`}
        >
          {offer.code}
          {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        </button>
      ) : (
        <p className="mt-1 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--iv-text-2)]">
          <Lock className="size-3.5" aria-hidden /> Kode tampil setelah daftar / masuk member
        </p>
      )}
      {offer.endsAt && !offer.terms.some((term) => term.startsWith("Berlaku")) ? (
        <p className="text-[12px] text-[var(--iv-text-3)]">Berlaku s/d {shortDate(offer.endsAt)}</p>
      ) : null}
    </article>
  );
}

/** SECTION 08 — Smart promotions: hanya voucher aktif & layak (getEligibleCustomerOffers). */
export function SmartOfferCarousel({ offers, token, title }: { offers: CustomerOffer[]; token: string; title: string }) {
  if (offers.length === 0) return null;
  return (
    <section aria-labelledby="iv-offers-title" className="grid gap-3">
      <h2 id="iv-offers-title" className="iv-card-title">
        <Gift className="size-5" aria-hidden />
        {title}
      </h2>
      <div className="iv-scroll-x" role="list">
        {offers.map((offer) => (
          <div role="listitem" key={offer.id}>
            <EligibleVoucherCard offer={offer} token={token} />
          </div>
        ))}
      </div>
    </section>
  );
}

const TIER_TONE: Record<string, string> = {
  Silver: "#d7d8dc",
  Gold: "#f0c65a",
  Platinum: "#b38cf0",
  Ultra: "#ff6b74",
};

/** Tangga level + benefit TERVERIFIKASI per level (tanpa janji fitur yang belum ada). */
export function MemberTierBenefits({ tiers, currentTier }: { tiers: TierShowcase[]; currentTier?: string | null }) {
  const [active, setActive] = useState(currentTier ?? "Silver");
  const tier = tiers.find((entry) => entry.level === active) ?? tiers[0];
  if (!tier) return null;
  return (
    <section className="iv-card iv-card-pad" aria-labelledby="iv-tier-title">
      <h2 id="iv-tier-title" className="iv-card-title">
        <Crown className="size-5" aria-hidden />
        Keuntungan Member
      </h2>
      <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Level member">
        {tiers.map((entry) => (
          <button
            key={entry.level}
            type="button"
            role="tab"
            aria-selected={entry.level === tier.level}
            className="iv-tier-tab"
            onClick={() => setActive(entry.level)}
          >
            {entry.level}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-3 grid gap-2">
        <p className="text-[13px] text-[var(--iv-text-2)]">
          <span className="font-bold" style={{ color: TIER_TONE[tier.level] }}>
            {tier.level}
          </span>{" "}
          · {tier.requirement}
        </p>
        {tier.benefits.map((benefit) => (
          <BenefitRow key={benefit.key} benefit={benefit} />
        ))}
        {tier.requiresApproval ? (
          <p className="text-[12px] text-[var(--iv-text-3)]">Ultra tidak naik otomatis — perlu persetujuan Owner.</p>
        ) : null}
      </div>
    </section>
  );
}

export function BenefitRow({ benefit }: { benefit: TierBenefit }) {
  return (
    <div className="iv-subcard flex items-start gap-3 p-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--iv-red-soft)] text-[var(--iv-red-text)]">
        <BenefitIcon benefitKey={benefit.key} className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[14px] font-bold text-[var(--iv-cream)]">{benefit.title}</p>
        <p className="text-[12.5px] leading-5 text-[var(--iv-text-2)]">{benefit.detail}</p>
      </div>
    </div>
  );
}

/** Izin promosi WhatsApp — terpisah dari pendaftaran, bisa dicabut kapan saja. */
export function CampaignConsentControl({
  granted,
  onChange,
}: {
  granted: boolean;
  onChange: (granted: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="iv-subcard flex items-start gap-3 p-3">
      {granted ? (
        <Bell className="mt-0.5 size-4 shrink-0 text-[var(--iv-green-text)]" aria-hidden />
      ) : (
        <BellOff className="mt-0.5 size-4 shrink-0 text-[var(--iv-text-3)]" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-[var(--iv-cream)]">
          Info promo via WhatsApp: {granted ? "Aktif" : "Tidak aktif"}
        </p>
        <p className="text-[12px] text-[var(--iv-text-3)]">Pesan transaksi tetap dikirim. Maks. 1 promo per minggu.</p>
        {error ? <p className="mt-1 text-[12px] text-[var(--iv-red-text)]">{error}</p> : null}
      </div>
      <button
        type="button"
        className="iv-btn iv-btn-secondary iv-btn-sm shrink-0"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await onChange(!granted);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Gagal menyimpan.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {granted ? "Berhenti" : "Aktifkan"}
      </button>
    </div>
  );
}
