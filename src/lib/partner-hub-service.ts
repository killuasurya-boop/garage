// =============================================================================
// SMART PARTNER HUB — lapisan server (Owner 10 Nov 2026, docs/partner-hub/).
// Aturan murni: partner-hub-rules.ts · integrasi order: partner-hub-orders.ts.
// Semua angka keuangan dihitung ulang di server dari snapshot partner_order_lines,
// tiket (status pemenuhan), penyesuaian yang disetujui, dan pembayaran terverifikasi.
// =============================================================================

import { createHash } from "node:crypto";

import { and, asc, desc, eq, gte, inArray, lt, ne, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  expenses,
  kitchenTickets,
  menuItems,
  menuVariants,
  orders,
  partnerAccounts,
  partnerAdjustments,
  partnerBankAccounts,
  partnerEvents,
  partnerOrderLines,
  partnerPayouts,
  partnerPriceHistory,
  partnerProductLinks,
  partnerReports,
  partnerSettlementLines,
  partnerSettlements,
  partners,
} from "@/db/schema";
import type { GarageSession } from "@/lib/server-auth";
import { hashPassword } from "@/lib/member-auth";
import type { PartnerSession } from "@/lib/partner-auth";
import {
  canChangePartnerStatus,
  isPayableLineStatus,
  lineStatusForTicket,
  maskAccountNumber,
  OPERATIONAL_STATUSES,
  partnerActivationBlockers,
  partnerLineFinance,
  partnerSettlementTotals,
  partnerTicketNextStatus,
  payoutBlockReason,
  settlementStatusAfterPayment,
  type PartnerTicketAction,
} from "@/lib/partner-hub-rules";
import { normalizePhone } from "@/lib/member-types";
import { PAYMENT_STATUS_LABEL, paymentStatusOf } from "@/lib/payment-status";

export class PartnerHubError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type DbLike = Db | Tx;

type Actor = { type: "staff" | "partner" | "system"; id: string | null; name: string };

const staffActor = (garage: GarageSession): Actor => ({ type: "staff", id: garage.user.id, name: `${garage.user.name} / ${garage.profile.role}` });
const partnerActor = (session: PartnerSession): Actor => ({ type: "partner", id: session.account.id, name: `${session.account.displayName} (${session.partner.name})` });

function isOwner(garage: GarageSession) {
  return garage.profile.role === "Owner";
}

function assertOwner(garage: GarageSession, what: string) {
  if (!isOwner(garage)) throw new PartnerHubError("OWNER_ONLY", `${what} hanya boleh dilakukan Owner.`, 403);
}

function assertOwnerOrManager(garage: GarageSession, what: string) {
  if (garage.profile.role !== "Owner" && garage.profile.role !== "Manajer") {
    throw new PartnerHubError("FORBIDDEN", `${what} hanya untuk Owner/Manajer.`, 403);
  }
}

async function logEvent(
  db: DbLike,
  input: { partnerId: string; kind: string; subjectId?: string | null; fromStatus?: string | null; toStatus?: string | null; reason?: string | null; actor: Actor; metadata?: Record<string, unknown> },
) {
  await db.insert(partnerEvents).values({
    partnerId: input.partnerId,
    kind: input.kind,
    subjectId: input.subjectId ?? null,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    reason: input.reason ?? null,
    actorType: input.actor.type,
    actorId: input.actor.id,
    actorName: input.actor.name,
    metadata: input.metadata ?? {},
  });
}

async function loadPartner(db: DbLike, partnerId: string, outletId?: string) {
  const [row] = await db.select().from(partners).where(eq(partners.id, partnerId)).limit(1);
  if (!row || (outletId && row.outletId !== outletId)) throw new PartnerHubError("PARTNER_NOT_FOUND", "Mitra tidak ditemukan.", 404);
  return row;
}

// ─── Master mitra (Owner/Manajer) ────────────────────────────────────────────

export type PartnerProfileInput = {
  code?: string;
  name?: string;
  picName?: string | null;
  phone?: string | null;
  address?: string | null;
  productKind?: string | null;
  handoverPoint?: string | null;
  lastOrderByDay?: Record<string, string | null>;
  payoutSchedule?: string | null;
  terms?: string | null;
};

export async function listPartners(garage: GarageSession) {
  const db = getDb();
  const rows = await db.select().from(partners).where(eq(partners.outletId, garage.profile.outlet.id)).orderBy(asc(partners.name));
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const [links, banks, accounts] = await Promise.all([
    db
      .select({ link: partnerProductLinks, item: menuItems })
      .from(partnerProductLinks)
      .innerJoin(menuItems, eq(partnerProductLinks.menuItemId, menuItems.id))
      .where(inArray(partnerProductLinks.partnerId, ids)),
    db.select().from(partnerBankAccounts).where(and(inArray(partnerBankAccounts.partnerId, ids), ne(partnerBankAccounts.status, "superseded"))),
    db.select().from(partnerAccounts).where(inArray(partnerAccounts.partnerId, ids)),
  ]);
  return rows.map((partner) => {
    const own = links.filter((row) => row.link.partnerId === partner.id);
    return {
      ...partner,
      productCount: own.length,
      availableCount: own.filter((row) => row.link.active && row.item.stock !== "sold_out").length,
      soldOutCount: own.filter((row) => row.link.active && row.item.stock === "sold_out").length,
      bank: banks
        .filter((bank) => bank.partnerId === partner.id)
        .map((bank) => ({
          id: bank.id,
          bankName: bank.bankName,
          accountName: bank.accountName,
          accountMasked: maskAccountNumber(bank.accountNumber),
          status: bank.status,
          // Nomor lengkap hanya untuk Owner (verifikasi sebelum transfer).
          accountNumber: isOwner(garage) ? bank.accountNumber : undefined,
        })),
      accounts: accounts
        .filter((account) => account.partnerId === partner.id)
        .map((account) => ({ id: account.id, phone: account.phone, displayName: account.displayName, status: account.status, lastLoginAt: account.lastLoginAt })),
    };
  });
}

export async function createPartner(input: PartnerProfileInput & { code: string; name: string }, garage: GarageSession) {
  assertOwnerOrManager(garage, "Mendaftarkan mitra");
  const db = getDb();
  const code = input.code.trim().toUpperCase();
  const [exists] = await db.select({ id: partners.id }).from(partners).where(eq(partners.code, code)).limit(1);
  if (exists) throw new PartnerHubError("PARTNER_CODE_TAKEN", `Kode mitra ${code} sudah dipakai.`, 409);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(partners)
      .values({
        outletId: garage.profile.outlet.id,
        code,
        name: input.name.trim(),
        picName: input.picName ?? null,
        phone: input.phone ? normalizePhone(input.phone) : null,
        address: input.address ?? null,
        productKind: input.productKind ?? null,
        handoverPoint: input.handoverPoint ?? null,
        lastOrderByDay: input.lastOrderByDay ?? {},
        payoutSchedule: input.payoutSchedule ?? null,
        terms: input.terms ?? null,
        createdBy: garage.user.id,
      })
      .returning();
    await logEvent(tx, { partnerId: row.id, kind: "partner_created", toStatus: "draft", actor: staffActor(garage) });
    return row;
  });
}

export async function updatePartnerProfile(partnerId: string, input: PartnerProfileInput, garage: GarageSession) {
  assertOwnerOrManager(garage, "Mengubah data mitra");
  const db = getDb();
  const before = await loadPartner(db, partnerId, garage.profile.outlet.id);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(partners)
      .set({
        name: input.name?.trim() || before.name,
        picName: input.picName === undefined ? before.picName : input.picName,
        phone: input.phone === undefined ? before.phone : input.phone ? normalizePhone(input.phone) : null,
        address: input.address === undefined ? before.address : input.address,
        productKind: input.productKind === undefined ? before.productKind : input.productKind,
        handoverPoint: input.handoverPoint === undefined ? before.handoverPoint : input.handoverPoint,
        lastOrderByDay: input.lastOrderByDay ?? before.lastOrderByDay,
        payoutSchedule: input.payoutSchedule === undefined ? before.payoutSchedule : input.payoutSchedule,
        terms: input.terms === undefined ? before.terms : input.terms,
        updatedAt: new Date(),
      })
      .where(eq(partners.id, partnerId))
      .returning();
    await logEvent(tx, { partnerId, kind: "partner_profile_updated", actor: staffActor(garage), metadata: { before: { ...before, lastOrderByDay: before.lastOrderByDay }, after: input } });
    return row;
  });
}

