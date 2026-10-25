import sharp from "sharp";
import QRCode from "qrcode";

import type { MemberLevel } from "@/lib/member-types";
import {
  CARD_BRAND_LINE,
  CARD_WEBSITE,
  cardMemberSince,
  cardPerks,
  cardValidity,
  formatMemberCode,
  memberQrPayload,
  optionalCardText,
} from "@/lib/membership-card-model";

export type MembershipCardImageInput = {
  name: string;
  phone: string;
  tier: string;
  memberCode?: string | null;
  address?: string | null;
  membershipSince?: string | Date | null;
  expiresAt?: string | Date | null;
  points?: number | null;
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
  bgStart: string;
  bgMid: string;
  bgEnd: string;
  accent: string;
  muted: string;
  text: string;
  glow: string;
};

const themes: Record<MemberLevel, TierTheme> = {
  Silver: {
    label: "SILVER",
    bgStart: "#f4f6fb",
    bgMid: "#8a8f9c",
    bgEnd: "#5f6573",
    accent: "#1a1d26",
    muted: "#363b48",
    text: "#0d1018",
    glow: "rgba(200,207,222,0.5)",
  },
  Gold: {
    label: "GOLD",
    bgStart: "#fff3c4",
    bgMid: "#c89828",
    bgEnd: "#3a2a10",
    accent: "#3a2a10",
    muted: "#4a3a0f",
    text: "#1f1606",
    glow: "rgba(245,197,66,0.55)",
  },
  Platinum: {
    label: "PLATINUM",
    bgStart: "#e7f4ff",
    bgMid: "#5a90c0",
    bgEnd: "#0a1828",
    accent: "#0a1828",
    muted: "#11304f",
    text: "#06121e",
    glow: "rgba(96,180,232,0.55)",
  },
  Ultra: {
    label: "ULTRA",
    bgStart: "#5b34b0",
    bgMid: "#3a1d78",
    bgEnd: "#08020f",
    accent: "#f8f5ff",
    muted: "#d9c9ff",
    text: "#f8f5ff",
    glow: "rgba(140,92,240,0.6)",
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

// QR selalu modul gelap di atas latar putih solid: warna tema terang (ULTRA
// #f8f5ff) di atas putih membuat QR tidak terbaca scanner kasir.
const QR_DARK = "#0d1018";

async function qrSvg(payload: string) {
  return QRCode.toString(payload || "GARAGE", {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    color: { dark: QR_DARK, light: "#ffffff" },
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

function memberIdFor(input: MembershipCardImageInput, tier: MemberLevel) {
  return input.memberCode ?? `${tier.slice(0, 3).toUpperCase()}-${input.phone.slice(-4)}`;
}

function field(x: number, y: number, label: string, value: string, theme: TierTheme, anchor: "start" | "end" = "start") {
  return `
    <g transform="translate(${x}, ${y})" text-anchor="${anchor}">
      <text font-family="JetBrains Mono, monospace" font-size="17" font-weight="700" fill="${theme.muted}" letter-spacing="4">${escapeXml(label)}</text>
      <text y="40" font-family="Inter, sans-serif" font-weight="700" font-size="30" fill="${theme.text}">${escapeXml(value)}</text>
    </g>`;
}

function cardBackground(id: string, theme: TierTheme) {
  return `
      <defs>
        <radialGradient id="${id}" cx="20%" cy="15%" r="120%">
          <stop offset="0%" stop-color="${theme.bgStart}" />
          <stop offset="40%" stop-color="${theme.bgMid}" />
          <stop offset="100%" stop-color="${theme.bgEnd}" />
        </radialGradient>
      </defs>
      <rect width="${WIDTH}" height="${HEIGHT}" rx="42" ry="42" fill="url(#${id})" />
      ${holoStripeRect(0, 0, WIDTH, HEIGHT)}
      <rect x="6" y="6" width="${WIDTH - 12}" height="${HEIGHT - 12}" rx="38" ry="38" fill="none" stroke="${theme.accent}" stroke-opacity="0.18" stroke-width="2" />`;
}

async function qrBlock(x: number, y: number, size: number, payload: string) {
  const qr = await qrSvg(payload);
  return `
      <g transform="translate(${x}, ${y})">
        <rect width="${size}" height="${size}" rx="16" fill="#ffffff" />
        <g transform="translate(10, 10) scale(${(size - 20) / 180})">${qr}</g>
      </g>`;
}

async function buildFront(input: MembershipCardImageInput, theme: TierTheme) {
  const tier = normalizeTier(input.tier);
  const memberId = memberIdFor(input, tier);
  const validity = cardValidity({ expiresAt: input.expiresAt });
  const since = cardMemberSince(input.membershipSince) ?? "—";
  const qr = await qrBlock(WIDTH - 286, 176, 228, memberQrPayload({ memberCode: memberId, tier, name: input.name }));
  const name = (input.name || "Member Garage").slice(0, 26);

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
      ${cardBackground("bg", theme)}

      <g transform="translate(58,82)">
        <text font-family="Anton, Impact, sans-serif" font-size="46" fill="${theme.text}" letter-spacing="6">GARAGE</text>
        <text y="34" font-family="JetBrains Mono, monospace" font-size="17" font-weight="700" fill="${theme.muted}" letter-spacing="4">${escapeXml(CARD_BRAND_LINE)}</text>
      </g>

      <g transform="translate(${WIDTH - 58},70)" text-anchor="end">
        <text font-family="JetBrains Mono, monospace" font-size="17" font-weight="700" fill="${theme.muted}" letter-spacing="5">MEMBER TIER</text>
        <text y="62" font-family="Anton, Impact, sans-serif" font-size="64" fill="${theme.text}" letter-spacing="4">${theme.label}</text>
      </g>

      ${qr}

      <g transform="translate(58, 300)">
        <text font-family="Inter, sans-serif" font-weight="800" font-size="48" fill="${theme.text}">${escapeXml(name)}</text>
        <text y="52" font-family="JetBrains Mono, monospace" font-weight="700" font-size="30" fill="${theme.text}" letter-spacing="3">${escapeXml(formatMemberCode(memberId))}</text>
      </g>

      ${field(58, 520, "MEMBER SEJAK", since, theme)}
      ${field(WIDTH - 58, 520, validity.label, validity.value, theme, "end")}
    </svg>
  `;
}

async function buildBack(input: MembershipCardImageInput, theme: TierTheme) {
  const tier = normalizeTier(input.tier);
  const memberId = memberIdFor(input, tier);
  const { perks } = cardPerks(tier);
  const validity = cardValidity({ expiresAt: input.expiresAt });
  const phone = optionalCardText(input.phone, 24);
  const address = optionalCardText(input.address, 24);
  const points = typeof input.points === "number" && Number.isFinite(input.points) ? input.points : null;
  const qr = await qrBlock(WIDTH - 266, 58, 208, memberQrPayload({ memberCode: memberId, tier, name: input.name }));

  const info: Array<[string, string]> = [];
  if (points !== null) info.push(["POIN", new Intl.NumberFormat("id-ID").format(points)]);
  info.push([validity.label, validity.value]);
  if (phone) info.push(["KONTAK", phone]);
  if (address) info.push(["ALAMAT", address]);

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
      ${cardBackground("bgBack", theme)}

      <g transform="translate(58, 82)">
        <text font-family="JetBrains Mono, monospace" font-size="17" font-weight="700" fill="${theme.muted}" letter-spacing="5">BENEFIT</text>
        <text y="56" font-family="Anton, Impact, sans-serif" font-size="52" fill="${theme.text}" letter-spacing="4">${theme.label}</text>
        ${perks
          .slice(0, 4)
          .map(
            (perk, index) =>
              `<text y="${108 + index * 40}" font-family="Inter, sans-serif" font-weight="700" font-size="27" fill="${theme.text}">✓  ${escapeXml(optionalCardText(perk, 34) ?? "")}</text>`,
          )
          .join("")}
      </g>

      ${qr}

      ${info
        .slice(0, 4)
        .map(([label, value], index) => field(58 + (index % 2) * 470, 390 + Math.floor(index / 2) * 84, label, value, theme))
        .join("")}

      <line x1="58" x2="${WIDTH - 58}" y1="${HEIGHT - 70}" y2="${HEIGHT - 70}" stroke="${theme.muted}" stroke-opacity="0.4" stroke-width="2" />
      <text x="58" y="${HEIGHT - 36}" font-family="JetBrains Mono, monospace" font-size="18" font-weight="700" fill="${theme.muted}" letter-spacing="4">${CARD_WEBSITE}</text>
      <text x="${WIDTH - 58}" y="${HEIGHT - 36}" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="18" font-weight="700" fill="${theme.muted}" letter-spacing="3">${escapeXml(formatMemberCode(memberId))}</text>
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
      ? await buildBack(input, theme)
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
