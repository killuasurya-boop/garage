import { afterEach, describe, expect, it, vi } from "vitest";

import { DEV_POS_API_KEY, requirePosTerminal } from "@/lib/pos-api-key";

// QA-audit: kunci POS bawaan seed tertulis di kode sumber → tidak boleh
// membuka akses terminal di production (sync poin member / lookup member).
describe("requirePosTerminal", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("tanpa x-api-key → 401", async () => {
    const result = await requirePosTerminal(new Request("http://x/api/pos/sync-transaction"));
    expect(result.response?.status).toBe(401);
  });

  it("kunci dev bawaan ditolak di production tanpa menyentuh DB", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const result = await requirePosTerminal(
      new Request("http://x/api/pos/sync-transaction", { headers: { "x-api-key": DEV_POS_API_KEY } }),
    );
    expect(result.data).toBeNull();
    expect(result.response?.status).toBe(401);
  });
});
