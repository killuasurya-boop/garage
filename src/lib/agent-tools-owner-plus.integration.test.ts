import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// Owner 18 Nov 2026: tool MCP "cukup nama" — produk cepat, mitra, event/panitia/sponsor, briefing pagi.
// Lewat mesin konfirmasi yang sama dengan ChatGPT (runToolWithConfirmation): R2 = preview dulu, R0/R1 langsung.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let outletId = "";
let categoryName = "";
const OWNER = "user-plus-owner";
const MANAJER = "user-plus-manajer";
const ctx = { authorization: "", internalOrigin: "http://127.0.0.1:1" };

function as(userId: string, role: Role): GarageSession {
  return {
    user: { id: userId, name: `Nama ${userId}`, email: `${userId}@garage.id` },
    profile: {
      id: `sp-${userId}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "HP",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}
const owner = () => as(OWNER, "Owner");
const manajer = () => as(MANAJER, "Manajer");

async function call(session: GarageSession, name: string, args: Record<string, unknown>) {
  const { runToolWithConfirmation } = await import("@/lib/mcp-confirmation");
  return (await runToolWithConfirmation({ session, name, rawArgs: args, ctx, oauthClientId: null })) as any;
}

async function confirmed(session: GarageSession, name: string, args: Record<string, unknown>) {
  const preview = await call(session, name, args);
  expect(preview.status).toBe("PERLU_KONFIRMASI");
  const done = await call(session, name, { ...args, konfirmasi: preview.konfirmasi });
  expect(done.status).toBe("BERHASIL");
  return { preview, done };
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: OWNER }));
  const d = t.getDb();
  await d.insert(t.schema.user).values({ id: MANAJER, name: "Manajer Plus", email: `${MANAJER}@garage.id` });
  await d.insert(t.schema.staffProfiles).values({ userId: MANAJER, outletId, role: "Manajer", status: "active" }).onConflictDoNothing();
  const { eq } = await import("drizzle-orm");
  await d.update(t.schema.staffProfiles).set({ role: "Owner" }).where(eq(t.schema.staffProfiles.userId, OWNER));
  const [category] = await d.select().from(t.schema.productCategories).limit(1);
  categoryName = category?.name ?? "";
  if (!categoryName) {
    await d.insert(t.schema.productCategories).values({ name: "Coffee Plus", station: "bar", posGroup: "Bar" } as any);
    categoryName = "Coffee Plus";
  }
  await d.insert(t.schema.events).values({
    slug: "gigs-plus",
    title: "GIGS PLUS",
    outletId,
    startsAt: new Date(Date.now() + 10 * 86_400_000),
    endsAt: new Date(Date.now() + 10 * 86_400_000 + 5 * 3_600_000),
    venueName: "Garage Coffee",
    address: "Jl. Contoh 1",
    mapsUrl: "https://maps.app.goo.gl/contoh",
    contactWhatsapp: "6281200000000",
    status: "published",
  } as any);
}, 120_000);

afterAll(async () => {
  if (t) await teardownGarageTestDb(t);
});

describe("produk cepat", () => {
  it("buat_produk: kategori dari nama, preview dulu, produk aktif di POS; nama sama ditolak", async () => {
    const args = { nama: "Kopi Plus Aren", kategori: categoryName.toLowerCase(), varian: [{ label: "Hot", harga: 18_000 }, { label: "Ice", harga: 20_000 }], alasan: "menu baru" };
    const { preview, done } = await confirmed(owner(), "buat_produk", args);
    expect(preview.ringkasan.kategori).toBe(categoryName);
    expect(done.hasil.dibuat).toBe("Kopi Plus Aren");
    const rows = await t.getDb().select().from(t.schema.menuItems);
    const item = rows.find((r: any) => r.name === "Kopi Plus Aren") as any;
    expect(item).toMatchObject({ status: "active", productType: expect.any(String) });
    await expect(call(owner(), "buat_produk", { ...args, alasan: "lagi" }).then((p) => call(owner(), "buat_produk", { ...args, alasan: "lagi", konfirmasi: p.konfirmasi }))).rejects.toMatchObject({
      code: "PRODUK_SUDAH_ADA",
    });
    await expect(call(owner(), "buat_produk", { ...args, nama: "Kopi Lain", kategori: "kategori-tidak-ada", alasan: "x y z" })).rejects.toMatchObject({ code: "KATEGORI_TIDAK_DITEMUKAN" });
  });

  it("ubah_harga_produk: varian wajib bila lebih dari satu; harga berubah hanya varian itu", async () => {
    await expect(call(owner(), "ubah_harga_produk", { nama: "kopi plus aren", hargaBaru: 21_000, alasan: "naik" })).rejects.toMatchObject({ code: "VARIAN_PERLU_DIPILIH" });
    // Tanpa hargaLama: tool menyebut harga sekarang (ChatGPT mengulang dengan angka itu).
    await expect(call(owner(), "ubah_harga_produk", { nama: "kopi plus aren", varian: "ice", hargaBaru: 21_000, alasan: "naik" })).rejects.toMatchObject({
      code: "HARGA_LAMA_DIPERLUKAN",
      message: expect.stringContaining("20.000"),
    });
    const { preview } = await confirmed(owner(), "ubah_harga_produk", { nama: "kopi plus aren", varian: "ice", hargaLama: 20_000, hargaBaru: 21_000, alasan: "naik" });
    expect(preview.ringkasan.hargaSaatIni).toContain("20.000");
    const item = (await t.getDb().select().from(t.schema.menuItems)).find((r: any) => r.name === "Kopi Plus Aren") as any;
    const variants = (await t.getDb().select().from(t.schema.menuVariants)).filter((v: any) => v.itemId === item.id) as any[];
    expect(variants.find((v) => v.label === "Ice")?.price).toBe(21_000);
    expect(variants.find((v) => v.label === "Hot")?.price).toBe(18_000);

    // Harga diubah orang lain di antara pratinjau & konfirmasi → ditolak, tidak tertimpa diam-diam (Codex #245).
    const args = { nama: "kopi plus aren", varian: "hot", hargaLama: 18_000, hargaBaru: 19_000, alasan: "naik" };
    const pv = await call(owner(), "ubah_harga_produk", args);
    const { and, eq } = await import("drizzle-orm");
    await t.getDb().update(t.schema.menuVariants).set({ price: 25_000 }).where(and(eq(t.schema.menuVariants.itemId, item.id), eq(t.schema.menuVariants.label, "Hot")));
    await expect(call(owner(), "ubah_harga_produk", { ...args, konfirmasi: pv.konfirmasi })).rejects.toMatchObject({ code: "STALE_PRICE" });
    const hot = (await t.getDb().select().from(t.schema.menuVariants)).find((v: any) => v.itemId === item.id && v.label === "Hot") as any;
    expect(hot.price).toBe(25_000);
  });
});

describe("mitra dari chat", () => {
  beforeAll(async () => {
    const svc = await import("@/lib/partner-hub-service");
    await svc.createPartner({ code: "PLS", name: "Mitra Plus Dimsum" } as any, owner());
  });

  it("tambah → nonaktif; Manajer tidak bisa menyetujui; Owner setujui & ubah harga pakai nama", async () => {
    await confirmed(manajer(), "tambah_produk_mitra", {
      mitra: "plus dimsum",
      nama: "Dimsum Udang Plus",
      kategori: "Dimsum",
      varian: [{ label: "Regular", hargaJual: 25_000, hargaSetor: 20_000 }],
    });
    const list = await call(owner(), "produk_mitra", { mitra: "Mitra Plus Dimsum" });
    expect(list.produk[0]).toMatchObject({ produk: "Dimsum Udang Plus", disetujui: "menunggu persetujuan Owner", foto: "BELUM ADA" });

    await expect(call(manajer(), "setujui_produk_mitra", { produk: "udang plus", aktif: true, alasan: "cek" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await confirmed(owner(), "setujui_produk_mitra", { produk: "udang plus", aktif: true, alasan: "sudah dicek" });
    await confirmed(owner(), "ubah_harga_mitra", { produk: "Dimsum Udang Plus", hargaJual: 27_000, alasan: "harga baru" });
    const after = await call(owner(), "produk_mitra", { mitra: "PLS" });
    expect(after.produk[0].disetujui).toBe("ya");
    expect(after.produk[0].harga[0]).toContain("27.000");

    const daftar = await call(owner(), "daftar_mitra", {});
    expect(daftar.map((m: any) => m.mitra)).toContain("Mitra Plus Dimsum");
  });

  it("nama produk sama di dua mitra: wajib sebut mitra; usulan harga menampilkan harga jual yang ikut berubah", async () => {
    const svc = await import("@/lib/partner-hub-service");
    await svc.createPartner({ code: "PL2", name: "Mitra Kedua" } as any, owner());
    await confirmed(owner(), "tambah_produk_mitra", { mitra: "Mitra Kedua", nama: "Dimsum Udang Plus", kategori: "Dimsum", varian: [{ label: "Regular", hargaJual: 24_000, hargaSetor: 18_000 }] });
    await expect(call(owner(), "ubah_harga_mitra", { produk: "Dimsum Udang Plus", hargaJual: 26_000, alasan: "uji" })).rejects.toMatchObject({ code: "PRODUK_AMBIGU", message: expect.stringContaining("sebut juga nama mitranya") });
    await confirmed(owner(), "ubah_harga_mitra", { produk: "Dimsum Udang Plus", mitra: "Mitra Kedua", hargaJual: 26_000, alasan: "uji" });
    const kedua = await call(owner(), "produk_mitra", { mitra: "Mitra Kedua" });
    expect(kedua.produk[0].harga[0]).toContain("26.000");

    // Usulan setor 27.000 > harga jual 26.000 → bila hargaJual kosong, harga jual ke pelanggan IKUT naik (aturan service).
    const partners = await t.getDb().select().from(t.schema.partners);
    const p2 = partners.find((p: any) => p.code === "PL2") as any;
    const links = await t.getDb().select().from(t.schema.partnerProductLinks);
    const link = links.find((l: any) => l.partnerId === p2.id) as any;
    const session = { account: { id: "acc-pl2", displayName: "Mitra Kedua", phone: "081200000000" }, partner: { id: p2.id, code: "PL2", name: "Mitra Kedua", outletId, status: "aktif", operationalStatus: "buka" } };
    await svc.submitPartnerPriceProposal(session as any, { linkId: link.id, variantId: "regular", proposedUnitCost: 27_000, reason: "bahan naik" });
    const usulan = await call(owner(), "usulan_harga_mitra", {});
    const nomor = usulan.find((u: any) => u.mitra === "Mitra Kedua").nomor;
    const pv = await call(owner(), "putuskan_usulan_harga_mitra", { nomor, setuju: true });
    expect(pv.ringkasan.hargaSetor).toContain("27.000");
    expect(pv.ringkasan.hargaJualKePelanggan).toMatch(/26\.000 → .*IKUT BERUBAH/);
  });

  it("penolakan aturan bisnis sampai ke ChatGPT apa adanya (harga jual di bawah setor)", async () => {
    const preview = await call(owner(), "ubah_harga_mitra", { produk: "Dimsum Udang Plus", mitra: "Mitra Plus Dimsum", hargaJual: 10_000, alasan: "uji" });
    const error = await call(owner(), "ubah_harga_mitra", { produk: "Dimsum Udang Plus", mitra: "Mitra Plus Dimsum", hargaJual: 10_000, alasan: "uji", konfirmasi: preview.konfirmasi }).catch((e) => e);
    const { toolFailure } = await import("@/lib/agent-mcp");
    const failure = toolFailure(error, "req-plus");
    expect(failure.code).toBe("PRICE_BELOW_COST");
    expect(failure.message).toMatch(/di bawah HPP mitra/);
  });
});

describe("event, panitia & sponsor dari chat", () => {
  it("talent: tambah, ubah jam & tagline, batal wajib alasan; event default = event terdekat", async () => {
    const added = await call(owner(), "simpan_talent", { nama: "Lost Side", jenis: "band", jamMulai: "20.00", durasiMenit: 40 });
    expect(added).toMatchObject({ event: "GIGS PLUS", aksi: "ditambahkan (konfirmasi)" });
    await call(owner(), "simpan_talent", { event: "gigs plus", nama: "lost side", tagline: "Heavy Roster", instagram: "@lostside" });
    await expect(call(owner(), "simpan_talent", { nama: "Lost Side", status: "batal" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(call(owner(), "simpan_talent", { nama: "Band Baru Tanpa Jenis" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(call(manajer(), "simpan_talent", { nama: "Lost Side", tagline: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("panitia + tugas dengan PIC dari nama; tempel daftar melewati nama yang sudah ada", async () => {
    await call(owner(), "simpan_panitia", { nama: "Ace", jabatan: "ketua", wa: "081234567890" });
    const task = await call(owner(), "simpan_tugas_panitia", { judul: "Cek sound system", pic: "ace", tenggat: "2020-01-01", prioritas: "tinggi" });
    expect(task).toMatchObject({ pic: "Ace", aksi: "ditambahkan" });
    await call(owner(), "simpan_tugas_panitia", { judul: "cek sound", status: "proses" });

    const teks = "Lost Side\tband\nSurai\tband\tHardcore\t@surai\t21.00\t30";
    const { preview, done } = await confirmed(owner(), "tempel_daftar_event", { jenis: "talent", teks });
    expect(preview.ringkasan.aksi).toContain("2 TALENT");
    expect(done.hasil.created).toEqual(["Surai"]);
    expect(done.hasil.skipped).toEqual(["Lost Side"]);
    await expect(call(owner(), "tempel_daftar_event", { jenis: "talent", teks: "X\tjenis-aneh" })).rejects.toMatchObject({ code: "BARIS_SALAH" });

    const papan = await call(owner(), "papan_event", {});
    expect(papan.event).toBe("GIGS PLUS");
    expect(papan.talent.map((p: any) => p.nama)).toEqual(expect.arrayContaining(["Lost Side", "Surai"]));
    expect(papan.talent.find((p: any) => p.nama === "Lost Side")).toMatchObject({ tagline: "Heavy Roster", jam: "20:00 (40 mnt)" });
    expect(papan.tugas[0]).toMatchObject({ judul: "Cek sound system", pic: "Ace", status: "proses", telat: true });
  });

  it("sponsor = kesepakatan saja (tidak ada baris buku kas)", async () => {
    const before = (await t.getDb().select().from(t.schema.cashLedgerEntries)).length;
    await confirmed(owner(), "simpan_sponsor", { nama: "Kopi Kapal", paket: "Gold", nilaiDisepakati: 1_000_000, instagram: "@kopikapal" });
    await confirmed(owner(), "simpan_sponsor", { nama: "kopi kapal", tampilDiWebsite: true });
    const papan = await call(owner(), "papan_event", { event: "GIGS PLUS" });
    expect(papan.sponsor[0]).toMatchObject({ nama: "Kopi Kapal", paket: "Gold", diWebsite: true });
    expect((await t.getDb().select().from(t.schema.cashLedgerEntries)).length).toBe(before);
  });
});

describe("briefing pagi", () => {
  it("merangkum semua bagian; bagian yang gagal diberi keterangan, bukan menggagalkan semuanya", async () => {
    const b = await call(owner(), "briefing_pagi", {});
    for (const key of ["hariIni", "penjualanKemarin", "closingKemarin", "approvalMenunggu", "bahanMenipis", "pesananMitraAktif", "usulanHargaMitra", "eventTerdekat"]) {
      expect(b[key], key).toBeTruthy();
      expect(b[key].data !== undefined || typeof b[key].tidakTersedia === "string").toBe(true);
    }
    expect(b.eventTerdekat.data.event).toBe("GIGS PLUS");
    const only = await call(owner(), "briefing_pagi", { bagian: ["eventTerdekat"] });
    expect(Object.keys(only)).toEqual(expect.arrayContaining(["eventTerdekat"]));
    expect(only.hariIni).toBeUndefined();
  });
});
