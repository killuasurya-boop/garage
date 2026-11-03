// Aya V2 — maskot resmi Garage Coffee (keputusan Owner OD-02, 4 Nov 2026; sumber visual
// docs/aya-v2/design-kit/assets/aya_master.svg): makhluk putih mungil seperti mochi, mata sipit,
// tangan & kaki pendek, titik antena digital, syal merah. Delapan state = delapan SVG di
// public/garage-brand/aya/v2/, dimuat lewat <img> (ringan, ter-cache, id gradient tiap file tidak
// bentrok). Gerak hanya CSS transform/opacity di aya.css; mati saat prefers-reduced-motion atau
// prop `reducedMotion`. Tidak memutar suara dan tidak memanggil layanan apa pun (mode Rp 0, OD-03).
import "./aya.css";

export const AYA_STATES = ["idle", "listening", "speaking", "thinking", "warning", "success", "guiding", "error"] as const;
export type AyaState = (typeof AYA_STATES)[number];

/** Gerak tubuh di atas state: diam, melambai, joget, terbang. */
export type AyaMotion = "rest" | "wave" | "dance" | "fly";

export type AyaAudience = "customer" | "staff" | "owner";

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
  return `/garage-brand/aya/v2/aya-${state}.svg`;
}

export function AyaMascot({
  state = "idle",
  motion = "rest",
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
  /** Lebar & tinggi dalam px; kosong = ikut ukuran wadah. */
  size?: number;
  /** `head` = potongan wajah untuk avatar bulat. */
  crop?: "full" | "head";
  /** Suara Aya dimatikan — dibaca lapisan suara (Phase 3); maskot sendiri tidak berbunyi. */
  muted?: boolean;
  /** Paksa tanpa animasi (selain prefers-reduced-motion yang sudah otomatis). */
  reducedMotion?: boolean;
  /** Konteks tampil; staf (POS/KDS) memakai gerak lebih tenang. */
  role?: AyaAudience;
  className?: string;
  /** Kosong = dekoratif (aria-hidden). */
  title?: string;
}) {
  return (
    <span
      className={`aya-svg aya-mascot ${className}`}
      data-state={state}
      data-motion={motion}
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
        {/* key = state: animasi masuk diputar ulang saat state berganti */}
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG statis lokal; next/image tidak menambah apa pun */}
        <img key={state} className="aya-img" src={ayaAssetSrc(state)} alt="" draggable={false} decoding="async" />
        {state === "speaking" ? <span className="aya-mouth" /> : null}
        {state === "listening" ? <span className="aya-ring" /> : null}
      </span>
    </span>
  );
}
