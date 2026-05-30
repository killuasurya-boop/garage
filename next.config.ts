import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

function localIpv4Hosts() {
  return Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry.address);
}

function hostFromOrigin(value: string | undefined) {
  if (!value) return null;

  try {
    return new URL(value).hostname;
  } catch {
    return value.replace(/^https?:\/\//, "").split(":")[0] || null;
  }
}

function configuredDevHosts() {
  const origins = [
    process.env.BETTER_AUTH_URL,
    process.env.GARAGE_PUBLIC_BASE_URL,
    process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL,
    ...(process.env.GARAGE_TRUSTED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  ];

  return origins.map(hostFromOrigin).filter((host): host is string => Boolean(host));
}

const nextConfig: NextConfig = {
  allowedDevOrigins: Array.from(
    new Set(["localhost", "127.0.0.1", ...configuredDevHosts(), ...localIpv4Hosts()]),
  ),
  async redirects() {
    return [
      {
        source: "/login-pos",
        destination: "/pos-login",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/garage-brand/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/garage-website/assets/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/garage-uploads/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