/** Ubah status siklus hidup mitra (PRD 04). Disetujui/Aktif = Owner; aktivasi wajib lolos syarat. */
export async function changePartnerStatus(partnerId: string, to: string, reason: string, garage: GarageSession) {
  const db = getDb();
  const partner = await loadPartner(db, partnerId, garage.profile.outlet.id);
  if (!canChangePartnerStatus(partner.status, to)) {
    throw new PartnerHubError("INVALID_STATUS", `Status mitra tidak bisa diubah dari ${partner.status} ke ${to}.`, 409);
  }
  if (to === "disetujui" || to === "aktif") assertOwner(garage, "Menyetujui / mengaktifkan mitra");
  else assertOwnerOrManager(garage, "Mengubah status mitra");
  if (to === "aktif") {
    const [bank] = await db
      .select({ id: partnerBankAccounts.id })
      .from(partnerBankAccounts)
      .where(and(eq(partnerBankAccounts.partnerId, partnerId), eq(partnerBankAccounts.status, "verified")))
      .limit(1);
    const [account] = await db
      .select({ id: partnerAccounts.id })
      .from(partnerAccounts)
      .where(and(eq(partnerAccounts.partnerId, partnerId), eq(partnerAccounts.status, "active")))
      .limit(1);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(partnerProductLinks)
      .where(and(eq(partnerProductLinks.partnerId, partnerId), eq(partnerProductLinks.active, true)));
    const blockers = partnerActivationBlockers({
      status: partner.status,
      hasVerifiedBank: Boolean(bank),
      hasActiveAccount: Boolean(account),
      phone: partner.phone,
      activeProductCount: Number(count),
      termsAccepted: Boolean(partner.terms?.trim()),
    });
    if (blockers.length) throw new PartnerHubError("ACTIVATION_BLOCKED", blockers.join(" "), 409);
  }
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(partners)
      .set({
        status: to,
        // Mitra dibekukan/nonaktif → tutup layanan (order baru terblokir; tiket lama tetap bisa dituntaskan).
        operationalStatus: to === "aktif" ? partner.operationalStatus : "tutup",
        approvedBy: to === "disetujui" ? garage.user.id : partner.approvedBy,
        approvedAt: to === "disetujui" ? new Date() : partner.approvedAt,
        updatedAt: new Date(),
      })
      .where(eq(partners.id, partnerId))
      .returning();
    await logEvent(tx, { partnerId, kind: "partner_status", fromStatus: partner.status, toStatus: to, reason, actor: staffActor(garage) });
    return row;
  });
}

// ─── Rekening (perubahan = baris baru + verifikasi Owner) ────────────────────

export async function addPartnerBankAccount(partnerId: string, input: { bankName: string; accountName: string; accountNumber: string }, garage: GarageSession) {
  assertOwnerOrManager(garage, "Mencatat rekening mitra");
  const db = getDb();
  await loadPartner(db, partnerId, garage.profile.outlet.id);
  const digits = input.accountNumber.replace(/\D/g, "");
  if (digits.length < 6) throw new PartnerHubError("INVALID_ACCOUNT", "Nomor rekening tidak valid.");
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(partnerBankAccounts)
      .values({ partnerId, bankName: input.bankName.trim(), accountName: input.accountName.trim(), accountNumber: digits, accountLast4: digits.slice(-4), createdBy: garage.user.id })
      .returning();
    await logEvent(tx, { partnerId, kind: "bank_added", subjectId: row.id, toStatus: "pending", actor: staffActor(garage), metadata: { bank: row.bankName, last4: row.accountLast4 } });
    return { id: row.id, status: row.status, accountMasked: maskAccountNumber(digits) };
  });
}

export async function verifyPartnerBankAccount(bankAccountId: string, garage: GarageSession) {
  assertOwner(garage, "Verifikasi rekening mitra");
  const db = getDb();
  const [bank] = await db.select().from(partnerBankAccounts).where(eq(partnerBankAccounts.id, bankAccountId)).limit(1);
  if (!bank) throw new PartnerHubError("BANK_NOT_FOUND", "Rekening tidak ditemukan.", 404);
  await loadPartner(db, bank.partnerId, garage.profile.outlet.id);
  if (bank.status !== "pending") throw new PartnerHubError("BANK_NOT_PENDING", "Rekening ini sudah diproses.", 409);
  return db.transaction(async (tx) => {
    await tx
      .update(partnerBankAccounts)
      .set({ status: "superseded" })
      .where(and(eq(partnerBankAccounts.partnerId, bank.partnerId), eq(partnerBankAccounts.status, "verified")));
    await tx.update(partnerBankAccounts).set({ status: "verified", verifiedBy: garage.user.id, verifiedAt: new Date() }).where(eq(partnerBankAccounts.id, bank.id));
    await logEvent(tx, { partnerId: bank.partnerId, kind: "bank_verified", subjectId: bank.id, fromStatus: "pending", toStatus: "verified", actor: staffActor(garage), metadata: { last4: bank.accountLast4 } });
    return { id: bank.id, status: "verified" };
  });
}

// ─── Akun login mitra ────────────────────────────────────────────────────────

export async function createPartnerAccount(partnerId: string, input: { phone: string; displayName: string; pin: string }, garage: GarageSession) {
  assertOwnerOrManager(garage, "Membuat akun mitra");
  if (!/^\d{6}$/.test(input.pin)) throw new PartnerHubError("INVALID_PIN", "PIN mitra harus 6 angka.");
  const db = getDb();
  await loadPartner(db, partnerId, garage.profile.outlet.id);
  const phone = normalizePhone(input.phone);
  const [exists] = await db.select({ id: partnerAccounts.id }).from(partnerAccounts).where(eq(partnerAccounts.phone, phone)).limit(1);
  if (exists) throw new PartnerHubError("PHONE_TAKEN", "Nomor ini sudah dipakai akun mitra lain.", 409);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(partnerAccounts)
      .values({ partnerId, phone, displayName: input.displayName.trim(), pinHash: await hashPassword(input.pin), createdBy: garage.user.id })
      .returning({ id: partnerAccounts.id, phone: partnerAccounts.phone, displayName: partnerAccounts.displayName });
    await logEvent(tx, { partnerId, kind: "account_created", subjectId: row.id, actor: staffActor(garage) });
    return row;
  });
}

export async function updatePartnerAccount(accountId: string, input: { pin?: string; status?: "active" | "disabled" }, garage: GarageSession) {
  assertOwnerOrManager(garage, "Mengubah akun mitra");
  const db = getDb();
  const [account] = await db.select().from(partnerAccounts).where(eq(partnerAccounts.id, accountId)).limit(1);
  if (!account) throw new PartnerHubError("ACCOUNT_NOT_FOUND", "Akun mitra tidak ditemukan.", 404);
  await loadPartner(db, account.partnerId, garage.profile.outlet.id);
  if (input.pin !== undefined && !/^\d{6}$/.test(input.pin)) throw new PartnerHubError("INVALID_PIN", "PIN mitra harus 6 angka.");
  return db.transaction(async (tx) => {
    await tx
      .update(partnerAccounts)
      .set({
        pinHash: input.pin ? await hashPassword(input.pin) : account.pinHash,
        status: input.status ?? account.status,
        // Ganti PIN / nonaktif → semua sesi lama berhenti berlaku.
        sessionVersion: account.sessionVersion + 1,
        updatedAt: new Date(),
      })
      .where(eq(partnerAccounts.id, accountId));
    await logEvent(tx, { partnerId: account.partnerId, kind: input.pin ? "account_pin_reset" : "account_status", subjectId: accountId, toStatus: input.status ?? null, actor: staffActor(garage) });
    return { id: accountId, status: input.status ?? account.status };
  });
}

// ─── Produk mitra & harga (Owner) ────────────────────────────────────────────

export type PartnerProductInput = {
  code: string;
  name: string;
  category: string;
  imageUrl?: string | null;
  description?: string | null;
  variants: Array<{ variantId: string; label: string; unitCost: number; sellPrice: number }>;
};

function assertPrices(variants: PartnerProductInput["variants"]) {
  if (!variants.length) throw new PartnerHubError("NO_VARIANT", "Minimal satu harga/varian.");
  for (const v of variants) {
    if (!Number.isInteger(v.unitCost) || v.unitCost < 0 || !Number.isInteger(v.sellPrice) || v.sellPrice <= 0) {
      throw new PartnerHubError("INVALID_PRICE", `Harga ${v.label} harus rupiah bulat (HPP ≥ 0, harga jual > 0).`);
    }
    if (v.sellPrice < v.unitCost) throw new PartnerHubError("PRICE_BELOW_COST", `Harga jual ${v.label} di bawah HPP mitra.`);
  }
}

/**
 * Daftarkan produk mitra sebagai menu POS (product_type "partner", station "none" → tidak masuk tiket
 * Bar/Dapur). Link dibuat NONAKTIF sampai disetujui Owner (approvePartnerProduct).
 */
