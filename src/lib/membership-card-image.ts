import sharp from "sharp";
import QRCode from "qrcode";

import type { MemberLevel } from "@/lib/member-types";

export type MembershipCardImageInput = {
  name: string;
  phone: string;
  tier: string;
  memberCode?: string | null;
  address?: string | null;
  membershipSince?: string | Date | null;
  expiresAt?: string | Date | null;
};

export type MembershipCardImageOptions = {
  format: "png" | "jpeg";
  side: "front" | "back";
  width?: number;
};

const WIDTH = 1010;
const HEIGHT = 636;

type TierTheme = {
  label: string;
  badge: string;
  bgStart: string;
  bgMid: string;
  bgEnd: string;
  accent: string;
  muted: string;
  text: string;
  glow: string;
  concept: string;
};

const themes: Record<MemberLevel, TierTheme> = {
  Silver: {
    label: "SILVER",
    badge: "CLASS · S",
    bgStart: "#f4f6fb",
    bgMid: "#8a8f9c",
    bgEnd: "#1a1d26",
    accent: "#1a1d26",
    muted: "#363b48",
    text: "#0d1018",
    glow: "rgba(200,207,222,0.5)",
    concept: "INDUSTRIAL ACCESS",
  },
  Gold: {
    label: "GOLD",
    badge: "CLASS · G",
    bgStart: "#fff3c4",
    bgMid: "#c89828",
    bgEnd: "#3a2a10",
    accent: "#3a2a10",
    muted: "#4a3a0f",
    text: "#1f1606",
    glow: "rgba(245,197,66,0.55)",
    concept: "ELITE EXECUTIVE",
  },
  Platinum: {
    label: "PLATINUM",
    badge: "CLASS · P",
    bgStart: "#e7f4ff",
    bgMid: "#5a90c0",
    bgEnd: "#0a1828",
    accent: "#0a1828",
    muted: "#11304f",
    text: "#06121e",
    glow: "rgba(96,180,232,0.55)",
    concept: "QUANTUM PRESTIGE",
  },
  Ultra: {
    label: "ULTRA",
    badge: "CLASS · OMEGA",
    bgStart: "#f0e6ff",
    bgMid: "#8c5cf0",
    bgEnd: "#08020f",
    accent: "#f8f5ff",
    muted: "#cbb8f7",
    text: "#f8f5ff",
    glow: "rgba(140,92,240,0.6)",
    concept: "FORBIDDEN PROTOTYPE",
  },
};

