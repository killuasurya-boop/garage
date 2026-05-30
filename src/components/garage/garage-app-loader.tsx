"use client";

import dynamic from "next/dynamic";

import type { ModuleId } from "@/lib/garage-data";

type GarageAppProps = {
  initialModule?: ModuleId;
};

type GarageLoginProps = {
  returnTo?: string;
  variant?: "os" | "pos";
};

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

const GarageAppDynamic = dynamic<GarageAppProps>(
  () => import("./garage-app").then((module) => module.GarageApp),
  {
    ssr: false,
    loading: () => <GarageShellFallback title="Membuka Garage OS" />,
  },
);

const GaragePosLoginDynamic = dynamic<GarageLoginProps>(
  () => import("./garage-app").then((module) => module.GaragePosLogin),
  {
    ssr: false,
    loading: () => <GarageShellFallback title="Membuka login POS" />,
  },
);

export function LazyGarageApp(props: GarageAppProps) {
  return <GarageAppDynamic {...props} />;
}

export function LazyGaragePosLogin(props: GarageLoginProps) {
  return <GaragePosLoginDynamic {...props} />;
}
