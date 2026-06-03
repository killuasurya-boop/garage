"use client";

// Layar QRIS customer-facing sinematik untuk monitor/tablet kedua di meja kasir,
// halaman invoice (saat belum lunas), dan window POS popup. Desain match mock
// HTML Garage: dark asphalt, aksen merah, scanlines, floating particles, clock
// live, QR frame dengan glow ring + scanline + corner accents.
//
// Sumber QRIS tunggal: /payments/qris-garage.png (sama dengan POS).
// Tidak menyentuh path uang createOrder — pure presentational.

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type QrisPaymentDisplayProps = {
  /** Nominal yang harus dibayar (rupiah). Opsional. */
  amount?: number | null;
  /** Nomor order, ditampilkan di meta. */
  orderNo?: string | null;
  /** Nama merchant di badge. */
  merchantName?: string;
  /** NMID merchant (dari sertifikasi QRIS BI). */
  nmid?: string;
  /** Kode kasir/terminal. */
  cashierCode?: string;
  /** Sumber gambar QRIS. */
  qrisSrc?: string;
};

const PAYMENT_PLATFORMS = [
  "GoPay",
  "OVO",
  "DANA",
  "LinkAja",
  "ShopeePay",
  "BCA Mobile",
  "Jenius",
  "SeaBank",
];

// Welcome rotasi yang muncul dengan crossfade. Tetap berorientasi pelanggan.
const WELCOME_MESSAGES = [
  "Terima Kasih!",
  "Selamat Datang",
  "Selamat Menikmati",
  "Pelayanan Cepat",
];

