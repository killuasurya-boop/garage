// Skeleton loading bertema Garage (asphalt/chrome/red) untuk route-level loading.tsx.
// Tampil instan saat Server Component berat (akses session/DB) sedang dirender,
// sehingga navigasi terasa cepat dan tidak "lelet".

export function GarageRouteLoading({ label = "Menyiapkan modul" }: { label?: string }) {
  return (
    <main className="min-h-screen bg-[#08080b] text-white">
      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* Header bar */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 animate-pulse rounded-md bg-white/10" />
            <div className="space-y-2">
              <div className="h-3 w-28 animate-pulse rounded bg-white/10" />
              <div className="h-2 w-20 animate-pulse rounded bg-white/[0.06]" />
            </div>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d11a2a]">
            {label}
          </p>
        </div>

        {/* KPI row */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-[#26262c] bg-white/[0.04] p-4"
            >
              <div className="h-2.5 w-16 animate-pulse rounded bg-white/10" />
              <div className="mt-3 h-6 w-24 animate-pulse rounded bg-white/[0.08]" />
              <div className="mt-2 h-2 w-12 animate-pulse rounded bg-white/[0.05]" />
            </div>
          ))}
        </div>

        {/* Content block */}
        <div className="mt-5 rounded-lg border border-[#26262c] bg-white/[0.03] p-4">
          <div className="h-3 w-40 animate-pulse rounded bg-white/10" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-8 w-8 animate-pulse rounded bg-white/[0.07]" />
                <div className="h-3 flex-1 animate-pulse rounded bg-white/[0.06]" />
                <div className="h-3 w-16 animate-pulse rounded bg-white/[0.06]" />
              </div>
            ))}
          </div>
        </div>

        {/* Progress hint */}
        <div className="mt-6 h-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-[#d11a2a]" />
        </div>
      </div>
    </main>
  );
}
