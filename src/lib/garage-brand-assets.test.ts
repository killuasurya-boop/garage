import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  GARAGE_BRAND_ASSETS,
  GARAGE_BRAND_LOGO_ASPECT,
  GARAGE_BRAND_WORDMARK_SIZE,
} from "@/lib/garage-brand-assets";

describe("Garage Coffee official brand assets", () => {
  it("points to real original brand image files in public/", () => {
    for (const publicPath of Object.values(GARAGE_BRAND_ASSETS)) {
      expect(publicPath.startsWith("/garage-brand/")).toBe(true);
      expect(existsSync(join(process.cwd(), "public", publicPath.slice(1)))).toBe(true);
    }
  });

  it("preserves the official horizontal wordmark aspect", () => {
    expect(GARAGE_BRAND_WORDMARK_SIZE).toEqual({ width: 1200, height: 282 });
    expect(GARAGE_BRAND_LOGO_ASPECT).toBeCloseTo(1200 / 282);
  });
});
