import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AyaCharacter, ayaMotionForPose, ayaStateForExpression, type AyaExpression, type AyaPose } from "@/components/garage/aya/aya-character";
import { AYA_EFFECTS, AYA_STATES, AyaMascot, ayaAssetSrc, ayaEffectFor } from "@/components/garage/aya/aya-mascot";
import { ayaSeed } from "@/components/garage/aya/aya-rig";

const publicFile = (src: string) => path.join(process.cwd(), "public", src);

describe("Aya V5 — robot (Owner 4 Nov 2026, semua layar)", () => {
  it("delapan state resmi, masing-masing punya SVG lokal yang aman", () => {
    expect(AYA_STATES).toEqual(["idle", "listening", "speaking", "thinking", "warning", "success", "guiding", "error"]);
    for (const state of AYA_STATES) {
      const file = publicFile(ayaAssetSrc(state));
      expect(existsSync(file), file).toBe(true);
      const svg = readFileSync(file, "utf8");
      expect(svg).toMatch(/^<svg[^>]+viewBox="0 0 480 480"/);
      // Aset dimuat lewat <img>, tetapi tetap dijaga: tanpa skrip, handler, atau sumber luar.
      expect(svg).not.toMatch(/<script|\son[a-z]+=|<foreignObject|<image|href="https?:/i);
    }
  });

  it("badan penuh = rig berlapis per state; avatar kepala = gambar statis", () => {
    for (const state of AYA_STATES) {
      const full = renderToStaticMarkup(<AyaMascot state={state} title="Aya" />);
      expect(full).toContain(`data-state="${state}"`);
      expect(full).toContain('class="aya-rig"');
      expect(full).not.toContain("<img");
      expect(full).toContain('role="img"');
      expect(full).toMatch(/aria-label="Aya — [^"]+"/);
      expect(full.includes('class="aya-ring"')).toBe(state === "listening");
      // Bicara & mendengar = gelombang suara di visor.
      expect(full.includes('class="aya-bars"')).toBe(state === "speaking" || state === "listening");
      expect(full.includes("aya-arm-point")).toBe(state === "guiding");
      // Mata terbuka (bisa berkedip) hanya pada state yang memang matanya terbuka.
      expect(full.includes("aya-eye-open")).toBe(["idle", "warning", "guiding"].includes(state));
      // Kaki & tangan terpisah supaya bisa berjalan/berlari.
      expect(full).toContain("aya-foot-l");
      expect(full).toContain("aya-foot-r");
      expect(full).toContain('viewBox="0 0 480 480"');

      const head = renderToStaticMarkup(<AyaMascot state={state} crop="head" />);
      expect(head).toContain(`src="${ayaAssetSrc(state)}"`);
      expect(head).not.toContain("aya-rig");
    }
  });

  it("aksesori state sesuai aset desain", () => {
    const acc = (state: (typeof AYA_STATES)[number]) => renderToStaticMarkup(<AyaMascot state={state} />);
    expect(acc("listening")).toContain("aya-acc-waves");
    expect(acc("thinking")).toContain("aya-acc-dots");
    expect(acc("warning")).toContain("aya-acc-warn");
    expect(acc("success")).toContain("aya-acc-heart");
    expect(acc("speaking")).toContain("aya-acc-talk");
    expect(acc("guiding")).toContain("aya-acc-point");
    for (const state of ["idle", "error"] as const) expect(acc(state)).not.toContain("aya-acc");
  });

  it("dua Aya di satu halaman tidak berbagi id gradient", () => {
    const html = renderToStaticMarkup(<><AyaMascot state="idle" /><AyaMascot state="idle" /></>);
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const ref of html.matchAll(/url\(#([^)]+)\)/g)) expect(ids).toContain(ref[1]);
  });

  it("lirik mata, efek lucu, dan kedip acak", () => {
    expect(renderToStaticMarkup(<AyaMascot look="right" />)).toContain('data-look="right"');
    // Sukses otomatis berkilau; efek pilihan pemanggil menang.
    expect(ayaEffectFor("success")).toBe("sparkle");
    expect(ayaEffectFor("idle")).toBeNull();
    expect(ayaEffectFor("success", "hearts")).toBe("hearts");
    for (const effect of AYA_EFFECTS) {
      const html = renderToStaticMarkup(<AyaMascot effect={effect} />);
      expect(html).toContain(`data-effect="${effect}"`);
      expect(html.includes(`aya-fx-${effect}`)).toBe(effect !== "blush"); // merona lewat CSS pipi
    }
    // Efek tidak ditempel di avatar kecil.
    expect(renderToStaticMarkup(<AyaMascot crop="head" effect="hearts" />)).not.toContain("aya-fx-hearts");
    expect(renderToStaticMarkup(<AyaMascot />)).toMatch(/--aya-blink-delay:[0-9.]+s;--aya-blink-dur:[0-9.]+s/);
    expect(ayaSeed("a")).not.toBe(ayaSeed("b"));
    for (const id of ["_R_1_", "_R_2_", "x"]) {
      expect(ayaSeed(id)).toBeGreaterThanOrEqual(0);
      expect(ayaSeed(id)).toBeLessThanOrEqual(1);
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

describe("Aya V5 — adapter API lama (AyaCharacter)", () => {
  it("setiap ekspresi lama dipetakan ke state yang ada", () => {
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

  it("pose dipetakan ke gerak (termasuk jalan & lari)", () => {
    const expected: Record<AyaPose, string> = { idle: "rest", wave: "wave", dance: "dance", cross: "rest", fly: "fly", walk: "walk", run: "run" };
    for (const [pose, motion] of Object.entries(expected) as [AyaPose, string][]) {
      expect(ayaMotionForPose(pose)).toBe(motion);
    }
  });

  it("AyaCharacter merender robot V5 (bukan SVG V1 inline)", () => {
    const html = renderToStaticMarkup(<AyaCharacter expression="alert" pose="wave" crop="head" title="Aya" />);
    expect(html).toContain('data-state="warning"');
    expect(html).toContain('data-motion="wave"');
    expect(html).toContain('data-crop="head"');
    expect(html).toContain("/garage-brand/aya/v5/aya-warning.svg");
    expect(html).not.toContain("<svg");
    const sleepy = renderToStaticMarkup(<AyaCharacter expression="sleepy" />);
    expect(sleepy).toContain("aya-sleepy");
    expect(sleepy).toContain('data-effect="zzz"');
    // Mendarat hanya memicu squash saat pose diam; efek pemanggil menang atas zzz.
    expect(renderToStaticMarkup(<AyaCharacter landing />)).toContain('data-motion="land"');
    expect(renderToStaticMarkup(<AyaCharacter landing pose="fly" />)).toContain('data-motion="fly"');
    expect(renderToStaticMarkup(<AyaCharacter pose="run" />)).toContain('data-motion="run"');
    expect(renderToStaticMarkup(<AyaCharacter expression="sleepy" effect="hearts" />)).toContain('data-effect="hearts"');
  });
});
