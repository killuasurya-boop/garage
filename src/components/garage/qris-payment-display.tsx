"use client";

// Layar QRIS customer-facing sinematik untuk monitor/tablet kedua di meja kasir,
// halaman invoice (saat belum lunas), dan window POS popup.
//
// PORT 1:1 dari mock HTML `garage_pos_display.html`:
//   - Canvas background dengan diagonal+horizontal grid + moving radial spotlight
//   - JS particles dinamis (spawn tiap 600ms, naik dgn drift, drag-fade)
//   - QR frame dgn ringPulse subtle (scale 1.02), framePulse, scanLine fade,
//     corner accents
//   - Layout 2-kolom dengan pemisah vertikal glow
//   - Bottombar dengan dot blink "Live"
//
// Sumber QRIS tunggal: /payments/qris-garage.png (sama dengan POS).
// Tidak menyentuh path uang createOrder — pure presentational.

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

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

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function QrisPaymentDisplay({
  amount,
  orderNo,
  merchantName = "GARAGE MINUMAN",
  nmid = "ID1026525964734",
  cashierCode = "A01",
  qrisSrc = "/payments/qris-garage.png",
}: QrisPaymentDisplayProps) {
  const hasAmount = typeof amount === "number" && Number.isFinite(amount) && amount > 0;

  // Clock live — anti hydration mismatch.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  const clockText = now
    ? `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`
    : "--:--:--";
  const clockDate = now
    ? now
        .toLocaleDateString("id-ID", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
        .toUpperCase()
    : "---";

  // ─── Canvas background (diagonal+horizontal grid + moving spotlight) ───
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const canvas = bgCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let t = 0;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const spacing = 60;

      // Diagonal grid
      ctx.strokeStyle = "rgba(192,57,43,0.06)";
      ctx.lineWidth = 1;
      for (let x = -canvas.height; x < canvas.width + canvas.height; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + canvas.height, canvas.height);
        ctx.stroke();
      }
      // Horizontal grid
      ctx.strokeStyle = "rgba(255,255,255,0.02)";
      for (let y = 0; y < canvas.height; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
      // Moving radial spotlight
      const gx = canvas.width * 0.75;
      const gy = canvas.height * 0.5 + Math.sin(t * 0.01) * 80;
      const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, 400);
      grad.addColorStop(0, "rgba(192,57,43,0.08)");
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      t++;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // ─── Particles JS (spawn tiap 600ms, naik dgn drift, fade out) ───
  const particleHostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const host = particleHostRef.current;
    if (!host) return;
    const rafs = new Set<number>();
    let intervalId: number | null = null;

    const spawn = () => {
      const p = document.createElement("div");
      p.className = "qris-particle";
      const startX = Math.random() * window.innerWidth;
      const startY = window.innerHeight - 60;
      const size = Math.random() * 3 + 1;
      const duration = Math.random() * 4 + 3; // 3-7s
      const drift = (Math.random() - 0.5) * 80;
      p.style.left = startX + "px";
      p.style.bottom = "50px";
      p.style.width = p.style.height = size + "px";
      host.appendChild(p);

      let progress = 0;
      const step = () => {
        progress += 0.008 / duration;
        if (progress >= 1) {
          p.remove();
          return;
        }
        const currentX = startX + drift * progress;
        const currentY = startY - (window.innerHeight + 100) * progress;
        const opacity = progress < 0.1 ? progress * 10 : 1 - progress;
        p.style.transform = `translate(${currentX - startX}px, ${currentY - startY}px)`;
        p.style.opacity = String(opacity * 0.6);
        const id = requestAnimationFrame(step);
        rafs.add(id);
      };
      const id0 = requestAnimationFrame(step);
      rafs.add(id0);
    };

    intervalId = window.setInterval(spawn, 600);
    return () => {
      if (intervalId !== null) clearInterval(intervalId);
      rafs.forEach((id) => cancelAnimationFrame(id));
      host.innerHTML = "";
    };
  }, []);

  return (
    <main className="qris-screen" role="region" aria-label="Layar pembayaran QRIS Garage">
      <style>{qrisStyles}</style>

      {/* Canvas background — diagonal grid + spotlight */}
      <canvas ref={bgCanvasRef} className="qris-bg" aria-hidden />
      {/* Scanlines overlay */}
      <div className="qris-scanlines" aria-hidden />
      {/* Floating particles host (JS-driven) */}
      <div ref={particleHostRef} className="qris-particles" aria-hidden />

      {/* Top bar */}
      <div className="qris-topbar" aria-hidden />

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
            <div className="qris-welcome-wrap">
              <div className="qris-welcome-line" />
              <div className="qris-welcome-text">
                Total Pembayaran
                <strong>{formatIdr(amount as number)}</strong>
                {orderNo ? (
                  <span className="qris-amount-order">Order {orderNo}</span>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="qris-welcome-wrap">
              <div className="qris-welcome-line" />
              <div className="qris-welcome-text">
                Pesanan Diproses
                <strong>Terima Kasih!</strong>
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
                  width={260}
                  height={260}
                  priority
                  className="qris-img"
                />
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
          <span className="qris-live-text">Live · Real-time Settlement</span>
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
  background:#080808;
}

/* Canvas background (diagonal grid + spotlight) */
.qris-bg{position:fixed; inset:0; z-index:0; opacity:.6; pointer-events:none;}

/* Scanlines overlay */
.qris-scanlines{
  position:fixed; inset:0; z-index:1; pointer-events:none;
  background:repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,.08) 3px, rgba(0,0,0,.08) 4px);
}

