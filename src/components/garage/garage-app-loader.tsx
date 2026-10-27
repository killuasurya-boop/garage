"use client";

import dynamic from "next/dynamic";

import type { ModuleId } from "@/lib/garage-data";

type GarageAppProps = {
  initialModule?: ModuleId;
};

type GarageLoginProps = {
  returnTo?: string;
  variant?: "os" | "pos";
  initialEmail?: string;
  includeOwnerPreset?: boolean;
};

// Kerangka sewarna halaman login (hitam + strip merah) supaya tidak ada kedipan saat modul dimuat.
function LoginLoadingFallback() {
  return (
    <main className="flex min-h-[100svh] items-center justify-center border-t-4 border-[#d11a2a] bg-[#08080a] px-4 text-white">
      <div className="w-full max-w-[388px] overflow-hidden rounded-md border border-[#2a2a30] bg-[#0d0d10]">
        <div className="h-[76px] bg-[linear-gradient(110deg,#d11a2a_0%,#a3141f_60%,#8b0f1a_100%)]" />
        <div className="space-y-3 p-5" role="status" aria-label="Memuat halaman masuk">
          <div className="h-12 animate-pulse rounded-md bg-white/[0.06]" />
          <div className="h-12 animate-pulse rounded-md bg-white/[0.06]" />
          <div className="h-12 rounded-md bg-[#d11a2a]/60" />
        </div>
      </div>
    </main>
  );
}

function GarageShellFallback({ title }: { title: string }) {
  return (
    <main className="min-h-screen bg-[#08080b] text-white">
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-sm rounded-md border border-[#34343c] bg-white/[0.04] p-5 shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d11a2a]">
            Garage
          </p>
          <h1 className="mt-3 text-xl font-semibold">{title}</h1>
          <div className="mt-5 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-[#d11a2a]" />
          </div>
          <p className="mt-4 text-sm text-zinc-400">
            Menyiapkan modul tanpa memblokir render awal.
          </p>
        </div>
      </div>
    </main>
  );
}

// Aya (pet pengingat kerja) dimuat terpisah agar tidak memperberat shell.
const AyaStaffCompanionDynamic = dynamic(
  () => import("./aya/aya-staff-companion").then((module) => module.AyaStaffCompanion),
  { ssr: false },
);

const GarageAppDynamic = dynamic<GarageAppProps>(
  () => import("./garage-app").then((module) => module.GarageApp),
  {
    ssr: false,
    loading: () => <GarageShellFallback title="Membuka Garage OS" />,
  },
);

// Login memuat modul ringan sendiri (bukan seluruh garage-app) supaya form cepat tampil di HP.
const GaragePosLoginDynamic = dynamic<GarageLoginProps>(
  () => import("./login/garage-login").then((module) => module.GarageLogin),
  {
    ssr: false,
    loading: () => <LoginLoadingFallback />,
  },
);

export function LazyGarageApp(props: GarageAppProps) {
  return (
    <>
      <GarageAppDynamic {...props} />
      <AyaStaffCompanionDynamic />
    </>
  );
}

export function LazyGaragePosLogin(props: GarageLoginProps) {
  return <GaragePosLoginDynamic {...props} />;
}
