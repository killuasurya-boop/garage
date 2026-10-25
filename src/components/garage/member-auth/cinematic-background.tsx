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

/** Latar sinematik member: asphalt, adegan cangkir, laser merah, grain, vignette. Dekoratif saja. */
export function CinematicBackground() {
  return (
    <div className="gm-bg" aria-hidden="true">
      <RedLaserEffect />
      <div className="gm-scene">
        <Image
          src="/garage-brand/member/member-scene.webp"
          alt=""
          fill
          sizes="(max-width: 1023px) 100vw, 62vw"
          className="select-none"
        />
        <span className="gm-steam" />
      </div>
      <div className="gm-grain" />
      <div className="gm-vignette" />
    </div>
  );
}
