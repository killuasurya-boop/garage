export type BrandKey = "garage";

export interface BrandProfile {
  key: BrandKey;
  name: string;
  instagram: string;
  role: string;
  positioning?: string;
  contentPillars: string[];
}

export const BRANDS: Record<BrandKey, BrandProfile> = {
  garage: {
    key: "garage",
    name: "GARAGE",
    instagram: "garage_tbt.id",
    role: "Business/F&B brand",
    contentPillars: [
      "menu",
      "promo",
      "customer",
      "suasana tempat",
      "team",
      "event",
      "operasional",
      "GARAGE OS",
    ],
  },
};

export function resolveBrand(value?: string): BrandProfile {
  const key = (value ?? "garage").toLowerCase() as BrandKey;
  const brand = BRANDS[key];
  if (!brand) {
    throw new Error(`Brand tidak dikenal: ${value}. Gunakan: garage.`);
  }
  return brand;
}
