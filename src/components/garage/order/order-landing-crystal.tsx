"use client";

// Crystal V5 — landing /order (papan 02 + 04): pilih cara pesan. Alur tetap: onChoose(dine-in|takeaway|delivery)
// sama seperti OrderTypeChooser lama (self-order dipertahankan). Data unggulan = item menu asli (foto & harga nyata).
import { ArrowRight, Bike, Gem, Lock, MessageCircle, ShoppingBag, Timer, UtensilsCrossed, BookOpen } from "lucide-react";
import Image from "next/image";

import { CrystalCard, LaserBorder } from "@/components/crystal/crystal";

export type LandingFeatured = { id: string; name: string; imageUrl: string | null; price: number };

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

type Choice = "dine-in" | "takeaway" | "delivery";

export function OrderLandingCrystal({
  deliveryEnabled,
  deliveryNote,
  onChoose,
  featured = [],
  featuredLabel = "Unggulan",
  memberHref,
  memberName,
  onAskAya,
}: {
  deliveryEnabled: boolean;
  deliveryNote?: string | null;
  onChoose: (value: Choice) => void;
  featured?: LandingFeatured[];
  featuredLabel?: string;
  memberHref?: string;
  memberName?: string | null;
  onAskAya?: () => void;
}) {
  const services: Array<{
    value: Choice;
    icon: typeof UtensilsCrossed;
    title: string;
    hint: string;
    disabled: boolean;
    tone: "red" | "amber" | "steel";
  }> = [
    { value: "dine-in", icon: UtensilsCrossed, title: "Makan di Tempat", hint: "Pilih meja kosong dulu, lalu pesan dari meja.", disabled: false, tone: "red" },
    { value: "takeaway", icon: ShoppingBag, title: "Take Away", hint: "Pesan sekarang, ambil di kasir. Bayar dulu.", disabled: false, tone: "amber" },
    {
      value: "delivery",
      icon: Bike,
      title: "Delivery",
      hint: deliveryEnabled ? "Diantar kurir Garage. Bayar QRIS dulu." : deliveryNote || "Layanan antar saat ini belum tersedia.",
      disabled: !deliveryEnabled,
      tone: "steel",
    },
  ];

  return (
    <div
      className="gc-root fixed inset-0 z-[70] overflow-y-auto overscroll-contain gc-scroll"
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-landing-title"
      data-testid="order-landing"
    >
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-4 pb-[calc(24px+env(safe-area-inset-bottom))] pt-[calc(14px+env(safe-area-inset-top))] sm:px-6">
        <header className="flex items-center justify-between gap-3 py-2">
          <Image src="/garage-brand/garage-coffee-logo.png" alt="Garage Coffee" width={168} height={40} priority className="h-8 w-auto object-contain sm:h-9" />
          {memberHref ? (
            <a href={memberHref} className="gc-chip" data-testid="order-landing-member-chip">
              <Gem className="size-4 text-[var(--gc-laser-bright)]" aria-hidden />
              {memberName ? `Halo, ${memberName.split(" ")[0]}` : "Member"}
            </a>
          ) : null}
        </header>

        {/* Hero */}
        <section className="relative mt-2 grid items-center gap-2 md:grid-cols-[1.1fr_0.9fr] md:gap-6">
          <div className="gc-reveal relative z-[1] max-w-xl">
            <p className="gc-eyebrow flex items-center gap-3">
              Order di Garage Coffee <span className="h-px w-10 bg-[var(--gc-laser)]" aria-hidden />
            </p>
            <h1 id="order-landing-title" className="gc-display mt-3 text-[clamp(2.4rem,9vw,4.4rem)]">
              Mau pesan
              <br />
              untuk <span className="gc-accent">apa?</span>
            </h1>
            <p className="mt-3 max-w-md text-[15px] leading-6 text-[var(--gc-text-2)]">
              Pilih cara menikmati Garage Coffee yang paling sesuai dengan kebutuhanmu.
            </p>
          </div>
          <div className="relative mx-auto mt-5 w-full max-w-[420px] md:mt-0" aria-hidden>
            <div className="absolute inset-x-6 bottom-2 h-16 rounded-full bg-[radial-gradient(closest-side,rgb(255_38_56/0.45),transparent)] blur-xl" />
            <div className="gc-float relative overflow-hidden rounded-[28px] border border-white/10 shadow-[0_30px_60px_rgb(0_0_0/0.6)]">
              <Image
                src="/garage-brand/crystal/hero-iced-latte.webp"
                alt=""
                width={800}
                height={538}
                priority
                sizes="(min-width: 768px) 420px, 90vw"
                className="aspect-[16/10] h-auto w-full object-cover object-[50%_35%] md:aspect-auto"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgb(8_9_11/0.85))]" />
              <LaserBorder radius={28} />
            </div>
          </div>
        </section>

        {/* Keunggulan singkat */}
        <ul className="mt-5 grid grid-cols-3 gap-2 text-[12.5px] font-semibold text-[var(--gc-text-2)] sm:max-w-xl">
          {[
            { icon: Timer, label: "Cepat & praktis" },
            { icon: BookOpen, label: "Menu lengkap" },
            { icon: Gem, label: "Poin member" },
          ].map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-2">
              <Icon className="size-5 shrink-0 text-[var(--gc-cream)]" aria-hidden />
              <span className="leading-tight">{label}</span>
            </li>
          ))}
        </ul>

        {/* Pilihan layanan */}
        <section aria-label="Pilih cara pesan" className="mt-6 grid gap-3 md:grid-cols-3">
          {services.map((option, index) => {
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                disabled={option.disabled}
                onClick={() => onChoose(option.value)}
                data-testid={`order-type-${option.value}`}
                className="gc-glass gc-reveal flex min-h-[104px] w-full items-center gap-4 p-4 text-left disabled:cursor-not-allowed"
                data-interactive="true"
                data-variant={option.disabled ? "disabled" : option.tone === "red" ? "active" : "elevated"}
                aria-disabled={option.disabled || undefined}
                style={{ animationDelay: `${80 + index * 70}ms` }}
              >
                <span
                  className="grid size-14 shrink-0 place-items-center rounded-2xl border border-white/12"
                  style={{
                    background:
                      option.tone === "red"
                        ? "linear-gradient(160deg,#f0333a,#9b1218)"
                        : option.tone === "amber"
                          ? "linear-gradient(160deg,rgb(255 189 66/0.32),rgb(120 70 20/0.4))"
                          : "rgb(255 255 255 / 0.06)",
                  }}
                  aria-hidden
                >
                  <Icon className="size-7 text-white" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[19px] font-extrabold leading-tight text-white">{option.title}</span>
                  <span className="mt-1 block text-sm leading-5 text-[var(--gc-text-2)]">{option.hint}</span>
                </span>
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-full border border-white/20 bg-white/5"
                  aria-hidden
                >
                  {option.disabled ? <Lock className="size-4 text-[var(--gc-text-2)]" /> : <ArrowRight className="size-5 text-white" />}
                </span>
              </button>
            );
          })}
        </section>

        {/* Menu unggulan (data asli) */}
        {featured.length ? (
          <section aria-label={`Menu ${featuredLabel}`} className="mt-7">
            <div className="flex items-end justify-between gap-3">
              <h2 className="gc-display text-xl">
                Menu <span className="gc-accent">{featuredLabel}</span>
              </h2>
              <span className="text-xs font-semibold text-[var(--gc-text-2)]">Pilih cara pesan untuk mulai</span>
            </div>
            <ul className="gc-scroll mt-3 flex snap-x gap-3 overflow-x-auto pb-2">
              {featured.slice(0, 8).map((item) => (
                <li key={item.id} className="w-[148px] shrink-0 snap-start">
                  <CrystalCard className="overflow-hidden p-0">
                    <div className="relative aspect-square bg-[var(--gc-surface-2)]">
                      {item.imageUrl ? (
                        <Image src={item.imageUrl} alt="" fill sizes="148px" className="object-cover" />
                      ) : null}
                    </div>
                    <div className="p-2.5">
                      <p className="line-clamp-2 min-h-[2.5em] text-[13px] font-bold leading-tight text-white">{item.name}</p>
                      <p className="mt-1 text-sm font-extrabold tabular-nums text-[var(--gc-cream)]">{rupiah.format(item.price)}</p>
                    </div>
                  </CrystalCard>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Member + AYA */}
        <section className="mt-5 grid gap-3 md:grid-cols-2">
          {memberHref ? (
            <a
              href={memberHref}
              className="gc-glass flex min-h-[96px] items-center gap-4 overflow-hidden p-4"
              data-interactive="true"
              data-variant="active"
            >
              <span className="relative grid h-16 w-24 shrink-0 -rotate-6 place-items-center rounded-xl border border-white/15 bg-[linear-gradient(135deg,#1b1d21,#08090b_60%,#5c0d12)] shadow-[0_10px_24px_rgb(0_0_0/0.6)]" aria-hidden>
                <Image src="/garage-brand/garage-coffee-icon.png" alt="" width={28} height={28} className="object-contain" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-extrabold italic leading-tight text-white">
                  {memberName ? "Lihat kartu member" : "Gabung Member Garage"}
                </span>
                <span className="mt-1 block text-sm leading-5 text-[var(--gc-text-2)]">
                  {memberName ? "Poin, tier, dan riwayat transaksimu." : "Kumpulkan poin sesuai program yang berlaku."}
                </span>
              </span>
              <ArrowRight className="size-5 shrink-0 text-white" aria-hidden />
            </a>
          ) : null}
          {onAskAya ? (
            <button
              type="button"
              onClick={onAskAya}
              className="gc-glass flex min-h-[96px] items-center gap-4 p-4 text-left"
              data-interactive="true"
              data-variant="elevated"
            >
              <Image src="/garage-brand/aya/v5/aya-guiding.svg" alt="" width={64} height={64} className="size-16 shrink-0 object-contain" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-[var(--gc-text-2)]">Butuh bantuan?</span>
                <span className="block text-xl font-extrabold italic leading-tight text-white">
                  Tanya <span className="gc-accent">AYA</span>
                </span>
                <span className="block text-xs text-[var(--gc-text-2)]">Asisten Garage Coffee</span>
              </span>
              <MessageCircle className="size-6 shrink-0 text-[var(--gc-laser-bright)]" aria-hidden />
            </button>
          ) : null}
        </section>
      </div>
    </div>
  );
}
