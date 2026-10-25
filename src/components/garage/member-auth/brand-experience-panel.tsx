import Link from "next/link";

import { GarageBrandLogo } from "./garage-brand-logo";
import { MotionReveal } from "./motion-reveal";

/** Cerita brand: logo + headline editorial. Desktop di kiri, tablet di atas kartu, mobile hanya logo. */
export function BrandExperiencePanel() {
  return (
    <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
      <MotionReveal delay={0} className="w-[min(300px,78vw)] md:w-[min(540px,72vw)] lg:w-[min(640px,100%)]">
        <Link href="/" aria-label="Garage Coffee — ke website" className="block rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--gm-accent-hover)]">
          <GarageBrandLogo />
        </Link>
      </MotionReveal>
      <MotionReveal delay={80} className="mt-6 hidden md:block lg:mt-10 lg:pl-6">
        <p className="gm-headline whitespace-nowrap md:text-[2.75rem] lg:text-[2.25rem] xl:text-[clamp(2.75rem,4.4vw,4.5rem)]">
          Your Coffee.
          <br />
          <span className="gm-headline-accent">Your Experience.</span>
        </p>
        <p className="gm-body gm-shadow-text mx-auto mt-4 lg:mt-5 max-w-[42ch] text-base text-[#dcd8d3] md:text-[17px] lg:mx-0">
          Masuk ke dunia Garage Coffee dan nikmati pengalaman member yang lebih personal.
        </p>
      </MotionReveal>
    </div>
  );
}
