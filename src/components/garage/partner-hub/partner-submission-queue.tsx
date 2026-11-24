"use client";

// Antrean "Pengajuan produk mitra" untuk Owner/Manajer (produk mandiri dari Portal Mitra).
// - variant "dashboard": ringkas di Dashboard (maks 4 item + tombol ke Kelola Mitra).
// - variant "desk": kartu penuh di Partner Hub → Kelola Mitra, tombol "Periksa" membuka detail mitra & produknya.
// Semua waktu ditampilkan dalam WIB.

import Link from "next/link";
import { AlertTriangle, ArrowRight, Clock3, ImageOff, PackagePlus, Undo2 } from "lucide-react";

import { isSubmissionOverdue, SUBMISSION_REVIEW_TARGET_HOURS, submissionAgeLabel, submissionTimeWib } from "@/lib/partner-product-submission";

export type SubmissionItem = {
  linkId: string;
  code: string;
  status: string | null;
  submittedAt: string | null;
  submissionNote: string | null;
  reviewNote: string | null;
  partnerId: string;
  partnerName: string;
  name: string;
  category: string;
  imageUrl: string | null;
  variantCount: number;
  sellPrice: number;
  unitCost: number;
};

export type SubmissionQueue = { pending: number; revision: number; overdue: number; oldestSubmittedAt: string | null; items: SubmissionItem[] };

const rp = (n: number) => `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(n))}`;

/** Tautan ke Kelola Mitra yang langsung membuka mitra & menyorot produknya. */
export const submissionHref = (item: Pick<SubmissionItem, "partnerId" | "linkId">) =>
  `/partners?tab=manage&partner=${encodeURIComponent(item.partnerId)}&product=${encodeURIComponent(item.linkId)}`;

