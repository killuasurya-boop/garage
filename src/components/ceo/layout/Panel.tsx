import type { ReactNode } from "react";

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-[color-mix(in_srgb,var(--garage-line)_78%,transparent)] bg-[var(--garage-bg-2)] p-5 shadow-[var(--garage-shadow-panel)] ${className}`}
    >
      {(title || actions) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <h3 className="font-[var(--garage-font-display)] text-sm font-black uppercase text-zinc-50">
                {title}
              </h3>
            ) : null}
            {subtitle ? <p className="mt-0.5 text-[11px] text-zinc-400">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </header>
      )}
      {children}
    </section>
  );
}
