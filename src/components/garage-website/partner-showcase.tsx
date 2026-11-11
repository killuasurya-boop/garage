"use client";

// Media marketing mitra di halaman utama (id="mitra"): produk mitra pilihan Owner yang memenuhi syarat
// (partnerMarketingBlockers) + ajakan bergabung jadi mitra. Data dari /api/site/partner-products (tanpa HPP).
// Tanpa produk terpilih, section tetap tampil sebagai ajakan kemitraan agar tab "Mitra" di hero tidak buntu.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Handshake, Store } from "lucide-react";

import { PARTNER_MARKETING_RULES } from "@/lib/partner-hub-rules";

type PartnerProduct = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  imageUrl: string | null;
  partnerName: string;
  priceFrom: number;
  multiPrice: boolean;
  availableNow: boolean;
};

const rupiah = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const menuHref = (name: string) => `/order?${new URLSearchParams({ source: "qr_takeaway", campaign: "landing_mitra", q: name }).toString()}`;

export function PartnerShowcase() {
  const [products, setProducts] = useState<PartnerProduct[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/site/partner-products", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data?: { products?: PartnerProduct[] } } | null) => {
        if (!cancelled) setProducts(json?.data?.products ?? []);
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasProducts = Boolean(products && products.length);

  return (
    <section id="mitra" className="section-pad gw-partner" aria-labelledby="gw-partner-title">
      <div className="shell">
        <div className="gw-partner-head">
          <div>
            <p className="eyebrow gw-partner-eyebrow">
              <Handshake className="size-4" aria-hidden /> Mitra Garage
            </p>
            <h2 id="gw-partner-title" className="display gw-partner-title">
              <span>Produk</span> <span className="gw-partner-red">mitra pilihan.</span>
            </h2>
            <p className="gw-partner-lead">
              UMKM lokal terkurasi yang dijual di Garage Coffee. Pesan lewat waiter atau kasir, diantar ke meja bersama pesanan Anda.
            </p>
          </div>
          <Link href="/mitra" className="btn gw-partner-join">
            <span>Jadi Mitra Garage</span>
            <ArrowRight aria-hidden />
          </Link>
        </div>

        {products === null ? (
          <div className="gw-partner-grid" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="gw-partner-card gw-partner-skeleton" />
            ))}
          </div>
        ) : hasProducts ? (
          <ul className="gw-partner-grid">
            {products!.map((p) => (
              <li key={p.id} className="gw-partner-card">
                <a href={menuHref(p.name)} className="gw-partner-link" aria-label={`Lihat ${p.name} dari ${p.partnerName} di menu digital`}>
                  <span className="gw-partner-photo">
                    {p.imageUrl ? (
                      // Foto produk asli dari mitra (disetujui Owner).
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt={p.name} loading="lazy" decoding="async" />
                    ) : null}
                    <span className="gw-partner-badge">
                      <BadgeCheck className="size-3.5" aria-hidden /> Mitra resmi
                    </span>
                    <span className={`gw-partner-status ${p.availableNow ? "is-open" : "is-closed"}`}>{p.availableNow ? "Tersedia sekarang" : "Sedang tutup"}</span>
                  </span>
                  <span className="gw-partner-body">
                    <span className="gw-partner-brand">
                      <Store className="size-3.5" aria-hidden /> {p.partnerName}
                    </span>
                    <span className="gw-partner-name">{p.name}</span>
                    {p.description ? <span className="gw-partner-desc">{p.description}</span> : null}
                    <span className="gw-partner-foot">
                      <span className="gw-partner-price">
                        {p.multiPrice ? <small>mulai </small> : null}
                        {rupiah(p.priceFrom)}
                      </span>
                      <span className="gw-partner-cta">Lihat menu</span>
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <div className="gw-partner-empty">
            <p className="gw-partner-empty-title">Produk mitra segera hadir.</p>
            <p>Garage Coffee membuka kerja sama untuk UMKM makanan & minuman lokal. Produk yang lolos kurasi tampil di sini.</p>
          </div>
        )}

        <div className="gw-partner-rules">
          <p className="gw-partner-rules-title">Syarat produk mitra tampil di media marketing Garage</p>
          <ul>
            {PARTNER_MARKETING_RULES.map((rule) => (
              <li key={rule}>
                <BadgeCheck className="size-4" aria-hidden /> {rule}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
