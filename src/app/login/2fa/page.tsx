import type { Metadata } from "next";

import { TwoFactorChallenge } from "@/components/garage/admin/two-factor-challenge";

export const metadata: Metadata = {
  title: "Garage OS — Two-Factor Challenge",
  description: "Verifikasi 2FA untuk lanjut login ke Garage OS.",
};

type Props = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function TwoFactorChallengePage({ searchParams }: Props) {
  const params = await searchParams;
  const nextRaw = Array.isArray(params.next) ? params.next[0] : params.next;
  const next =
    nextRaw && nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/os";

  return <TwoFactorChallenge next={next} />;
}
