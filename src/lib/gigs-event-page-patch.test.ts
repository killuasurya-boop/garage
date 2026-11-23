import { describe, expect, it } from "vitest";

import { patchGigsAppJs } from "@/lib/gigs-event-page-patch";

// Potongan app.js platform GIGS (bentuk asli, 18 Nov 2026) — cukup untuk jangkar koreksi.
const SAMPLE = [
  "  const LINEUPS = [",
  "    {",
  "      slot: 'LINEUP // 02',",
  "      name: 'SURAU',",
  "      role: 'OFFICIAL LINEUP',",
  "    },",
  "  ];",
  "  const COMMUNITY_MEMBERS = [",
  "    { name: 'SURAU', cat: 'band', tag: 'Official Lineup #02' },",
  "  ];",
  "  async function loadPublicLineup() {",
  "    try {",
  "      LINEUPS.splice(0, LINEUPS.length,",
  "        ...filled.map((slot, i) => ({",
  "          name: slot.performer.toUpperCase(),",
  "          photo: `/event/gigs-akhir-tahun-2026/photos/lineup-${(i % 5) + 1}.jpg`,",
  "          logo: slot.logo,",
  "        })),",
  "        { slot: 'SLOT // OPEN', name: 'NEXT TALENT?', isCta: true });",
  "      renderLineups();",
  "    } catch {}",
  "  }",
  "",
].join("\n");

describe("patchGigsAppJs (halaman event platform, Owner 18 Nov 2026)", () => {
  it("memasang ulang animasi muncul setelah lineup dirender dan mengganti semua SURAU → SURAI", () => {
    const { code, applied, skipped } = patchGigsAppJs(SAMPLE);
    expect(applied).toEqual(["lineup-reveal", "surai-name", "lineup-photo", "panitia-login"]);
    expect(code).toContain("/login?next=/panitia");
    expect(skipped).toEqual([]);
    expect(code).toContain("renderLineups();\n      setupRevealObserver();\n      revealActiveScreenImmediate();\n");
    expect(code).not.toContain("SURAU");
    expect(code.match(/name: 'SURAI',/g)).toHaveLength(2);
  });

  it("file platform berubah (jangkar tidak ada / dobel) → koreksi itu dilewati, isi lain tidak disentuh", () => {
    const changed = "renderLineups();\nrenderLineups();\nconst x = 1;\n";
    const { code, applied, skipped } = patchGigsAppJs(changed);
    expect(code.startsWith(changed)).toBe(true);
    expect(applied).toEqual(["panitia-login"]);
    expect(skipped).toEqual(["lineup-reveal", "surai-name", "lineup-photo"]);
  });

  it("dua kali dipasang tetap aman (tidak menambah panggilan ganda)", () => {
    const once = patchGigsAppJs(SAMPLE).code;
    const twice = patchGigsAppJs(once);
    expect(twice.code.match(/setupRevealObserver\(\);/g)).toHaveLength(1);
    expect(twice.code.match(/__garagePanitiaLogin = true/g)).toHaveLength(1);
    expect(twice.code.match(/slot\.photo \?/g)).toHaveLength(1);
  });

  it("foto penampil dari Garage menang; tanpa foto tetap foto umum platform (Owner 19 Nov 2026)", () => {
    const { code } = patchGigsAppJs(SAMPLE);
    const start = code.indexOf("...filled.map(");
    const end = code.indexOf("})),", start) + 3;
    const mapper = new Function("filled", `return [${code.slice(start, end)}];`) as (slots: unknown[]) => Array<{ photo: string }>;
    const [withPhoto, without] = mapper([
      { performer: "surai", photo: "/garage-uploads/event-lineup/x-foto.webp", logo: "" },
      { performer: "lost side", logo: "" },
    ]);
    expect(withPhoto.photo).toBe("/garage-uploads/event-lineup/x-foto.webp");
    expect(without.photo).toBe("/event/gigs-akhir-tahun-2026/photos/lineup-2.jpg");
  });
});