function formatIdr(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

export function QrisPaymentDisplay({
  amount,
  orderNo,
  merchantName = "GARAGE COFFEE & MOTOR",
  nmid = "ID1026525964734",
  cashierCode = "A01",
  qrisSrc = "/payments/qris-garage.png",
}: QrisPaymentDisplayProps) {
  const hasAmount = typeof amount === "number" && Number.isFinite(amount) && amount > 0;

  // Clock live (HH:MM:SS + tanggal). Hindari hydration mismatch: server render
  // placeholder ("--:--"), client tick pertama jadi waktu sekarang. Tidak ada
  // setState dalam body effect — cuma subscribe ke timer.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick(); // tick pertama via callback (legal: panggilan fn dlm effect, bukan setState langsung)
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  const mounted = now !== null;

  // Welcome rotasi setiap 4s (paused saat reduced-motion karena re-render minor).
  const [welcomeIdx, setWelcomeIdx] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) return;
    const id = setInterval(
      () => setWelcomeIdx((i) => (i + 1) % WELCOME_MESSAGES.length),
      4000,
    );
    return () => clearInterval(id);
  }, []);

  const clockText =
    mounted && now
      ? `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`
      : "--:--:--";
  const clockDate =
    mounted && now
      ? now.toLocaleDateString("id-ID", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "---";

  // Floating particles: 14 div ringan dgn delay/posisi acak — di-memo agar SSR=client.
  const particles = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        left: ((i * 37) % 100) + (i % 3) * 1.5,
        size: 2 + (i % 4),
        delay: (i * 0.55) % 7,
        duration: 9 + ((i * 3) % 8),
      })),
    [],
  );

  return (
    <main className="qris-screen" role="region" aria-label="Layar pembayaran QRIS Garage">
      <style>{qrisStyles}</style>

      {/* Top bar pulse */}
      <div className="qris-topbar" aria-hidden />
      {/* Overlay scanlines */}
      <div className="qris-scanlines" aria-hidden />
      {/* Vignette gelap di tepi layar */}
      <div className="qris-vignette" aria-hidden />

      {/* Floating particles */}
      <div className="qris-particles" aria-hidden>
        {particles.map((p, i) => (
          <span
            key={i}
            className="qris-particle"
            style={{
              left: `${p.left}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
            }}
          />
        ))}
      </div>

      <div className="qris-screen-grid">
        {/* ── KIRI ── */}
        <section className="qris-left">
          <div className="qris-logo-area">
            <div className="qris-logo-img" aria-hidden>G</div>
            <div className="qris-brand-text">
              <div className="qris-brand-main">GARAGE</div>
              <div className="qris-brand-sub">Coffee &amp; Motor</div>
            </div>
          </div>

          <div className="qris-clock-wrap">
            <div className="qris-clock" suppressHydrationWarning>
              {clockText}
            </div>
            <div className="qris-clock-date" suppressHydrationWarning>
              {clockDate}
            </div>
          </div>

          {hasAmount ? (
            <div className="qris-amount-box">
              <div className="qris-welcome-line" />
              <div className="qris-amount-label">Total Pembayaran</div>
              <div className="qris-amount-value">{formatIdr(amount as number)}</div>
              {orderNo ? (
                <div className="qris-amount-order">
                  Order <strong>{orderNo}</strong>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="qris-welcome-wrap">
              <div className="qris-welcome-line" />
              <div className="qris-welcome-text">
                Pesanan Diproses
                <strong key={welcomeIdx}>{WELCOME_MESSAGES[welcomeIdx]}</strong>
              </div>
            </div>
          )}

          <div className="qris-platforms-wrap">
            <div className="qris-platforms-label">⬡ Platform Pembayaran Diterima</div>
            <div className="qris-platforms-grid">
              {PAYMENT_PLATFORMS.map((p) => (
                <span key={p} className="qris-pay-chip">
                  {p}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── KANAN ── */}
        <section className="qris-right">
          <div className="qris-scan-instruction">
            <div className="qris-scan-title">⬡ Scan QR Code ⬡</div>
            <div className="qris-scan-subtitle">Arahkan kamera HP ke QR di bawah</div>
          </div>

          <div className="qris-container">
            <div className="qris-glow-ring" aria-hidden />
            <div className="qris-glow-ring" aria-hidden />
            <div className="qris-glow-ring" aria-hidden />
            <div className="qris-frame">
              <div className="qris-inner">
                <Image
                  src={qrisSrc}
                  alt="QRIS Garage Coffee & Motor"
                  width={420}
                  height={420}
                  priority
                  className="qris-img"
                />
                <div className="qris-scanline" aria-hidden />
              </div>
            </div>
          </div>

          <div className="qris-merchant-badge">
            <div className="qris-merchant-name">{merchantName}</div>
            <div className="qris-merchant-meta">
              <span className="qris-meta-pill">
                NMID: <span>{nmid}</span>
              </span>
              <span className="qris-meta-pill">
                Kasir: <span>{cashierCode}</span>
              </span>
            </div>
          </div>

          <div className="qris-arrow-wrap">
            <span className="qris-arrow-icon">↑</span>
            <span className="qris-arrow-text">Scan QR di atas untuk bayar</span>
            <span className="qris-arrow-icon">↑</span>
          </div>
        </section>
      </div>

      {/* Bottombar */}
      <div className="qris-bottombar">
        <div className="qris-bottom-left">QRIS · Pembayaran Nasional · GPN</div>
        <div className="qris-bottom-center">
          <span className="qris-live-dot" aria-hidden />
          <span>Live · Real-time Settlement</span>
        </div>
        <div className="qris-bottom-right">Bank Indonesia · ASPI</div>
      </div>
    </main>
  );
}

/* ───────────────────────────────────────────────────────────────────────── */

const qrisStyles = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;600;700;900&display=swap');

.qris-screen{
  position:fixed; inset:0; overflow:hidden; color:#F0F0F0;
  font-family:'Rajdhani',ui-sans-serif,system-ui,sans-serif;
  background:
    radial-gradient(1200px 600px at 18% -10%, #1a1a1f 0%, transparent 60%),
    radial-gradient(900px 500px at 110% 110%, #1c1113 0%, transparent 55%),
    #080808;
}

/* Top bar */
.qris-topbar{
  position:absolute; left:0; right:0; top:0; height:5px; z-index:6;
  background:linear-gradient(90deg, transparent 0%, #C0392B 20%, #E74C3C 50%, #C0392B 80%, transparent 100%);
  animation:qrisBarPulse 3s ease-in-out infinite;
}
@keyframes qrisBarPulse{
  0%,100%{opacity:.7}
  50%{opacity:1; box-shadow:0 0 20px #E74C3C}
}

/* Scanlines + vignette */
.qris-scanlines{
  position:absolute; inset:0; z-index:3; pointer-events:none;
  background:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.08) 3px,rgba(0,0,0,.08) 4px);
}
.qris-vignette{
  position:absolute; inset:0; z-index:2; pointer-events:none;
  box-shadow:inset 0 0 220px 60px rgba(0,0,0,.7);
}

/* Floating particles */
.qris-particles{position:absolute; inset:0; z-index:1; overflow:hidden; pointer-events:none;}
.qris-particle{
  position:absolute; bottom:-10px; border-radius:50%;
  background:radial-gradient(circle, rgba(231,76,60,.55), transparent 70%);
  filter:blur(.5px);
  animation:qrisParticle linear infinite;
}
@keyframes qrisParticle{
  0%{transform:translateY(0) translateX(0); opacity:0}
  10%{opacity:.7}
  90%{opacity:.5}
  100%{transform:translateY(-110vh) translateX(20px); opacity:0}
}

/* Layout: 2 kolom + bottombar */
.qris-screen-grid{
  position:relative; z-index:5; height:100%;
  display:grid; grid-template-columns:1fr 1fr;
  padding-top:5px; padding-bottom:44px; /* sisakan ruang topbar + bottombar */
}

/* ── KIRI ── */
.qris-left{
  position:relative; padding:5vh 4vw 5vh 6vw;
  display:flex; flex-direction:column; justify-content:center; gap:clamp(16px,3vh,32px);
  border-right:1px solid rgba(192,57,43,.2);
}
.qris-left::before{
  content:''; position:absolute; right:0; top:15%; bottom:15%; width:1px;
  background:linear-gradient(180deg, transparent, #C0392B, transparent);
  animation:qrisLineGlow 2s ease-in-out infinite;
}
@keyframes qrisLineGlow{
  0%,100%{opacity:.3}
  50%{opacity:1; box-shadow:0 0 12px #C0392B}
}

.qris-logo-area{display:flex; align-items:center; gap:16px; animation:qrisFadeSlideUp .8s ease both;}
.qris-logo-img{
  width:72px; height:72px; border-radius:12px; border:2px solid #C0392B;
  display:grid; place-items:center;
  background:linear-gradient(145deg,#1E1E1E,#0F0F0F);
  font-family:'Bebas Neue',sans-serif; font-size:38px; color:#F0F0F0;
  box-shadow:0 0 24px rgba(192,57,43,.5);
}
.qris-brand-text{display:flex; flex-direction:column;}
.qris-brand-main{
  font-family:'Bebas Neue',sans-serif; font-size:clamp(36px,5vw,64px);
  letter-spacing:8px; color:#F0F0F0; line-height:1;
}
.qris-brand-sub{
  font-size:clamp(11px,1.2vw,14px); letter-spacing:5px; color:#9A9A9A;
  text-transform:uppercase; margin-top:2px; font-weight:500;
}

.qris-clock-wrap{animation:qrisFadeSlideUp .8s .2s ease both;}
.qris-clock{
  font-family:'Orbitron',sans-serif; font-size:clamp(28px,4vw,52px);
  font-weight:900; color:#F0F0F0; letter-spacing:4px; line-height:1;
}
.qris-clock-date{
  font-size:clamp(12px,1.2vw,16px); color:#9A9A9A; letter-spacing:3px;
  text-transform:uppercase; margin-top:4px;
}

.qris-welcome-wrap, .qris-amount-box{animation:qrisFadeSlideUp .8s .4s ease both;}
.qris-welcome-line{width:50px; height:3px; background:#C0392B; margin-bottom:10px; border-radius:2px;}
.qris-welcome-text{
  font-size:clamp(14px,1.8vw,22px); font-weight:600; color:#9A9A9A;
  letter-spacing:2px; line-height:1.5; text-transform:uppercase;
}
.qris-welcome-text strong{
  display:block; color:#F0F0F0; font-family:'Bebas Neue',sans-serif;
  font-size:clamp(20px,2.8vw,36px); letter-spacing:4px; margin-top:4px;
  animation:qrisFadeSlideUp .6s ease both;
}

.qris-amount-box{
  border:1px solid rgba(192,57,43,.45); border-radius:12px;
  padding:clamp(14px,2vw,20px); max-width:560px;
  background:linear-gradient(180deg, rgba(231,76,60,.10), rgba(255,255,255,.02));
  position:relative; overflow:hidden;
}
.qris-amount-box::after{
  content:''; position:absolute; top:0; left:-100%; width:80%; height:100%;
  background:linear-gradient(90deg, transparent, rgba(231,76,60,.12), transparent);
  animation:qrisShimmer 4s linear infinite;
}
.qris-amount-label{
  font-size:clamp(11px,1.1vw,14px); letter-spacing:.22em; color:#9A9A9A;
  text-transform:uppercase; margin-top:2px;
}
.qris-amount-value{
  font-family:'Orbitron',sans-serif; font-weight:900;
  font-size:clamp(34px,5vw,64px); color:#FFF; line-height:1; margin-top:6px;
  text-shadow:0 0 24px rgba(231,76,60,.45);
}
.qris-amount-order{
  font-size:clamp(12px,1.2vw,15px); color:#9A9A9A; letter-spacing:.08em; margin-top:8px;
}
.qris-amount-order strong{color:#E74C3C; font-weight:700;}

.qris-platforms-wrap{animation:qrisFadeSlideUp .8s .6s ease both;}
.qris-platforms-label{
  font-family:'Orbitron',sans-serif; font-size:9px; font-weight:700;
  letter-spacing:3px; color:#666; text-transform:uppercase; margin-bottom:10px;
}
.qris-platforms-grid{display:flex; flex-wrap:wrap; gap:8px; max-width:560px;}
.qris-pay-chip{
  background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.1); border-radius:6px;
  padding:5px 12px; font-size:clamp(10px,1vw,13px); font-weight:700; color:#9A9A9A;
  letter-spacing:1px; transition:all .3s;
}
.qris-pay-chip:hover{
  background:rgba(192,57,43,.18); border-color:rgba(192,57,43,.5); color:#FFF;
}

/* ── KANAN ── */
.qris-right{
  position:relative; padding:4vh 5vw;
  display:flex; flex-direction:column; justify-content:center; align-items:center;
  gap:clamp(10px,2vh,22px);
}

.qris-scan-instruction{display:flex; flex-direction:column; align-items:center; gap:6px; animation:qrisFadeSlideUp .8s .3s ease both;}
.qris-scan-title{
  font-family:'Orbitron',sans-serif; font-size:clamp(14px,1.8vw,22px);
  font-weight:900; letter-spacing:5px; color:#E74C3C; text-transform:uppercase;
}
.qris-scan-subtitle{
  font-size:clamp(11px,1.2vw,15px); font-weight:500; letter-spacing:3px;
  color:#9A9A9A; text-transform:uppercase; opacity:.75;
}

.qris-container{position:relative; display:flex; align-items:center; justify-content:center; padding:18px; animation:qrisFadeSlideUp .8s .5s ease both;}
.qris-glow-ring{
  position:absolute; inset:0; margin:auto;
  width:calc(100% + 40px); height:calc(100% + 40px);
  border-radius:20px; border:1px solid rgba(192,57,43,.2);
  animation:qrisRingPulse 2.5s ease-in-out infinite;
}
.qris-glow-ring:nth-child(2){width:calc(100% + 70px); height:calc(100% + 70px); border-radius:24px; animation-delay:.5s;}
.qris-glow-ring:nth-child(3){width:calc(100% + 100px); height:calc(100% + 100px); border-radius:28px; animation-delay:1s;}
@keyframes qrisRingPulse{
  0%,100%{opacity:.2; transform:scale(1)}
  50%{opacity:.7; transform:scale(1.02); box-shadow:0 0 20px rgba(192,57,43,.3)}
}

.qris-frame{
  position:relative; padding:4px; border-radius:16px;
  background:linear-gradient(135deg, #C0392B 0%, #6B1A10 40%, #C0392B 100%);
  box-shadow:
    0 0 40px rgba(192,57,43,.6),
    0 0 80px rgba(192,57,43,.25),
    0 0 120px rgba(192,57,43,.1);
  animation:qrisFramePulse 3s ease-in-out infinite;
}
@keyframes qrisFramePulse{
  0%,100%{box-shadow:0 0 40px rgba(192,57,43,.6), 0 0 80px rgba(192,57,43,.25)}
  50%{box-shadow:0 0 60px rgba(231,76,60,.8), 0 0 100px rgba(192,57,43,.4), 0 0 140px rgba(192,57,43,.15)}
}
.qris-frame::before, .qris-frame::after{
  content:''; position:absolute; width:22px; height:22px;
  border-color:#FF6B5B; border-style:solid;
}
.qris-frame::before{top:-3px; left:-3px; border-width:3px 0 0 3px; border-radius:6px 0 0 0;}
.qris-frame::after{bottom:-3px; right:-3px; border-width:0 3px 3px 0; border-radius:0 0 6px 0;}

.qris-inner{position:relative; overflow:hidden; border-radius:12px; background:#FFF; padding:clamp(10px,1.2vw,16px);}
.qris-img{display:block; width:clamp(260px,28vw,400px); height:auto;}
.qris-scanline{
  position:absolute; left:0; right:0; height:3px;
  background:linear-gradient(90deg, transparent, rgba(231,76,60,.95), transparent);
  box-shadow:0 0 12px rgba(231,76,60,.8);
  animation:qrisScanLine 2.5s ease-in-out infinite;
}
@keyframes qrisScanLine{0%{top:0}50%{top:calc(100% - 3px)}100%{top:0}}

.qris-merchant-badge{display:flex; flex-direction:column; align-items:center; gap:8px; animation:qrisFadeSlideUp .8s .7s ease both;}
.qris-merchant-name{
  font-family:'Bebas Neue',sans-serif; font-size:clamp(18px,2.2vw,28px);
  letter-spacing:6px; color:#F0F0F0;
}
.qris-merchant-meta{display:flex; gap:10px; flex-wrap:wrap; justify-content:center;}
.qris-meta-pill{
  display:inline-flex; align-items:center; gap:6px;
  background:rgba(255,255,255,.04); border:1px solid #34343c;
  padding:4px 12px; border-radius:999px;
  font-size:clamp(10px,1vw,12px); letter-spacing:1.5px; color:#9A9A9A; text-transform:uppercase;
}
.qris-meta-pill span{color:#F0F0F0; font-weight:700; letter-spacing:1px;}

.qris-arrow-wrap{display:inline-flex; align-items:center; gap:10px; animation:qrisArrowBounce 1.5s ease-in-out infinite;}
.qris-arrow-icon{color:#E74C3C; font-size:clamp(14px,1.5vw,20px); font-weight:900;}
.qris-arrow-text{
  font-size:clamp(11px,1.2vw,14px); font-weight:600; letter-spacing:3px;
  color:#9A9A9A; text-transform:uppercase;
}
@keyframes qrisArrowBounce{
  0%,100%{transform:translateY(0)}
  50%{transform:translateY(-6px)}
}

/* Bottombar */
.qris-bottombar{
  position:absolute; left:0; right:0; bottom:0; z-index:6; height:36px;
  background:linear-gradient(180deg, transparent, rgba(0,0,0,.6));
  border-top:1px solid rgba(192,57,43,.2);
  display:flex; align-items:center; justify-content:space-between;
  padding:0 clamp(16px,3vw,32px);
  font-size:clamp(9px,.9vw,12px); letter-spacing:2px; color:#666; text-transform:uppercase;
}
.qris-bottom-center{display:inline-flex; align-items:center; gap:8px; color:#9A9A9A;}
.qris-live-dot{
  width:8px; height:8px; border-radius:50%; background:#E74C3C;
  box-shadow:0 0 8px #E74C3C; animation:qrisDotBlink 1.5s ease-in-out infinite;
}
@keyframes qrisDotBlink{
  0%,100%{opacity:1; transform:scale(1)}
  50%{opacity:.3; transform:scale(.7)}
}

@keyframes qrisFadeSlideUp{
  from{opacity:0; transform:translateY(24px)}
  to{opacity:1; transform:translateY(0)}
}
@keyframes qrisShimmer{
  0%{left:-100%}
  100%{left:200%}
}

/* Responsive: stack jadi 1 kolom di lebar sempit */
@media (max-width:900px){
  .qris-screen-grid{grid-template-columns:1fr; grid-template-rows:auto 1fr; overflow-y:auto;}
  .qris-left{order:2; padding:24px; border-right:none; border-top:1px solid rgba(192,57,43,.2); align-items:center; text-align:center;}
  .qris-left::before{display:none;}
  .qris-platforms-grid{justify-content:center;}
  .qris-right{order:1; padding:24px;}
  .qris-bottombar{position:static; height:auto; padding:10px 16px; flex-direction:column; gap:4px; text-align:center;}
}

@media (prefers-reduced-motion:reduce){
  .qris-topbar, .qris-particle, .qris-live-dot, .qris-glow-ring,
  .qris-scanline, .qris-frame, .qris-arrow-wrap, .qris-amount-box::after,
  .qris-left::before{
    animation:none !important;
  }
  .qris-glow-ring{opacity:.35;}
}
`;
