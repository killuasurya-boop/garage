// Kode gabung meja untuk staf (waiter/kasir): tamu yang tidak punya kode dari teman
// semeja bisa bertanya ke staf. Kode hanya ada selama meja terisi tamu.
import { KeyRound } from "lucide-react";

export function StaffTableJoinCode({ joinCode, tableLabel, className = "" }: { joinCode?: string | null; tableLabel: string; className?: string }) {
  if (!joinCode) return null;
  return (
    <div className={`flex items-center gap-3 rounded-md border border-[#f5a742]/45 bg-[#f5a742]/10 px-3 py-2 ${className}`}>
      <KeyRound className="size-4 shrink-0 text-[#ffd08a]" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-[#ffd08a]">Kode gabung {tableLabel}</p>
        <p className="text-[11px] leading-snug text-[#d6d6dc]">Sebutkan ke teman semeja yang mau pesan dari HP sendiri.</p>
      </div>
      <span className="garage-mono shrink-0 text-xl font-black tracking-[0.25em] text-white" aria-label={`Kode gabung ${joinCode.split("").join(" ")}`}>
        {joinCode}
      </span>
    </div>
  );
}