export async function createPartnerProduct(partnerId: string, input: PartnerProductInput, garage: GarageSession) {
  assertOwnerOrManager(garage, "Mendaftarkan produk mitra");
  assertPrices(input.variants);
  const db = getDb();
  const partner = await loadPartner(db, partnerId, garage.profile.outlet.id);
  const code = input.code.trim().toUpperCase();
  const menuId = `ptn-${code.toLowerCase()}`;
  const [takenCode] = await db.select({ id: partnerProductLinks.id }).from(partnerProductLinks).where(eq(partnerProductLinks.code, code)).limit(1);
  if (takenCode) throw new PartnerHubError("PRODUCT_CODE_TAKEN", `Kode produk ${code} sudah dipakai.`, 409);
  const [takenMenu] = await db.select({ id: menuItems.id }).from(menuItems).where(or(eq(menuItems.id, menuId), eq(menuItems.sku, code))).limit(1);
  if (takenMenu) throw new PartnerHubError("PRODUCT_CODE_TAKEN", `SKU ${code} sudah dipakai produk lain.`, 409);
  return db.transaction(async (tx) => {
    await tx.insert(menuItems).values({
      id: menuId,
      sku: code,
      name: input.name.trim(),
      category: input.category.trim(),
      section: input.category.trim(),
      productType: "partner",
      brand: partner.name,
      station: "none",
      prep: "0m",
      stock: "ready",
      imageUrl: input.imageUrl ?? null,
      description: input.description ?? null,
      batchEligible: false,
      tags: ["Mitra"],
    });
    await tx.insert(menuVariants).values(
      input.variants.map((v, index) => ({ itemId: menuId, variantId: v.variantId, label: v.label, price: v.sellPrice, baseCost: v.unitCost, sortOrder: index })),
    );
    const [link] = await tx.insert(partnerProductLinks).values({ partnerId, menuItemId: menuId, code, active: false }).returning();
    await tx.insert(partnerPriceHistory).values(
      input.variants.map((v) => ({ linkId: link.id, variantId: v.variantId, unitCost: v.unitCost, sellPrice: v.sellPrice, reason: "Harga awal kesepakatan", createdBy: garage.user.id })),
    );
    await logEvent(tx, { partnerId, kind: "product_created", subjectId: link.id, actor: staffActor(garage), metadata: { code, variants: input.variants } });
    return { linkId: link.id, menuItemId: menuId, code };
  });
}

export async function setPartnerProductActive(linkId: string, active: boolean, garage: GarageSession) {
  assertOwner(garage, "Menyetujui produk mitra");
  const db = getDb();
  const [link] = await db.select().from(partnerProductLinks).where(eq(partnerProductLinks.id, linkId)).limit(1);
  if (!link) throw new PartnerHubError("PRODUCT_NOT_FOUND", "Produk mitra tidak ditemukan.", 404);
  await loadPartner(db, link.partnerId, garage.profile.outlet.id);
  return db.transaction(async (tx) => {
    await tx
      .update(partnerProductLinks)
      .set({ active, approvedBy: active ? garage.user.id : link.approvedBy, approvedAt: active ? new Date() : link.approvedAt, updatedAt: new Date() })
      .where(eq(partnerProductLinks.id, linkId));
    await tx.update(menuItems).set({ status: active ? "active" : "archived", updatedAt: new Date() }).where(eq(menuItems.id, link.menuItemId));
    await logEvent(tx, { partnerId: link.partnerId, kind: active ? "product_approved" : "product_deactivated", subjectId: linkId, actor: staffActor(garage) });
    return { linkId, active };
  });
}

/** Harga baru berlaku sejak sekarang; transaksi lama tetap memakai snapshot (PRD 05.3). */
export async function setPartnerProductPrice(
  linkId: string,
  input: { variantId: string; unitCost: number; sellPrice: number; reason: string },
  garage: GarageSession,
) {
  assertOwner(garage, "Mengubah HPP/harga mitra");
  assertPrices([{ ...input, label: input.variantId }]);
  if (!input.reason.trim()) throw new PartnerHubError("REASON_REQUIRED", "Alasan perubahan harga wajib diisi.");
  const db = getDb();
  const [link] = await db.select().from(partnerProductLinks).where(eq(partnerProductLinks.id, linkId)).limit(1);
  if (!link) throw new PartnerHubError("PRODUCT_NOT_FOUND", "Produk mitra tidak ditemukan.", 404);
  await loadPartner(db, link.partnerId, garage.profile.outlet.id);
  return db.transaction(async (tx) => {
    const [variant] = await tx
      .update(menuVariants)
      .set({ price: input.sellPrice, baseCost: input.unitCost, updatedAt: new Date() })
      .where(and(eq(menuVariants.itemId, link.menuItemId), eq(menuVariants.variantId, input.variantId)))
      .returning({ id: menuVariants.id });
    if (!variant) throw new PartnerHubError("VARIANT_NOT_FOUND", "Varian tidak ditemukan.", 404);
    const [row] = await tx
      .insert(partnerPriceHistory)
      .values({ linkId, variantId: input.variantId, unitCost: input.unitCost, sellPrice: input.sellPrice, reason: input.reason.trim(), createdBy: garage.user.id })
      .returning();
    await logEvent(tx, { partnerId: link.partnerId, kind: "price_changed", subjectId: linkId, reason: input.reason, actor: staffActor(garage), metadata: input });
    return row;
  });
}

export async function listPartnerProducts(partnerId: string, viewer: { outletId: string; showCost: boolean }) {
  const db = getDb();
  const partner = await loadPartner(db, partnerId, viewer.outletId);
  const rows = await db
    .select({ link: partnerProductLinks, item: menuItems })
    .from(partnerProductLinks)
    .innerJoin(menuItems, eq(partnerProductLinks.menuItemId, menuItems.id))
    .where(eq(partnerProductLinks.partnerId, partner.id))
    .orderBy(asc(partnerProductLinks.code));
  const variants = rows.length
    ? await db.select().from(menuVariants).where(inArray(menuVariants.itemId, rows.map((row) => row.item.id))).orderBy(asc(menuVariants.sortOrder))
    : [];
  return rows.map(({ link, item }) => ({
    linkId: link.id,
    menuItemId: item.id,
    code: link.code,
    name: item.name,
    category: item.category,
    imageUrl: item.imageUrl,
    active: link.active,
    available: item.stock !== "sold_out",
    availabilityUpdatedAt: link.availabilityUpdatedAt,
    availabilityUpdatedBy: link.availabilityUpdatedBy,
    variants: variants
      .filter((v) => v.itemId === item.id)
      .map((v) => ({ variantId: v.variantId, label: v.label, sellPrice: v.price, unitCost: viewer.showCost ? v.baseCost : undefined })),
  }));
}

// ─── Ketersediaan & status layanan (mitra pemilik / Owner) ───────────────────

/** Tersedia ↔ Habis (unlimited stock: tanpa kuantitas). Berlaku di POS, waiter & menu digital lewat menu_items.stock. */
export async function setPartnerProductAvailability(
  linkId: string,
  available: boolean,
  who: { partner?: PartnerSession; garage?: GarageSession },
) {
  const db = getDb();
  const [link] = await db.select().from(partnerProductLinks).where(eq(partnerProductLinks.id, linkId)).limit(1);
  if (!link) throw new PartnerHubError("PRODUCT_NOT_FOUND", "Produk mitra tidak ditemukan.", 404);
  if (who.partner && who.partner.partner.id !== link.partnerId) throw new PartnerHubError("PRODUCT_NOT_FOUND", "Produk mitra tidak ditemukan.", 404);
  if (who.garage) {
    assertOwnerOrManager(who.garage, "Mengubah ketersediaan produk mitra");
    await loadPartner(db, link.partnerId, who.garage.profile.outlet.id);
  }
  const actor = who.partner ? partnerActor(who.partner) : staffActor(who.garage!);
  return db.transaction(async (tx) => {
    const [item] = await tx.select({ stock: menuItems.stock }).from(menuItems).where(eq(menuItems.id, link.menuItemId)).limit(1);
    const to = available ? "ready" : "sold_out";
    await tx.update(menuItems).set({ stock: to, updatedAt: new Date() }).where(eq(menuItems.id, link.menuItemId));
    await tx.update(partnerProductLinks).set({ availabilityUpdatedAt: new Date(), availabilityUpdatedBy: actor.name, updatedAt: new Date() }).where(eq(partnerProductLinks.id, linkId));
    await logEvent(tx, { partnerId: link.partnerId, kind: "availability", subjectId: linkId, fromStatus: item?.stock ?? null, toStatus: to, actor });
    return { linkId, available };
  });
}

