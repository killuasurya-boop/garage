"use client";

import Image from "next/image";
import Link from "next/link";
import { BellRing, Clock, LogIn, MapPin, UserRound, Wallet } from "lucide-react";

import { GARAGE_LOCATION } from "@/lib/garage-location";

// Header ringkas menu digital: satu baris (logo · meja · bantuan · login) + satu baris
// info kecil. Menu sudah terlihat di layar pertama HP tanpa harus scroll.
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
  const secondaryButton =
    "garage-press inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-garage-line-2 px-3 text-sm font-semibold text-white transition-colors hover:border-garage-amber/70 hover:bg-white/[0.04]";

  return (
    <header className="pt-3">
      {/* Judul halaman untuk pembaca layar; tampilan visual memakai chip meja di bawah. */}
      <h1 className="sr-only">
        Menu digital Garage Coffee &amp; Motor — {dineIn ? tableLabel : channelLabel}
      </h1>
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/"
          className="flex min-h-11 w-[124px] shrink-0 items-center sm:w-[160px]"
          aria-label="Kembali ke website Garage"
        >
          <Image
            src="/garage-brand/logo-website.png"
            alt="Garage Coffee & Motor"
            width={1024}
            height={325}
            priority
            sizes="(max-width: 640px) 124px, 160px"
            className="h-auto w-full object-contain"
          />
        </Link>
        <div className="flex min-w-0 items-center gap-2">
          <div
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-md bg-garage-bg-2 px-3 ring-1 ring-garage-line-2"
            aria-label={dineIn ? tableLabel : channelLabel}
          >
            <span className="text-xs font-semibold text-garage-dim">{dineIn ? "Meja" : "Order"}</span>
            <span className="font-mono text-base font-bold tabular-nums text-white">{tableCode}</span>
          </div>
          {dineIn ? (
            <button
              type="button"
              onClick={onHelp}
              className={secondaryButton}
              aria-label={`Bantuan untuk ${tableLabel}`}
            >
              <BellRing className="size-4 text-garage-amber" aria-hidden />
              <span className="hidden min-[400px]:inline">Bantuan</span>
            </button>
          ) : null}
          <Link
            href={loginHref}
            className={`${secondaryButton} min-w-11 px-2.5 sm:px-3`}
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

      <ul className="mt-1 flex flex-wrap items-center gap-x-3 text-[13px] text-garage-dim">
        <li className="inline-flex items-center gap-1.5">
          <Clock className="size-3.5 text-garage-amber" aria-hidden /> {etaLabel}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <Wallet className="size-3.5 text-garage-amber" aria-hidden /> Tunai · QRIS · Transfer
        </li>
        <li>
          <a
            href={GARAGE_LOCATION.directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 underline-offset-4 transition-colors hover:text-white hover:underline"
          >
            <MapPin className="size-3.5 text-garage-amber" aria-hidden /> Rute
          </a>
        </li>
      </ul>
    </header>
  );
}
