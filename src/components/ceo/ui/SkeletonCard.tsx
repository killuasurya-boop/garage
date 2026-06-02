export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-lg border border-white/10 bg-[var(--garage-bg-2)] p-5 ${className}`}>
      <div className="h-3 w-1/3 rounded-full bg-white/10" />
      <div className="mt-4 h-7 w-2/3 rounded-md bg-white/10" />
      <div className="mt-6 h-12 w-full rounded-md bg-white/5" />
      <div className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <style jsx>{`
        @keyframes shimmer { 100% { transform: translateX(100%); } }
      `}</style>
    </div>
  );
}
