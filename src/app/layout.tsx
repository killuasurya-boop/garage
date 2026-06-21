import type { Metadata, Viewport } from "next";
import { Anton, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GarageToastProvider } from "@/components/garage/garage-toast";
import { GarageThemeProvider } from "@/components/garage/theme/garage-theme-provider";
import { AutoLogoutWatcher } from "@/components/garage/admin/auto-logout-watcher";
import { ClientErrorReporter } from "@/components/garage/client-error-reporter";
import "./globals.css";
import "@/components/garage-website/garage-website.css";

const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: "400",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const SITE_URL =
  process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL ?? "https://app.garagecoffee.id";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "Garage POS",
  title: "Garage Coffee & Motor",
  description:
    "Kopi premium dengan jiwa otomotif. Bengkel yang menyamar jadi coffee shop dengan budaya komunitas motor.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/garage-brand/logo-icon.png",
    apple: "/garage-brand/logo-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Garage POS",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#08080b",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${anton.variable} ${spaceGrotesk.variable} ${jetBrainsMono.variable} dark h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <GarageThemeProvider>
          <TooltipProvider delayDuration={250}>
            <GarageToastProvider>
              <AutoLogoutWatcher />
              <ClientErrorReporter />
              {children}
            </GarageToastProvider>
          </TooltipProvider>
        </GarageThemeProvider>
      </body>
    </html>
  );
}
