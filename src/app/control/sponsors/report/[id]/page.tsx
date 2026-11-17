import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PrintButton } from "@/components/ceo/sponsors/print-button";
import { getSponsor, SponsorError } from "@/lib/event-sponsor-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Laporan Sponsor — Garage Coffee", robots: { index: false, follow: false } };

const idr = (value: number) => `Rp${Math.round(value).toLocaleString("id-ID")}`;
const tanggal = (value: string | null) =>
  value ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(value.length === 10 ? `${value}T12:00:00+07:00` : value)) : "—";

// GIGS EO #12: laporan pertanggungjawaban ke sponsor (Owner). Dicetak / disimpan PDF lewat browser.
// Isi hanya untuk sponsor itu: dukungan uang yang sudah diterima, sponsor barang, dan kewajiban + foto bukti.
export default async function SponsorReportPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) redirect("/login?next=/control/sponsors");
  const { id } = await params;
  let sponsor: Awaited<ReturnType<typeof getSponsor>>;
  try {
    sponsor = await getSponsor(id, session.data);
  } catch (error) {
    if (error instanceof SponsorError) notFound();
    throw error;
  }
  const obligations = sponsor.obligations;
  const done = obligations.filter((o) => o.doneAt);
  return (
    <main className="sponsor-report mx-auto max-w-3xl bg-white px-6 py-8 text-zinc-900 print:max-w-none print:p-0">
      {/* Aturan cetak global (globals.css) menyembunyikan semua isi kecuali struk `.garage-print-root` di kertas 58 mm.
          Laporan ini dokumen A4: tampilkan isinya dan pakai ukuran kertas A4. */}
      <style>{`@media print {
  @page { size: A4; margin: 14mm; }
  .sponsor-report, .sponsor-report * { visibility: visible !important; }
  .sponsor-report { position: static; width: auto; }
}`}</style>
      <div className="mb-6 flex items-start justify-between gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- logo resmi di atas kertas putih */}
        <img src="/garage-brand/garage-coffee-logo-dark.png" alt="Garage Coffee" className="h-14 w-auto object-contain" />
        <PrintButton />
      </div>
      <h1 className="text-2xl font-black uppercase">Laporan Sponsor</h1>
      <p className="mt-1 text-sm text-zinc-600">
        {sponsor.eventName}
        {sponsor.eventDate ? ` · ${tanggal(sponsor.eventDate)}` : ""}
      </p>

      <section className="mt-6 grid gap-1 text-sm">
        <p>
          <strong>Sponsor:</strong> {sponsor.name}
          {sponsor.packageName ? ` — paket ${sponsor.packageName}` : ""}
        </p>
        <p>
          <strong>No.:</strong> {sponsor.sponsorNo}
        </p>
      </section>

      <section className="mt-6">
        <h2 className="border-b border-zinc-300 pb-1 text-base font-bold">Dukungan</h2>
        <table className="mt-2 w-full text-sm">
          <tbody>
            <tr>
              <td className="py-1">Nilai kesepakatan</td>
              <td className="py-1 text-right tabular-nums">{idr(sponsor.money.agreed)}</td>
            </tr>
            <tr>
              <td className="py-1">Sudah diterima</td>
              <td className="py-1 text-right tabular-nums">{idr(sponsor.money.paid)}</td>
            </tr>
            {sponsor.inkind.map((k) => (
              <tr key={k.id}>
                <td className="py-1">
                  Barang: {k.item} ({k.qty} {k.unit})
                </td>
                <td className="py-1 text-right tabular-nums">± {idr(k.estimatedValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-6">
        <h2 className="border-b border-zinc-300 pb-1 text-base font-bold">
          Kewajiban kepada sponsor ({done.length}/{obligations.length} terpenuhi)
        </h2>
        {!obligations.length ? <p className="mt-2 text-sm text-zinc-600">Tidak ada kewajiban tercatat.</p> : null}
        <ol className="mt-2 space-y-4">
          {obligations.map((o) => (
            <li key={o.id} className="break-inside-avoid text-sm">
              <p className="font-semibold">
                {o.title} — {o.doneAt ? `terpenuhi ${tanggal(o.doneAt)}` : "belum terpenuhi"}
              </p>
              {o.doneNote ? <p className="text-zinc-600">{o.doneNote}</p> : null}
              {o.hasProof ? (
                // eslint-disable-next-line @next/next/no-img-element -- bukti non-publik, disajikan route Owner
                <img src={`/api/sponsors/obligations/${o.id}/proof`} alt={`Bukti: ${o.title}`} className="mt-2 max-h-72 w-auto rounded border border-zinc-200 object-contain" />
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <p className="mt-8 text-xs text-zinc-500">Dicetak {tanggal(new Date().toISOString())} · Garage Coffee, Tebing Tinggi.</p>
    </main>
  );
}