export async function setPartnerOperationalStatus(
  partnerId: string,
  status: string,
  who: { partner?: PartnerSession; garage?: GarageSession },
) {
  if (!(OPERATIONAL_STATUSES as readonly string[]).includes(status)) throw new PartnerHubError("INVALID_STATUS", "Status layanan tidak dikenal.");
  const db = getDb();
  if (who.partner && who.partner.partner.id !== partnerId) throw new PartnerHubError("PARTNER_NOT_FOUND", "Mitra tidak ditemukan.", 404);
  const partner = await loadPartner(db, partnerId, who.garage?.profile.outlet.id);
  if (who.garage) assertOwnerOrManager(who.garage, "Mengubah status layanan mitra");
  if (status === "buka" && partner.status !== "aktif") throw new PartnerHubError("PARTNER_INACTIVE", "Mitra belum aktif; tidak bisa dibuka.", 409);
  const actor = who.partner ? partnerActor(who.partner) : staffActor(who.garage!);
  return db.transaction(async (tx) => {
    await tx.update(partners).set({ operationalStatus: status, operationalStatusAt: new Date(), operationalStatusBy: actor.name, updatedAt: new Date() }).where(eq(partners.id, partnerId));
    await logEvent(tx, { partnerId, kind: "operational_status", fromStatus: partner.operationalStatus, toStatus: status, actor });
    return { partnerId, operationalStatus: status };
  });
}

// ─── Tiket mitra ─────────────────────────────────────────────────────────────

function ticketView(ticket: typeof kitchenTickets.$inferSelect, lines: Array<typeof partnerOrderLines.$inferSelect>) {
  const status = ticket.status === "queue" && ticket.acceptedAt ? "accepted" : ticket.status;
  return {
    ticketNo: ticket.ticketNo,
    orderNo: ticket.orderNo,
    tableLabel: ticket.tableLabel,
    customerName: ticket.customerName,
    status,
    createdAt: ticket.createdAt,
    acceptedAt: ticket.acceptedAt,
    readyAt: ticket.readyAt,
    deliveredAt: ticket.deliveredAt,
    claimedByName: ticket.claimedByName,
    deliveredByName: ticket.deliveredByName,
    issueReason: ticket.issueReason,
    notes: ticket.itemNotes,
    items: lines.map((line) => ({ name: line.itemName, variant: line.variantLabel, qty: line.qty })),
  };
}

export async function listTicketsForPartner(partnerId: string, scope: "active" | "history", options: { from?: Date; limit?: number } = {}) {
  const db = getDb();
  const active = ["queue", "cooking", "ready"];
  const rows = await db
    .select()
    .from(kitchenTickets)
    .where(
      and(
        eq(kitchenTickets.partnerId, partnerId),
        scope === "active" ? inArray(kitchenTickets.status, active) : sql`${kitchenTickets.status} not in ('queue','cooking','ready')`,
        options.from ? gte(kitchenTickets.createdAt, options.from) : undefined,
      ),
    )
    .orderBy(scope === "active" ? asc(kitchenTickets.createdAt) : desc(kitchenTickets.createdAt))
    .limit(options.limit ?? 100);
  if (!rows.length) return [];
  const lines = await db.select().from(partnerOrderLines).where(inArray(partnerOrderLines.ticketId, rows.map((row) => row.id)));
  return rows.map((ticket) => ticketView(ticket, lines.filter((line) => line.ticketId === ticket.id)));
}

/** Aksi mitra pada tiketnya: terima → proses → siap antar, atau tolak (dengan alasan). */
export async function actOnPartnerTicket(session: PartnerSession, ticketNo: string, action: PartnerTicketAction, reason?: string) {
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const [ticket] = await tx
      .select()
      .from(kitchenTickets)
      .where(and(eq(kitchenTickets.ticketNo, ticketNo), eq(kitchenTickets.partnerId, session.partner.id)))
      .for("update")
      .limit(1);
    // 404 juga untuk tiket mitra lain: tidak membocorkan keberadaannya.
    if (!ticket) throw new PartnerHubError("TICKET_NOT_FOUND", "Tiket tidak ditemukan.", 404);
    const current = ticket.status === "queue" && ticket.acceptedAt ? "accepted" : ticket.status;
    const next = partnerTicketNextStatus(current, action);
    if (!next) throw new PartnerHubError("INVALID_TRANSITION", `Tiket berstatus ${current} tidak bisa di-${action}.`, 409);
    if (action === "reject" && !reason?.trim()) throw new PartnerHubError("REASON_REQUIRED", "Alasan penolakan wajib diisi.");
    const now = new Date();
    const actorName = session.account.displayName;
    const patch: Partial<typeof kitchenTickets.$inferInsert> = { updatedAt: now };
    if (action === "accept") Object.assign(patch, { acceptedAt: now, acceptedByName: actorName });
    if (action === "start") Object.assign(patch, { status: "cooking", acceptedAt: ticket.acceptedAt ?? now });
    // Siap Antar = mitra menyerahkan di titik serah-terima → waiter bisa klaim (alur klaim/antar waiter yang ada).
    if (action === "ready") Object.assign(patch, { status: "ready", readyAt: now, readyByName: actorName, handoverAt: now, handoverByName: actorName, acceptedAt: ticket.acceptedAt ?? now });
    if (action === "reject") Object.assign(patch, { status: "rejected", issueReason: reason!.trim(), issueAt: now });
    await tx.update(kitchenTickets).set(patch).where(eq(kitchenTickets.id, ticket.id));
    const lineStatus = lineStatusForTicket(action === "accept" ? "accepted" : (patch.status as string));
    await tx
      .update(partnerOrderLines)
      .set({
        status: lineStatus,
        fulfilledQty: action === "ready" ? sql`${partnerOrderLines.qty}` : partnerOrderLines.fulfilledQty,
        cancelledQty: action === "reject" ? sql`${partnerOrderLines.qty}` : partnerOrderLines.cancelledQty,
        readyAt: action === "ready" ? now : partnerOrderLines.readyAt,
        updatedAt: now,
      })
      .where(eq(partnerOrderLines.ticketId, ticket.id));
    await logEvent(tx, { partnerId: session.partner.id, kind: `ticket_${action}`, subjectId: ticket.ticketNo, fromStatus: current, toStatus: next, reason: reason ?? null, actor: partnerActor(session) });
    return { ticket, next };
  });
  // Notifikasi in-app setelah mutasi sukses (WhatsApp hanya jalur tambahan).
  try {
    const { notifyStaff } = await import("@/lib/staff-notifications");
    const { publishProductionChange } = await import("@/lib/production-events");
    publishProductionChange();
    if (action === "ready") {
      await notifyStaff({
        outletId: session.partner.outletId,
        audience: "waiter",
        kind: "partner_ready",
        severity: "info",
        title: `Siap diambil dari ${session.partner.name}`,
        body: `${result.ticket.orderNo} · ${result.ticket.tableLabel ?? "Take away"}`,
        url: "/partners?tab=pickup",
        dedupKey: `partner_ready:${ticketNo}`,
      });
    }
    if (action === "reject") {
      await notifyStaff({
        outletId: session.partner.outletId,
        audience: "cashier",
        kind: "partner_rejected",
        severity: "urgent",
        title: `${session.partner.name} menolak pesanan ${result.ticket.orderNo}`,
        body: reason?.slice(0, 200) ?? null,
        url: "/partners",
        dedupKey: `partner_rejected:${ticketNo}`,
      });
    }
  } catch {
    /* notifikasi tidak boleh menggagalkan aksi tiket */
  }
  return { ticketNo, status: result.next };
}

// ─── Monitor POS & keuangan ──────────────────────────────────────────────────

export async function listPartnerOrdersForOutlet(outletId: string, options: { partnerId?: string; scope?: "active" | "today" } = {}) {
  const db = getDb();
  const since = new Date(Date.now() - 24 * 3_600_000);
  const rows = await db
    .select({ ticket: kitchenTickets, partner: partners, order: { id: orders.id, status: orders.status, total: orders.total } })
    .from(kitchenTickets)
    .innerJoin(partners, eq(kitchenTickets.partnerId, partners.id))
    .innerJoin(orders, eq(kitchenTickets.orderId, orders.id))
    .where(
      and(
        eq(partners.outletId, outletId),
        options.partnerId ? eq(kitchenTickets.partnerId, options.partnerId) : undefined,
        options.scope === "today" ? gte(kitchenTickets.createdAt, since) : inArray(kitchenTickets.status, ["queue", "cooking", "ready"]),
      ),
    )
    .orderBy(asc(kitchenTickets.createdAt))
    .limit(200);
  if (!rows.length) return [];
  const lines = await db.select().from(partnerOrderLines).where(inArray(partnerOrderLines.ticketId, rows.map((row) => row.ticket.id)));
  return rows.map(({ ticket, partner, order }) => ({
    ...ticketView(ticket, lines.filter((line) => line.ticketId === ticket.id)),
    partnerId: partner.id,
    partnerName: partner.name,
    partnerPhone: partner.phone,
    handoverPoint: partner.handoverPoint,
    orderStatus: order.status,
    paymentLabel: PAYMENT_STATUS_LABEL[paymentStatusOf({ status: order.status })],
  }));
}

