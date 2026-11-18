import type { Metadata } from "next";
import { LazyGaragePosLogin } from "@/components/garage/garage-app-loader";

export const metadata: Metadata = {
  title: "Masuk · Garage OS",
  description:
    "Login karyawan Garage Coffee untuk masuk ke GARAGE OS.",
};

type LoginPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

const allowedReturnTargets = new Set(["/os", "/dashboard", "/pos", "/control", "/panitia"]);
const allowedReturnPrefixes = ["/control/"];

function safeReturnTo(value: string | string[] | undefined) {
  const target = Array.isArray(value) ? value[0] : value;
  if (!target || !target.startsWith("/") || target.startsWith("//")) {
    return "/os";
  }

  const path = target.split("?")[0];
  if (allowedReturnTargets.has(path)) return target;
  if (allowedReturnPrefixes.some((p) => path.startsWith(p))) return target;
  return "/os";
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const returnTo = safeReturnTo(params.next);
  const returnPath = returnTo.split("?")[0];
  const isOwnerControlLogin = returnPath === "/control" || returnPath.startsWith("/control/");

  return (
    <LazyGaragePosLogin
      returnTo={returnTo}
      variant="os"
      includeOwnerPreset={isOwnerControlLogin}
      // Prefill email owner hanya di mode pengembangan — production tidak membocorkan akun.
      initialEmail={
        isOwnerControlLogin && process.env.NODE_ENV !== "production" ? "owner@garage.id" : undefined
      }
    />
  );
}