function normalizeTier(tier: string): MemberLevel {
  if (tier === "Ultra") return "Ultra";
  if (tier === "Platinum") return "Platinum";
  if (tier === "Gold") return "Gold";
  return "Silver";
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatMemberNumber(code: string) {
  const normalized = code.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const padded = normalized.padEnd(16, "0").slice(0, 16);
  return padded.match(/.{1,4}/g)?.join(" ") ?? padded;
}

function formatSince(value?: string | Date | null) {
  if (!value) return "LIFETIME";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "LIFETIME";
  return date
    .toLocaleDateString("id-ID", { month: "short", year: "numeric" })
    .toUpperCase();
}

async function qrSvg(payload: string, tint: string) {
  return QRCode.toString(payload || "GARAGE", {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
    color: { dark: tint, light: "#ffffff00" },
    width: 180,
  });
}

function holoStripeRect(x: number, y: number, w: number, h: number) {
  return `
    <defs>
      <linearGradient id="holo" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0" />
        <stop offset="40%" stop-color="#ffffff" stop-opacity="0.18" />
        <stop offset="60%" stop-color="#ffffff" stop-opacity="0.35" />
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
      </linearGradient>
    </defs>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#holo)" />
  `;
}

function chipSvg(x: number, y: number, accent: string) {
  return `
    <g transform="translate(${x},${y})">
      <rect width="92" height="68" rx="10" fill="${accent}" opacity="0.92" />
      <rect x="16" y="14" width="60" height="40" rx="6" fill="#000" opacity="0.32" />
      <line x1="16" y1="26" x2="76" y2="26" stroke="#000" stroke-width="2" opacity="0.35" />
      <line x1="16" y1="40" x2="76" y2="40" stroke="#000" stroke-width="2" opacity="0.3" />
      <line x1="46" y1="14" x2="46" y2="54" stroke="#000" stroke-width="2" opacity="0.35" />
    </g>
  `;
}

async function buildFront(input: MembershipCardImageInput, theme: TierTheme) {
  const tier = normalizeTier(input.tier);
  const memberId = input.memberCode ?? `${tier.slice(0, 3).toUpperCase()}-${input.phone.slice(-4)}`;
  const qrPayload = JSON.stringify({ v: 1, id: memberId, tier, n: input.name });
  const qr = await qrSvg(qrPayload, theme.text);

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
      <defs>
        <radialGradient id="bg" cx="20%" cy="15%" r="120%">
          <stop offset="0%" stop-color="${theme.bgStart}" />
          <stop offset="40%" stop-color="${theme.bgMid}" />
          <stop offset="100%" stop-color="${theme.bgEnd}" />
        </radialGradient>
        <filter id="noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.15 0" />
        </filter>
      </defs>

      <rect width="${WIDTH}" height="${HEIGHT}" rx="42" ry="42" fill="url(#bg)" />
      <rect width="${WIDTH}" height="${HEIGHT}" rx="42" ry="42" fill="url(#bg)" filter="url(#noise)" opacity="0.55" />
      ${holoStripeRect(0, 0, WIDTH, HEIGHT)}

      <rect x="6" y="6" width="${WIDTH - 12}" height="${HEIGHT - 12}" rx="38" ry="38" fill="none" stroke="${theme.accent}" stroke-opacity="0.18" stroke-width="2" />

      <g transform="translate(58,58)">
        <text font-family="Anton, Impact, sans-serif" font-size="40" fill="${theme.text}" letter-spacing="6">GARAGE</text>
        <text y="28" font-family="JetBrains Mono, monospace" font-size="13" fill="${theme.muted}" letter-spacing="4">COFFEE &amp; MOTOR · MEDAN</text>
      </g>

      <g transform="translate(${WIDTH - 360},58)" text-anchor="end">
        <text x="300" font-family="JetBrains Mono, monospace" font-size="14" fill="${theme.muted}" letter-spacing="6">ACCESS TIER</text>
        <text x="300" y="58" font-family="Anton, Impact, sans-serif" font-size="68" fill="${theme.text}" letter-spacing="4">${theme.label}</text>
        <text x="300" y="86" font-family="JetBrains Mono, monospace" font-size="13" fill="${theme.muted}" letter-spacing="4">${theme.badge}</text>
      </g>

      ${chipSvg(58, 220, theme.accent)}

      <g transform="translate(${WIDTH - 240}, 220)">
        <rect width="180" height="180" rx="14" fill="#ffffff" opacity="0.82" />
        <g transform="translate(8, 8) scale(${164 / 180})">${qr}</g>
      </g>

      <g transform="translate(58, 430)">
        <text font-family="JetBrains Mono, monospace" font-weight="700" font-size="36" fill="${theme.text}" letter-spacing="8">${escapeXml(formatMemberNumber(memberId))}</text>
      </g>

      <g transform="translate(58, 520)">
        <text font-family="JetBrains Mono, monospace" font-size="14" fill="${theme.muted}" letter-spacing="6">MEMBER</text>
        <text y="38" font-family="Anton, Impact, sans-serif" font-size="36" fill="${theme.text}" letter-spacing="3">${escapeXml((input.name || "GARAGE MEMBER").toUpperCase())}</text>
      </g>

      <g transform="translate(${WIDTH - 240}, 520)">
        <text font-family="JetBrains Mono, monospace" font-size="14" fill="${theme.muted}" letter-spacing="6">VALID</text>
        <text y="38" font-family="Anton, Impact, sans-serif" font-size="32" fill="${theme.text}" letter-spacing="3">${escapeXml(formatSince(input.expiresAt ?? input.membershipSince))}</text>
      </g>
    </svg>
  `;
}

function buildBack(input: MembershipCardImageInput, theme: TierTheme) {
  const tier = normalizeTier(input.tier);
  const memberId = input.memberCode ?? `${tier.slice(0, 3).toUpperCase()}-${input.phone.slice(-4)}`;
  const address = input.address ?? "Garage HQ · Medan, ID";

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
      <defs>
        <radialGradient id="bgBack" cx="20%" cy="15%" r="120%">
          <stop offset="0%" stop-color="${theme.bgStart}" />
          <stop offset="40%" stop-color="${theme.bgMid}" />
          <stop offset="100%" stop-color="${theme.bgEnd}" />
        </radialGradient>
      </defs>

      <rect width="${WIDTH}" height="${HEIGHT}" rx="42" ry="42" fill="url(#bgBack)" />
      ${holoStripeRect(0, 0, WIDTH, HEIGHT)}
      <rect x="0" y="60" width="${WIDTH}" height="86" fill="#000" opacity="0.88" />

      <g transform="translate(58,200)">
        <text font-family="JetBrains Mono, monospace" font-size="14" fill="${theme.muted}" letter-spacing="6">${theme.concept}</text>
        <text y="42" font-family="Anton, Impact, sans-serif" font-size="38" fill="${theme.text}" letter-spacing="3">${theme.label} PROTOCOL</text>
      </g>

      <g transform="translate(58, 320)">
        <text font-family="JetBrains Mono, monospace" font-size="14" fill="${theme.muted}" letter-spacing="6">ALAMAT</text>
        <text y="32" font-family="Inter, sans-serif" font-size="22" fill="${theme.text}">${escapeXml(address.slice(0, 80))}</text>

        <text y="80" font-family="JetBrains Mono, monospace" font-size="14" fill="${theme.muted}" letter-spacing="6">KONTAK</text>
        <text y="112" font-family="JetBrains Mono, monospace" font-size="22" fill="${theme.text}">${escapeXml(input.phone)}</text>
      </g>

      <g transform="translate(${WIDTH - 320}, 320)">
        ${Array.from({ length: 32 })
          .map((_, i) => {
            const w = (i * 7 + 5) % 4 === 0 ? 6 : (i * 3) % 4 === 0 ? 3 : 2;
            return `<rect x="${i * 8}" y="0" width="${w}" height="120" fill="${theme.text}" opacity="${i % 3 === 0 ? 0.95 : 0.7}" />`;
          })
          .join("")}
        <text y="146" font-family="JetBrains Mono, monospace" font-size="12" fill="${theme.muted}" letter-spacing="4">${escapeXml(memberId)}</text>
      </g>

      <g transform="translate(58, ${HEIGHT - 56})">
        <text font-family="JetBrains Mono, monospace" font-size="12" fill="${theme.muted}" letter-spacing="6">garage-motor.id</text>
      </g>
    </svg>
  `;
}

export async function generateMembershipCardImage(
  input: MembershipCardImageInput,
  options: MembershipCardImageOptions,
): Promise<Buffer> {
  const tier = normalizeTier(input.tier);
  const theme = themes[tier];

  const svg =
    options.side === "back"
      ? buildBack(input, theme)
      : await buildFront(input, theme);

  const pipeline = sharp(Buffer.from(svg), { density: 220 }).resize({
    width: options.width ?? WIDTH,
    fit: "inside",
  });

  if (options.format === "jpeg") {
    return pipeline.flatten({ background: "#08080a" }).jpeg({ quality: 92 }).toBuffer();
  }

  return pipeline.png({ compressionLevel: 9 }).toBuffer();
}
