import Image from "next/image";
import { SURYA_PORTFOLIO_URL } from "./surya-data";
import "./surya-credit.css";

type Props = {
  /** full = footer lengkap, compact = baris kredit saja, invoice = satu blok minimal. */
  variant?: "full" | "compact" | "invoice";
  className?: string;
  /** Tautan "Explore Digital Projects ↗" (homepage → section portofolio SURYA.dev). Kosong = tidak tampil. */
  exploreHref?: string;
};

function CreditLines({ stacked = false }: { stacked?: boolean }) {
  return (
    <div className={`sdc-lines${stacked ? " sdc-lines--stacked" : ""}`}>
      <span>
        Powered by <strong className="sdc-ul">Garage OS</strong>
      </span>
      <span className="sdc-sep" aria-hidden="true" />
      <span>
        Designed &amp; Developed by{" "}
        <a className="sdc-ul sdc-link" href={SURYA_PORTFOLIO_URL} target="_blank" rel="noopener noreferrer">
          SURYA.dev
        </a>
      </span>
    </div>
  );
}

/** Kredit pengembang SURYA.dev (referensi D). Hanya untuk halaman publik, bukan layar operasional. */
export function SuryaDeveloperCredit({ variant = "compact", className = "", exploreHref }: Props) {
  if (variant === "invoice") {
    return (
      <div className={`sdc sdc--invoice ${className}`} data-surya-credit="invoice">
        <Image src="/garage-brand/garage-coffee-logo.png" alt="Garage Coffee" width={72} height={26} className="sdc-logo" />
        <span className="sdc-vr" aria-hidden="true" />
        <div className="sdc-invoice-text">
          <span>
            Powered by <strong className="sdc-ul">Garage OS</strong>
          </span>
          <span>
            Designed &amp; Developed by{" "}
            <a className="sdc-ul sdc-link" href={SURYA_PORTFOLIO_URL} target="_blank" rel="noopener noreferrer">
              SURYA.dev
            </a>
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className={`sdc sdc--${variant} ${className}`} data-surya-credit={variant}>
      <span className="sdc-copy">© 2026 Garage Coffee. All rights reserved.</span>
      <CreditLines />
      {exploreHref ? (
        <a className="sdc-explore" href={exploreHref}>
          Explore Digital Projects <span aria-hidden="true">↗</span>
        </a>
      ) : null}
    </div>
  );
}
