import type { Metadata } from "next";
import { LazyGaragePosLogin } from "@/components/garage/garage-app-loader";

export const metadata: Metadata = {
  title: "Login GARAGE OS",
  description:
    "Login karyawan Garage Coffee & Motor untuk masuk ke GARAGE OS.",
};

type LoginPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

const allowedReturnTargets = new Set(["/os", "/dashboard", "/pos"]);

function safeReturnTo(value: string | string[] | undefined) {
  const target = Array.isArray(value) ? value[0] : value;
  if (!target || !target.startsWith("/") || target.startsWith("//")) {
    return "/os";
  }

  const path = target.split("?")[0];
  return allowedReturnTargets.has(path) ? target : "/os";
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const returnTo = safeReturnTo(params.next);

  return <LazyGaragePosLogin returnTo={returnTo} variant="os" />;
}
