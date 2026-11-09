"use client";

import { useEffect, useRef } from "react";
import { ArrowUpRight, Code2, MonitorSmartphone, Palette, Workflow } from "lucide-react";
import "./surya-showcase.css";

const PORTFOLIO_URL = "https://suryadev.click/";
const CONTACT_URL =
  "https://wa.me/6281396186251?text=" +
  encodeURIComponent(
    "Halo Surya, saya melihat Garage OS melalui website Garage Coffee. Saya ingin konsultasi pembuatan website atau sistem bisnis."
  );

const services = [
  { icon: Code2, label: "Custom Software" },
  { icon: MonitorSmartphone, label: "Website & Web App" },
  { icon: Palette, label: "UI/UX & Branding" },
  { icon: Workflow, label: "Business Systems" },
];

const stations = [
  { id: "waiter", eyebrow: "01 / INPUT", title: "Waiter", meta: "Pencatatan order" },
  { id: "pos", eyebrow: "02 / TRANSACTION", title: "POS", meta: "Kasir & pembayaran" },
  { id: "bar", eyebrow: "03 / PRODUCTION", title: "Bar", meta: "Minuman" },
  { id: "kitchen", eyebrow: "04 / PRODUCTION", title: "Kitchen", meta: "Makanan" },
  { id: "owner", eyebrow: "05 / INSIGHT", title: "Owner", meta: "Monitoring bisnis" },
];

export function SuryaShowcase() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = sectionRef.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;
    let context: { revert: () => void } | null = null;

    void (async () => {
      try {
        const [{ gsap }, { ScrollTrigger }] = await Promise.all([
          import("gsap"),
          import("gsap/ScrollTrigger"),
        ]);
        if (cancelled || !root) return;

        gsap.registerPlugin(ScrollTrigger);
        context = gsap.context(() => {
          gsap.fromTo(
            ".surya-showcase__enter",
            { opacity: 0, y: 36 },
            {
              opacity: 1,
              y: 0,
              duration: 0.85,
              stagger: 0.12,
              ease: "power3.out",
              scrollTrigger: {
                trigger: root,
                start: "top 78%",
                once: true,
              },
            }
          );
          gsap.to(".surya-showcase__scene", {
            yPercent: -4,
            rotateX: 3,
            ease: "none",
            scrollTrigger: {
              trigger: root,
              start: "top bottom",
              end: "bottom top",
              scrub: 0.8,
            },
          });
        }, root);
      } catch {
        // Konten dan CTA tetap dapat dipakai bila modul animasi tidak dimuat.
      }
    })();

    return () => {
      cancelled = true;
      context?.revert();
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      id="surya-dev"
      className="surya-showcase"
      aria-labelledby="surya-showcase-title"
    >
      <div className="surya-showcase__beam" aria-hidden="true" />
      <div className="shell surya-showcase__container">
        <div className="surya-showcase__copy">
          <div className="surya-showcase__eyebrow surya-showcase__enter">
            <span className="surya-showcase__indicator" aria-hidden="true" />
            THE TECHNOLOGY BEHIND GARAGE COFFEE
          </div>

          <h2 id="surya-showcase-title" className="surya-showcase__title surya-showcase__enter">
            KOPI DI DEPAN.
            <span>TEKNOLOGI DI BALIKNYA.</span>
          </h2>

          <p className="surya-showcase__intro surya-showcase__enter">
            Garage OS adalah ekosistem digital yang dibangun untuk membantu
            operasional Garage Coffee, dari pencatatan pesanan oleh waiter,
            kasir, hingga alur produksi Bar dan Kitchen.
          </p>

          <div className="surya-showcase__signature surya-showcase__enter">
            <span className="surya-showcase__signature-line" aria-hidden="true" />
            <span>
              CONCEPT · DESIGN · DEVELOPMENT
              <strong>Created by SURYA.dev — Surya</strong>
            </span>
          </div>

          <div className="surya-showcase__services surya-showcase__enter" aria-label="Layanan SURYA.dev">
            {services.map(({ icon: Icon, label }) => (
              <span className="surya-showcase__service" key={label}>
                <Icon size={15} strokeWidth={1.7} aria-hidden="true" />
                {label}
              </span>
            ))}
          </div>

          <div className="surya-showcase__actions surya-showcase__enter">
            <a
              className="surya-showcase__button surya-showcase__button--primary"
              href={CONTACT_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Konsultasi pembuatan website dan sistem bisnis dengan SURYA.dev melalui WhatsApp"
            >
              Konsultasikan Proyek Anda
              <ArrowUpRight size={19} aria-hidden="true" />
            </a>
            <a
              className="surya-showcase__button surya-showcase__button--secondary"
              href={PORTFOLIO_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Lihat SURYA.dev
              <ArrowUpRight size={18} aria-hidden="true" />
            </a>
          </div>
          <p className="surya-showcase__contact surya-showcase__enter">
            WhatsApp Marketing: <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer">0813-9618-6251</a>
          </p>
        </div>

        <div className="surya-showcase__visual surya-showcase__enter">
          <div className="surya-showcase__scene" aria-hidden="true">
            <div className="surya-showcase__grid" />
            <div className="surya-showcase__ring surya-showcase__ring--one" />
            <div className="surya-showcase__ring surya-showcase__ring--two" />
            <div className="surya-showcase__laser surya-showcase__laser--one" />
            <div className="surya-showcase__laser surya-showcase__laser--two" />
            <div className="surya-showcase__core">
              <span>OPERATIONS / 2026</span>
              <strong>GARAGE <em>OS</em></strong>
              <small>CONNECTED BUSINESS SYSTEM</small>
              <i />
            </div>
            {stations.map((station) => (
              <div
                className={"surya-showcase__station surya-showcase__station--" + station.id}
                key={station.id}
              >
                <span>{station.eyebrow}</span>
                <strong>{station.title}</strong>
                <small>{station.meta}</small>
              </div>
            ))}
          </div>
          <div className="surya-showcase__visual-caption">
            <span>GARAGE OS / SYSTEM ARCHITECTURE</span>
            <span>Ilustrasi alur, bukan data real-time</span>
          </div>
        </div>
      </div>
    </section>
  );
}
