import Image from "next/image";

/** Garis neon merah vertikal (hanya opacity yang beranimasi). */
export function RedLaserEffect() {
  return (
    <>
      <span className="gm-laser gm-laser-a" />
      <span className="gm-laser gm-laser-b" />
    </>
  );
}

/** Latar sinematik member: asphalt, es kopi Garage (Crystal V5: hanya minuman dingin), laser merah, grain, vignette. */
export function CinematicBackground() {
  return (
    <div className="gm-bg" aria-hidden="true">
      <RedLaserEffect />
      <div className="gm-scene">
        <Image
          src="/garage-brand/crystal/hero-iced-latte.webp"
          alt=""
          fill
          sizes="(max-width: 1023px) 100vw, 62vw"
          className="select-none"
        />
      </div>
      <div className="gm-grain" />
      <div className="gm-vignette" />
    </div>
  );
}
