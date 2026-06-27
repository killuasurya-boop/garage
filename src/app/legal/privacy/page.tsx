import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | G A R A G E",
  description: "Kebijakan privasi layanan digital G A R A G E.",
  alternates: { canonical: "/legal/privacy" },
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[#09090b] px-5 py-14 text-zinc-100 sm:px-8">
      <article className="mx-auto max-w-3xl">
        <p className="text-sm font-semibold uppercase text-red-500">G A R A G E</p>
        <h1 className="mt-3 text-4xl font-bold sm:text-5xl">Kebijakan Privasi</h1>
        <p className="mt-4 text-sm text-zinc-400">Berlaku sejak 25 Juni 2026</p>

        <div className="mt-10 space-y-8 text-base leading-7 text-zinc-300">
          <section>
            <h2 className="text-xl font-semibold text-white">Data yang diproses</h2>
            <p className="mt-2">
              GARAGE OS memproses data akun staf, materi konten, jadwal, status persetujuan,
              token otorisasi platform, tautan publikasi, dan metrik performa yang diperlukan
              untuk menjalankan operasional serta pemasaran G A R A G E.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white">Penggunaan data platform</h2>
            <p className="mt-2">
              Akses TikTok, Instagram, YouTube, dan layanan pihak ketiga hanya digunakan untuk
              akun resmi G A R A G E. Konten tidak dipublikasikan sebelum mendapat persetujuan
              pengguna yang berwenang di GARAGE OS.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white">Keamanan</h2>
            <p className="mt-2">
              Token OAuth disimpan dalam bentuk terenkripsi. Akses dibatasi berdasarkan peran,
              aktivitas penting dicatat, dan kredensial tidak ditampilkan kepada pengguna
              aplikasi.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white">Penyimpanan dan penghapusan</h2>
            <p className="mt-2">
              Data disimpan selama masih diperlukan untuk operasional, audit, atau kewajiban
              hukum. Pemilik akun dapat meminta pemutusan integrasi dan penghapusan token
              platform.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white">Kontak</h2>
            <p className="mt-2">
              Pertanyaan privasi dapat dikirim ke{" "}
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
