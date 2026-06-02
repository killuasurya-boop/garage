export function GlowDot({ tone = "success", className = "" }: { tone?: "success" | "amber" | "red" | "chrome"; className?: string }) {
  const map = {
    success: "bg-[var(--garage-success)] shadow-[0_0_12px_color-mix(in_srgb,var(--garage-success)_70%,transparent)]",
    amber: "bg-[var(--garage-amber)] shadow-[0_0_12px_color-mix(in_srgb,var(--garage-amber)_70%,transparent)]",
    red: "bg-[var(--garage-red-bright)] shadow-[0_0_14px_color-mix(in_srgb,var(--garage-red-bright)_70%,transparent)]",
    chrome: "bg-[var(--garage-silver)] shadow-[0_0_10px_color-mix(in_srgb,var(--garage-silver)_50%,transparent)]",
  } as const;
  return (
    <span className={`relative inline-flex h-2 w-2 ${className}`}>
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:animate-none ${map[tone]}`} />
      <span className={`relative inline-flex h-2 w-2 rounded-full ${map[tone]}`} />
    </span>
  );
}
