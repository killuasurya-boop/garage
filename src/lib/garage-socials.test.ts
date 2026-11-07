import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { GARAGE_SOCIALS } from "./garage-socials";

describe("sosmed resmi Garage", () => {
  it("empat akun, https, dan sama persis dengan link di website", () => {
    const website = readFileSync(join(process.cwd(), "src/components/garage-website/garage-website.tsx"), "utf8");
    expect(GARAGE_SOCIALS.map((social) => social.id)).toEqual(["instagram", "tiktok", "youtube", "facebook"]);
    for (const social of GARAGE_SOCIALS) {
      expect(social.href.startsWith("https://")).toBe(true);
      expect(website).toContain(social.href);
    }
  });
});
