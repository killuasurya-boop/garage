"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CheckCircle2, Crown, Info, Link2, Sparkles } from "lucide-react";

import { PremiumMembershipCard } from "@/components/garage/premium-membership-card";
import type { InvoiceMemberContext } from "@/lib/customer-experience-service";
import type { TierProgress } from "@/lib/customer-offers";
import { trackCxEvent } from "@/lib/cx-events";
import { normalizeMemberLevel } from "@/lib/member-types";
import { BenefitIcon, CampaignConsentControl, MemberTierBenefits, SmartOfferCarousel } from "./member-offers";
import { MemberRegisterSheet } from "./member-register-sheet";

type Context = InvoiceMemberContext & { sessionExpired?: boolean };

const rupiah = (value: number) => `Rp${Math.round(value).toLocaleString("id-ID")}`;

/**
 * SECTION 06–08 — Membership, kartu digital, smart promotions.
 * Sumber data: /api/invoice/[token]/member-context (sesi member, bukan token invoice).
 */
export function InvoiceMembership({ token, customerName }: { token: string; customerName: string | null }) {
  const [context, setContext] = useState<Context | null>(null);
  const [failed, setFailed] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [celebrate, setCelebrate] = useState<{ name: string } | null>(null);
  const refreshed = useRef(false);
  const offerSeen = useRef(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const loginHref = `/member-login?next=${encodeURIComponent(`/invoice/${token}?member=login`)}`;

  const load = useCallback(async () => {
    const fetchContext = async () => {
      const res = await fetch(`/api/invoice/${token}/member-context`, { cache: "no-store", credentials: "include" });
      const json = (await res.json()) as { data?: Context };
      if (!res.ok || !json.data) throw new Error("context");
      return json.data;
    };
    try {
      let data = await fetchContext();
      // Sesi kedaluwarsa tapi refresh token ada → perbarui sekali, lalu muat ulang.
      if (data.sessionExpired && !refreshed.current) {
        refreshed.current = true;
        const refresh = await fetch("/api/member/auth/refresh", { method: "POST", credentials: "include" }).catch(() => null);
        if (refresh?.ok) data = await fetchContext();
      }
      setContext(data);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [token]);

  useEffect(() => {
    // Pola repo: tunda ke task berikutnya (setState tidak sinkron di dalam effect).
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  // member_offer_viewed saat bagian ini benar-benar terlihat (sekali).
  useEffect(() => {
    const node = sectionRef.current;
    if (!node || !context || context.viewer !== "guest") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !offerSeen.current) {
          offerSeen.current = true;
          trackCxEvent(token, "member_offer_viewed");
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [context, token]);

  async function updateConsent(granted: boolean) {
    const res = await fetch("/api/member/consent", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ granted, source: "invoice_member" }),
    });
    if (!res.ok) throw new Error("Gagal menyimpan izin promosi.");
    await load();
  }

  if (failed) {
    return (
      <div className="iv-card iv-card-pad text-[13px] text-[var(--iv-text-2)] iv-no-print">
        Info member belum bisa dimuat.{" "}
        <button type="button" className="font-semibold text-[var(--iv-cream)] underline" onClick={() => void load()}>
          Coba lagi
        </button>
      </div>
    );
  }

  if (!context) {
    return (
      <div className="iv-card iv-card-pad grid gap-3 iv-no-print" aria-busy="true" aria-label="Memuat info member">
        <div className="iv-skeleton h-5 w-2/3" />
        <div className="iv-skeleton h-24 w-full" />
        <div className="iv-skeleton h-11 w-full" />
      </div>
    );
  }

  return (
    <div ref={sectionRef} className="grid gap-4 iv-no-print">
      <AnimatePresence>{celebrate ? <RewardSuccessAnimation key="ok" name={celebrate.name} onDone={() => setCelebrate(null)} /> : null}</AnimatePresence>

      {context.viewer === "member" && context.member ? (
        <MemberCardPanel context={context} token={token} onConsentChange={updateConsent} />
      ) : (
        <MembershipInvitation
          benefits={context.benefits}
          loginHref={loginHref}
          onRegister={() => {
            trackCxEvent(token, "member_register_clicked");
            setRegisterOpen(true);
          }}
        />
      )}

      <SmartOfferCarousel
        offers={context.offers}
        token={token}
        title={context.viewer === "member" ? "Voucher & Promo Anda" : "Promo Spesial Member"}
      />

      <MemberTierBenefits tiers={context.tiers} currentTier={context.member?.tier ?? null} />

      <MemberRegisterSheet
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        token={token}
        defaultName={customerName}
        loginHref={loginHref}
        onRegistered={(member) => {
          setRegisterOpen(false);
          setCelebrate({ name: member.name });
          void load();
        }}
      />
    </div>
  );
}

/** State A — Guest: undangan member dengan benefit terverifikasi saja. */
function MembershipInvitation({
  benefits,
  loginHref,
  onRegister,
}: {
  benefits: Context["benefits"];
  loginHref: string;
  onRegister: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      className="iv-card iv-card-pad overflow-hidden"
      aria-labelledby="iv-member-title"
      initial={reduce ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="iv-eyebrow flex items-center gap-1.5 text-[var(--iv-red-text)]">
            <Sparkles className="size-3.5" aria-hidden /> Nikmati lebih banyak keuntungan
          </p>
          <h2 id="iv-member-title" className="iv-heading mt-1.5 text-[21px] leading-tight">
            <Crown className="mb-1 mr-1.5 inline size-5 text-[var(--iv-red)]" aria-hidden />
            Jadi Member Garage Coffee
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-5 text-[var(--iv-text-2)]">Gratis. Poin & voucher untuk kunjungan berikutnya.</p>
        </div>
        <MemberCardPreview />
      </div>

      <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
        {benefits.map((benefit, index) => (
          <motion.li
            key={benefit.key}
            className="iv-subcard flex flex-col items-center gap-1.5 p-2.5 text-center"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 + index * 0.06, duration: 0.35 }}
            title={benefit.detail}
          >
            <span className="grid size-9 place-items-center rounded-full bg-[var(--iv-red-soft)] text-[var(--iv-red-text)]">
              <BenefitIcon benefitKey={benefit.key} className="size-4" />
            </span>
            <span className="text-[12.5px] font-semibold leading-tight text-[var(--iv-cream)]">{benefit.title}</span>
          </motion.li>
        ))}
      </ul>

      <button type="button" className="iv-btn iv-btn-primary iv-btn-block mt-4 min-h-12 text-[15px]" onClick={onRegister}>
        Daftar Member Gratis
        <ArrowRight className="size-4" aria-hidden />
      </button>
      <p className="mt-3 text-center text-[13.5px] text-[var(--iv-text-2)]">
        Sudah punya akun?{" "}
        <Link href={loginHref} className="font-bold text-[var(--iv-red-text)] hover:underline">
          Masuk Member
        </Link>
      </p>
      <p className="mt-2 text-center text-[12px] text-[var(--iv-text-3)]">Tidak wajib — invoice & tracking tetap bisa dipakai tanpa daftar.</p>
    </motion.section>
  );
}

/** Pratinjau kartu Silver: tanpa nama, kode, poin, atau QR palsu. */
export function MemberCardPreview({ tier = "Silver" }: { tier?: string }) {
  return (
    <div className="iv-preview-card hidden w-[132px] shrink-0 p-3 min-[400px]:block" data-tier={tier} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- logo resmi, object-contain */}
      <img src="/garage-brand/garage-coffee-logo-dark.png" alt="" className="h-5 w-auto object-contain opacity-90" />
      <p className="absolute bottom-6 left-3 font-[var(--iv-font-heading)] text-[15px] font-extrabold uppercase leading-none tracking-wide">
        {tier}
      </p>
      <p className="absolute bottom-2.5 left-3 text-[8px] font-bold uppercase tracking-[0.2em] opacity-80">Member</p>
    </div>
  );
}

/** State C — member login: kartu ASLI, poin, progres, voucher, izin promosi. */
function MemberCardPanel({
  context,
  token,
  onConsentChange,
}: {
  context: Context;
  token: string;
  onConsentChange: (granted: boolean) => Promise<void>;
}) {
  const member = context.member!;
  const reduce = useReducedMotion();
  const [side, setSide] = useState<"front" | "back">("front");
  const progress = member.progress;
  return (
    <section className="iv-card iv-card-pad" aria-labelledby="iv-card-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="iv-card-title" className="iv-card-title">
          <Crown className="size-5" aria-hidden />
          Hai, {member.name.split(" ")[0]}
        </h2>
        <span className="iv-pill" data-tone="outline">
          {member.tier} Member
        </span>
      </div>

      <motion.div
        className="mx-auto mt-4 w-full max-w-[360px]"
        initial={reduce ? false : { opacity: 0, rotateX: 18, y: 24 }}
        animate={{ opacity: 1, rotateX: 0, y: 0 }}
        transition={{ duration: 0.7, ease: [0.2, 0.7, 0.2, 1] }}
        style={{ transformPerspective: 900 }}
        onClick={() => trackCxEvent(token, "member_card_opened")}
      >
        <PremiumMembershipCard
          data={{
            name: member.name,
            memberId: member.memberCode ?? "",
            tier: normalizeMemberLevel(member.tier),
            membershipSince: member.membershipSince,
            validThru: member.expiresAt,
            points: member.points,
          }}
          side={side}
          onSideChange={setSide}
          flippable
          interactive
          expired={member.expired}
          showQrButton
          ariaLabel={`Kartu member ${member.tier} ${member.name}`}
        />
      </motion.div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="iv-subcard p-3">
          <p className="text-[12px] text-[var(--iv-text-3)]">Poin Anda</p>
          <p className="iv-money text-[22px] text-[var(--iv-cream)]">{member.points.toLocaleString("id-ID")}</p>
          {member.pointsValue > 0 ? <p className="text-[12px] text-[var(--iv-text-3)]">≈ {rupiah(member.pointsValue)}</p> : null}
        </div>
        <div className="iv-subcard p-3">
          <p className="text-[12px] text-[var(--iv-text-3)]">Voucher aktif</p>
          <p className="iv-money text-[22px] text-[var(--iv-cream)]">{context.offers.filter((offer) => offer.code).length}</p>
        </div>
      </div>

      <MemberLoyaltyProgress progress={progress} />

      <div className="mt-3 grid gap-2">
        {context.invoiceLinked ? (
          <p className="flex items-start gap-2 text-[13px] text-[var(--iv-green-text)]">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            Transaksi ini tercatat di akun member Anda (poin dihitung setelah lunas).
          </p>
        ) : (
          <p className="flex items-start gap-2 text-[13px] text-[var(--iv-text-2)]">
            <Link2 className="mt-0.5 size-4 shrink-0 text-[var(--iv-text-3)]" aria-hidden />
            Transaksi ini belum terhubung ke akun Anda. Tunjukkan QR member ke kasir saat bayar agar poin tercatat.
          </p>
        )}
        {context.marketingConsent ? (
          <CampaignConsentControl granted={context.marketingConsent.granted} onChange={onConsentChange} />
        ) : null}
        <Link href="/member" className="iv-btn iv-btn-secondary iv-btn-block">
          Buka Halaman Member
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}

/** Progres level dari belanja lunas 12 bulan (aturan naik level yang berlaku). */
function MemberLoyaltyProgress({ progress }: { progress: TierProgress }) {
  if (!progress.next || !progress.target) {
    return (
      <p className="mt-3 flex items-center gap-2 text-[13px] text-[var(--iv-text-2)]">
        <Info className="size-4 shrink-0 text-[var(--iv-text-3)]" aria-hidden />
        Anda di level tertinggi yang bisa dicapai otomatis.
      </p>
    );
  }
  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="font-semibold text-[var(--iv-cream)]">Menuju {progress.next}</span>
        <span className="text-[var(--iv-text-2)]">{progress.percent}%</span>
      </div>
      <div className="iv-progress mt-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
        <span style={{ width: `${progress.percent}%` }} />
      </div>
      <p className="mt-1 text-[12px] text-[var(--iv-text-3)]">
        Belanja lunas {rupiah(progress.remaining)} lagi dalam 12 bulan untuk naik ke {progress.next}.
      </p>
    </div>
  );
}

/** Konfirmasi setelah pendaftaran BERHASIL di server (bukan sebelum). */
function RewardSuccessAnimation({ name, onDone }: { name: string; onDone: () => void }) {
  const reduce = useReducedMotion();
  useEffect(() => {
    const id = window.setTimeout(onDone, 4200);
    return () => window.clearTimeout(id);
  }, [onDone]);
  return (
    <motion.div
      role="status"
      className="iv-card iv-card-pad flex items-center gap-3 border-[rgb(34_197_94/0.45)]"
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35 }}
    >
      <motion.span
        className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--iv-green-soft)] text-[var(--iv-green-text)]"
        initial={reduce ? false : { scale: 0.3, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 18, delay: 0.1 }}
      >
        <CheckCircle2 className="size-6" aria-hidden />
      </motion.span>
      <div className="min-w-0">
        <p className="iv-heading text-[16px]">Pendaftaran berhasil!</p>
        <p className="text-[13px] text-[var(--iv-text-2)]">Selamat datang, {name.split(" ")[0]}. Kartu & reward Anda ada di bawah.</p>
      </div>
    </motion.div>
  );
}
