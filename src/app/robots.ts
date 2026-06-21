import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL ?? "https://app.garagecoffee.id";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/order", "/franchise", "/member-login"],
        // Modul operasional & endpoint internal tidak boleh diindeks.
        disallow: [
          "/api/",
          "/control",
          "/dashboard",
          "/pos",
          "/pos-login",
          "/os",
          "/display",
          "/shift",
          "/attendance",
          "/sales-history",
          "/account",
          "/login",
          "/member",
          "/invoice",
          "/saas-executive",
          "/garage-uploads",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
