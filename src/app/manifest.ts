import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/pos",
    name: "Garage POS",
    short_name: "Garage POS",
    description: "Fullscreen POS tablet untuk Garage Coffee & Motor.",
    start_url: "/pos",
    scope: "/",
    display: "fullscreen",
    display_override: ["fullscreen", "standalone"],
    orientation: "landscape",
    background_color: "#08080b",
    theme_color: "#08080b",
    icons: [
      {
        src: "/garage-brand/logo-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/garage-brand/logo-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Buka POS",
        short_name: "POS",
        description: "Buka layar kasir fullscreen.",
        url: "/pos",
        icons: [
          {
            src: "/garage-brand/logo-icon.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    ],
    launch_handler: {
      client_mode: "focus-existing",
    },
  };
}