export function SubmissionQueue({
  queue,
  variant,
  onReview,
}: {
  queue: SubmissionQueue;
  variant: "dashboard" | "desk";
  /** Desk: buka detail mitra di halaman yang sama (tanpa pindah halaman). */
  onReview?: (item: SubmissionItem) => void;
}) {
  const now = new Date();
  const pendingItems = queue.items.filter((item) => item.status === "pending");
  const revisionItems = queue.items.filter((item) => item.status === "revision");
  const shown = variant === "dashboard" ? pendingItems.slice(0, 4) : pendingItems;
  const hidden = queue.pending - shown.length;

  if (variant === "dashboard" && queue.pending === 0) return null;

  return (
    <section
      aria-labelledby={`psq-title-${variant}`}
      className={`rounded-xl border p-4 ${queue.overdue ? "border-[#ff5a66]/60 bg-[#1f1013]" : queue.pending ? "border-[#f5a742]/50 bg-[#1d170e]" : "border-[#34343c] bg-[#17171c]"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`psq-title-${variant}`} className="flex flex-wrap items-center gap-2 text-base font-bold text-white">
            <PackagePlus className="size-4 text-[#f5a742]" aria-hidden /> Pengajuan produk mitra
            <span className={`rounded-full px-2 py-0.5 text-xs font-black ${queue.pending ? "bg-[#d11a2a] text-white" : "bg-white/10 text-[#d4d4d8]"}`}>{queue.pending} menunggu</span>
          </h2>
          <p className="mt-0.5 text-sm text-[#d4d4d8]">
            {queue.pending
              ? `Produk baru dari Portal Mitra menunggu keputusan Owner. Target diperiksa ≤ ${SUBMISSION_REVIEW_TARGET_HOURS} jam.`
              : "Tidak ada pengajuan yang menunggu. Pengajuan baru dari Portal Mitra muncul di sini."}
          </p>
          {queue.overdue || (queue.oldestSubmittedAt && queue.pending > 1) ? (
            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-sm">
              {queue.overdue ? (
                <span className="inline-flex items-center gap-1.5 font-semibold text-[#ff8a95]">
                  <AlertTriangle className="size-4" aria-hidden /> {queue.overdue} lewat {SUBMISSION_REVIEW_TARGET_HOURS} jam
                </span>
              ) : null}
              {queue.oldestSubmittedAt && queue.pending > 1 ? (
                <span className="inline-flex items-center gap-1.5 text-[#e4e4e8]" title={submissionTimeWib(queue.oldestSubmittedAt)}>
                  <Clock3 className="size-4 text-[#ffd08a]" aria-hidden /> Pengajuan tertua: {submissionAgeLabel(queue.oldestSubmittedAt, now)}
                </span>
              ) : null}
              {queue.revision ? <span className="text-[#c8c8cf]">{queue.revision} dikembalikan ke mitra</span> : null}
            </p>
          ) : null}
        </div>
        {variant === "dashboard" ? (
          <Link
            href="/partners?tab=manage"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#d11a2a] px-3.5 text-sm font-bold text-white transition-colors hover:bg-[#e02434] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff8a94] motion-reduce:transition-none"
          >
            Periksa pengajuan <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </div>

      {shown.length ? (
        <ul className={`mt-3 grid gap-2 ${variant === "dashboard" ? "sm:grid-cols-2" : "lg:grid-cols-2"}`}>
          {shown.map((item) => (
            <SubmissionRow key={item.linkId} item={item} now={now} variant={variant} onReview={onReview} />
          ))}
        </ul>
      ) : null}
      {variant === "dashboard" && hidden > 0 ? (
        <p className="mt-2 text-sm text-[#d4d4d8]">
          +{hidden} pengajuan lain —{" "}
          <Link href="/partners?tab=manage" className="font-semibold text-[#ffb4bb] underline underline-offset-2">
            lihat semua
          </Link>
        </p>
      ) : null}

      {variant === "desk" && revisionItems.length ? (
        <details className="mt-3 rounded-lg border border-[#3a3a42] bg-black/20 px-3 py-2">
          <summary className="min-h-9 cursor-pointer content-center text-sm font-semibold text-[#e4e4e8]">
            <Undo2 className="mr-1.5 inline size-4 text-[#ff8a94]" aria-hidden />
            {revisionItems.length} dikembalikan ke mitra (menunggu perbaikan)
          </summary>
          <ul className="mt-2 grid gap-1.5 pb-1 text-sm">
            {revisionItems.map((item) => (
              <li key={item.linkId} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-t border-[#2a2a30] pt-1.5">
                <span className="min-w-0 break-words text-white">
                  <b>{item.name}</b> <span className="text-[#c8c8cf]">· {item.partnerName}</span>
                </span>
                {item.reviewNote ? <span className="min-w-0 break-words text-xs text-[#ffd0d4]">Catatan: {item.reviewNote}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function SubmissionRow({ item, now, variant, onReview }: { item: SubmissionItem; now: Date; variant: "dashboard" | "desk"; onReview?: (item: SubmissionItem) => void }) {
  const overdue = isSubmissionOverdue(item.submittedAt, now);
  const body = (
    <>
      {item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt="" className="size-12 shrink-0 rounded-lg border border-[#3a3a42] object-cover" />
      ) : (
        <span className="grid size-12 shrink-0 place-items-center rounded-lg border border-dashed border-[#4a4a52] text-[#b8b8bf]" aria-hidden>
          <ImageOff className="size-4" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block break-words font-bold leading-snug text-white">{item.name}</span>
        <span className="block break-words text-xs text-[#c8c8cf]">
          {item.partnerName} · {item.category}
        </span>
        <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs">
          <span className="whitespace-nowrap font-semibold tabular-nums text-[#f4f4f5]">
            {item.variantCount > 1 ? "mulai " : ""}
            {rp(item.sellPrice)}
          </span>
          <span className="whitespace-nowrap tabular-nums text-[#b8b8bf]">setor {rp(item.unitCost)}</span>
          <span className={`whitespace-nowrap font-semibold ${overdue ? "text-[#ff8a95]" : "text-[#ffd08a]"}`} title={submissionTimeWib(item.submittedAt)}>
            {submissionAgeLabel(item.submittedAt, now)}
          </span>
        </span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 self-center text-sm font-bold text-[#ffb4bb]">
        Periksa <ArrowRight className="size-4" aria-hidden />
      </span>
    </>
  );
  const cls = `flex w-full min-h-16 cursor-pointer items-start gap-3 rounded-lg border bg-black/25 p-2.5 text-left transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a66] motion-reduce:transition-none ${overdue ? "border-[#ff5a66]/50" : "border-[#3a3a42]"}`;
  return (
    <li>
      {variant === "desk" && onReview ? (
        <button type="button" onClick={() => onReview(item)} className={cls} aria-label={`Periksa ${item.name} dari ${item.partnerName}`}>
          {body}
        </button>
      ) : (
        <Link href={submissionHref(item)} className={cls} aria-label={`Periksa ${item.name} dari ${item.partnerName}`}>
          {body}
        </Link>
      )}
    </li>
  );
}