/* Particles host — div spawn dinamis */
.qris-particles{position:fixed; inset:0; z-index:1; pointer-events:none;}
.qris-particle{
  position:fixed; width:2px; height:2px; background:#C0392B;
  border-radius:50%; pointer-events:none; opacity:0;
  box-shadow:0 0 4px rgba(192,57,43,.8);
}

/* Layout grid */
.qris-screen-grid{
  position:relative; z-index:2; width:100vw; height:100vh;
  display:grid; grid-template-rows:auto 1fr auto; grid-template-columns:1fr 1fr; gap:0;
}

/* Top bar */
.qris-topbar{
  position:absolute; left:0; right:0; top:0; height:5px; z-index:4;
  background:linear-gradient(90deg, transparent 0%, #C0392B 20%, #E74C3C 50%, #C0392B 80%, transparent 100%);
  animation:qrisBarPulse 3s ease-in-out infinite;
}
@keyframes qrisBarPulse{
  0%,100%{opacity:.7}
  50%{opacity:1; box-shadow:0 0 20px #E74C3C}
}

/* ── LEFT PANEL ── */
.qris-left{
  position:relative; display:flex; flex-direction:column;
  justify-content:center; align-items:flex-start;
  padding:5vh 4vw 5vh 6vw; border-right:1px solid rgba(192,57,43,.2);
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

.qris-logo-area{
  display:flex; align-items:center; gap:16px; margin-bottom:5vh;
  animation:qrisFadeSlideUp .8s ease both;
}
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
  font-family:'Rajdhani',sans-serif; font-size:clamp(11px,1.2vw,14px);
  letter-spacing:5px; color:#9A9A9A; text-transform:uppercase; margin-top:2px;
}

.qris-clock-wrap{margin-bottom:3vh; animation:qrisFadeSlideUp .8s .2s ease both;}
.qris-clock{
  font-family:'Orbitron',sans-serif; font-size:clamp(28px,4vw,52px);
  font-weight:900; color:#F0F0F0; letter-spacing:4px; line-height:1;
}
.qris-clock-date{
  font-family:'Rajdhani',sans-serif; font-size:clamp(12px,1.2vw,16px);
  color:#9A9A9A; letter-spacing:3px; text-transform:uppercase; margin-top:4px;
}

.qris-welcome-wrap{margin-bottom:4vh; animation:qrisFadeSlideUp .8s .4s ease both;}
.qris-welcome-line{width:50px; height:3px; background:#C0392B; margin-bottom:10px; border-radius:2px;}
.qris-welcome-text{
  font-family:'Rajdhani',sans-serif; font-size:clamp(14px,1.8vw,22px);
  font-weight:600; color:#9A9A9A; letter-spacing:2px; line-height:1.5;
  text-transform:uppercase;
}
.qris-welcome-text strong{
  color:#F0F0F0; display:block; font-size:clamp(20px,2.8vw,36px);
  font-family:'Bebas Neue',sans-serif; letter-spacing:4px; margin-top:4px;
}
.qris-amount-order{
  display:block; margin-top:8px; color:#9A9A9A;
  font-family:'Rajdhani',sans-serif; font-size:clamp(11px,1vw,14px);
  letter-spacing:3px; font-weight:500;
}

.qris-platforms-wrap{animation:qrisFadeSlideUp .8s .6s ease both;}
.qris-platforms-label{
  font-family:'Orbitron',sans-serif; font-size:9px; font-weight:700;
  letter-spacing:3px; color:#444; text-transform:uppercase; margin-bottom:10px;
}
.qris-platforms-grid{display:flex; flex-wrap:wrap; gap:8px;}
.qris-pay-chip{
  background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.1);
  border-radius:6px; padding:5px 12px;
  font-family:'Rajdhani',sans-serif; font-size:clamp(10px,1vw,13px);
  font-weight:700; color:#9A9A9A; letter-spacing:1px; transition:all .3s;
}
.qris-pay-chip:hover{
  background:rgba(192,57,43,.15); border-color:rgba(192,57,43,.4); color:#F0F0F0;
}

/* ── RIGHT PANEL ── */
.qris-right{
  display:flex; flex-direction:column; justify-content:center; align-items:center;
  padding:4vh 5vw; position:relative; gap:2.5vh;
}

.qris-scan-instruction{
  display:flex; flex-direction:column; align-items:center; gap:6px;
  animation:qrisFadeSlideUp .8s .3s ease both;
}
.qris-scan-title{
  font-family:'Orbitron',sans-serif; font-size:clamp(14px,1.8vw,22px);
  font-weight:900; letter-spacing:5px; color:#E74C3C; text-transform:uppercase;
}
.qris-scan-subtitle{
  font-family:'Rajdhani',sans-serif; font-size:clamp(11px,1.2vw,15px);
  font-weight:500; letter-spacing:3px; color:#9A9A9A; text-transform:uppercase; opacity:.7;
}

.qris-container{
  position:relative; display:flex; align-items:center; justify-content:center;
  animation:qrisFadeSlideUp .8s .5s ease both;
}
.qris-glow-ring{
  position:absolute; inset:0; margin:auto;
  width:calc(100% + 40px); height:calc(100% + 40px);
  border-radius:20px; border:1px solid rgba(192,57,43,.2);
  animation:qrisRingPulse 2.5s ease-in-out infinite;
}
.qris-glow-ring:nth-child(2){
  width:calc(100% + 70px); height:calc(100% + 70px); border-radius:24px;
  animation:qrisRingPulse 2.5s .5s ease-in-out infinite;
}
.qris-glow-ring:nth-child(3){
  width:calc(100% + 100px); height:calc(100% + 100px); border-radius:28px;
  animation:qrisRingPulse 2.5s 1s ease-in-out infinite;
}
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

.qris-inner{
  background:#FFFFFF; border-radius:13px;
  padding:clamp(10px,1.5vw,18px);
  display:flex; align-items:center; justify-content:center;
  position:relative; overflow:hidden;
}
/* Scan-line (top 10% → 90% dengan opacity fade in/out) */
.qris-inner::after{
  content:''; position:absolute; left:0; right:0; height:3px;
  background:linear-gradient(90deg, transparent, rgba(192,57,43,.8), transparent);
  animation:qrisScanLine 2.5s ease-in-out infinite;
  border-radius:2px;
}
@keyframes qrisScanLine{
  0%{top:10%; opacity:0}
  10%{opacity:1}
  90%{opacity:1}
  100%{top:90%; opacity:0}
}
.qris-img{
  width:clamp(160px,22vw,260px); height:clamp(160px,22vw,260px);
  object-fit:contain; display:block; image-rendering:crisp-edges;
}

.qris-merchant-badge{
  display:flex; flex-direction:column; align-items:center; gap:8px;
  animation:qrisFadeSlideUp .8s .7s ease both;
}
.qris-merchant-name{
  font-family:'Bebas Neue',sans-serif; font-size:clamp(20px,2.5vw,30px);
  letter-spacing:6px; color:#F0F0F0; line-height:1;
}
.qris-merchant-meta{display:flex; gap:10px;}
.qris-meta-pill{
  background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.1);
  padding:4px 12px; border-radius:999px;
  font-family:'Rajdhani',sans-serif; font-size:clamp(10px,.9vw,11px);
  color:#9A9A9A; letter-spacing:1px;
}
.qris-meta-pill span{color:#E74C3C; font-weight:700;}

.qris-arrow-wrap{
  display:flex; align-items:center; gap:10px;
  animation:qrisArrowBounce 1.5s ease-in-out infinite;
}
.qris-arrow-text{
  font-family:'Orbitron',sans-serif; font-size:clamp(10px,1vw,13px);
  font-weight:700; letter-spacing:3px; color:#C0392B; text-transform:uppercase;
}
.qris-arrow-icon{
  font-size:22px; color:#E74C3C; filter:drop-shadow(0 0 6px #C0392B);
}
@keyframes qrisArrowBounce{
  0%,100%{transform:translateY(0)}
  50%{transform:translateY(-6px)}
}

/* ── BOTTOM BAR ── */
.qris-bottombar{
  grid-column:1 / -1; height:36px; padding:0 4vw;
  background:linear-gradient(180deg, transparent, rgba(0,0,0,.6));
  border-top:1px solid rgba(192,57,43,.2);
  display:flex; align-items:center; justify-content:space-between;
  position:relative; overflow:hidden;
}
.qris-bottombar::before{
  content:''; position:absolute; top:0; left:-100%; width:50%; height:100%;
  background:linear-gradient(90deg, transparent, rgba(192,57,43,.1), transparent);
  animation:qrisShimmer 4s linear infinite;
}
@keyframes qrisShimmer{
  0%{transform:translateX(-100%)}
  100%{transform:translateX(100%)}
}
.qris-bottom-left{
  font-family:'Orbitron',sans-serif; font-size:clamp(8px,.8vw,10px);
  font-weight:600; letter-spacing:3px; color:#444; text-transform:uppercase;
}
.qris-bottom-center{display:flex; align-items:center; gap:10px;}
.qris-live-dot{
  width:8px; height:8px; border-radius:50%; background:#E74C3C;
  animation:qrisDotBlink 1.5s ease-in-out infinite;
  box-shadow:0 0 8px #E74C3C;
}
@keyframes qrisDotBlink{
  0%,100%{opacity:1}
  50%{opacity:.2}
}
.qris-live-text{
  font-family:'Orbitron',sans-serif; font-size:clamp(9px,.9vw,11px);
  font-weight:700; letter-spacing:2px; color:#E74C3C; text-transform:uppercase;
}
.qris-bottom-right{
  font-family:'Rajdhani',sans-serif; font-size:clamp(8px,.8vw,10px);
  font-weight:600; letter-spacing:2px; color:#444; text-transform:uppercase;
}

@keyframes qrisFadeSlideUp{
  from{opacity:0; transform:translateY(20px)}
  to{opacity:1; transform:translateY(0)}
}

/* Responsif: stack jadi 1 kolom di lebar sempit */
@media (max-width:900px){
  .qris-screen-grid{grid-template-columns:1fr; grid-template-rows:auto auto auto auto; overflow-y:auto;}
  .qris-left{order:2; padding:24px; border-right:none; border-top:1px solid rgba(192,57,43,.2); align-items:center; text-align:center;}
  .qris-left::before{display:none;}
  .qris-platforms-grid{justify-content:center;}
  .qris-right{order:1; padding:24px;}
  .qris-bottombar{order:3; flex-direction:column; gap:4px; height:auto; padding:10px 16px; text-align:center;}
}

@media (prefers-reduced-motion:reduce){
  .qris-topbar, .qris-particle, .qris-live-dot, .qris-glow-ring,
  .qris-frame, .qris-arrow-wrap, .qris-bottombar::before,
  .qris-inner::after, .qris-left::before{
    animation:none !important;
  }
  .qris-glow-ring{opacity:.35;}
}
`;
