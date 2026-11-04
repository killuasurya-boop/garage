// Aya V2 berlapis ("rig", A3): bentuk & warna sama persis dengan public/garage-brand/aya/v2/aya-*.svg
// (sumber docs/aya-v2/design-kit/assets), tetapi tiap bagian — antena, tangan, mata, mulut, aksesori —
// jadi grup sendiri sehingga bisa berkedip, melirik, menunjuk, dan melambai lewat CSS (aya.css).
// Bayangan memakai gradient (bukan filter blur) agar ringan di tablet kasir/KDS.
import { useId, type CSSProperties } from "react";

import type { AyaState } from "@/components/garage/aya/aya-mascot";

const INK = "#383331";
const LIP = "#794E46";

export type AyaLook = "center" | "left" | "right";

/** Angka semu-acak stabil dari id (sama di server & klien → tanpa hydration mismatch). */
export function ayaSeed(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

function OpenEye({ cx, cy = 235, rx = 10, ry = 15, hl = 3.2 }: { cx: number; cy?: number; rx?: number; ry?: number; hl?: number }) {
  return (
    <g className="aya-eye-open">
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={INK} />
      <circle cx={cx + 3} cy={cy - 5.5} r={hl} fill="#fff" />
    </g>
  );
}

const arc = (d: string, width = 8) => <path d={d} stroke={INK} strokeWidth={width} fill="none" strokeLinecap="round" />;

function Face({ state }: { state: AyaState }) {
  switch (state) {
    case "listening":
      return (
        <>
          <g className="aya-eyes"><OpenEye cx={214} /><OpenEye cx={307} /></g>
          <path className="aya-mouth-line" d="M252 267 Q260 260 268 267" stroke={LIP} strokeWidth={4.5} fill="none" strokeLinecap="round" />
        </>
      );
    case "speaking":
      return (
        <>
          <g className="aya-eyes">{arc("M194 237 Q213 219 232 237")}{arc("M288 237 Q307 219 326 237")}</g>
          <ellipse className="aya-mouth-talk" cx={260} cy={272} rx={12} ry={8} fill="#773D3D" />
        </>
      );
    case "thinking":
      return (
        <>
          <g className="aya-eyes"><OpenEye cx={216} cy={233} rx={11} ry={15} hl={3.3} />{arc("M289 238 Q307 230 325 235", 7)}</g>
          <circle cx={268} cy={268} r={5} fill={LIP} />
        </>
      );
    case "warning":
      return (
        <>
          <g className="aya-eyes"><OpenEye cx={216} rx={13} ry={16} hl={4} /><OpenEye cx={306} rx={13} ry={16} hl={4} /></g>
          <ellipse cx={260} cy={273} rx={13} ry={15} fill="#773D3D" />
        </>
      );
    case "success":
      return (
        <>
          <g className="aya-eyes">{arc("M194 234 Q213 209 235 231")}{arc("M286 231 Q307 209 327 234")}</g>
          <path d="M236 267 Q260 298 285 267" fill="#773D3D" stroke={LIP} strokeWidth={3} />
          <path d="M245 280 Q260 288 275 280" fill="none" stroke="#F6A8A0" strokeWidth={4} />
        </>
      );
    case "guiding":
      return (
        <>
          <g className="aya-eyes">{arc("M194 236 Q214 220 234 237")}<OpenEye cx={307} rx={10} ry={14} hl={3} /></g>
          <path d="M248 266 Q260 278 273 266" stroke={LIP} strokeWidth={5} fill="none" strokeLinecap="round" />
        </>
      );
    case "error":
      return (
        <>
          <g className="aya-eyes">{arc("M195 221 Q215 228 233 237", 7)}{arc("M287 238 Q306 228 326 221", 7)}</g>
          <path d="M247 274 Q260 260 273 274" stroke={LIP} strokeWidth={5} fill="none" strokeLinecap="round" />
        </>
      );
    default:
      return (
        <>
          <g className="aya-eyes">{arc("M194 236 Q214 220 234 237")}{arc("M286 237 Q306 220 326 236")}</g>
          <path d="M247 266 Q260 279 273 266" stroke={LIP} strokeWidth={5} fill="none" strokeLinecap="round" />
        </>
      );
  }
}

function Accessory({ state }: { state: AyaState }) {
  switch (state) {
    case "listening":
      return <path className="aya-acc aya-acc-waves" d="M367 208 Q393 227 367 246 M380 197 Q421 227 380 258" fill="none" stroke="#D65751" strokeWidth={5} opacity={0.7} strokeLinecap="round" />;
    case "thinking":
      return (
        <g className="aya-acc aya-acc-dots" fill="#F2C57C">
          <circle cx={364} cy={121} r={7} /><circle cx={379} cy={100} r={4.5} /><circle cx={388} cy={84} r={3} />
        </g>
      );
    case "warning":
      return (
        <g className="aya-acc aya-acc-warn" transform="translate(350 90)">
          <path d="M0 -34 L32 25 H-32Z" fill="#E8493D" stroke="#FFBC91" strokeWidth={4} />
          <path d="M0 -12 V7" stroke="white" strokeWidth={6} strokeLinecap="round" />
          <circle cy={17} r={3.5} fill="white" />
        </g>
      );
    case "success":
      return <path className="aya-acc aya-acc-star" d="M371 124 l8 14 15 3 -12 11 2 16 -13 -8 -13 8 2 -16 -12 -11 15 -3Z" fill="#E9BD65" />;
    default:
      return null;
  }
}

export function AyaRig({ state, look = "center" }: { state: AyaState; look?: AyaLook }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const id = (name: string) => `aya-${name}-${uid}`;
  const seed = ayaSeed(uid);
  // Kedip acak per Aya: jeda 0–4 dtk, siklus 4,5–7 dtk.
  const blink = { "--aya-blink-delay": `${(seed * 4).toFixed(2)}s`, "--aya-blink-dur": `${(4.5 + seed * 2.5).toFixed(2)}s` } as CSSProperties;
  const pointing = state === "guiding";

  return (
    <svg className="aya-rig" viewBox="0 0 520 520" data-look={look} style={blink} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={id("body")} cx="36%" cy="23%" r="76%">
          <stop offset="0" stopColor="#fffdf8" /><stop offset="0.56" stopColor="#fff9ef" /><stop offset="0.85" stopColor="#eadfd3" /><stop offset="1" stopColor="#c9bdb4" />
        </radialGradient>
        <radialGradient id={id("shine")} cx="33%" cy="21%" r="82%">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity=".9" /><stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("arm")} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fffefa" /><stop offset="1" stopColor="#e3d5c8" />
        </linearGradient>
        <linearGradient id={id("badge")} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#FB5D52" /><stop offset="1" stopColor="#B62B29" />
        </linearGradient>
        <radialGradient id={id("glow")}>
          <stop stopColor="#F25B50" stopOpacity=".33" /><stop offset="1" stopColor="#F25B50" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("shadow")}>
          <stop stopColor="#030303" stopOpacity=".3" /><stop offset="1" stopColor="#030303" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle className="aya-glow" cx={260} cy={218} r={190} fill={`url(#${id("glow")})`} />
      <ellipse className="aya-shadow" cx={260} cy={428} rx={132} ry={24} fill={`url(#${id("shadow")})`} />

      <g className="aya-body-rig">
        <g className="aya-antenna">
          <path d="M259 120 Q250 96 260 82 Q271 96 263 121" fill="#F7E7DB" stroke="#DBBBB2" strokeWidth={4} />
          <circle className="aya-antenna-dot" cx={260} cy={82} r={9} fill="#D4413B" />
          <circle cx={257} cy={79} r={3} fill="#fff" opacity={0.8} />
        </g>
        <g className="aya-feet">
          <ellipse cx={212} cy={408} rx={39} ry={21} transform="rotate(-10 212 408)" fill={`url(#${id("arm")})`} stroke="#D4C6BC" strokeWidth={3} />
          <ellipse cx={313} cy={408} rx={39} ry={21} transform="rotate(10 313 408)" fill={`url(#${id("arm")})`} stroke="#D4C6BC" strokeWidth={3} />
        </g>
        <g className="aya-arm aya-arm-l">
          <path d="M162 290 Q112 276 106 309 Q104 335 146 339 Q173 329 181 314Z" fill={`url(#${id("arm")})`} stroke="#D5C6B9" strokeWidth={4} />
        </g>
        <g className={`aya-arm aya-arm-r${pointing ? " aya-arm-point" : ""}`}>
          <path d="M358 290 Q408 275 415 309 Q418 336 371 337 Q349 326 340 315Z" fill={`url(#${id("arm")})`} stroke="#D5C6B9" strokeWidth={4} />
        </g>
        <path d="M259 110 C327 100 382 135 389 204 C397 264 398 325 363 366 C342 395 298 403 260 404 C221 405 177 397 155 368 C122 324 124 266 132 204 C139 143 190 109 259 110Z" fill={`url(#${id("body")})`} stroke="#D0C3B9" strokeWidth={4} />
        <ellipse cx={214} cy={173} rx={65} ry={44} fill={`url(#${id("shine")})`} opacity={0.7} transform="rotate(-18 214 173)" />
        <g className="aya-cheeks">
          <ellipse cx={176} cy={270} rx={24} ry={14} fill="#F4A8A2" opacity={0.39} />
          <ellipse cx={345} cy={270} rx={24} ry={14} fill="#F4A8A2" opacity={0.39} />
        </g>
        <g className="aya-face">
          <Face state={state} />
        </g>
        <path d="M225 333 Q260 350 296 333 Q288 361 260 368 Q232 361 225 333Z" fill="#AD302C" opacity={0.9} />
        <circle cx={260} cy={348} r={14} fill={`url(#${id("badge")})`} stroke="#F6D8CD" strokeWidth={3} />
        <path d="M254 348 l4 5 9 -11" fill="none" stroke="#fff9ed" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        {pointing ? (
          <g className="aya-acc aya-acc-point">
            <path d="M392 218 L421 205" stroke="#B43535" strokeWidth={4} strokeLinecap="round" />
            <circle cx={426} cy={202} r={8} fill="#D94A43" />
          </g>
        ) : null}
        <Accessory state={state} />
      </g>
    </svg>
  );
}