type FinanceLine = {
  id: string;
  orderNo: string;
  createdAt: Date;
  tableLabel: string | null;
  customerName: string | null;
  itemName: string;
  variantLabel: string;
  qty: number;
  unitPrice: number;
  unitCost: number;
  status: string;
  cancelledQty: number;
  fulfilledQty: number;
  ticketStatus: string | null;
  settlementNo: string | null;
  salesVoided: boolean;
};

/** Status efektif baris untuk keuangan: tiket diantar/siap → payable; tiket dibatalkan/ditolak → batal penuh. */
function effectiveLine(row: { line: typeof partnerOrderLines.$inferSelect; ticketStatus: string | null; orderStatus: string | null }) {
  const ts = row.ticketStatus;
  let status = row.line.status;
  let cancelledQty = row.line.cancelledQty;
  let fulfilledQty = row.line.fulfilledQty;
  const orderVoided = paymentStatusOf({ status: row.orderStatus }) === "cancelled";
  if (orderVoided && ts !== "ready" && ts !== "delivered") {
    // Dibatalkan sebelum mitra menyiapkan: tidak ada penjualan maupun kewajiban.
    return { ...row.line, status: "cancelled", cancelledQty: row.line.qty, fulfilledQty: 0, salesVoided: true };
  }
  if (ts === "cancelled" || ts === "rejected") {
    status = ts === "rejected" ? "rejected" : "cancelled";
    cancelledQty = row.line.qty;
  } else if (ts === "ready" || ts === "delivered") {
    status = ts === "delivered" ? "delivered" : "ready";
    fulfilledQty = Math.max(fulfilledQty, row.line.qty - cancelledQty);
  }
  return { ...row.line, status, cancelledQty, fulfilledQty, salesVoided: orderVoided };
}

export async function partnerFinanceLines(partnerId: string, outletId: string, from: Date, to: Date): Promise<FinanceLine[]> {
  const db = getDb();
  const rows = await db
    .select({ line: partnerOrderLines, ticketStatus: kitchenTickets.status, orderStatus: orders.status })
    .from(partnerOrderLines)
    .leftJoin(kitchenTickets, eq(partnerOrderLines.ticketId, kitchenTickets.id))
    .leftJoin(orders, eq(partnerOrderLines.orderId, orders.id))
    .where(and(eq(partnerOrderLines.partnerId, partnerId), eq(partnerOrderLines.outletId, outletId), gte(partnerOrderLines.createdAt, from), lt(partnerOrderLines.createdAt, to)))
    .orderBy(asc(partnerOrderLines.createdAt));
  const settled = rows.length
    ? await db
        .select({ orderLineId: partnerSettlementLines.orderLineId, settlementNo: partnerSettlements.settlementNo })
        .from(partnerSettlementLines)
        .innerJoin(partnerSettlements, eq(partnerSettlementLines.settlementId, partnerSettlements.id))
        .where(and(inArray(partnerSettlementLines.orderLineId, rows.map((row) => row.line.id)), sql`${partnerSettlementLines.activeLineKey} is not null`))
    : [];
  const settledBy = new Map(settled.map((row) => [row.orderLineId, row.settlementNo]));
  return rows.map((row) => {
    const line = effectiveLine(row);
    return {
      id: line.id,
      orderNo: line.orderNo,
      createdAt: line.createdAt,
      tableLabel: line.tableLabel,
      customerName: line.customerName,
      itemName: line.itemName,
      variantLabel: line.variantLabel,
      qty: line.qty,
      unitPrice: line.unitPrice,
      unitCost: line.unitCost,
      status: line.status,
      cancelledQty: line.cancelledQty,
      fulfilledQty: line.fulfilledQty,
      ticketStatus: row.ticketStatus,
      settlementNo: settledBy.get(line.id) ?? null,
      salesVoided: line.salesVoided,
    };
  });
}

export async function partnerFinanceSummary(partnerId: string, outletId: string, from: Date, to: Date) {
  const db = getDb();
  const lines = await partnerFinanceLines(partnerId, outletId, from, to);
  const adjustments = await db
    .select()
    .from(partnerAdjustments)
    .where(and(eq(partnerAdjustments.partnerId, partnerId), gte(partnerAdjustments.createdAt, from), lt(partnerAdjustments.createdAt, to)));
  const settlements = await db
    .select()
    .from(partnerSettlements)
    .where(and(eq(partnerSettlements.partnerId, partnerId), ne(partnerSettlements.status, "cancelled"), gte(partnerSettlements.periodTo, from), lt(partnerSettlements.periodFrom, to)));
  const totals = partnerSettlementTotals(lines, adjustments);
  const approvedLiability = settlements.filter((s) => ["approved", "partially_paid", "paid"].includes(s.status)).reduce((sum, s) => sum + s.liabilityTotal, 0);
  const paid = settlements.reduce((sum, s) => sum + s.paidAmount, 0);
  return {
    ...totals,
    orderCount: new Set(lines.map((line) => line.orderNo)).size,
    unsettledLines: lines.filter((line) => !line.settlementNo && isPayableLineStatus(line.status)).length,
    approvedLiability,
    paidAmount: paid,
    outstanding: totals.liabilityTotal - paid,
    lines: lines.map((line) => ({ ...line, ...partnerLineFinance(line) })),
    settlements: settlements.map((s) => ({ id: s.id, settlementNo: s.settlementNo, status: s.status, liabilityTotal: s.liabilityTotal, paidAmount: s.paidAmount, periodFrom: s.periodFrom, periodTo: s.periodTo })),
  };
}

// ─── Settlement (PRD 13) ─────────────────────────────────────────────────────

function settlementNo(partnerCode: string, at: Date) {
  const d = new Date(at.getTime() + 7 * 3_600_000).toISOString().slice(0, 10).replace(/-/g, "");
  return `PST-${partnerCode}-${d}-${at.getTime().toString(36).toUpperCase().slice(-5)}`;
}

function summaryHash(input: unknown) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

/**
 * Buat draft settlement dari baris yang memenuhi syarat & belum masuk settlement aktif.
 * Anti-dobel dijaga DB: partner_settlement_lines.active_line_key UNIQUE.
 */
export async function createPartnerSettlement(input: { partnerId: string; from: Date; to: Date; note?: string | null }, garage: GarageSession) {
  if (!["Owner", "Manajer", "Kasir"].includes(garage.profile.role)) throw new PartnerHubError("FORBIDDEN", "Tidak berwenang membuat settlement.", 403);
  if (!(input.from < input.to)) throw new PartnerHubError("INVALID_PERIOD", "Periode tidak valid.");
  const db = getDb();
  const partner = await loadPartner(db, input.partnerId, garage.profile.outlet.id);
  const lines = await partnerFinanceLines(partner.id, partner.outletId, input.from, input.to);
  const eligible = lines.filter((line) => !line.settlementNo && isPayableLineStatus(line.status));
  const adjustments = await db
    .select()
    .from(partnerAdjustments)
    .where(
      and(
        eq(partnerAdjustments.partnerId, partner.id),
        eq(partnerAdjustments.status, "approved"),
        lt(partnerAdjustments.createdAt, input.to),
        sql`not exists (select 1 from ${partnerSettlementLines} sl where sl.adjustment_id = ${partnerAdjustments.id} and sl.active_line_key is not null)`,
      ),
    );
  if (!eligible.length && !adjustments.length) throw new PartnerHubError("NOTHING_TO_SETTLE", "Tidak ada transaksi mitra yang siap direkap pada periode ini.", 409);
  const totals = partnerSettlementTotals(eligible, adjustments);
  const now = new Date();
  const no = settlementNo(partner.code, now);
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(partnerSettlements)
        .values({
          settlementNo: no,
          partnerId: partner.id,
          outletId: partner.outletId,
          periodFrom: input.from,
          periodTo: input.to,
          status: "draft",
          totalQty: totals.totalQty,
          grossSales: totals.grossSales,
          salesAdjustments: totals.salesAdjustments,
          totalCost: totals.totalCost,
          liabilityAdjustments: totals.liabilityAdjustments,
          garageProfit: totals.garageProfit,
          liabilityTotal: totals.liabilityTotal,
          lineCount: eligible.length + adjustments.length,
          summaryHash: summaryHash({ lines: eligible.map((l) => [l.id, l.qty, l.unitPrice, l.unitCost, l.status]), adjustments: adjustments.map((a) => [a.id, a.salesDelta, a.liabilityDelta]), totals }),
          note: input.note ?? null,
          createdBy: garage.user.id,
        })
        .returning();
      const settlementLines = [
        ...eligible.map((line) => {
          const f = partnerLineFinance(line);
          return { settlementId: row.id, orderLineId: line.id, qty: f.payableQty, sales: f.gross, cost: f.cost, liability: f.liability, activeLineKey: `line:${line.id}` };
        }),
        ...adjustments.map((adj) => ({ settlementId: row.id, adjustmentId: adj.id, qty: adj.qty, sales: adj.salesDelta, cost: 0, liability: adj.liabilityDelta, activeLineKey: `adj:${adj.id}` })),
      ];
      await tx.insert(partnerSettlementLines).values(settlementLines);
      await logEvent(tx, { partnerId: partner.id, kind: "settlement_created", subjectId: row.settlementNo, toStatus: "draft", actor: staffActor(garage), metadata: { totals } });
      return row;
    });
  } catch (error) {
    if (String((error as { code?: string }).code ?? error).includes("23505") || /unique|duplicate/i.test(String(error))) {
      throw new PartnerHubError("ALREADY_SETTLED", "Sebagian transaksi sudah masuk settlement lain. Muat ulang lalu coba lagi.", 409);
    }
    throw error;
  }
}

