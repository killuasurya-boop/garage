import Link from "next/link";
import type { ReactNode } from "react";

/** Permukaan kartu login member: eyebrow MEMBER ACCESS, judul, isi, footer legal. */
export function MemberLoginCard({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby="member-card-title"
      className="gm-card w-full px-0 py-2 md:px-14 md:pb-9 md:pt-12 lg:px-11 xl:px-[60px] xl:pt-14"
    >
      <p className="gm-eyebrow gm-card-eyebrow">Member Access</p>
      <h1
        id="member-card-title"
        className="gm-heading mt-6 text-[2.25rem] leading-[1.08] md:mt-6 md:text-[2.5rem]"
      >
        {title}
      </h1>
      <p className="gm-body mt-3 max-w-[30ch] text-[15px] md:mt-4 md:text-base">{description}</p>
      <div className="mt-8 md:mt-9">{children}</div>
      <div className="gm-divider mt-8" />
      <nav aria-label="Legal" className="mt-6 flex items-center justify-center gap-5">
        <Link href="/legal/privacy" className="gm-footer-link">
          Kebijakan Privasi
        </Link>
        <span aria-hidden="true" className="h-4 w-px bg-[var(--gm-border-strong)]" />
        <Link href="/legal/terms" className="gm-footer-link">
          Syarat &amp; Ketentuan
        </Link>
      </nav>
    </section>
  );
}
