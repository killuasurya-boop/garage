"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, BellRing, Clock, LogIn, MapPin, UserRound, Wallet } from "lucide-react";

import { OrderHero3D } from "@/components/garage/order/order-hero-3d";
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
  staff,
}: {
  tableLabel: string;
  tableCode: string;
  dineIn: boolean;
  channelLabel: string;
  etaLabel: string;
  loginHref: string;
  memberName?: string | null;
  onHelp: () => void;
  /** Mode waiter (Pesankan): tombol kembali ke daftar meja + nama waiter, tanpa Bantuan/Login. */
  staff?: { name: string; backHref: string } | null;
}) {
  const secondaryButton =
    "garage-press inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-garage-line-2 px-3 text-sm font-semibold text-white transition-colors hover:border-garage-amber/70 hover:bg-white/[0.04]";

  return (
    <header className="pt-3">
      {/* Judul halaman untuk pembaca layar; tampilan visual memakai chip meja di bawah. */}
      <h1 className="sr-only">
        Menu digital Garage Coffee — {dineIn ? tableLabel : channelLabel}
      </h1>
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/"
          className="flex min-h-11 w-[124px] shrink-0 items-center sm:w-[160px]"
          aria-label="Kembali ke website Garage"
        >
          <Image
            src="/garage-brand/garage-coffee-logo.png"
            alt="Garage Coffee"
            width={1200}
            height={282}
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
          {staff ? (
            <>
              <span className="hidden max-w-[140px] truncate text-sm font-semibold text-garage-dim sm:inline">
                Waiter: <span className="text-white">{staff.name}</span>
              </span>
              <Link href={staff.backHref} className={secondaryButton} aria-label="Kembali ke daftar meja">
                <ArrowLeft className="size-4 text-garage-amber" aria-hidden />
                <span>Meja</span>
              </Link>
            </>
          ) : dineIn ? (
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
          {staff ? null : (
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
          )}
        </div>
      </div>

      {staff ? null : (
        // Pita sambutan gaya Argon (kartu bergradasi + potongan miring + bayangan lembut) dalam
        // palet Garage. Pendek (±96px) supaya daftar menu tetap terlihat di layar pertama HP.
        <div className="relative mt-3 overflow-hidden rounded-lg bg-gradient-to-br from-garage-bg-3 via-garage-bg-2 to-garage-red/25 shadow-[0_15px_35px_-12px_rgba(0,0,0,0.65),0_5px_15px_rgba(0,0,0,0.3)] ring-1 ring-garage-line-2 [clip-path:polygon(0_0,100%_0,100%_86%,0_100%)]">
          <div className="flex items-center gap-3 py-3 pr-1 pb-5 pl-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-garage-amber">Selamat datang di Garage Coffee</p>
              <p className="mt-0.5 break-words text-lg leading-tight font-bold text-white">
                {dineIn ? `Pesan dari ${tableLabel}` : `Pesan · ${channelLabel}`}
              </p>
            </div>
            <OrderHero3D className="size-20 shrink-0 sm:size-24" />
          </div>
        </div>
      )}

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
