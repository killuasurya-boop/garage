import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | G A R A G E",
  description: "Ketentuan penggunaan layanan digital G A R A G E.",
  alternates: { canonical: "/legal/terms" },
};

export default function TermsOfServicePage() {
  return (
    <main className="min-h-screen bg-[#09090b] px-5 py-14 text-zinc-100 sm:px-8">
      <article className="mx-auto max-w-3xl">
        <p className="text-sm font-semibold uppercase text-red-500">G A R A G E</p>
        <h1 className="mt-3 text-4xl font-bold sm:text-5xl">Ketentuan Layanan</h1>
        <p className="mt-4 text-sm text-zinc-400">Berlaku sejak 25 Juni 2026</p>

        <div className="mt-10 space-y-8 text-base leading-7 text-zinc-300">
          <section>
            <h2 className="text-xl font-semibold text-white">Ruang lingkup</h2>
            <p className="mt-2">
              GARAGE OS adalah sistem internal untuk operasional, pemasaran, manajemen konten,
              persetujuan, penjadwalan, publikasi, dan analitik akun resmi G A R A G E.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white">Akun dan kewenangan</h2>
            <p className="mt-2">
              Pengguna wajib menjaga keamanan akun. Tindakan persetujuan dan publikasi hanya
              boleh dilakukan oleh peran yang memiliki izin marketing di GARAGE OS.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white">Publikasi konten</h2>
            <p className="mt-2">
              Sistem menolak publikasi konten yang belum berstatus approved. Pengguna tetap
              bertanggung jawab atas hak penggunaan media, kebenaran informasi, dan kepatuhan
              terhadap kebijakan setiap platform.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white">Ketersediaan layanan</h2>
            <p className="mt-2">
              Integrasi platform dapat berubah, dibatasi, atau dihentikan oleh penyedia API.
              GARAGE OS dapat menunda publikasi untuk mencegah duplikasi, kesalahan, atau akses
              tanpa persetujuan.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white">Kontak</h2>
            <p className="mt-2">
              Pertanyaan layanan dapat dikirim ke{" "}
              <a className="text-red-400 underline" href="mailto:garagetebingtinggi@gmail.com">
                garagetebingtinggi@gmail.com
              </a>
              .
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
