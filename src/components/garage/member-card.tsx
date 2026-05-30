import Image from "next/image";

import type { MemberLevel } from "@/lib/member-types";

const levelStyles: Record<MemberLevel, { tone: string; border: string; label: string }> = {
  Silver: {
    tone: "from-white/[0.14] via-white/[0.045] to-[#54545d]/18",
    border: "border-white/18",
    label: "Normal point + promo umum + welcome reward",
  },
  Gold: {
    tone: "from-[#f5a742]/24 via-[#d11a2a]/10 to-black/20",
    border: "border-[#f5a742]/42",
    label: "1.2x point + birthday reward + priority promo",
  },
  Platinum: {
    tone: "from-[#70b8ee]/24 via-[#12365f]/18 to-white/[0.08]",
    border: "border-[#70b8ee]/45",
    label: "1.5x point + monthly drink + exclusive event",
  },
  Ultra: {
    tone: "from-[#9060f0]/28 via-[#201060]/24 to-black/20",
    border: "border-[#9060f0]/50",
    label: "2x point + prototype access + owner-only privilege",
  },
};

export function MemberLevelCard({
  level,
  points,
  multiplier,
  active,
}: {
  level: MemberLevel;
  points: string;
  multiplier: string;
  active?: boolean;
}) {
  const style = levelStyles[level];

  return (
    <article
      className={`garage-hover-lift relative overflow-hidden border ${style.border} bg-gradient-to-br ${style.tone} p-5 ${
        active ? "garage-red-glow" : ""
      }`}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent" />
      <div className="absolute -right-16 -top-16 size-40 rounded-full bg-[#d11a2a]/16 blur-3xl" />
      <div className="relative flex min-h-[190px] flex-col justify-between">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="garage-mono">{active ? "LEVEL AKTIF" : "LEVEL"}</p>
            <h3 className="garage-display mt-2 text-5xl leading-none">{level}</h3>
          </div>
          <Image
            src="/garage-brand/logo-icon.png"
            alt=""
            width={72}
            height={72}
            sizes="56px"
            className="size-14 object-contain opacity-75"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-white/12 pt-4 text-sm">
          <div>
            <p className="garage-mono">Point</p>
            <p className="mt-1 font-semibold text-white">{points}</p>
          </div>
          <div>
            <p className="garage-mono">Reward</p>
            <p className="mt-1 font-semibold text-white">{multiplier}</p>
          </div>
          <div className="col-span-2">
            <p className="garage-mono">Benefit</p>
            <p className="mt-1 text-sm text-[#d0d0d6]">{style.label}</p>
          </div>
        </div>
      </div>
    </article>
  );
}
