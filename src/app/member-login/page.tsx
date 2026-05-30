import type { Metadata } from "next";
import { MemberLoginScreen } from "@/components/garage/member-login-screen";

export const metadata: Metadata = {
  title: "Login Member - Garage Coffee & Motor",
  description:
    "Pintu masuk member Garage Coffee & Motor untuk rewards, promo, dan riwayat kunjungan.",
};

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function MemberLoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  return <MemberLoginScreen initialReturnTarget={firstParam(params, "next")} />;
}
