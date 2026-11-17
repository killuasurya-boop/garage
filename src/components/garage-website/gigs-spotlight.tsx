/* eslint-disable @next/next/no-img-element -- aset resmi dilayani platform event (/event/...), bukan Next. */
"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, Clock3, MapPin, Mic2, Music2, Share2, ShieldCheck, Store, Users } from "lucide-react";

import { groupLineup, LINEUP_KIND_LABEL, lineupSummary } from "@/lib/gigs-lineup";
import type { GigsPromo } from "@/lib/gigs-promo";

// Section promosi utama GIGS di beranda (#gigs). Semua isi dari platform event:
// teks & lineup resmi (events.json), angka dana/target/minimal sponsor dari API event.
// Tidak ada angka atau nama penampil yang ditulis di sini.

const rupiah = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const rupiahShort = (n: number) =>
  n >= 1_000_000 ? `Rp${(n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} juta` : n >= 1000 ? `Rp${Math.round(n / 1000)} ribu` : rupiah(n);

function useDayLabel(promo: GigsPromo) {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    const compute = () => {
      const now = Date.now();
      const start = Date.parse(promo.startsAt);
      const end = Date.parse(promo.endsAt);
      if (promo.live || (now >= start && now <= end)) return setLabel("LIVE");
      const day = (t: number) => Math.floor((t + 7 * 3600000) / 86400000);
      const d = day(start) - day(now);
      setLabel(d <= 0 ? "HARI INI" : `H-${d}`);
    };
    compute();
    const t = window.setInterval(compute, 60_000);
    return () => window.clearInterval(t);
  }, [promo]);
  return label;
}

