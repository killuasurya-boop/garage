import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AyaCharacter, ayaMotionForPose, ayaStateForExpression, type AyaExpression, type AyaPose } from "@/components/garage/aya/aya-character";
import { AYA_STATES, AyaMascot, ayaAssetSrc } from "@/components/garage/aya/aya-mascot";

const publicFile = (src: string) => path.join(process.cwd(), "public", src);

describe("Aya V2 — maskot (OD-02)", () => {
  it("delapan state resmi, masing-masing punya SVG lokal yang aman", () => {
    expect(AYA_STATES).toEqual(["idle", "listening", "speaking", "thinking", "warning", "success", "guiding", "error"]);
    for (const state of AYA_STATES) {
      const file = publicFile(ayaAssetSrc(state));
      expect(existsSync(file), file).toBe(true);
      const svg = readFileSync(file, "utf8");
      expect(svg).toMatch(/^<svg[^>]+viewBox="0 0 520 520"/);
      // Aset dimuat lewat <img>, tetapi tetap dijaga: tanpa skrip, handler, atau sumber luar.
      expect(svg).not.toMatch(/<script|\son[a-z]+=|<foreignObject|<image|href="https?:/i);
    }
  });

  it("merender tiap state dengan gambar & label yang benar", () => {
    for (const state of AYA_STATES) {
      const html = renderToStaticMarkup(<AyaMascot state={state} title="Aya" />);
      expect(html).toContain(`data-state="${state}"`);
      expect(html).toContain(`src="${ayaAssetSrc(state)}"`);
      expect(html).toContain('role="img"');
      expect(html).toMatch(/aria-label="Aya — [^"]+"/);
      expect(html.includes('class="aya-mouth"')).toBe(state === "speaking");
      expect(html.includes('class="aya-ring"')).toBe(state === "listening");
    }
  });

  it("dekoratif bila tanpa judul; prop gerak, potongan, peran & mute diteruskan ke CSS", () => {
    const html = renderToStaticMarkup(
      <AyaMascot state="guiding" motion="wave" crop="head" role="staff" muted reducedMotion size={40} />,
    );
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="img"');
    expect(html).toContain('data-motion="wave"');
    expect(html).toContain('data-crop="head"');
    expect(html).toContain('data-role="staff"');
    expect(html).toContain('data-muted="true"');
    expect(html).toContain('data-reduced-motion="true"');
    expect(html).toContain("width:40px;height:40px");
  });

  it("tidak ada lagi karakter V1 di public/", () => {
    expect(existsSync(publicFile("/garage-brand/aya/aya-avatar.svg"))).toBe(false);
    expect(existsSync(publicFile("/garage-brand/aya/aya-full.svg"))).toBe(false);
  });
});

describe("Aya V2 — adapter API lama (AyaCharacter)", () => {
  it("setiap ekspresi lama dipetakan ke state V2 yang ada", () => {
    const expected: Record<AyaExpression, string> = {
      default: "idle",
      happy: "success",
      centil: "guiding",
      grumpy: "error",
      sleepy: "idle",
      alert: "warning",
      thinking: "thinking",
      surprised: "listening",
    };
    for (const [expression, state] of Object.entries(expected) as [AyaExpression, string][]) {
      expect(ayaStateForExpression(expression)).toBe(state);
    }
  });

  it("pose lama dipetakan ke gerak V2", () => {
    const expected: Record<AyaPose, string> = { idle: "rest", wave: "wave", dance: "dance", cross: "rest", fly: "fly" };
    for (const [pose, motion] of Object.entries(expected) as [AyaPose, string][]) {
      expect(ayaMotionForPose(pose)).toBe(motion);
    }
  });

  it("AyaCharacter merender maskot V2 (bukan SVG V1 inline)", () => {
    const html = renderToStaticMarkup(<AyaCharacter expression="alert" pose="wave" crop="head" title="Aya" />);
    expect(html).toContain('data-state="warning"');
    expect(html).toContain('data-motion="wave"');
    expect(html).toContain('data-crop="head"');
    expect(html).toContain("/garage-brand/aya/v2/aya-warning.svg");
    expect(html).not.toContain("<svg");
    expect(renderToStaticMarkup(<AyaCharacter expression="sleepy" />)).toContain("aya-sleepy");
  });
});
