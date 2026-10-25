import { CheckCircle2 } from "lucide-react";

export type AuthStatus =
  | { tone: "error"; message: string }
  | { tone: "info"; message: string }
  | { tone: "success"; message: string };

/** Pesan error/info/sukses auth member. Error memakai role="alert" agar dibacakan pembaca layar. */
export function AuthenticationStatus({ status }: { status: AuthStatus | null }) {
  if (!status) return null;
  if (status.tone === "success") {
    return (
      <div role="status" className="gm-status gm-status-success gm-success flex items-center gap-2.5">
        <CheckCircle2 size={18} className="shrink-0 text-[var(--gm-accent-hover)]" />
        <span>{status.message}</span>
      </div>
    );
  }
  return (
    <div
      role={status.tone === "error" ? "alert" : "status"}
      className={`gm-status ${status.tone === "error" ? "gm-status-error" : "gm-status-info"}`}
    >
      {status.message}
    </div>
  );
}
