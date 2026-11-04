// Aya V5 — maskot resmi Garage Coffee: robot berhelm silver, visor hitam, headphone berlogo "A" merah
// (keputusan Owner 4 Nov 2026, dipakai di SEMUA layar; sumber visual docs/design-references/aya-v5/).
// - Badan penuh = AyaRig (SVG berlapis: kedip, lirik, tangan menunjuk/melambai, kaki berjalan/berlari).
// - Potongan kepala (avatar kecil) = <img> dari public/garage-brand/aya/v5/ (ringan, ter-cache).
// Gerak hanya CSS transform/opacity di aya.css; mati saat prefers-reduced-motion atau prop
// `reducedMotion`. Tidak memutar suara dan tidak memanggil layanan apa pun (mode Rp 0, OD-03).
import { AyaRig, type AyaLook } from "@/components/garage/aya/aya-rig";

import "./aya.css";

export const AYA_STATES = ["idle", "listening", "speaking", "thinking", "warning", "success", "guiding", "error"] as const;
export type AyaState = (typeof AYA_STATES)[number];

/** Gerak tubuh di atas state: diam, melambai, joget, terbang, mendarat (squash & stretch), berjalan, berlari. */
export type AyaMotion = "rest" | "wave" | "dance" | "fly" | "land" | "walk" | "run";

/** Efek lucu sesaat di sekitar Aya. */
export const AYA_EFFECTS = ["sparkle", "hearts", "dizzy", "zzz", "blush"] as const;
export type AyaEffect = (typeof AYA_EFFECTS)[number];

export type AyaAudience = "customer" | "staff" | "owner";
export type { AyaLook };

export const AYA_STATE_LABEL: Record<AyaState, string> = {
  idle: "santai",
  listening: "mendengarkan",
  speaking: "berbicara",
  thinking: "berpikir",
  warning: "memberi peringatan",
  success: "senang, berhasil",
  guiding: "menunjukkan arah",
  error: "bingung, ada kendala",
};

export function ayaAssetSrc(state: AyaState) {
  return `/garage-brand/aya/v5/aya-${state}.svg`;
}

/** Sukses otomatis berkilau bila pemanggil tidak memilih efek lain. */
export function ayaEffectFor(state: AyaState, effect?: AyaEffect | null): AyaEffect | null {
  if (effect) return effect;
  return state === "success" ? "sparkle" : null;
}

const SPARK = "M0 -10 L2.4 -2.4 L10 0 L2.4 2.4 L0 10 L-2.4 2.4 L-10 0 L-2.4 -2.4Z";
const HEART = "M0 8 C-9 1 -9 -7 -3.5 -7 C-1.5 -7 0 -5 0 -3.5 C0 -5 1.5 -7 3.5 -7 C9 -7 9 1 0 8Z";

function Effect({ effect }: { effect: AyaEffect }) {
  if (effect === "blush") return null; // dikerjakan lewat CSS (pipi merona)
  const shapes =
    effect === "sparkle"
      ? [0, 1, 2, 3].map((i) => <path key={i} d={SPARK} fill="#E9BD65" />)
      : effect === "hearts"
        ? [0, 1, 2].map((i) => <path key={i} d={HEART} fill="#E8493D" />)
        : effect === "dizzy"
          ? [0, 1, 2].map((i) => <path key={i} d={SPARK} fill="#F2C57C" transform="scale(0.7)" />)
          : [0, 1, 2].map((i) => (
              <text key={i} x={0} y={4} fontSize={14} fontWeight={800} fill="#BDB4AA" textAnchor="middle">z</text>
            ));
  return (
    <span className={`aya-fx aya-fx-${effect}`} aria-hidden="true">
      {shapes.map((shape, i) => (
        <svg key={i} className="aya-fx-item" style={{ ["--i" as string]: i }} viewBox="-12 -12 24 24">
          {shape}
        </svg>
      ))}
    </span>
  );
}

export function AyaMascot({
  state = "idle",
  motion = "rest",
  effect,
  look = "center",
  size,
  crop = "full",
  muted = false,
  reducedMotion = false,
  role,
  className = "",
  title,
}: {
  state?: AyaState;
  motion?: AyaMotion;
  /** Efek sesaat; kosong = otomatis (sukses berkilau). */
  effect?: AyaEffect | null;
  /** Arah lirik mata (mis. ke tombol yang sedang ditunjuk). */
  look?: AyaLook;
  /** Lebar & tinggi dalam px; kosong = ikut ukuran wadah. */
  size?: number;
  /** `head` = potongan wajah untuk avatar bulat (memakai gambar statis). */
  crop?: "full" | "head";
  /** Suara Aya dimatikan — dibaca lapisan suara (A4); maskot sendiri tidak berbunyi. */
  muted?: boolean;
  /** Paksa tanpa animasi (selain prefers-reduced-motion yang sudah otomatis). */
  reducedMotion?: boolean;
  /** Konteks tampil; staf (POS/KDS) memakai gerak lebih tenang. */
  role?: AyaAudience;
  className?: string;
  /** Kosong = dekoratif (aria-hidden). */
  title?: string;
}) {
  const fx = ayaEffectFor(state, effect);
  return (
    <span
      className={`aya-svg aya-mascot ${className}`}
      data-state={state}
      data-motion={motion}
      data-effect={fx ?? undefined}
      data-crop={crop}
      data-role={role}
      data-muted={muted ? "true" : undefined}
      data-reduced-motion={reducedMotion ? "true" : undefined}
      role={title ? "img" : undefined}
      aria-label={title ? `${title} — ${AYA_STATE_LABEL[state]}` : undefined}
      aria-hidden={title ? undefined : true}
      style={size ? { width: size, height: size } : undefined}
    >
      <span className="aya-stage">
        {crop === "full" ? (
          <AyaRig state={state} look={look} />
        ) : (
          <>
            {/* key = state: animasi masuk diputar ulang saat state berganti */}
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG statis lokal; next/image tidak menambah apa pun */}
            <img key={state} className="aya-img" src={ayaAssetSrc(state)} alt="" draggable={false} decoding="async" />
          </>
        )}
        {state === "listening" ? <span className="aya-ring" /> : null}
      </span>
      {fx && crop === "full" ? <Effect key={`${fx}-${state}`} effect={fx} /> : null}
    </span>
  );
}
