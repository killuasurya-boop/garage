"use client";

import Image from "next/image";
import Link from "next/link";
import { BellRing, Clock, LogIn, MapPin, UserRound, Wallet } from "lucide-react";

import { GARAGE_LOCATION } from "@/lib/garage-location";

// Header ringkas menu digital: logo, nomor meja, tombol bantuan & login dalam satu
// baris, lalu judul + strip info satu baris. Menu langsung terlihat di layar pertama.
export function OrderHeader({
  tableLabel,
  tableCode,
  dineIn,
  channelLabel,
  etaLabel,
  loginHref,
  memberName,
  onHelp,
}: {
  tableLabel: string;
  tableCode: string;
  dineIn: boolean;
  channelLabel: string;
  etaLabel: string;
  loginHref: string;
  memberName?: string | null;
  onHelp: () => void;
}) {
  return (
    <header className="pt-3">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="flex min-h-11 w-[132px] shrink-0 items-center sm:w-[168px]" aria-label="Kembali ke website Garage">
          <Image
            src="/garage-brand/logo-website.png"
            alt="Garage Coffee & Motor"
            width={1024}
            height={325}
            priority
            sizes="(max-width: 640px) 132px, 168px"
            className="h-auto w-full object-contain"
          />
        </Link>
        <div className="flex min-w-0 items-center gap-2">
          <div
            className="flex h-11 shrink-0 flex-col items-center justify-center rounded-md border border-garage-line-2 bg-garage-bg-2 px-2.5 leading-none"
            aria-label={dineIn ? tableLabel : channelLabel}
          >
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-garage-dim">
              {dineIn ? "Meja" : "Order"}
            </span>
            <span className="mt-0.5 font-mono text-base font-bold tabular-nums text-white">{tableCode}</span>
          </div>
          {dineIn ? (
            <button
              type="button"
              onClick={onHelp}
              className="garage-press inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-md border border-garage-line-2 bg-garage-bg-2 px-3 text-sm font-bold text-white transition-colors hover:border-garage-amber/70"
              aria-label={`Bantuan untuk ${tableLabel}`}
            >
              <BellRing className="size-4 text-garage-amber" aria-hidden />
              <span className="hidden min-[380px]:inline">Bantuan</span>
            </button>
          ) : null}
          <Link
            href={loginHref}
            className="garage-press inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-md border border-garage-line-2 bg-garage-bg-2 px-3 text-sm font-bold text-white transition-colors hover:border-garage-amber/70"
            aria-label={memberName ? `Member ${memberName}` : "Login member"}
          >
            {memberName ? (
              <UserRound className="size-4 text-garage-amber" aria-hidden />
            ) : (
              <LogIn className="size-4 text-garage-amber" aria-hidden />
            )}
            <span className="hidden max-w-[120px] truncate sm:inline">{memberName ?? "Login"}</span>
          </Link>
        </div>
      </div>

      <div className="mt-5">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-garage-amber">
          Menu Digital · {channelLabel}
        </p>
        <h1 className="garage-display mt-1.5 text-[clamp(28px,7.5vw,40px)] leading-[1.05] tracking-wide text-white">
          {dineIn ? `Pesan dari ${tableLabel}` : "Pesan untuk dibawa pulang"}
        </h1>
        <ul className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-garage-dim">
          <li className="inline-flex items-center gap-1.5">
            <Clock className="size-4 text-garage-amber" aria-hidden /> {etaLabel}
          </li>
          <li className="inline-flex items-center gap-1.5">
            <Wallet className="size-4 text-garage-amber" aria-hidden /> Tunai · QRIS · Transfer
          </li>
          <li>
            <a
              href={GARAGE_LOCATION.directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 underline-offset-4 transition-colors hover:text-white hover:underline"
            >
              <MapPin className="size-4 text-garage-amber" aria-hidden /> Rute ke GARAGE
            </a>
          </li>
        </ul>
      </div>
    </header>
  );
}
