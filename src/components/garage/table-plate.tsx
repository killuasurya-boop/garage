import { cn } from "@/lib/utils";

const SIZES = {
  xs: { box: "min-w-9 px-1.5 py-0.5", label: "text-[7px] tracking-[0.2em]", number: "text-[15px]" },
  sm: { box: "min-w-11 px-2 py-1", label: "text-[8px] tracking-[0.22em]", number: "text-[18px]" },
  md: { box: "min-w-[3.25rem] px-2 py-1", label: "text-[8.5px] tracking-[0.24em]", number: "text-[24px]" },
  lg: { box: "min-w-[4.5rem] px-3 py-1.5", label: "text-[10px] tracking-[0.28em]", number: "text-[34px]" },
  xl: { box: "min-w-[6rem] px-4 py-2", label: "text-[12px] tracking-[0.3em]", number: "text-[56px]" },
} as const;

/**
 * "Plat nomor meja" Garage — satu tampilan nomor meja untuk semua layar
 * (waiter, POS, KDS, layar antrian): plat hitam, label MEJA kecil, angka
 * monospace tebal, garis merah di bawah seperti plat motor.
 */
export function TablePlate({
  number,
  size = "md",
  label = "MEJA",
  className,
  numberClassName,
}: {
  number: string;
  size?: keyof typeof SIZES;
  label?: string;
  className?: string;
  /** Override ukuran angka (mis. clamp() di layar besar). */
  numberClassName?: string;
}) {
  const s = SIZES[size];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 flex-col items-center justify-center rounded-md border-b-[3px] border-[#d11a2a] bg-[#0b0b0e] text-center leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-white/15",
        s.box,
        className,
      )}
    >
      <span className={cn("font-bold uppercase text-[#b8b8bf]", s.label)}>{label}</span>
      <span className={cn("mt-0.5 font-mono font-black tabular-nums tracking-tight text-white", s.number, numberClassName)}>{number}</span>
    </span>
  );
}
