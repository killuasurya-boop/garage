"use client";

// Layar QRIS customer-facing (monitor/tablet kedua di meja kasir).
// Desain sinematik Garage: asphalt gelap, aksen merah, scanlines, QR frame
// dengan glow ring + scan-line. QRIS statis ("satu QRIS untuk semua") diambil
// dari aset publik /payments/qris-garage.png (sumber tunggal, sama dgn POS).
// Animasi ringan + hormati prefers-reduced-motion (tablet/layar toko).

import Image from "next/image";

type QrisPaymentDisplayProps = {
  /** Nominal yang harus dibayar (rupiah). Opsional — kalau ada, ditampilkan besar. */
  amount?: number | null;
  /** Nomor order, untuk referensi kasir/pelanggan. */
  orderNo?: string | null;
  /** Nama merchant di badge. */
  merchantName?: string;
  /** Sumber gambar QRIS. Default aset publik Garage. */
  qrisSrc?: string;
};

const PAYMENT_PLATFORMS = [
  "GoPay",
  "DANA",
  "OVO",
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

export function QrisPaymentDisplay({
  amount,
  orderNo,
  merchantName = "GARAGE COFFEE & MOTOR",
  qrisSrc = "/payments/qris-garage.png",
}: QrisPaymentDisplayProps) {
  const hasAmount = typeof amount === "number" && Number.isFinite(amount) && amount > 0;

  return (
    <main className="qris-screen">
      <style>{qrisStyles}</style>

      {/* overlay scanlines + vignette */}
      <div className="qris-scanlines" aria-hidden />
      <div className="qris-vignette" aria-hidden />
      <div className="qris-topbar" aria-hidden />

      <div className="qris-grid">
        {/* KIRI — brand, nominal, platform */}
        <section className="qris-left">
          <div className="qris-brand">
            <span className="qris-brand-main">GARAGE</span>
            <span className="qris-brand-sub">Coffee &amp; Motor</span>
          </div>

          {hasAmount ? (
            <div className="qris-amount-box">
              <span className="qris-amount-label">Total Pembayaran</span>
              <span className="qris-amount-value">{formatIdr(amount as number)}</span>
              {orderNo ? <span className="qris-amount-order">Order {orderNo}</span> : null}
            </div>
          ) : (
            <div className="qris-amount-box qris-amount-box--static">
              <span className="qris-amount-label">Pembayaran Non-Tunai</span>
              <span className="qris-amount-static">Scan &amp; bayar sesuai nominal kasir</span>
            </div>
          )}

          <div className="qris-platforms">
            <span className="qris-platforms-label">Platform Pembayaran Diterima</span>
            <div className="qris-chips">
              {PAYMENT_PLATFORMS.map((p) => (
                <span key={p} className="qris-chip">
                  {p}
                </span>
              ))}
            </div>
          </div>

          <div className="qris-tagline">
            <span className="qris-live-dot" aria-hidden />
            SATU QRIS UNTUK SEMUA
          </div>
        </section>

        {/* KANAN — QR frame */}
        <section className="qris-right">
          <div className="qris-scan-title">⬡ Scan QR Code ⬡</div>
          <div className="qris-scan-sub">Arahkan kamera HP ke QR di bawah</div>

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

          <div className="qris-merchant">
            <span className="qris-merchant-name">{merchantName}</span>
            <span className="qris-merchant-meta">QRIS · NMID terdaftar · Bank Indonesia</span>
          </div>
        </section>
      </div>
    </main>
  );
}

const qrisStyles = `
.qris-screen{position:fixed;inset:0;overflow:hidden;background:
  radial-gradient(1200px 600px at 20% -10%, #1a1a1f 0%, transparent 60%),
  radial-gradient(900px 500px at 110% 110%, #1c1113 0%, transparent 55%),
  #08080b;color:#f0f0f0;font-family:'Rajdhani',ui-sans-serif,system-ui,sans-serif;}
.qris-topbar{position:absolute;top:0;left:0;right:0;height:4px;z-index:4;
  background:linear-gradient(90deg,transparent,#c0392b 20%,#e74c3c 50%,#c0392b 80%,transparent);
  animation:qrisBar 3s ease-in-out infinite;}
.qris-scanlines{position:absolute;inset:0;z-index:3;pointer-events:none;
  background:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.10) 3px,rgba(0,0,0,.10) 4px);}
.qris-vignette{position:absolute;inset:0;z-index:2;pointer-events:none;
  box-shadow:inset 0 0 220px 60px rgba(0,0,0,.7);}
.qris-grid{position:relative;z-index:5;height:100%;display:grid;
  grid-template-columns:1fr 1fr;gap:24px;padding:clamp(20px,4vw,56px);align-items:center;}
.qris-left{display:flex;flex-direction:column;justify-content:center;gap:clamp(20px,3vh,40px);}
.qris-brand{display:flex;flex-direction:column;line-height:.9;}
.qris-brand-main{font-family:'Bebas Neue','Rajdhani',sans-serif;font-weight:700;
  font-size:clamp(48px,8vw,104px);letter-spacing:.04em;
  background:linear-gradient(180deg,#f5f5f5,#9a9a9a);-webkit-background-clip:text;
  background-clip:text;color:transparent;text-shadow:0 2px 30px rgba(231,76,60,.25);}
.qris-brand-sub{font-size:clamp(14px,1.6vw,22px);letter-spacing:.5em;color:#e74c3c;
  text-transform:uppercase;font-weight:600;margin-top:4px;}
.qris-amount-box{border:1px solid #34343c;border-radius:14px;padding:clamp(14px,2vw,22px);
  background:linear-gradient(180deg,rgba(231,76,60,.08),rgba(255,255,255,.02));
  display:flex;flex-direction:column;gap:6px;max-width:520px;}
.qris-amount-box--static{background:rgba(255,255,255,.03);}
.qris-amount-label{font-size:clamp(11px,1.1vw,14px);letter-spacing:.22em;color:#9a9a9a;text-transform:uppercase;}
.qris-amount-value{font-family:'Orbitron','Rajdhani',sans-serif;font-weight:900;
  font-size:clamp(34px,5vw,64px);color:#fff;line-height:1;text-shadow:0 0 24px rgba(231,76,60,.4);}
.qris-amount-static{font-size:clamp(16px,1.8vw,24px);font-weight:600;color:#f0f0f0;}
.qris-amount-order{font-size:clamp(12px,1.2vw,15px);color:#9a9a9a;letter-spacing:.08em;}
.qris-platforms{display:flex;flex-direction:column;gap:10px;}
.qris-platforms-label{font-size:clamp(10px,1vw,13px);letter-spacing:.2em;color:#777;text-transform:uppercase;}
.qris-chips{display:flex;flex-wrap:wrap;gap:8px;max-width:560px;}
.qris-chip{font-size:clamp(11px,1.1vw,14px);font-weight:600;padding:6px 12px;border-radius:999px;
  border:1px solid #34343c;background:rgba(255,255,255,.04);color:#cfcfcf;}
.qris-tagline{display:inline-flex;align-items:center;gap:10px;font-weight:700;
  letter-spacing:.18em;color:#e74c3c;font-size:clamp(13px,1.4vw,18px);text-transform:uppercase;}
.qris-live-dot{width:10px;height:10px;border-radius:50%;background:#e74c3c;
  box-shadow:0 0 12px #e74c3c;animation:qrisPulse 1.6s ease-in-out infinite;}
.qris-right{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(10px,1.6vh,18px);}
.qris-scan-title{font-family:'Orbitron','Rajdhani',sans-serif;font-weight:700;
  font-size:clamp(18px,2.2vw,30px);color:#fff;letter-spacing:.1em;}
.qris-scan-sub{font-size:clamp(12px,1.3vw,17px);color:#9a9a9a;}
.qris-container{position:relative;display:grid;place-items:center;padding:18px;}
.qris-glow-ring{position:absolute;inset:0;margin:auto;width:clamp(320px,34vw,460px);
  height:clamp(320px,34vw,460px);border-radius:28px;border:1px solid rgba(231,76,60,.35);
  animation:qrisRing 3.4s ease-in-out infinite;}
.qris-glow-ring:nth-child(2){animation-delay:1.1s;}
.qris-glow-ring:nth-child(3){animation-delay:2.2s;}
.qris-frame{position:relative;padding:clamp(10px,1.4vw,18px);border-radius:24px;
  background:linear-gradient(145deg,#e74c3c,#c0392b);box-shadow:0 0 50px rgba(231,76,60,.4);}
.qris-inner{position:relative;overflow:hidden;border-radius:14px;background:#fff;
  padding:clamp(10px,1.2vw,16px);}
.qris-img{display:block;width:clamp(260px,28vw,400px);height:auto;}
.qris-scanline{position:absolute;left:0;right:0;height:3px;
  background:linear-gradient(90deg,transparent,rgba(231,76,60,.9),transparent);
  box-shadow:0 0 12px rgba(231,76,60,.8);animation:qrisScan 2.6s linear infinite;}
.qris-merchant{display:flex;flex-direction:column;align-items:center;gap:4px;margin-top:6px;}
.qris-merchant-name{font-weight:700;letter-spacing:.12em;color:#f0f0f0;font-size:clamp(14px,1.6vw,20px);}
.qris-merchant-meta{font-size:clamp(10px,1vw,13px);color:#777;letter-spacing:.06em;}
@keyframes qrisBar{0%,100%{opacity:.7}50%{opacity:1}}
@keyframes qrisPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.7)}}
@keyframes qrisRing{0%{transform:scale(.85);opacity:0}50%{opacity:.6}100%{transform:scale(1.25);opacity:0}}
@keyframes qrisScan{0%{top:-4px}100%{top:100%}}
@media (max-width:760px){.qris-grid{grid-template-columns:1fr;gap:18px;overflow-y:auto;}
  .qris-left{order:2;align-items:center;text-align:center;}.qris-right{order:1;}}
@media (prefers-reduced-motion:reduce){
  .qris-topbar,.qris-live-dot,.qris-glow-ring,.qris-scanline{animation:none!important}
  .qris-glow-ring{opacity:.4}}
`;
