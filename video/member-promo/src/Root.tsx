import { Composition } from "remotion";

import { MemberPromo } from "./MemberPromo";

// 15 dtk @30fps. Vertikal untuk Reels/TikTok/Status WA, lebar untuk layar kasir/website.
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="MemberPromoVertical" component={MemberPromo} durationInFrames={450} fps={30} width={1080} height={1920} defaultProps={{ layout: "vertical" as const }} />
      <Composition id="MemberPromoWide" component={MemberPromo} durationInFrames={450} fps={30} width={1920} height={1080} defaultProps={{ layout: "wide" as const }} />
    </>
  );
};
