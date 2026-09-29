import { describe, expect, it } from "vitest";

import { resolveOrderCampaign } from "@/lib/order-campaign";

const from = (query: string) => {
  const params = new URLSearchParams(query);
  return (key: string) => params.get(key);
};

describe("resolveOrderCampaign", () => {
  it("campaign eksplisit menang", () => {
    expect(resolveOrderCampaign(from("campaign=bio_ig&src=tiktok"))).toBe("bio_ig");
  });

  it("src / utm_source dipakai bila campaign kosong", () => {
    expect(resolveOrderCampaign(from("src=ig"))).toBe("ig");
    expect(resolveOrderCampaign(from("utm_source=TikTok&utm_campaign=Promo Senin!"))).toBe("tiktok_promo_senin");
  });

  it("tanpa sumber → undefined", () => {
    expect(resolveOrderCampaign(from("table=5"))).toBeUndefined();
    expect(resolveOrderCampaign(from("src=%20%20"))).toBeUndefined();
  });

  it("panjang dibatasi", () => {
    expect(resolveOrderCampaign(from(`src=${"a".repeat(100)}`))?.length).toBe(40);
  });
});