async function loadSettlement(db: DbLike, id: string, outletId: string) {
  const [row] = await db.select().from(partnerSettlements).where(eq(partnerSettlements.id, id)).limit(1);
  if (!row || row.outletId !== outletId) throw new PartnerHubError("SETTLEMENT_NOT_FOUND", "Settlement tidak ditemukan.", 404);
  return row;
}

export async function getPartnerSettlement(id: string, viewer: { outletId: string; partnerId?: string }) {
  const db = getDb();
  const settlement = await loadSettlement(db, id, viewer.outletId);
  if (viewer.partnerId && settlement.partnerId !== viewer.partnerId) throw new PartnerHubError("SETTLEMENT_NOT_FOUND", "Settlement tidak ditemukan.", 404);
  const partner = await loadPartner(db, settlement.partnerId);
  const lines = await db
    .select({ sl: partnerSettlementLines, line: partnerOrderLines, adj: partnerAdjustments })
    .from(partnerSettlementLines)
    .leftJoin(partnerOrderLines, eq(partnerSettlementLines.orderLineId, partnerOrderLines.id))
    .leftJoin(partnerAdjustments, eq(partnerSettlementLines.adjustmentId, partnerAdjustments.id))
    .where(eq(partnerSettlementLines.settlementId, settlement.id))
    .orderBy(asc(partnerSettlementLines.createdAt));
  const payouts = await db.select().from(partnerPayouts).where(eq(partnerPayouts.settlementId, settlement.id)).orderBy(asc(partnerPayouts.createdAt));
  const reports = await db
    .select({ id: partnerReports.id, reportNo: partnerReports.reportNo, audience: partnerReports.audience, kind: partnerReports.kind, version: partnerReports.version, createdAt: partnerReports.createdAt, checksum: partnerReports.checksum })
    .from(partnerReports)
    .where(eq(partnerReports.settlementId, settlement.id))
    .orderBy(desc(partnerReports.createdAt));
  return {
    settlement,
    partner: { id: partner.id, code: partner.code, name: partner.name, address: partner.address, phone: partner.phone, productKind: partner.productKind },
    lines: lines
      .map(({ sl, line, adj }) =>
        line
          ? {
              kind: "sale" as const,
              orderNo: line.orderNo,
              createdAt: line.createdAt,
              tableLabel: line.tableLabel,
              customerName: line.customerName,
              itemName: line.itemName,
              variantLabel: line.variantLabel,
              qty: sl.qty,
              unitPrice: line.unitPrice,
              unitCost: line.unitCost,
              sales: sl.sales,
              cost: sl.cost,
              profit: sl.sales - sl.cost,
              liability: sl.liability,
              status: line.status,
            }
          : {
              kind: "adjustment" as const,
              orderNo: adj?.sourceRef ?? "-",
              createdAt: adj?.createdAt ?? sl.createdAt,
              tableLabel: null,
              customerName: null,
              itemName: `Penyesuaian: ${adj?.reason ?? "-"}`,
              variantLabel: adj?.kind ?? "",
              qty: sl.qty,
              unitPrice: 0,
              unitCost: 0,
              sales: sl.sales,
              cost: 0,
              profit: sl.sales - sl.liability,
              liability: sl.liability,
              status: adj?.status ?? "approved",
            },
      ),
    payouts: payouts.map((p) => ({ id: p.id, amount: p.amount, fundSource: p.fundSource, reference: p.reference, status: p.status, paidAt: p.paidAt, selfVerified: p.selfVerified, createdBy: p.createdBy, verifiedBy: p.verifiedBy })),
    reports,
  };
}

export async function listPartnerSettlements(outletId: string, partnerId?: string) {
  return getDb()
    .select({ settlement: partnerSettlements, partnerName: partners.name, partnerCode: partners.code })
    .from(partnerSettlements)
    .innerJoin(partners, eq(partnerSettlements.partnerId, partners.id))
    .where(and(eq(partnerSettlements.outletId, outletId), partnerId ? eq(partnerSettlements.partnerId, partnerId) : undefined))
    .orderBy(desc(partnerSettlements.createdAt))
    .limit(200);
}

export async function submitPartnerSettlement(id: string, garage: GarageSession) {
  const db = getDb();
  const row = await loadSettlement(db, id, garage.profile.outlet.id);
  if (row.status !== "draft") throw new PartnerHubError("INVALID_STATUS", "Hanya draft yang bisa diajukan.", 409);
  return db.transaction(async (tx) => {
    await tx.update(partnerSettlements).set({ status: "submitted", submittedBy: garage.user.id, submittedAt: new Date(), updatedAt: new Date() }).where(eq(partnerSettlements.id, id));
    await logEvent(tx, { partnerId: row.partnerId, kind: "settlement_submitted", subjectId: row.settlementNo, fromStatus: "draft", toStatus: "submitted", actor: staffActor(garage) });
    return { id, status: "submitted" };
  });
}

/**
 * Owner menyetujui settlement (DEC-08). DEC-06: kewajiban HPP mitra diakui sebagai biaya "HPP Mitra"
 * (expenses status recorded, sourceDoc = nomor settlement, idempoten) — dibayar lewat payout terverifikasi.
 */
export async function approvePartnerSettlement(id: string, garage: GarageSession) {
  assertOwner(garage, "Menyetujui settlement mitra");
  const db = getDb();
  const row = await loadSettlement(db, id, garage.profile.outlet.id);
  if (!["draft", "submitted"].includes(row.status)) throw new PartnerHubError("INVALID_STATUS", "Settlement ini sudah diproses.", 409);
  const partner = await loadPartner(db, row.partnerId);
  return db.transaction(async (tx) => {
    const [locked] = await tx.select().from(partnerSettlements).where(eq(partnerSettlements.id, id)).for("update").limit(1);
    if (!locked || !["draft", "submitted"].includes(locked.status)) throw new PartnerHubError("INVALID_STATUS", "Settlement ini sudah diproses.", 409);
    await tx.update(partnerSettlements).set({ status: "approved", approvedBy: garage.user.id, approvedAt: new Date(), updatedAt: new Date() }).where(eq(partnerSettlements.id, id));
    if (locked.liabilityTotal > 0) {
      await tx
        .insert(expenses)
        .values({
          outletId: locked.outletId,
          category: "HPP Mitra",
          description: `Setoran mitra ${partner.name} · ${locked.settlementNo}`,
          amount: locked.liabilityTotal,
          paymentMethod: "Transfer",
          status: "recorded",
          expenseDate: locked.periodTo,
          notes: `Settlement ${locked.settlementNo}`,
          sourceDoc: `PSET:${locked.settlementNo}`,
          createdBy: garage.user.id,
        })
        .onConflictDoNothing({ target: expenses.sourceDoc });
    }
    await logEvent(tx, { partnerId: row.partnerId, kind: "settlement_approved", subjectId: row.settlementNo, fromStatus: locked.status, toStatus: "approved", actor: staffActor(garage) });
    return { id, status: "approved" };
  });
}

/** Batalkan draft/ajuan: slot anti-dobel dilepas supaya baris bisa direkap ulang. */
export async function cancelPartnerSettlement(id: string, reason: string, garage: GarageSession) {
  assertOwnerOrManager(garage, "Membatalkan settlement");
  if (!reason.trim()) throw new PartnerHubError("REASON_REQUIRED", "Alasan pembatalan wajib diisi.");
  const db = getDb();
  const row = await loadSettlement(db, id, garage.profile.outlet.id);
  if (!["draft", "submitted"].includes(row.status)) throw new PartnerHubError("INVALID_STATUS", "Settlement yang sudah disetujui tidak bisa dibatalkan; buat penyesuaian.", 409);
  return db.transaction(async (tx) => {
    await tx.update(partnerSettlements).set({ status: "cancelled", note: reason.trim(), updatedAt: new Date() }).where(eq(partnerSettlements.id, id));
    await tx.update(partnerSettlementLines).set({ activeLineKey: null }).where(eq(partnerSettlementLines.settlementId, id));
    await logEvent(tx, { partnerId: row.partnerId, kind: "settlement_cancelled", subjectId: row.settlementNo, fromStatus: row.status, toStatus: "cancelled", reason, actor: staffActor(garage) });
    return { id, status: "cancelled" };
  });
}

