import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ArrowRight } from "lucide-react";

/** Tombol member: primary (merah) / secondary (gelap ber-border), dengan state loading. */
export function MemberButton({
  variant = "primary",
  loading = false,
  loadingLabel = "Memproses…",
  showArrow = true,
  children,
  className,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
  loading?: boolean;
  loadingLabel?: string;
  showArrow?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`gm-btn ${variant === "primary" ? "gm-btn-primary" : "gm-btn-secondary"} ${className ?? ""}`}
    >
      {loading ? (
        <>
          <span className="gm-spinner" aria-hidden="true" />
          <span>{loadingLabel}</span>
        </>
      ) : (
        <>
          <span className="truncate">{children}</span>
          {showArrow ? <ArrowRight size={18} className="gm-btn-icon" aria-hidden="true" /> : null}
        </>
      )}
    </button>
  );
}
