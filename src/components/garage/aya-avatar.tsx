// Avatar Aya — robot AI Garage (keputusan Owner D-07). Satu sumber gambar untuk
// panel AI, notifikasi, dan sambutan website. Selalu object-contain; teks status
// tetap ditulis di samping avatar (avatar tidak menggantikan label).
import Image from "next/image";

import { AYA_AVATAR_SRC, AYA_NAME } from "@/lib/garage-ai-persona";

export function AyaAvatar({ size = 32, className = "", decorative = false }: { size?: number; className?: string; decorative?: boolean }) {
  return (
    <Image
      src={AYA_AVATAR_SRC}
      alt={decorative ? "" : `${AYA_NAME}, robot AI Garage Coffee`}
      width={size}
      height={size}
      className={`shrink-0 object-contain ${className}`}
      unoptimized
    />
  );
}