async function refreshSettlementPaid(tx: Tx, settlementId: string) {
  const [row] = await tx.select().from(partnerSettlements).where(eq(partnerSettlements.id, settlementId)).limit(1);
  const [{ paid }] = await tx
    .select({ paid: sql<number>`coalesce(sum(${partnerPayouts.amount}), 0)::int` })
    .from(partnerPayouts)
    .where(and(eq(partnerPayouts.settlementId, settlementId), eq(partnerPayouts.status, "verified")));
  const status = settlementStatusAfterPayment(row.liabilityTotal, Number(paid));
  await tx.update(partnerSettlements).set({ paidAmount: Number(paid), status, updatedAt: new Date() }).where(eq(partnerSettlements.id, settlementId));
  if (status === "paid") {
    await tx.update(expenses).set({ status: "paid" }).where(eq(expenses.sourceDoc, `PSET:${row.settlementNo}`));
  }
  return { paidAmount: Number(paid), status };
}

/** Catat transfer ke mitra. Manajer mencatat → Owner memverifikasi; Owner mencatat = terverifikasi + "tanpa pemeriksa kedua". */
export async function recordPartnerPayout(
  settlementId: string,
  input: { amount: number; fundSource: "bank_jago" | "bank_bni" | "external"; reference: string; paidAt: Date; proofUrl?: string | null; idempotencyKey: string },
  garage: GarageSession,
) {
  assertOwnerOrManager(garage, "Mencatat pembayaran mitra");
  const db = getDb();
  const settlement = await loadSettlement(db, settlementId, garage.profile.outlet.id);
  const reference = input.reference.trim();
  if (reference.length < 4) throw new PartnerHubError("REFERENCE_REQUIRED", "Nomor referensi bank wajib diisi.");
  const [replay] = await db.select().from(partnerPayouts).where(eq(partnerPayouts.idempotencyKey, input.idempotencyKey)).limit(1);
  if (replay) return { id: replay.id, status: replay.status, replay: true };
  const [dupRef] = await db.select({ id: partnerPayouts.id }).from(partnerPayouts).where(eq(partnerPayouts.reference, reference)).limit(1);
  if (dupRef) throw new PartnerHubError("DUPLICATE_REFERENCE", "Referensi transfer ini sudah pernah dicatat.", 409);
  const [bank] = await db
    .select()
    .from(partnerBankAccounts)
    .where(and(eq(partnerBankAccounts.partnerId, settlement.partnerId), eq(partnerBankAccounts.status, "verified")))
    .limit(1);
  if (!bank) throw new PartnerHubError("BANK_NOT_VERIFIED", "Rekening mitra belum diverifikasi Owner.", 409);
  const owner = isOwner(garage);
  try {
    return await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(partnerSettlements).where(eq(partnerSettlements.id, settlementId)).for("update").limit(1);
      const [{ verified, pending }] = await tx
        .select({
          verified: sql<number>`coalesce(sum(case when ${partnerPayouts.status} = 'verified' then ${partnerPayouts.amount} end), 0)::int`,
          pending: sql<number>`coalesce(sum(case when ${partnerPayouts.status} = 'recorded' then ${partnerPayouts.amount} end), 0)::int`,
        })
        .from(partnerPayouts)
        .where(eq(partnerPayouts.settlementId, settlementId));
      const block = payoutBlockReason({ status: locked.status, liabilityTotal: locked.liabilityTotal, verifiedPaid: Number(verified), recordedPending: Number(pending), amount: input.amount });
      if (block) throw new PartnerHubError("PAYOUT_BLOCKED", block, 409);
      const [row] = await tx
        .insert(partnerPayouts)
        .values({
          settlementId,
          partnerId: settlement.partnerId,
          bankAccountId: bank.id,
          amount: input.amount,
          fundSource: input.fundSource,
          reference,
          proofUrl: input.proofUrl ?? null,
          status: owner ? "verified" : "recorded",
          paidAt: input.paidAt,
          idempotencyKey: input.idempotencyKey,
          createdBy: garage.user.id,
          verifiedBy: owner ? garage.user.id : null,
          verifiedAt: owner ? new Date() : null,
          selfVerified: owner,
        })
        .returning();
      if (owner) await refreshSettlementPaid(tx, settlementId);
      await logEvent(tx, { partnerId: settlement.partnerId, kind: "payout_recorded", subjectId: row.id, toStatus: row.status, actor: staffActor(garage), metadata: { amount: row.amount, reference, selfVerified: owner } });
      return { id: row.id, status: row.status, replay: false };
    });
  } catch (error) {
    if (/unique|duplicate|23505/i.test(String((error as { code?: string }).code ?? "") + String(error))) {
      throw new PartnerHubError("DUPLICATE_REFERENCE", "Referensi transfer ini sudah pernah dicatat.", 409);
    }
    throw error;
  }
}

export async function verifyPartnerPayout(payoutId: string, garage: GarageSession) {
  assertOwner(garage, "Verifikasi pembayaran mitra");
  const db = getDb();
  const [payout] = await db.select().from(partnerPayouts).where(eq(partnerPayouts.id, payoutId)).limit(1);
  if (!payout) throw new PartnerHubError("PAYOUT_NOT_FOUND", "Pembayaran tidak ditemukan.", 404);
  await loadSettlement(db, payout.settlementId, garage.profile.outlet.id);
  if (payout.status !== "recorded") throw new PartnerHubError("INVALID_STATUS", "Pembayaran ini sudah diproses.", 409);
  if (payout.createdBy === garage.user.id) throw new PartnerHubError("SAME_PERSON", "Pemeriksa harus berbeda dari pencatat.", 409);
  return db.transaction(async (tx) => {
    await tx.update(partnerPayouts).set({ status: "verified", verifiedBy: garage.user.id, verifiedAt: new Date() }).where(and(eq(partnerPayouts.id, payoutId), eq(partnerPayouts.status, "recorded")));
    const state = await refreshSettlementPaid(tx, payout.settlementId);
    await logEvent(tx, { partnerId: payout.partnerId, kind: "payout_verified", subjectId: payoutId, fromStatus: "recorded", toStatus: "verified", actor: staffActor(garage) });
    return state;
  });
}

export async function voidPartnerPayout(payoutId: string, reason: string, garage: GarageSession) {
  assertOwner(garage, "Membatalkan pembayaran mitra");
  if (!reason.trim()) throw new PartnerHubError("REASON_REQUIRED", "Alasan wajib diisi.");
  const db = getDb();
  const [payout] = await db.select().from(partnerPayouts).where(eq(partnerPayouts.id, payoutId)).limit(1);
  if (!payout || payout.status === "void") throw new PartnerHubError("PAYOUT_NOT_FOUND", "Pembayaran tidak ditemukan.", 404);
  await loadSettlement(db, payout.settlementId, garage.profile.outlet.id);
  return db.transaction(async (tx) => {
    await tx.update(partnerPayouts).set({ status: "void", voidReason: reason.trim() }).where(eq(partnerPayouts.id, payoutId));
    const state = await refreshSettlementPaid(tx, payout.settlementId);
    if (state.status !== "paid") {
      const [s] = await tx.select({ no: partnerSettlements.settlementNo }).from(partnerSettlements).where(eq(partnerSettlements.id, payout.settlementId)).limit(1);
      await tx.update(expenses).set({ status: "recorded" }).where(eq(expenses.sourceDoc, `PSET:${s.no}`));
    }
    await logEvent(tx, { partnerId: payout.partnerId, kind: "payout_void", subjectId: payoutId, fromStatus: payout.status, toStatus: "void", reason, actor: staffActor(garage) });
    return state;
  });
}

