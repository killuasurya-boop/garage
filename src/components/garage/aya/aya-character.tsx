// Adapter API lama Aya (ekspresi + pose D-07) ke maskot V2 (keputusan Owner OD-02): semua
// pemanggil lama — pet melayang, companion staf, sapaan /order, avatar — otomatis memakai
// karakter V2 tanpa diubah satu per satu. Kode baru sebaiknya langsung memakai AyaMascot.
import { AyaMascot, type AyaAudience, type AyaEffect, type AyaLook, type AyaMotion, type AyaState } from "@/components/garage/aya/aya-mascot";

export type AyaExpression = "default" | "happy" | "centil" | "grumpy" | "sleepy" | "alert" | "thinking" | "surprised";
export type AyaPose = "idle" | "wave" | "dance" | "cross" | "fly";

const STATE_FOR_EXPRESSION: Record<AyaExpression, AyaState> = {
  default: "idle",
  happy: "success",
  centil: "guiding", // satu mata mengedip
  grumpy: "error",
  sleepy: "idle", // mata V2 saat santai sudah terpejam
  alert: "warning",
  thinking: "thinking",
  surprised: "listening", // mata terbuka lebar
};

const MOTION_FOR_POSE: Record<AyaPose, AyaMotion> = {
  idle: "rest",
  wave: "wave",
  dance: "dance",
  cross: "rest",
  fly: "fly",
};

export function ayaStateForExpression(expression: AyaExpression): AyaState {
  return STATE_FOR_EXPRESSION[expression];
}

export function ayaMotionForPose(pose: AyaPose): AyaMotion {
  return MOTION_FOR_POSE[pose];
}

export function AyaCharacter({
  expression = "default",
  pose = "idle",
  crop = "full",
  className = "",
  title,
  role,
  effect,
  landing = false,
  look,
}: {
  expression?: AyaExpression;
  pose?: AyaPose;
  crop?: "full" | "head";
  className?: string;
  /** Kosong = dekoratif (aria-hidden). */
  title?: string;
  role?: AyaAudience;
  /** Efek lucu sesaat; kosong = otomatis (mengantuk → zzz, sukses → kilau). */
  effect?: AyaEffect | null;
  /** Baru mendarat → squash & stretch sekali. */
  landing?: boolean;
  /** Arah lirik mata (mis. ke tombol yang sedang ditunjuk). */
  look?: AyaLook;
}) {
  return (
    <AyaMascot
      state={ayaStateForExpression(expression)}
      motion={landing && pose === "idle" ? "land" : ayaMotionForPose(pose)}
      effect={effect ?? (expression === "sleepy" ? "zzz" : null)}
      crop={crop}
      look={look}
      className={`${expression === "sleepy" ? "aya-sleepy " : ""}${className}`}
      title={title}
      role={role}
    />
  );
}
