// Aya — AI pet Garage OS (keputusan Owner D-07, sheet karakter Okt 2026): makhluk mungil
// putih mutiara, kepala besar, jambul melengkung, mata sipit setengah terpejam, piringan
// telinga perak, inti bintang merah di dada. Satu SVG untuk semua ukuran (48 px s/d hero);
// ekspresi & pose lewat props, animasi lewat aya.css (mati saat prefers-reduced-motion).
import { useId } from "react";

import "./aya.css";

export type AyaExpression = "default" | "happy" | "centil" | "grumpy" | "sleepy" | "alert" | "thinking" | "surprised";
export type AyaPose = "idle" | "wave" | "dance" | "cross" | "fly";

const INK = "#232326";
const IRIS = "#7a1d24";
const RED = "#e32636";

function Eye({ cx, side, look = 0 }: { cx: number; side: -1 | 1; look?: number }) {
  // Almond sipit, sudut luar naik (sassy), kelopak atas tebal dengan sayap kecil ke luar.
  const o = side; // -1 = kiri (sayap ke kiri), 1 = kanan
  const outer = cx + 12 * o;
  const inner = cx - 10 * o;
  const almond = `M${inner} 60 Q${cx} 49.5 ${outer} 53.6 Q${cx + 2 * o} 65 ${inner} 60 Z`;
  const clip = `aya-eye-${useId().replace(/:/g, "")}`;
  return (
    <g className="aya-eye">
      <clipPath id={clip}>
        <path d={almond} />
      </clipPath>
      <path d={almond} fill="#fff" />
      <g clipPath={`url(#${clip})`}>
        <ellipse cx={cx + look} cy={58} rx={6.2} ry={6.6} fill={IRIS} />
        <ellipse cx={cx + look} cy={58.4} rx={3.2} ry={3.6} fill={INK} />
        <circle cx={cx + look - 2} cy={55.8} r={1.6} fill="#fff" />
      </g>
      <path d={`M${inner - 0.5 * o} 60 Q${cx} 49 ${outer} 53.6 L${outer + 3.4 * o} 51.4`} fill="none" stroke={INK} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

function Face({ expression }: { expression: AyaExpression }) {
  const arcEyes = (
    <>
      <path d="M33 59 Q43 50 53 59" fill="none" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
      <path d="M67 59 Q77 50 87 59" fill="none" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
    </>
  );
  const openMouth = (
    <g>
      <path d="M54 70 Q60 69.5 66 70 Q64.5 77.5 60 77.5 Q55.5 77.5 54 70 Z" fill={INK} />
      <path d="M56.5 75 Q60 73 63.5 75 Q62 77.1 60 77.1 Q58 77.1 56.5 75 Z" fill="#e8606b" />
    </g>
  );
  switch (expression) {
    case "happy":
      return (<>{arcEyes}{openMouth}</>);
    case "centil":
      return (
        <>
          <path d="M33 58 Q43 51 53 58" fill="none" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
          <Eye cx={77} side={1} look={-2} />
          <path d="M55 71 Q60 75.5 66 70.5" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
          <path d="M60.5 73.6 Q62.5 77 64.6 73" fill="#e8606b" />
        </>
      );
    case "grumpy":
      return (
        <>
          <path d="M33 52 L52 56.5" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
          <path d="M87 52 L68 56.5" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
          <path d="M35 60.5 Q43 57 52 60.2 Q43 63.5 35 60.5 Z" fill={INK} />
          <path d="M85 60.5 Q77 57 68 60.2 Q77 63.5 85 60.5 Z" fill={INK} />
          <path d="M56 75 Q60 71.6 64 75" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
        </>
      );
    case "sleepy":
      return (
        <>
          <path d="M34 59 Q43 64 52 59" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
          <path d="M68 59 Q77 64 86 59" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
          <ellipse cx={60} cy={73} rx={2.2} ry={2.6} fill={INK} />
          <text x={88} y={30} fontSize={11} fontWeight={700} fill="#c7cdd2" className="aya-zz">z</text>
        </>
      );
    case "alert":
    case "surprised":
      return (
        <>
          <Eye cx={43} side={-1} />
          <Eye cx={77} side={1} />
          <ellipse cx={60} cy={73.5} rx={2.8} ry={3.4} fill={INK} />
        </>
      );
    case "thinking":
      return (
        <>
          <Eye cx={43} side={-1} look={2.4} />
          <Eye cx={77} side={1} look={2.4} />
          <path d="M57 73 Q61 74.5 64 72" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
          <text x={86} y={28} fontSize={13} fontWeight={800} fill={RED}>?</text>
        </>
      );
    default:
      return (
        <>
          <Eye cx={43} side={-1} />
          <Eye cx={77} side={1} />
          <path d="M56 72 Q60 75 64.5 71" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
        </>
      );
  }
}

/** Seluruh badan Aya (viewBox 120×150). `crop="head"` = avatar bulat kepala saja. */
export function AyaCharacter({
  expression = "default",
  pose = "idle",
  crop = "full",
  className = "",
  title,
}: {
  expression?: AyaExpression;
  pose?: AyaPose;
  crop?: "full" | "head";
  className?: string;
  /** Kosong = dekoratif (aria-hidden). */
  title?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const body = `aya-body-${uid}`;
  const head = `aya-head-${uid}`;
  const silver = `aya-silver-${uid}`;
  const glow = `aya-glow-${uid}`;
  // Bahu kiri (42,92) / kanan (78,92); sudut positif = searah jarum jam.
  const armL = pose === "wave" || pose === "dance" ? "rotate(78 42 92)" : pose === "cross" ? "rotate(-70 42 92)" : pose === "fly" ? "rotate(45 42 92)" : "";
  const armR = pose === "dance" ? "rotate(-35 78 92)" : pose === "cross" ? "rotate(70 78 92)" : pose === "fly" ? "rotate(-45 78 92)" : "";
  return (
    <svg
      viewBox={crop === "head" ? "14 2 92 92" : "0 0 120 150"}
      className={`aya-svg aya-pose-${pose} aya-exp-${expression} ${className}`}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      overflow="visible"
    >
      <defs>
        <radialGradient id={head} cx="0.36" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#f5f5f2" />
          <stop offset="1" stopColor="#c7cdd2" />
        </radialGradient>
        <radialGradient id={body} cx="0.4" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor="#f2f2ef" />
          <stop offset="1" stopColor="#bfc5cb" />
        </radialGradient>
        <linearGradient id={silver} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4f5f7" />
          <stop offset="1" stopColor="#9aa1a9" />
        </linearGradient>
        <radialGradient id={glow} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={RED} stopOpacity="0.55" />
          <stop offset="1" stopColor={RED} stopOpacity="0" />
        </radialGradient>
      </defs>

      {crop === "full" ? <ellipse className="aya-shadow" cx={60} cy={146} rx={22} ry={3.6} fill={`url(#${glow})`} /> : null}

      <g className="aya-bounce">
        {crop === "full" ? (
          <g className="aya-lower">
            {/* kaki mungil */}
            <path d="M47 131 Q45 140 51 141 Q55 140 54 132 Z" fill={`url(#${body})`} />
            <path d="M73 131 Q75 140 69 141 Q65 140 66 132 Z" fill={`url(#${body})`} />
            {/* badan buah pir */}
            <path d="M60 76 C45 76 38 92 38 109 C38 127 48 137 60 137 C72 137 82 127 82 109 C82 92 75 76 60 76 Z" fill={`url(#${body})`} />
            {/* lengan */}
            {/* inti energi merah */}
            <circle className="aya-core-glow" cx={60} cy={104} r={11} fill={`url(#${glow})`} />
            <circle cx={60} cy={104} r={7.4} fill="#3a1418" />
            <circle className="aya-core" cx={60} cy={104} r={6} fill={RED} />
            <path d="M60 99.4 L61.3 102.7 L64.6 104 L61.3 105.3 L60 108.6 L58.7 105.3 L55.4 104 L58.7 102.7 Z" fill="#fff" />
          </g>
        ) : null}

        <g className="aya-head">
          {/* piringan telinga */}
          <circle cx={18} cy={56} r={8.5} fill={`url(#${silver})`} />
          <circle cx={18} cy={56} r={4.8} fill="none" stroke="#8a9098" strokeWidth={1.2} />
          <circle cx={102} cy={56} r={8.5} fill={`url(#${silver})`} />
          <circle cx={102} cy={56} r={4.8} fill="none" stroke="#8a9098" strokeWidth={1.2} />
          {/* kepala */}
          <ellipse cx={60} cy={53} rx={43} ry={37} fill={`url(#${head})`} />
          {/* jambul */}
          <path className="aya-tuft" d="M50 20 C50 10 58 4 67 3 C62 7 61 11 64 15 C66 18 64 21 60 20 Z" fill={`url(#${head})`} />
          {/* kilau */}
          <ellipse cx={44} cy={32} rx={10} ry={5} fill="#fff" opacity={0.75} transform="rotate(-20 44 32)" />
          {/* pipi */}
          <ellipse cx={32} cy={69} rx={5.5} ry={3} fill="#f19aa3" opacity={0.45} />
          <ellipse cx={88} cy={69} rx={5.5} ry={3} fill="#f19aa3" opacity={0.45} />
          <g className="aya-face">
            <Face expression={expression} />
          </g>
        </g>

        {crop === "full" ? (
          <g className="aya-arms">
            {/* pose = atribut transform di grup luar; animasi CSS di grup dalam (tidak saling timpa) */}
              <g transform={armL}>
                <g className="aya-arm-l">
                  <ellipse cx={34} cy={101} rx={4.8} ry={10.5} transform="rotate(32 34 101)" fill={`url(#${body})`} stroke="#b9c0c7" strokeWidth={0.8} />
                </g>
              </g>
              <g transform={armR}>
                <g className="aya-arm-r">
                  <ellipse cx={86} cy={101} rx={4.8} ry={10.5} transform="rotate(-32 86 101)" fill={`url(#${body})`} stroke="#b9c0c7" strokeWidth={0.8} />
                </g>
              </g>
          </g>
        ) : null}
      </g>
    </svg>
  );
}
