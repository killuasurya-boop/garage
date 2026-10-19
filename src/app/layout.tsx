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
  process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL ?? "https://garagecoffee.id";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "Garage POS",
  title: "Garage Coffee Tebing Tinggi",
  description: "Garage Coffee Tebing Tinggi — cafe & coffee shop, buka setiap hari 15.00–23.00 WIB.",
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

// Halaman pelanggan (website, /order, invoice) boleh di-zoom dua jari —
// pelanggan sepuh perlu memperbesar menu & harga (WCAG 1.4.4). Layar staf
// (/pos, /os) tetap mengunci zoom lewat `staffViewport` di page masing-masing.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
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
      lang="id"
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
