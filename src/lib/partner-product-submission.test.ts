import { describe, expect, it } from "vitest";

import {
  canPartnerEditSubmission,
  garageShare,
  nextPartnerSubmissionCode,
  partnerProductView,
  partnerSubmissionProblems,
  submissionVariantIds,
} from "@/lib/partner-product-submission";

const base = { name: "Dimsum Ayam", category: "Dimsum", variants: [{ label: "", unitCost: 15000, sellPrice: 20000 }] };

describe("produk mandiri mitra — aturan murni", () => {
  it("isian lengkap tanpa masalah; satu varian tanpa nama = Regular", () => {
    expect(partnerSubmissionProblems(base)).toEqual([]);
  });

  it("menolak harga jual di bawah harga setor, harga nol, dan nama varian dobel/kosong", () => {
    expect(partnerSubmissionProblems({ ...base, variants: [{ label: "Kecil", unitCost: 20000, sellPrice: 15000 }] }).join(" ")).toMatch(/di bawah harga setor/);
    expect(partnerSubmissionProblems({ ...base, variants: [{ label: "Kecil", unitCost: 0, sellPrice: 15000 }] }).join(" ")).toMatch(/harga setor/);
    const twice = partnerSubmissionProblems({
      ...base,
      variants: [
        { label: "Isi 4", unitCost: 1, sellPrice: 2 },
        { label: "isi 4", unitCost: 1, sellPrice: 2 },
        { label: "", unitCost: 1, sellPrice: 2 },
      ],
    }).join(" ");
    expect(twice).toMatch(/dobel/);
    expect(twice).toMatch(/isi nama varian/);
  });

  it("menolak nama/kategori kosong dan varian terlalu banyak", () => {
    const problems = partnerSubmissionProblems({ name: " ", category: "", variants: Array.from({ length: 7 }, (_, i) => ({ label: `V${i}`, unitCost: 1, sellPrice: 1 })) });
    expect(problems.join(" ")).toMatch(/Nama produk/);
    expect(problems.join(" ")).toMatch(/kategori/);
    expect(problems.join(" ")).toMatch(/Maksimal 6 varian/);
  });

  it("kode produk = KODE-Mnn, melewati yang sudah dipakai", () => {
    expect(nextPartnerSubmissionCode("dsm", [])).toBe("DSM-M01");
    expect(nextPartnerSubmissionCode("DSM", ["DSM-M01", "dsm-m02", "DSM-01"])).toBe("DSM-M03");
    expect(nextPartnerSubmissionCode("A B!", [])).toMatch(/^[A-Z0-9-]{3,20}$/);
  });

  it("ID varian unik & aman", () => {
    expect(submissionVariantIds(["Regular", "Isi 4 pcs", "Isi 4 pcs", "!!!"])).toEqual(["regular", "isi-4-pcs", "isi-4-pcs-2", "v4"]);
  });

  it("status tampilan & hak ubah mitra", () => {
    expect(partnerProductView({ active: true, submissionStatus: "approved" })).toBe("selling");
    expect(partnerProductView({ active: false, submissionStatus: "pending" })).toBe("pending");
    expect(partnerProductView({ active: false, submissionStatus: "revision" })).toBe("revision");
    expect(partnerProductView({ active: false, submissionStatus: null })).toBe("inactive");
    expect(partnerProductView({ active: false, submissionStatus: "approved" })).toBe("inactive");
    expect(canPartnerEditSubmission("pending")).toBe(true);
    expect(canPartnerEditSubmission("revision")).toBe(true);
    expect(canPartnerEditSubmission("approved")).toBe(false);
    expect(canPartnerEditSubmission(null)).toBe(false);
    expect(garageShare({ unitCost: 15000, sellPrice: 20000 })).toBe(5000);
  });
});
