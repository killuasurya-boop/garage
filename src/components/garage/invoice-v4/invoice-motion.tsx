"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { trackCxEvent } from "@/lib/cx-events";

/**
 * Reveal sinematik ringan (GSAP + ScrollTrigger) untuk elemen `.iv-reveal`, plus
 * event `invoice_viewed`. Konten TIDAK pernah disembunyikan tanpa JS: kelas
 * `iv-motion-ready` baru dipasang di sini, dan tidak dipasang saat reduced-motion.
 */
export function InvoiceMotion({ token }: { token: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  useEffect(() => {
    trackCxEvent(token, "invoice_viewed");
  }, [token]);

  // Kembali dari /member-login?next=… → catat login lalu bersihkan parameter.
  useEffect(() => {
    if (params.get("member") !== "login") return;
    trackCxEvent(token, "member_login_completed");
    router.replace(pathname, { scroll: false });
  }, [params, pathname, router, token]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.querySelector<HTMLElement>(".iv-root");
    if (!root) return;
    let cleanup = () => {};
    let cancelled = false;
    Promise.all([import("gsap"), import("gsap/ScrollTrigger")])
      .then(([{ gsap }, { ScrollTrigger }]) => {
        if (cancelled) return;
        gsap.registerPlugin(ScrollTrigger);
        root.classList.add("iv-motion-ready");
        const ctx = gsap.context(() => {
          const items = gsap.utils.toArray<HTMLElement>(".iv-reveal");
          ScrollTrigger.batch(items, {
            start: "top 92%",
            once: true,
            onEnter: (batch) =>
              gsap.to(batch, { opacity: 1, y: 0, duration: 0.55, ease: "power3.out", stagger: 0.07, overwrite: true }),
          });
          // Elemen yang sudah di viewport saat load: tampil berurutan cepat.
          gsap.to(
            items.filter((el) => el.getBoundingClientRect().top < window.innerHeight),
            { opacity: 1, y: 0, duration: 0.5, ease: "power3.out", stagger: 0.06 },
          );
        }, root);
        cleanup = () => {
          ctx.revert();
          root.classList.remove("iv-motion-ready");
        };
      })
      .catch(() => root.classList.remove("iv-motion-ready"));
    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  return null;
}
