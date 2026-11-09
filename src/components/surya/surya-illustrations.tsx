import type { SuryaModuleId } from "./surya-data";

/* Ilustrasi vektor modul Garage OS. Animasi murni CSS (kelas sdi-*), dijeda saat luar layar
   dan dimatikan oleh prefers-reduced-motion. Bukan data langsung. */

const C = { body: "#1a1a1e", edge: "#c8c8cc", red: "#ff3045", dark: "#0d0d10", skin: "#d9a982" };

function Waiter() {
  return (
    <svg viewBox="0 0 100 80" role="presentation">
      <ellipse cx="50" cy="74" rx="34" ry="4" fill="#000" opacity=".5" />
      <path d="M30 72 C30 52 36 44 50 44 C64 44 70 52 70 72 Z" fill={C.body} stroke={C.edge} strokeWidth="1.2" />
      <path d="M42 46 L50 62 L58 46" fill="#f4f4f5" opacity=".9" />
      <circle cx="50" cy="32" r="9" fill={C.skin} />
      <path d="M41 30 C41 21 59 21 59 30 C55 26 45 26 41 30Z" fill="#2a1a14" />
      <g className="sdi-tablet">
        <rect x="56" y="48" width="26" height="18" rx="2" fill={C.dark} stroke={C.edge} strokeWidth="1.2" transform="rotate(-12 69 57)" />
        <rect x="59" y="51" width="20" height="12" rx="1" fill="#3a1018" transform="rotate(-12 69 57)" />
        <g transform="rotate(-12 69 57)"><rect x="61" y="53" width="9" height="1.8" fill={C.red} className="sdi-blink" /><rect x="61" y="57" width="14" height="1.4" fill="#c8c8cc" opacity=".6" /><rect x="61" y="60" width="11" height="1.4" fill="#c8c8cc" opacity=".6" /></g>
      </g>
      <path d="M62 58 C58 60 56 62 54 62" stroke={C.skin} strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function Pos() {
  return (
    <svg viewBox="0 0 100 80" role="presentation">
      <ellipse cx="50" cy="74" rx="32" ry="4" fill="#000" opacity=".5" />
      <path d="M40 72 L44 56 L56 56 L60 72 Z" fill={C.body} stroke={C.edge} strokeWidth="1.2" />
      <rect x="22" y="12" width="56" height="42" rx="4" fill={C.dark} stroke={C.edge} strokeWidth="1.5" />
      <rect x="26" y="16" width="48" height="34" rx="2" fill="#241014" />
      {[0, 1, 2].map((r) => [0, 1, 2].map((c) => (
        <rect key={`${r}${c}`} x={29 + c * 15} y={19 + r * 10.5} width="12" height="8" rx="1.5" fill={(r + c) % 4 === 0 ? C.red : "#3a3a42"} className={(r + c) % 4 === 0 ? "sdi-blink" : undefined} />
      )))}
      <rect x="30" y="64" width="40" height="7" rx="1.5" fill={C.body} stroke={C.edge} strokeWidth="1" />
      <rect x="62" y="66" width="6" height="3" fill={C.red} className="sdi-blink" />
    </svg>
  );
}

function Bar() {
  return (
    <svg viewBox="0 0 100 80" role="presentation">
      <ellipse cx="50" cy="74" rx="36" ry="4" fill="#000" opacity=".5" />
      <rect x="14" y="26" width="72" height="42" rx="3" fill={C.body} stroke={C.edge} strokeWidth="1.3" />
      <rect x="14" y="18" width="72" height="9" rx="2" fill="#2a2a30" stroke={C.edge} strokeWidth="1" />
      {[0, 1, 2, 3].map((i) => <rect key={i} x={22 + i * 11} y="19.5" width="8" height="6" rx="1" fill="#e9e9ec" />)}
      <circle cx="32" cy="38" r="5" fill="#0d0d10" stroke={C.edge} /><circle cx="68" cy="38" r="5" fill="#0d0d10" stroke={C.edge} />
      <circle cx="50" cy="36" r="2.4" fill={C.red} className="sdi-blink" />
      <rect x="30" y="52" width="40" height="4" fill="#0d0d10" />
      <path d="M42 56 h16 v10 a3 3 0 0 1 -3 3 h-10 a3 3 0 0 1 -3 -3 z" fill="#f4f4f5" />
      <path className="sdi-steam" d="M46 50 q-3 -5 0 -9 q3 -4 0 -8" stroke="#f4f4f5" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path className="sdi-steam sdi-steam--b" d="M54 50 q-3 -5 0 -9 q3 -4 0 -8" stroke="#f4f4f5" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function Kitchen() {
  return (
    <svg viewBox="0 0 100 80" role="presentation">
      <ellipse cx="50" cy="74" rx="36" ry="4" fill="#000" opacity=".5" />
      <rect x="14" y="40" width="72" height="28" rx="3" fill={C.body} stroke={C.edge} strokeWidth="1.3" />
      {[28, 50, 72].map((x) => <circle key={x} cx={x} cy="40" r="2" fill={C.red} className="sdi-blink" />)}
      <rect x="22" y="48" width="56" height="14" rx="2" fill="#0d0d10" stroke={C.edge} strokeWidth="1" />
      <ellipse cx="40" cy="36" rx="16" ry="4" fill="#2a2a30" stroke={C.edge} strokeWidth="1.2" />
      <rect x="54" y="34" width="22" height="3" rx="1.5" fill={C.edge} />
      <path d="M62 20 a10 10 0 0 1 20 0 v6 h-20 z" fill="#f4f4f5" />
      <path className="sdi-steam" d="M34 30 q-3 -5 0 -9 q3 -4 0 -8" stroke="#f4f4f5" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path className="sdi-steam sdi-steam--b" d="M44 30 q-3 -5 0 -9 q3 -4 0 -8" stroke="#f4f4f5" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function Owner() {
  return (
    <svg viewBox="0 0 100 80" role="presentation">
      <ellipse cx="50" cy="74" rx="38" ry="4" fill="#000" opacity=".5" />
      <path d="M40 70 L44 58 L56 58 L60 70 Z" fill={C.body} stroke={C.edge} strokeWidth="1.2" />
      <rect x="10" y="8" width="80" height="52" rx="4" fill={C.dark} stroke={C.edge} strokeWidth="1.5" />
      <rect x="14" y="12" width="72" height="44" rx="2" fill="#150a0d" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} className="sdi-bar" style={{ animationDelay: `${i * 0.25}s` }} x={20 + i * 9} y={48 - (10 + i * 5)} width="6" height={10 + i * 5} fill={C.red} />
      ))}
      <circle cx="74" cy="30" r="9" fill="none" stroke="#3a3a42" strokeWidth="4" />
      <circle cx="74" cy="30" r="9" fill="none" stroke={C.red} strokeWidth="4" strokeDasharray="34 60" transform="rotate(-90 74 30)" />
      <rect x="18" y="16" width="26" height="2.5" fill="#c8c8cc" opacity=".6" />
    </svg>
  );
}

const MAP: Record<SuryaModuleId, () => React.JSX.Element> = { waiter: Waiter, pos: Pos, bar: Bar, kitchen: Kitchen, owner: Owner };

/** Render ChatGPT (brief 001), tanpa teks/logo. Logo yang digambar ulang AI di waiter & POS
    dihapus dengan inpainting sebelum dipasang. SVG di atas tetap jadi cadangan. */
const PHOTO: Partial<Record<SuryaModuleId, string>> = {
  waiter: "/surya-dev/waiter.webp",
  pos: "/surya-dev/pos.webp",
  bar: "/surya-dev/bar.webp",
  kitchen: "/surya-dev/kitchen.webp",
  owner: "/surya-dev/owner.webp",
};

export function SuryaIllustration({ id }: { id: SuryaModuleId }) {
  const src = PHOTO[id];
  if (src) {
    return (
      <div className={`sdi sdi--photo sdi--${id}`} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- aset dekoratif kecil, sudah WebP */}
        <img src={src} alt="" width={560} height={560} loading="lazy" decoding="async" />
      </div>
    );
  }
  const Cmp = MAP[id];
  return <div className={`sdi sdi--${id}`} aria-hidden="true"><Cmp /></div>;
}