/** Penyesuaian manual (diskon ditanggung mitra, koreksi, sengketa) — Owner/Manajer, selalu dengan alasan. */
export async function createPartnerAdjustment(
  input: { partnerId: string; kind: "discount_partner" | "correction" | "dispute"; salesDelta: number; liabilityDelta: number; qty?: number; reason: string; orderLineId?: string | null },
  garage: GarageSession,
) {
  assertOwnerOrManager(garage, "Mencatat penyesuaian mitra");
  if (!input.reason.trim()) throw new PartnerHubError("REASON_REQUIRED", "Alasan penyesuaian wajib diisi.");
  if (![input.salesDelta, input.liabilityDelta].every(Number.isInteger)) throw new PartnerHubError("INVALID_AMOUNT", "Nominal harus rupiah bulat.");
  const db = getDb();
  const partner = await loadPartner(db, input.partnerId, garage.profile.outlet.id);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(partnerAdjustments)
      .values({
        partnerId: partner.id,
        outletId: partner.outletId,
        orderLineId: input.orderLineId ?? null,
        kind: input.kind,
        qty: input.qty ?? 0,
        salesDelta: input.salesDelta,
        liabilityDelta: input.liabilityDelta,
        reason: input.reason.trim(),
        // Owner langsung disetujui; Manajer menunggu Owner (dispute selalu menunggu).
        status: isOwner(garage) && input.kind !== "dispute" ? "approved" : "pending",
        createdBy: garage.user.id,
        approvedBy: isOwner(garage) && input.kind !== "dispute" ? garage.user.id : null,
      })
      .returning();
    await logEvent(tx, { partnerId: partner.id, kind: "adjustment_created", subjectId: row.id, toStatus: row.status, reason: input.reason, actor: staffActor(garage), metadata: { salesDelta: row.salesDelta, liabilityDelta: row.liabilityDelta } });
    return row;
  });
}

export async function decidePartnerAdjustment(id: string, approve: boolean, garage: GarageSession) {
  assertOwner(garage, "Memutuskan penyesuaian mitra");
  const db = getDb();
  const [row] = await db.select().from(partnerAdjustments).where(eq(partnerAdjustments.id, id)).limit(1);
  if (!row || row.outletId !== garage.profile.outlet.id) throw new PartnerHubError("ADJUSTMENT_NOT_FOUND", "Penyesuaian tidak ditemukan.", 404);
  if (row.status !== "pending") throw new PartnerHubError("INVALID_STATUS", "Penyesuaian sudah diputuskan.", 409);
  return db.transaction(async (tx) => {
    await tx.update(partnerAdjustments).set({ status: approve ? "approved" : "rejected", approvedBy: garage.user.id }).where(eq(partnerAdjustments.id, id));
    await logEvent(tx, { partnerId: row.partnerId, kind: "adjustment_decided", subjectId: id, fromStatus: "pending", toStatus: approve ? "approved" : "rejected", actor: staffActor(garage) });
    return { id, status: approve ? "approved" : "rejected" };
  });
}

// ─── Laporan untuk Portal Mitra ──────────────────────────────────────────────

export async function partnerPortalOverview(session: PartnerSession) {
  const db = getDb();
  const now = new Date();
  const dayStart = new Date(Math.floor((now.getTime() + 7 * 3_600_000) / 86_400_000) * 86_400_000 - 7 * 3_600_000);
  const [products, active, today, settlements] = await Promise.all([
    listPartnerProducts(session.partner.id, { outletId: session.partner.outletId, showCost: false }),
    listTicketsForPartner(session.partner.id, "active"),
    partnerFinanceSummary(session.partner.id, session.partner.outletId, dayStart, new Date(now.getTime() + 60_000)),
    db
      .select({ id: partnerSettlements.id, settlementNo: partnerSettlements.settlementNo, status: partnerSettlements.status, liabilityTotal: partnerSettlements.liabilityTotal, paidAmount: partnerSettlements.paidAmount, periodFrom: partnerSettlements.periodFrom, periodTo: partnerSettlements.periodTo })
      .from(partnerSettlements)
      .where(and(eq(partnerSettlements.partnerId, session.partner.id), ne(partnerSettlements.status, "cancelled")))
      .orderBy(desc(partnerSettlements.createdAt))
      .limit(20),
  ]);
  const unpaid = settlements.filter((s) => ["approved", "partially_paid"].includes(s.status)).reduce((sum, s) => sum + (s.liabilityTotal - s.paidAmount), 0);
  return {
    partner: session.partner,
    products: products.map((p) => ({ ...p, variants: p.variants.map(({ unitCost: _unitCost, ...v }) => v) })),
    activeTickets: active,
    today: { qty: today.totalQty, gross: today.grossSales, liability: today.liabilityTotal, orders: today.orderCount },
    unpaid,
    settlements,
  };
}


// ─── PDF settlement (PRD 14) ─────────────────────────────────────────────────

/**
 * Terbitkan PDF settlement. FINAL hanya bila settlement sudah disetujui Owner; selain itu DRAFT.
 * Mitra hanya boleh mengunduh PDF resmi (audience "partner") miliknya sendiri yang FINAL.
 * Arsip: partner_reports (versi, checksum, jumlah baris). Isi direkonstruksi deterministik dari snapshot
 * settlement — dokumen yang isinya sama menghasilkan checksum sama dan tidak menambah versi.
 */
export async function generatePartnerReport(
  settlementId: string,
  input: { audience: "partner" | "internal"; outletId: string; partnerId?: string; generatedBy: string | null },
) {
  const { renderPartnerReportPdf } = await import("@/lib/partner-report-pdf");
  const db = getDb();
  const detail = await getPartnerSettlement(settlementId, { outletId: input.outletId, partnerId: input.partnerId });
  const s = detail.settlement;
  const final = ["approved", "partially_paid", "paid"].includes(s.status);
  if (input.partnerId && (!final || input.audience !== "partner")) {
    throw new PartnerHubError("REPORT_NOT_READY", "Laporan resmi tersedia setelah settlement disetujui Owner.", 409);
  }
  // Rekonsiliasi wajib Rp0: Σ baris = total settlement (PRD 16.3 #7).
  const sumLiability = detail.lines.reduce((sum, line) => sum + line.liability, 0);
  const sumSales = detail.lines.reduce((sum, line) => sum + line.sales, 0);
  if (sumLiability !== s.liabilityTotal || sumSales !== s.grossSales + s.salesAdjustments) {
    throw new PartnerHubError("LEDGER_MISMATCH", "Total baris tidak sama dengan total settlement. Laporan ditahan untuk diperiksa.", 409);
  }
  const { outlets, user } = await import("@/db/schema");
  const [outlet] = await db.select({ name: outlets.name }).from(outlets).where(eq(outlets.id, s.outletId)).limit(1);
  const [approver] = s.approvedBy ? await db.select({ name: user.name }).from(user).where(eq(user.id, s.approvedBy)).limit(1) : [];
  const existing = await db
    .select()
    .from(partnerReports)
    .where(and(eq(partnerReports.settlementId, s.id), eq(partnerReports.audience, input.audience)))
    .orderBy(desc(partnerReports.version));
  const kind = final ? "final" : "draft";
  const build = (version: number) =>
    renderPartnerReportPdf({
      reportNo: `RPT-${s.settlementNo}-${input.audience === "partner" ? "P" : "I"}`,
      version,
      kind,
      audience: input.audience,
      generatedAt: s.approvedAt ?? s.createdAt,
      outletName: outlet?.name ?? "Garage Coffee",
      partner: { code: detail.partner.code, name: detail.partner.name, productKind: detail.partner.productKind, address: detail.partner.address },
      settlement: { ...s, approvedByName: approver?.name ?? null },
      lines: detail.lines,
      payouts: detail.payouts.filter((p) => p.status !== "void").map((p) => ({ ...p, paidAt: new Date(p.paidAt) })),
    });
  const latest = existing[0];
  let pdf = await build(latest ? latest.version : 1);
  if (latest && latest.checksum === pdf.sha256 && latest.kind === kind) {
    return { buffer: pdf.buffer, report: latest, fileName: `${latest.reportNo}-v${latest.version}.pdf` };
  }
  const version = latest ? latest.version + 1 : 1;
  if (latest) pdf = await build(version);
  const reportNo = `RPT-${s.settlementNo}-${input.audience === "partner" ? "P" : "I"}V${String(version).padStart(2, "0")}`;
  const [report] = await db
    .insert(partnerReports)
    .values({
      reportNo,
      settlementId: s.id,
      partnerId: s.partnerId,
      audience: input.audience,
      kind,
      version,
      checksum: pdf.sha256,
      totalLines: detail.lines.length,
      // Tidak menyimpan file: PDF direkonstruksi dari snapshot settlement; checksum membuktikan keasliannya.
      filePath: `regen:${s.id}:${input.audience}:v${version}`,
      generatedBy: input.generatedBy,
    })
    .returning();
  await logEvent(db, { partnerId: s.partnerId, kind: "report_generated", subjectId: reportNo, toStatus: kind, actor: { type: input.partnerId ? "partner" : "staff", id: input.generatedBy, name: input.generatedBy ?? "-" }, metadata: { checksum: pdf.sha256, lines: detail.lines.length } });
  return { buffer: pdf.buffer, report, fileName: `${reportNo}.pdf` };
}