export function GigsSpotlight({ promo }: { promo: GigsPromo }) {
  const dayLabel = useDayLabel(promo);
  const lineupGroups = groupLineup(promo.promo.lineup);
  const lineupCounts = lineupSummary(lineupGroups);

  const date = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(promo.startsAt));
  const clock = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(promo.startsAt));
  const shareText = `${promo.name} — ${date}, ${clock} WIB di ${promo.venue ?? "Garage Coffee"}. Band lokal, stand-up, UMKM & komunitas. Cek & ajak temanmu:`;
  // Domain publik sama seperti JSON-LD beranda (bukan window.location, agar sama di server & klien).
  const publicBase = process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL?.startsWith("https://") ? process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL.replace(/\/$/, "") : "https://garagecoffee.id";
  const waShare = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${publicBase}${promo.url}`)}`;
  const fundPct = promo.fundPercent ?? 0;

  const roles = [
    {
      Icon: Users,
      kicker: "Penonton",
      title: "Datang & rayakan",
      copy: "Lihat lineup, jadwal tampil, dan status “sedang tampil” secara langsung di malam acara.",
      cta: "Lihat jadwal",
      href: promo.url,
    },
    {
      Icon: Store,
      kicker: "Sponsor & UMKM",
      title: "Pasang brand-mu",
      copy: promo.sponsorMin
        ? `Mulai ${rupiahShort(promo.sponsorMin)}. Semua nominal dapat hak promosi setara, dananya dicatat terbuka.`
        : "Semua nominal dapat hak promosi setara, dananya dicatat terbuka.",
      cta: "Daftar sponsor",
      href: promo.links.daftarSponsor,
    },
    {
      Icon: Mic2,
      kicker: "Band · Komika · Kreator",
      title: "Naik panggung",
      copy: "Band, komika, akustik, dan konten kreator lokal daftar sendiri, lalu pantau status & slot tampil.",
      cta: "Daftar tampil",
      href: promo.links.daftarKreator,
    },
  ].filter((r) => r.href);

  return (
    <section id="gigs" aria-labelledby="gigs-spot-title" data-testid="home-gigs-spotlight" className="gigs-spot">
      <div className="gigs-spot__shell">
        {/* ---------- Kepala: pesan utama + logo resmi ---------- */}
        <div className="gigs-spot__head">
          <div className="gigs-spot__intro">
            <p className="gigs-spot__eyebrow">
              <span aria-hidden>{"///"}</span> Event Garage · {date}
            </p>
            <h2 id="gigs-spot-title" className="gigs-spot__title">
              {/* Bagian bertanda *...* di headline (events.json) tampil merah. */}
              {(promo.promo.headline ?? promo.name).split(/\*([^*]+)\*/).map((part, i) =>
                i % 2 ? (
                  <em key={i} className="gigs-spot__accent">
                    {part}
                  </em>
                ) : (
                  part
                ),
              )}
            </h2>
            {promo.promo.pitch ? <p className="gigs-spot__pitch">{promo.promo.pitch}</p> : null}
            <ul className="gigs-spot__facts">
              <li>
                <CalendarDays aria-hidden /> {date} · {clock} WIB
              </li>
              {promo.venue ? (
                <li>
                  <MapPin aria-hidden /> {promo.venue}
                </li>
              ) : null}
            </ul>
            <div className="gigs-spot__actions">
              <a className="btn btn-primary" href={promo.url}>
                <span>Lihat Event GIGS</span>
                <ArrowRight aria-hidden size={16} />
              </a>
              {waShare ? (
                <a className="btn" href={waShare} target="_blank" rel="noopener noreferrer">
                  <Share2 aria-hidden size={16} />
                  <span>Ajak teman via WhatsApp</span>
                </a>
              ) : null}
            </div>
          </div>

          <a className="gigs-spot__poster" href={promo.url} aria-label={`Buka halaman ${promo.name}`} style={promo.poster ? { backgroundImage: `url("${promo.poster}")` } : undefined}>
            {promo.logo ? <img src={promo.logo} alt={`Logo resmi ${promo.name}`} width={1200} height={1200} loading="lazy" decoding="async" /> : null}
            {dayLabel ? (
              <span className={`gigs-spot__sticker${dayLabel === "LIVE" ? " is-live" : ""}`} aria-label={dayLabel === "LIVE" ? "Sedang berlangsung" : `${dayLabel} menuju acara`}>
                {dayLabel}
              </span>
            ) : null}
          </a>
        </div>

        {/* ---------- Program ---------- */}
        {promo.promo.programs.length ? (
          <ul className="gigs-spot__programs" aria-label="Program acara">
            {promo.promo.programs.map((p) => (
              <li key={p}>
                <Music2 aria-hidden /> {p}
              </li>
            ))}
          </ul>
        ) : null}

        {/* ---------- Lineup resmi (dikelompokkan per jenis bila platform event mengirim jenisnya) ---------- */}
        {lineupGroups.length ? (
          <div className="gigs-spot__lineup-wrap">
            <div className="gigs-spot__subhead">
              <h3>Official lineup</h3>
              <span>
                {promo.promo.lineup.length} penampil terkonfirmasi
                {lineupCounts ? ` · ${lineupCounts}` : ""}
              </span>
            </div>
            {lineupGroups.map((group) => (
              <section key={group.label} className="gigs-spot__lineup-group" aria-label={group.label}>
                {lineupGroups.length > 1 || group.kind ? (
                  <h4 className="gigs-spot__group-title">
                    {group.kind === "standup" ? <Mic2 aria-hidden size={16} /> : <Music2 aria-hidden size={16} />}
                    {group.label}
                    <span>{group.items.length}</span>
                  </h4>
                ) : null}
                <ol className="gigs-spot__lineup">
                  {group.items.map((performer) => {
                    const slot = promo.promo.lineup.indexOf(performer) + 1;
                    return (
                      <li key={performer.name} className={`gigs-spot__band${performer.kind ? ` is-${performer.kind}` : ""}`}>
                        <div className="gigs-spot__card-head">
                          <span className="gigs-spot__slot">#{String(slot).padStart(2, "0")}</span>
                          {performer.kind ? <span className="gigs-spot__kind">{LINEUP_KIND_LABEL[performer.kind]}</span> : null}
                        </div>
                        <div className="gigs-spot__band-logo">
                          {performer.logo ? <img src={performer.logo} alt={`Logo ${performer.name}`} loading="lazy" decoding="async" /> : null}
                        </div>
                        <strong>{performer.name}</strong>
                        {performer.time ? (
                          <span className="gigs-spot__time">
                            <Clock3 aria-hidden size={12} />
                            <span>{performer.time} WIB</span>
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
            {promo.links.daftarKreator ? (
              <ol className="gigs-spot__lineup gigs-spot__lineup--open">
                <li className="gigs-spot__band is-open">
                  <span className="gigs-spot__slot">#{String(promo.promo.lineup.length + 1).padStart(2, "0")}</span>
                  <a href={promo.links.daftarKreator} className="gigs-spot__open">
                    <span>Slot berikutnya</span>
                    <strong>Kamu?</strong>
                    <em>
                      Daftar tampil <ArrowRight aria-hidden size={14} />
                    </em>
                  </a>
                </li>
              </ol>
            ) : null}
          </div>
        ) : null}

        {/* ---------- Cara ikut ---------- */}
        <div className="gigs-spot__roles">
          {roles.map(({ Icon, kicker, title, copy, cta, href }) => (
            <a key={kicker} className="gigs-spot__role" href={href!}>
              <Icon aria-hidden className="gigs-spot__role-icon" />
              <span className="gigs-spot__role-kicker">{kicker}</span>
              <strong>{title}</strong>
              <p>{copy}</p>
              <span className="gigs-spot__role-cta">
                {cta} <ArrowRight aria-hidden size={14} />
              </span>
            </a>
          ))}
        </div>

        {/* ---------- Transparansi dana (angka riil) ---------- */}
        {promo.fundTarget && promo.links.transparansi ? (
          <a className="gigs-spot__fund" href={promo.links.transparansi}>
            <ShieldCheck aria-hidden className="gigs-spot__fund-icon" />
            <div className="gigs-spot__fund-body">
              <strong>Dana acara terbuka untuk publik</strong>
              <span>
                {fundPct > 0
                  ? `Target ${rupiah(promo.fundTarget)} · terkumpul ${fundPct.toLocaleString("id-ID", { maximumFractionDigits: 1 })}% · setiap dana dicek dua orang panitia`
                  : `Target ${rupiah(promo.fundTarget)} · pendanaan baru dibuka, jadilah sponsor pertama · setiap dana dicek dua orang panitia`}
              </span>
              <div className="gigs-spot__fund-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={fundPct} aria-label="Persentase dana terkumpul">
                <i style={{ width: `${Math.max(fundPct, 1.5)}%` }} />
              </div>
            </div>
            <span className="gigs-spot__fund-cta">
              Lihat laporan <ArrowRight aria-hidden size={14} />
            </span>
          </a>
        ) : null}
      </div>
    </section>
  );
}
