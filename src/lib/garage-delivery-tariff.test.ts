import { describe, expect, it } from "vitest";

import { deliveryQuote } from "@/lib/garage-delivery-rules";

// Ongkir per km (owner, Okt 2026): dasar Rp5.000 untuk 2 km pertama,
// +Rp2.000 per km berikutnya (dibulatkan ke atas), maks 7 km.
const tariff = { baseFee: 5000, baseKm: 2, perKmFee: 2000, maxKm: 7 };
const garage = { lat: 3.3285, lng: 99.1625 };
const north = (km: number) => ({ lat: garage.lat + km / 111.195, lng: garage.lng });

describe("deliveryQuote", () => {
  it("tanpa lokasi pelanggan atau titik Garage → ongkir dasar (flat)", () => {
    expect(deliveryQuote(tariff, garage, null)).toEqual({ ok: true, fee: 5000, distanceKm: null, flat: true });
    expect(deliveryQuote(tariff, null, north(5))).toMatchObject({ ok: true, fee: 5000, flat: true });
  });

  it("dalam jarak dasar = ongkir dasar; lewat jarak dasar dibulatkan ke atas per km", () => {
    expect(deliveryQuote(tariff, garage, north(1.5))).toMatchObject({ ok: true, fee: 5000, distanceKm: 1.5 });
    expect(deliveryQuote(tariff, garage, north(2.3))).toMatchObject({ ok: true, fee: 7000 });
    expect(deliveryQuote(tariff, garage, north(4.3))).toMatchObject({ ok: true, fee: 11000 });
    expect(deliveryQuote(tariff, garage, north(7))).toMatchObject({ ok: true, fee: 15000 });
  });

  it("di luar radius ditolak; radius 0 = tanpa batas", () => {
    const far = deliveryQuote(tariff, garage, north(9));
    expect(far.ok).toBe(false);
    if (!far.ok) expect(far.reason).toMatch(/maks 7 km/);
    expect(deliveryQuote({ ...tariff, maxKm: 0 }, garage, north(9))).toMatchObject({ ok: true, fee: 19000 });
  });
});
