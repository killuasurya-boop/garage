// Aya V5 berlapis ("rig"): robot berhelm Garage Coffee (keputusan Owner 4 Nov 2026, dipakai di semua layar).
// Sumber bentuk & warna: docs/design-references/aya-v5/svg/aya-*.svg (kanvas 480×480). Bagian tubuh dipisah
// jadi grup — torso, tangan kiri/kanan, kaki kiri/kanan, kepala, wajah — supaya bisa berkedip, melirik,
// menunjuk, melambai, berjalan dan berlari lewat CSS (aya.css).
// Paket asli memakai filter blur (bayangan & glow wajah); di sini diganti gradient dan garis glow tipis
// agar ringan di tablet kasir/KDS (CLAUDE.md: hindari blur berat).
import { useId, type CSSProperties, type ReactNode } from "react";

import type { AyaState } from "@/components/garage/aya/aya-mascot";

const FACE = "#FFECEA";
const FACE_GLOW = "#FF5A52";

export type AyaLook = "center" | "left" | "right";

/** Angka semu-acak stabil dari id (sama di server & klien → tanpa hydration mismatch). */
export function ayaSeed(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

/** Garis wajah bercahaya: lapisan glow lebar & tipis di bawah garis utama (pengganti filter blur). */
function Glow({ d, width }: { d: string; width: number }) {
  return (
    <>
      <path d={d} stroke={FACE_GLOW} strokeOpacity={0.28} strokeWidth={width + 7} strokeLinecap="round" fill="none" />
      <path d={d} stroke={FACE} strokeWidth={width} strokeLinecap="round" fill="none" />
    </>
  );
}

/** Mata tegak (bisa berkedip). */
function EyeOpen({ x, y, w = 15, h = 43 }: { x: number; y: number; w?: number; h?: number }) {
  return (
    <g className="aya-eye-open">
      <rect x={x - 3} y={y - 3} width={w + 6} height={h + 6} rx={(w + 6) / 2} fill={FACE_GLOW} opacity={0.26} />
      <rect x={x} y={y} width={w} height={h} rx={w / 2} fill={FACE} />
    </g>
  );
}

/** Batang gelombang suara di visor (mendengar & bicara). */
function Bars({ bars, width }: { bars: Array<[number, number, number]>; width: number }) {
  return (
    <g className="aya-bars">
      {bars.map(([x, y1, y2], i) => (
        <g key={x} className="aya-bar" style={{ ["--i" as string]: i } as CSSProperties}>
          <Glow d={`M${x} ${y1} V${y2}`} width={width} />
        </g>
      ))}
    </g>
  );
}

const SMILE = "M251 227 Q263 242 278 226";

function Face({ state }: { state: AyaState }): ReactNode {
  switch (state) {
    case "listening":
      return (
        <Bars
          width={5.5}
          bars={[[212, 190, 201], [226, 176, 211], [240, 182, 204], [255, 164, 222], [270, 182, 204], [284, 171, 215], [298, 188, 201]]}
        />
      );
    case "thinking":
      return (
        <g className="aya-think-dots">
          {[220, 257, 294].map((cx, i) => (
            <g key={cx} className="aya-think-dot" style={{ ["--i" as string]: i } as CSSProperties}>
              <circle cx={cx} cy={204} r={11} fill={FACE_GLOW} opacity={0.26} />
              <circle cx={cx} cy={204} r={7.5} fill={FACE} />
            </g>
          ))}
        </g>
      );
    case "speaking":
      return (
        <>
          <Glow d="M195 194 Q208 174 221 194" width={8} />
          <Bars width={5.8} bars={[[244, 196, 205], [256, 184, 218], [269, 176, 225], [282, 185, 216], [294, 196, 205]]} />
        </>
      );
    case "success":
      return (
        <>
          <Glow d="M196 193 Q211 172 228 193" width={8} />
          <Glow d="M284 192 Q299 172 316 193" width={8} />
          <path d="M246 228 Q264 259 282 227 Z" fill={FACE} stroke={FACE} strokeWidth={5} strokeLinejoin="round" />
        </>
      );
    case "guiding":
      // Mengedip centil: mata kiri melengkung, mata kanan terbuka.
      return (
        <>
          <Glow d="M196 193 Q211 172 228 193" width={8} />
          <EyeOpen x={299} y={168} />
          <Glow d={SMILE} width={7} />
        </>
      );
    case "warning":
      return (
        <>
          <EyeOpen x={202} y={166} w={17} h={47} />
          <EyeOpen x={297} y={165} w={17} h={47} />
          <circle cx={264} cy={236} r={13} fill={FACE_GLOW} opacity={0.26} />
          <circle cx={264} cy={236} r={8.5} fill={FACE} />
        </>
      );
    case "error":
      return (
        <>
          <Glow d="M202 192 L226 196" width={8} />
          <Glow d="M290 196 L314 192" width={8} />
          <Glow d="M249 236 Q263 224 279 236" width={7} />
        </>
      );
    default:
      return (
        <>
          <EyeOpen x={204} y={169} />
          <EyeOpen x={299} y={168} />
          <Glow d={SMILE} width={7} />
        </>
      );
  }
}

/** Logo "A" dari paket V5 (sementara, sampai Owner memberi vektor resmi). */
function BadgeA({ transform }: { transform: string }) {
  return (
    <g transform={transform}>
      <path d="M0 49 L24 0 L48 49 H35 L29 37 H19 L13 49 Z M24 13 L19 28 H29 Z" fill="#E83F37" fillRule="evenodd" />
      <path d="M9 42 L39 42" stroke="#FF8680" strokeWidth={2.5} strokeOpacity={0.6} />
      <path d="M27 24 L39 36" stroke="#80111A" strokeWidth={2.3} />
    </g>
  );
}

function Accessory({ state, red }: { state: AyaState; red: string }) {
  switch (state) {
    case "listening":
      return (
        <g className="aya-acc aya-acc-waves" fill="none" stroke="#EF4944" strokeLinecap="round">
          <path d="M59 165 Q35 196 59 235" strokeWidth={4.5} />
          <path d="M45 150 Q8 197 45 252" strokeWidth={3} />
          <path d="M420 166 Q447 200 420 239" strokeWidth={4.5} />
          <path d="M436 148 Q471 196 437 252" strokeWidth={3} />
        </g>
      );
    case "thinking":
      return (
        <g className="aya-acc aya-acc-dots">
          <path d="M361 75 Q361 49 392 49 H426 Q447 49 447 70 V86 Q447 103 424 103 H405 L393 117 L389 101 Q361 98 361 75Z" fill="#252125" stroke="#B6A2A1" strokeWidth={2} />
          <g fill="#F3BDB6">
            <circle cx={384} cy={76} r={3.3} /><circle cx={405} cy={76} r={3.3} /><circle cx={426} cy={76} r={3.3} />
          </g>
        </g>
      );
    case "speaking":
      return (
        <g className="aya-acc aya-acc-talk">
          <path d="M355 68 Q355 46 379 46 H444 Q465 46 465 68 V92 Q465 111 445 111 H395 L375 125 L377 109 Q355 104 355 92Z" fill="#242023" stroke="#BFB5B6" strokeWidth={2} />
          <path d="M380 69 H440 M380 82 H431" stroke="#FFF0E8" strokeWidth={4} strokeLinecap="round" />
        </g>
      );
    case "success":
      return (
        // Posisi di grup luar, animasi CSS di grup dalam: transform CSS menimpa atribut transform SVG.
        <g transform="translate(376 52)">
          <g className="aya-acc aya-acc-heart">
            <path d="M8 20 C8 2 25 -2 34 9 C43 -2 61 3 61 20 C61 40 34 55 34 55 C34 55 8 40 8 20Z" fill={`url(#${red})`} stroke="#FFB2AB" strokeWidth={3} />
            <path d="M23 19 Q28 12 34 19 Q40 12 45 19 Q44 27 34 34 Q24 28 23 19Z" fill="#FFF1F0" />
            <path d="M70 72 L86 63 M67 85 L84 91" stroke="#FF6762" strokeWidth={5} strokeLinecap="round" />
          </g>
        </g>
      );
    case "warning":
      return (
        <g transform="translate(408 118)">
          <g className="aya-acc aya-acc-warn">
            <path d="M0 -34 L32 25 H-32Z" fill="#D43A3A" stroke="#FFBC91" strokeWidth={4} />
            <path d="M0 -12 V7" stroke="white" strokeWidth={6} strokeLinecap="round" />
            <circle cy={17} r={3.5} fill="white" />
          </g>
        </g>
      );
    default:
      return null;
  }
}

export function AyaRig({ state, look = "center" }: { state: AyaState; look?: AyaLook }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const id = (name: string) => `aya-${name}-${uid}`;
  const url = (name: string) => `url(#${id(name)})`;
  const seed = ayaSeed(uid);
  // Kedip acak per Aya: jeda 0–4 dtk, siklus 4,5–7 dtk.
  const blink = { "--aya-blink-delay": `${(seed * 4).toFixed(2)}s`, "--aya-blink-dur": `${(4.5 + seed * 2.5).toFixed(2)}s` } as CSSProperties;
  const pointing = state === "guiding";

  return (
    <svg className="aya-rig" viewBox="0 0 480 480" data-look={look} style={blink} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id("silver")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFF7F2" /><stop offset=".17" stopColor="#D0C9C7" /><stop offset=".4" stopColor="#F7EEEA" />
          <stop offset=".63" stopColor="#89868A" /><stop offset=".79" stopColor="#F5E9E6" /><stop offset="1" stopColor="#55545C" />
        </linearGradient>
        <linearGradient id={id("steel")} x1=".16" y1="0" x2=".88" y2="1">
          <stop offset="0" stopColor="#FCF6F2" /><stop offset=".24" stopColor="#C4BEC0" /><stop offset=".59" stopColor="#655F69" />
          <stop offset=".79" stopColor="#E8D7D3" /><stop offset="1" stopColor="#625E66" />
        </linearGradient>
        <linearGradient id={id("cream")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFF7F5" /><stop offset=".57" stopColor="#C3BEC2" /><stop offset="1" stopColor="#716C73" />
        </linearGradient>
        <linearGradient id={id("visor")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2B272B" /><stop offset=".31" stopColor="#0C0D12" /><stop offset=".74" stopColor="#100D12" /><stop offset="1" stopColor="#24181A" />
        </linearGradient>
        <linearGradient id={id("red")} x1="0" y1="0" x2=".92" y2="1">
          <stop offset="0" stopColor="#FF6962" /><stop offset=".36" stopColor="#DD242A" /><stop offset=".73" stopColor="#761018" /><stop offset="1" stopColor="#3B1015" />
        </linearGradient>
        <radialGradient id={id("aura")}>
          <stop offset="0" stopColor="#F03931" stopOpacity=".55" /><stop offset=".45" stopColor="#E0242C" stopOpacity=".15" /><stop offset="1" stopColor="#D42022" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("shadow")}>
          <stop offset="0" stopColor="#030303" stopOpacity=".42" /><stop offset="1" stopColor="#030303" stopOpacity="0" />
        </radialGradient>
        <clipPath id={id("faceclip")}>
          <path d="M149 164 C152 118 194 99 258 98 C327 99 360 119 371 159 Q388 218 364 254 C338 283 191 292 157 265 C133 247 134 197 149 164 Z" />
        </clipPath>
      </defs>

      <ellipse className="aya-glow" cx={255} cy={288} rx={215} ry={145} fill={url("aura")} opacity={0.52} />
      <ellipse className="aya-shadow" cx={258} cy={446} rx={140} ry={22} fill={url("shadow")} />

      <g className="aya-body-rig">
        <g className="aya-torso">
          <path d="M185 331 Q203 299 256 304 Q320 305 335 338 L355 406 Q346 445 255 447 Q165 443 163 408 Z" fill={url("silver")} stroke="#686169" strokeWidth={5} />
          <path d="M192 337 Q226 317 314 332" fill="none" stroke="#FFF6F0" strokeWidth={9} opacity={0.5} strokeLinecap="round" />
          <path d="M218 337 Q250 325 297 337 L318 411 Q289 430 251 430 Q212 428 195 411 Z" fill={url("cream")} stroke="#9B8D8B" strokeWidth={3} />
          <path d="M234 325 L270 325 L274 345 L230 345Z" fill="#262126" />
          <BadgeA transform="translate(236 356) scale(0.81)" />
        </g>
        <g className="aya-arm aya-arm-l">
          <circle cx={151} cy={358} r={47} fill={url("steel")} stroke="#514D55" strokeWidth={5} />
          <circle cx={149} cy={365} r={31} fill={url("cream")} stroke="#AAA1A2" strokeWidth={3} />
        </g>
        <g className={`aya-arm aya-arm-r${pointing ? " aya-arm-point" : ""}`}>
          <circle cx={367} cy={359} r={46} fill={url("steel")} stroke="#514D55" strokeWidth={5} />
          <circle cx={369} cy={366} r={31} fill={url("cream")} stroke="#AAA1A2" strokeWidth={3} />
        </g>
        <g className="aya-feet">
          <g className="aya-foot aya-foot-l">
            <circle cx={178} cy={403} r={36} fill={url("silver")} stroke="#8B7C7F" strokeWidth={4} />
          </g>
          <g className="aya-foot aya-foot-r">
            <circle cx={337} cy={403} r={36} fill={url("silver")} stroke="#8B7C7F" strokeWidth={4} />
          </g>
        </g>

        <g className="aya-head">
          <path d="M122 160 C133 67 196 34 250 34 C312 31 367 66 389 139" fill="none" stroke="#43383F" strokeWidth={32} strokeLinecap="round" />
          <path d="M123 154 C139 74 188 44 250 42 Q320 34 379 131" fill="none" stroke={url("cream")} strokeWidth={22} strokeLinecap="round" />
          <path d="M137 139 C152 81 198 53 256 50" stroke="#FFF6EF" strokeWidth={7} fill="none" opacity={0.5} strokeLinecap="round" />
          <ellipse cx={393} cy={204} rx={32} ry={66} fill={url("silver")} stroke="#76676F" strokeWidth={5} />
          <ellipse cx={399} cy={205} rx={13} ry={43} fill={url("steel")} opacity={0.8} />
          <path d="M116 169 C125 100 177 74 252 69 C336 65 394 98 409 165 Q427 240 396 291 Q355 332 256 332 C173 334 115 318 101 279 Q90 232 116 169Z" fill={url("silver")} stroke="#7E7076" strokeWidth={4.5} />
          <path d="M129 152 C150 93 191 83 257 80 C331 79 379 102 394 150" fill="none" stroke="#FFF9F4" strokeOpacity={0.65} strokeWidth={11} strokeLinecap="round" />
          <path d="M119 275 Q163 319 250 319 Q356 321 395 279" fill="none" stroke="#B5A6A6" strokeWidth={11} opacity={0.8} />
          <path className="aya-visor-rim" d="M141 155 C153 106 194 91 255 90 C329 89 369 114 382 156 Q402 224 371 270 C349 294 180 309 149 276 Q120 246 141 155Z" fill="#6D0D14" stroke="#EF3E39" strokeWidth={8} opacity={0.85} />
          <path d="M149 164 C152 118 194 99 258 98 C327 99 360 119 371 159 Q388 218 364 254 C338 283 191 292 157 265 C133 247 134 197 149 164 Z" fill={url("visor")} stroke="#211E21" strokeWidth={5} />
          <g clipPath={url("faceclip")}>
            <path d="M147 160 Q177 102 284 100 Q328 101 352 117" stroke="#FFFFFF" opacity={0.065} strokeWidth={28} fill="none" />
            <path d="M135 237 Q149 283 198 286" stroke="#F13F39" opacity={0.13} strokeWidth={24} fill="none" />
          </g>
          <g className="aya-face">
            <g className="aya-eyes">
              <Face state={state} />
            </g>
          </g>
          <ellipse cx={119} cy={213} rx={67} ry={83} fill={url("steel")} stroke="#817478" strokeWidth={5} />
          <ellipse cx={115} cy={217} rx={48} ry={63} fill="#1A161B" stroke="#756363" strokeWidth={5} />
          <ellipse cx={115} cy={217} rx={41} ry={54} fill="#181318" stroke="#3F292C" strokeWidth={2} />
          <BadgeA transform="translate(92 188) scale(1.02)" />
          <path d="M87 160 Q113 144 139 162" stroke="#FFF8F5" strokeWidth={7} opacity={0.36} fill="none" strokeLinecap="round" />
          <path d="M160 97 L173 106 M308 76 L315 85" stroke="#8C8287" strokeWidth={2} opacity={0.5} />
        </g>

        {pointing ? (
          <g className="aya-acc aya-acc-point">
            <path d="M412 330 L440 314" stroke="#B43535" strokeWidth={4} strokeLinecap="round" />
            <circle cx={445} cy={311} r={8} fill="#D43A3A" />
          </g>
        ) : null}
        <Accessory state={state} red={id("red")} />
      </g>
    </svg>
  );
}
