import Image from "next/image";
import { GARAGE_BRAND_ASSETS } from "@/lib/garage-brand-assets";

/** Logo resmi Garage Coffee — selalu object-contain, tidak pernah dipotong/direkonstruksi. */
export function GarageBrandLogo({
  className,
  priority = true,
  sizes = "(max-width: 767px) 300px, (max-width: 1023px) 560px, 640px",
}: {
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  return (
    <Image
      src={GARAGE_BRAND_ASSETS.wordmark}
      alt="Garage Coffee"
      width={1200}
      height={282}
      priority={priority}
      sizes={sizes}
      className={`h-auto w-full object-contain drop-shadow-[0_18px_40px_rgba(0,0,0,0.65)] ${className ?? ""}`}
    />
  );
}
