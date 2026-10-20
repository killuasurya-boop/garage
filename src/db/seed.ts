import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";

import { and, count, eq, isNull, sql } from "drizzle-orm";

import { ensureDatabaseReady, getDb, getPgPool } from "@/db";
import {
  appSettings as appSettingsTable,
  approvals as approvalsTable,
  auditLogs as auditLogsTable,
  cashSessions,
  customers as customersTable,
  expenses,
  inventoryItems as inventoryItemsTable,
  kitchenTickets,
  marketingBroadcasts,
  marketingCampaigns,
  menuRecipes,
  menuItems as menuItemsTable,
  menuVariants,
  orders,
  outlets,
  payments,
  paymentSettlements,
  posTerminals,
  supplierInvoices,
  suppliers,
  staffProfiles,
  siteAssets,
  stockMovements as stockMovementsTable,
  user,
  vouchers as vouchersTable,
} from "@/db/schema";
import { syncRecipeBaseCosts } from "@/lib/menu-recipe-cost";
import { landingHeroSlot } from "@/lib/site-assets";
import { auth } from "@/lib/auth";
import {
  approvals,
  auditLogs,
  closingChecklist,
  customers,
  inventoryItems,
  kitchenOrders,
  menuItems,
  paymentBreakdown,
  roles,
  stockMovements,
  type Role,
} from "@/lib/garage-data";
import { ensureGarageMemberLoyaltySeed } from "@/lib/garage-member-seed";
import { hashPosApiKey } from "@/lib/pos-api-key";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const seedPassword = process.env.GARAGE_SEED_PASSWORD ?? "garage12345";
const seedMemberPassword = process.env.GARAGE_MEMBER_SEED_PASSWORD ?? "member12345";
const seedPosApiKey = process.env.GARAGE_POS_API_KEY ?? "garage-pos-dev-key";

const staffSeed: Array<{
  role: Role;
  email: string;
  name: string;
  deviceLabel: string;
}> = [
  {
    role: "Owner",
    email: "owner@garage.id",
    name: "Owner Garage",
    deviceLabel: "WEB-OWNER-01",
  },
  {
    role: "Manajer",
    email: "manajer@garage.id",
    name: "Manajer Garage",
    deviceLabel: "WEB-MGR-01",
  },
  {
    role: "Kasir",
    email: "kasir@garage.id",
    name: "Kasir Garage",
    deviceLabel: "POS-01",
  },
  {
    role: "Kasir",
    email: "kasir2@garage.id",
    name: "Kasir 2 Garage",
    deviceLabel: "POS-02",
  },
  {
    role: "Waiter",
    email: "waiter@garage.id",
    name: "Waiter Garage",
    deviceLabel: "TABLE-WTR-01",
  },
  {
    role: "Waiter",
    email: "waiter2@garage.id",
    name: "Waiter 2 Garage",
    deviceLabel: "TABLE-WTR-02",
  },
];

async function ensureAuthUser(email: string, name: string) {
  const db = getDb();
  const [existing] = await db.select().from(user).where(eq(user.email, email)).limit(1);
  if (existing) {
    return existing;
  }

  try {
    const result = (await auth.api.signUpEmail({
      body: {
        email,
        password: seedPassword,
        name,
      },
    })) as { user?: typeof user.$inferSelect };

    if (result.user) {
      return result.user;
    }
  } catch (error) {
    const [created] = await db.select().from(user).where(eq(user.email, email)).limit(1);
    if (created) {
      return created;
    }

    throw error;
  }

  const [created] = await db.select().from(user).where(eq(user.email, email)).limit(1);
  if (!created) {
    throw new Error(`Unable to seed auth user ${email}`);
  }

  return created;
}

// Mode seed. Default = HANYA-TAMBAH: data yang sudah ada (nama outlet, role staf,
// harga/resep menu, HPP & harga beli bahan, kunci POS, gambar hero) TIDAK
// ditimpa, dan produk buatan owner tidak diarsipkan — aman dijalankan setelah
// live. `--sync-catalog` = selaraskan penuh katalog ke garage-data.ts (dipakai
// saat memasukkan data Excel baru sebelum live).
const syncCatalog = process.argv.includes("--sync-catalog");

// --sync-catalog menimpa harga jual & kategori POS dari garage-data.ts. Setelah ada
// transaksi, itu melanggar aturan data POS terlindungi (owner, Okt 2026) — wajib
// konfirmasi eksplisit `--confirm-overwrite-pos` (cek dulu GET /api/admin/pos-baseline).
async function assertCatalogOverwriteAllowed() {
  if (process.argv.includes("--confirm-overwrite-pos")) return;
  const [{ n }] = await getDb().select({ n: count() }).from(orders);
  if (Number(n) > 0) {
    throw new Error(
      `--sync-catalog dibatalkan: sudah ada ${n} order. Ini akan menimpa harga & kategori POS yang berjalan. ` +
        "Tambahkan --confirm-overwrite-pos bila owner memang menyetujuinya.",
    );
  }
}

async function seedOutletAndStaff() {
  const db = getDb();
  const outletValues = {
    code: "OUTLET-A",
    name: "Outlet A",
    timezone: "Asia/Jakarta",
    status: "active",
  };
  if (syncCatalog) {
    await db
      .insert(outlets)
      .values(outletValues)
      .onConflictDoUpdate({
        target: outlets.code,
        set: { name: outletValues.name, timezone: outletValues.timezone, status: "active", updatedAt: new Date() },
      });
  } else {
    await db.insert(outlets).values(outletValues).onConflictDoNothing({ target: outlets.code });
  }
  const [outlet] = await db.select().from(outlets).where(eq(outlets.code, outletValues.code)).limit(1);

  for (const staff of staffSeed) {
    const seededUser = await ensureAuthUser(staff.email, staff.name);
    const profile = {
      userId: seededUser.id,
      outletId: outlet.id,
      role: staff.role,
      shiftLabel: "Shift aktif",
      deviceLabel: staff.deviceLabel,
    };
    if (syncCatalog) {
      await db
        .insert(staffProfiles)
        .values(profile)
        .onConflictDoUpdate({
          target: staffProfiles.userId,
          set: {
            outletId: outlet.id,
            role: staff.role,
            shiftLabel: "Shift aktif",
            deviceLabel: staff.deviceLabel,
            updatedAt: new Date(),
          },
        });
    } else {
      await db.insert(staffProfiles).values(profile).onConflictDoNothing({ target: staffProfiles.userId });
    }
  }

  return outlet;
}

async function seedMenu() {
  const db = getDb();

  for (const [index, item] of menuItems.entries()) {
    const itemValues = {
      id: item.id,
      name: item.name,
      category: item.category,
      section: item.section,
      stock: item.stock,
      status: item.status ?? "active",
      prep: item.prep,
      tags: item.tags,
      imageUrl: item.imageUrl ?? null,
      // Rokok disembunyikan dari menu digital pelanggan.
      showInDigitalMenu: item.showInDigitalMenu ?? true,
      sortOrder: index,
    };
    if (syncCatalog) {
      await db
        .insert(menuItemsTable)
        .values(itemValues)
        .onConflictDoUpdate({
          target: menuItemsTable.id,
          set: {
            name: item.name,
            category: item.category,
            section: item.section,
            stock: item.stock,
            status: item.status ?? "active",
            prep: item.prep,
            tags: item.tags,
            sortOrder: index,
            updatedAt: new Date(),
          },
        });
    } else {
      await db.insert(menuItemsTable).values(itemValues).onConflictDoNothing({ target: menuItemsTable.id });
    }

    for (const [variantIndex, variant] of item.variants.entries()) {
      const variantValues = {
        itemId: item.id,
        variantId: variant.id,
        label: variant.label,
        price: variant.price,
        baseCost: variant.baseCost ?? 0,
        sortOrder: variantIndex,
      };
      if (syncCatalog) {
        await db
          .insert(menuVariants)
          .values(variantValues)
          .onConflictDoUpdate({
            target: [menuVariants.itemId, menuVariants.variantId],
            set: {
              label: variant.label,
              price: variant.price,
              baseCost: variant.baseCost ?? 0,
              sortOrder: variantIndex,
              updatedAt: new Date(),
            },
          });
      } else {
        await db
          .insert(menuVariants)
          .values(variantValues)
          .onConflictDoNothing({ target: [menuVariants.itemId, menuVariants.variantId] });
      }
    }
  }

  // Penyelarasan (hapus varian lama, arsipkan produk di luar daftar) hanya pada
  // --sync-catalog — tanpa ini produk yang dibuat owner lewat aplikasi ikut
  // terarsip setiap kali seed dijalankan.
  if (!syncCatalog) return;

  // Reconcile against the seed so removed products/variants stop showing in POS
  // and the digital menu. Variants are deleted (order_items.variant_id is a plain
  // snapshot, not a foreign key). Items are archived, not deleted, to keep
  // order_items.menu_item_id history intact.
  for (const item of menuItems) {
    const keepVariantIds = item.variants.map((variant) => variant.id);
    await db.execute(sql`
      DELETE FROM menu_variants
      WHERE item_id = ${item.id}
        AND variant_id NOT IN (${sql.join(
          keepVariantIds.map((id) => sql`${id}`),
          sql`, `,
        )})
    `);
  }

  // Owner directive (Sep 2026): the menu is exactly the seed list (10 Makanan &
  // Cemilan products). Everything else — old Coffee, Non-Coffee, Burger, Kebab,
  // and previous food/snack IDs — is archived here. Rows are kept so order
  // history stays intact.
  const seedItemIds = menuItems.map((item) => item.id);
  await db.execute(sql`
    UPDATE menu_items
    SET status = 'archived',
        updated_at = now()
    WHERE status = 'active'
      AND id NOT IN (${sql.join(
        seedItemIds.map((id) => sql`${id}`),
        sql`, `,
      )})
  `);
}

async function seedInventory(seedDemo: boolean) {
  const db = getDb();
  // Katalog gudang = bahan "HPP BAR.xlsx" (area bar, HPP per ml/gr/pcs). Stok nyata
  // (onHand/status/movement) TIDAK pernah ditimpa. HPP & harga beli hanya ditimpa
  // pada --sync-catalog (setelah live harganya mengikuti receiving/edit owner).
  for (const item of inventoryItems) {
    if (!syncCatalog) {
      await db.insert(inventoryItemsTable).values(item).onConflictDoNothing({ target: inventoryItemsTable.sku });
      continue;
    }
    await db
      .insert(inventoryItemsTable)
      .values(item)
      .onConflictDoUpdate({
        target: inventoryItemsTable.sku,
        set: {
          name: item.name,
          alternativeName: item.alternativeName,
          category: item.category,
          usageArea: item.usageArea,
          unit: item.unit,
          packageSize: item.packageSize,
          purchasePrice: item.purchasePrice,
          packageQty: item.packageQty,
          unitCost: item.unitCost,
          min: item.min,
          updatedAt: new Date(),
        },
      });
  }

  // Resep menu dari seed (saat ini hanya minuman bar). Makanan & cemilan belum
  // punya resep — owner mengisinya sendiri lewat modul Resep.
  for (const item of menuItems) {
    for (const recipe of item.recipes ?? []) {
      const recipeValues = {
        menuItemId: item.id,
        variantId: recipe.variantId,
        inventorySku: recipe.inventorySku,
        qty: recipe.qty,
        unit: recipe.unit,
        wastePct: recipe.wastePct,
        status: "active",
      };
      if (!syncCatalog) {
        await db
          .insert(menuRecipes)
          .values(recipeValues)
          .onConflictDoNothing({
            target: [menuRecipes.menuItemId, menuRecipes.variantId, menuRecipes.inventorySku],
          });
        continue;
      }
      await db
        .insert(menuRecipes)
        .values(recipeValues)
        .onConflictDoUpdate({
          target: [menuRecipes.menuItemId, menuRecipes.variantId, menuRecipes.inventorySku],
          set: {
            qty: recipe.qty,
            unit: recipe.unit,
            wastePct: recipe.wastePct,
            status: "active",
            updatedAt: new Date(),
          },
        });
    }
  }

  // HPP menu = resep × HPP bahan terkini (bukan angka tertulis / persen).
  await syncRecipeBaseCosts(db);

  if (seedDemo) {
    const [movementCount] = await db.select({ total: count() }).from(stockMovementsTable);
    if (!movementCount.total) {
      await db.insert(stockMovementsTable).values(
        stockMovements.map((movement) => ({
          type: "seed",
          note: movement,
          actor: "Seed",
        })),
      );
    }
  }
}

async function seedCustomers() {
  const db = getDb();

  for (const customer of customers) {
    await db
      .insert(customersTable)
      .values(customer)
      .onConflictDoUpdate({
        target: customersTable.phone,
        set: {
          name: customer.name,
          tier: customer.tier,
          points: customer.points,
          visits: customer.visits,
          lastOrder: customer.lastOrder,
          flag: customer.flag,
          updatedAt: new Date(),
        },
      });
  }
}

// Struktural: POS terminal selalu di-seed (bukan data demo).
// Keputusan owner (Sep 2026): pelanggan membayar harga produk bulat apa adanya —
// tanpa PB1, tanpa service charge, tanpa promo QR otomatis. Status HABIS menu
// diatur manual oleh kasir ("Atur Stok Habis"), bukan otomatis dari stok.
// Disimpan sebagai setting global HANYA bila belum ada, supaya perubahan owner
// di Pengaturan tidak tertimpa seed berikutnya.
async function seedBusinessSettings() {
  const db = getDb();
  const ownerDecisions: Record<string, unknown> = {
    serviceChargePct: 0,
    taxPct: 0,
    qrPromoPct: 0,
    autoSoldOutFromStock: false,
  };
  for (const [key, value] of Object.entries(ownerDecisions)) {
    const [existing] = await db
      .select({ id: appSettingsTable.id })
      .from(appSettingsTable)
      .where(and(eq(appSettingsTable.key, key), isNull(appSettingsTable.outletId)))
      .limit(1);
    if (existing) continue;
    await db.insert(appSettingsTable).values({ key, valueJson: value, outletId: null, updatedBy: "seed" });
  }
}

async function seedPosTerminal() {
  const db = getDb();
  const terminal = {
    terminalCode: "GARAGE-POS-01",
    location: "Main cashier",
    apiKeyHash: hashPosApiKey(seedPosApiKey),
    status: "active",
  };
  // Kunci API terminal tidak di-reset ke nilai seed kecuali --sync-catalog.
  if (!syncCatalog) {
    await db.insert(posTerminals).values(terminal).onConflictDoNothing({ target: posTerminals.terminalCode });
    return;
  }
  await db
    .insert(posTerminals)
    .values(terminal)
    .onConflictDoUpdate({
      target: posTerminals.terminalCode,
      set: {
        location: "Main cashier",
        apiKeyHash: hashPosApiKey(seedPosApiKey),
        status: "active",
        updatedAt: new Date(),
      },
    });
}

// Demo: akun member loyalty contoh (hanya saat GARAGE_SEED_DEMO=true).
async function seedMemberLoyalty() {
  await ensureGarageMemberLoyaltySeed(seedMemberPassword);
}

async function seedKitchen() {
  const db = getDb();

  for (const ticket of kitchenOrders) {
    await db
      .insert(kitchenTickets)
      .values({
        ticketNo: ticket.id,
        tableLabel: ticket.table,
        channel: ticket.channel,
        station: ticket.station,
        status: ticket.status,
        elapsed: ticket.elapsed,
        priority: ticket.priority,
        items: [...ticket.items],
      })
      .onConflictDoUpdate({
        target: kitchenTickets.ticketNo,
        set: {
          tableLabel: ticket.table,
          channel: ticket.channel,
          station: ticket.station,
          status: ticket.status,
          elapsed: ticket.elapsed,
          priority: ticket.priority,
          items: [...ticket.items],
          updatedAt: new Date(),
        },
      });
  }
}

async function seedFinance(outletId: string) {
  const db = getDb();
  await db
    .insert(cashSessions)
    .values({
      code: "CS-OUTLET-A-DEMO",
      outletId,
      openingCash: 2500000,
      expectedCash: 5740000,
      actualCash: 5722000,
      discrepancy: -18000,
      status: "closed",
      checklist: closingChecklist,
    })
    .onConflictDoUpdate({
      target: cashSessions.code,
      set: {
        openingCash: 2500000,
        expectedCash: 5740000,
        actualCash: 5722000,
        discrepancy: -18000,
        status: "closed",
        checklist: closingChecklist,
      },
    });

  for (const payment of paymentBreakdown) {
    const orderNo = `POS-SEED-${payment.method.toUpperCase().replace(/[^A-Z0-9]/g, "")}`;
    const [order] = await db
      .insert(orders)
      .values({
        orderNo,
        outletId,
        tableLabel: "SEED",
        channel: "Dine in",
        status: "paid",
        subtotal: payment.amount,
        service: 0,
        tax: 0,
        discount: 0,
        total: payment.amount,
      })
      .onConflictDoUpdate({
        target: orders.orderNo,
        set: {
          subtotal: payment.amount,
          total: payment.amount,
          updatedAt: new Date(),
        },
      })
      .returning();

    await db.delete(payments).where(eq(payments.orderId, order.id));
    await db.insert(payments).values({
      orderId: order.id,
      method: payment.method,
      amount: payment.amount,
      status: "captured",
    });
  }

  const supplierSeed = [
    {
      code: "SUP-KOPI",
      name: "CV Kopi Nusantara",
      category: "COGS",
      contactName: "Pak Damar",
      phone: "081300001101",
    },
    {
      code: "SUP-SUSU",
      name: "PT Susu Fresh",
      category: "COGS",
      contactName: "Bu Rina",
      phone: "081300001102",
    },
    {
      code: "SUP-GAS",
      name: "CV Gas Melon",
      category: "Operasional",
      contactName: "Pak Ucok",
      phone: "081300001103",
    },
  ];

  const supplierByCode = new Map<string, string>();
  for (const supplier of supplierSeed) {
    const [row] = await db
      .insert(suppliers)
      .values({ ...supplier, outletId })
      .onConflictDoUpdate({
        target: suppliers.code,
        set: {
          name: supplier.name,
          category: supplier.category,
          contactName: supplier.contactName,
          phone: supplier.phone,
          status: "active",
          updatedAt: new Date(),
        },
      })
      .returning();
    supplierByCode.set(supplier.code, row.id);
  }

  const invoiceSeed = [
    {
      supplierCode: "SUP-KOPI",
      invoiceNo: "INV-KOPI-2026-05-001",
      category: "COGS",
      description: "Arabika, robusta, dan house blend",
      amount: 3_200_000,
      dueDate: new Date("2026-05-25T10:00:00+07:00"),
      status: "unpaid",
    },
    {
      supplierCode: "SUP-SUSU",
      invoiceNo: "INV-SUSU-2026-05-001",
      category: "COGS",
      description: "Susu fresh dan creamer",
      amount: 850_000,
      dueDate: new Date("2026-05-22T10:00:00+07:00"),
      status: "due",
    },
    {
      supplierCode: "SUP-GAS",
      invoiceNo: "INV-GAS-2026-05-001",
      category: "Operasional",
      description: "Gas dapur outlet",
      amount: 180_000,
      dueDate: new Date("2026-05-21T10:00:00+07:00"),
      status: "overdue",
    },
  ];

  for (const invoice of invoiceSeed) {
    await db
      .insert(supplierInvoices)
      .values({
        supplierId: supplierByCode.get(invoice.supplierCode) ?? null,
        outletId,
        invoiceNo: invoice.invoiceNo,
        category: invoice.category,
        description: invoice.description,
        amount: invoice.amount,
        dueDate: invoice.dueDate,
        status: invoice.status,
      })
      .onConflictDoUpdate({
        target: supplierInvoices.invoiceNo,
        set: {
          supplierId: supplierByCode.get(invoice.supplierCode) ?? null,
          category: invoice.category,
          description: invoice.description,
          amount: invoice.amount,
          dueDate: invoice.dueDate,
          status: invoice.status,
          updatedAt: new Date(),
        },
      });
  }

  const expenseSeed = [
    ["COGS", "Bahan baku kopi dan susu", 5_200_000, "Transfer"],
    ["Payroll", "Gaji pegawai bulanan accrual", 3_800_000, "Transfer"],
    ["Operasional", "Biaya operasional outlet", 1_900_000, "Cash"],
    ["Utilitas", "Listrik dan air", 800_000, "Transfer"],
    ["Marketing", "Promo dan konten sosial media", 600_000, "Transfer"],
  ] as const;

  const [expenseCount] = await db.select({ total: count() }).from(expenses);
  if (!expenseCount.total) {
    await db.insert(expenses).values(
      expenseSeed.map(([category, description, amount, paymentMethod]) => ({
        outletId,
        category,
        description,
        amount,
        paymentMethod,
        status: "recorded",
        expenseDate: new Date("2026-05-15T14:00:00+07:00"),
      })),
    );
  }

  const settlementSeed = [
    ["SET-QRIS-2026-05-21", "QRIS", "BCA", 8_762_500, 8_762_500, 0, "settled"],
    ["SET-GPAY-2026-05-21", "E-wallet", "GoPay", 3_200_000, 3_200_000, 0, "settled"],
    ["SET-OVO-2026-05-21", "E-Wallet", "OVO", 1_576_760, 0, 0, "pending"],
    ["SET-CARD-2026-05-21", "Card", "Mandiri", 2_750_000, 0, 0, "processing"],
  ] as const;

  for (const [settlementNo, method, provider, expectedAmount, settledAmount, feeAmount, status] of settlementSeed) {
    await db
      .insert(paymentSettlements)
      .values({
        outletId,
        settlementNo,
        method,
        provider,
        expectedAmount,
        settledAmount,
        feeAmount,
        status,
        settlementDate: new Date("2026-05-21T16:00:00+07:00"),
      })
      .onConflictDoUpdate({
        target: paymentSettlements.settlementNo,
        set: {
          expectedAmount,
          settledAmount,
          feeAmount,
          status,
          updatedAt: new Date(),
        },
      });
  }
}

async function seedApprovalsAndAudit() {
  const db = getDb();

  for (const approval of approvals) {
    await db
      .insert(approvalsTable)
      .values({
        ...approval,
        status: "pending",
      })
      .onConflictDoUpdate({
        target: approvalsTable.id,
        set: {
          type: approval.type,
          requester: approval.requester,
          requesterPhone: approval.requesterPhone,
          amount: approval.amount,
          reason: approval.reason,
          risk: approval.risk,
          age: approval.age,
          status: "pending",
          updatedAt: new Date(),
        },
      });
  }

  const [auditCount] = await db.select({ total: count() }).from(auditLogsTable);
  if (!auditCount.total) {
    await db.insert(auditLogsTable).values(
      auditLogs.map((log) => ({
        time: log.time,
        actor: log.actor,
        action: log.action,
        object: log.object,
        device: log.device,
        status: log.status,
      })),
    );
  }
}

async function seedMarketing() {
  const db = getDb();

  const [voucherTotal] = await db.select({ total: count() }).from(vouchersTable);
  const [campaignTotal] = await db.select({ total: count() }).from(marketingCampaigns);
  const [broadcastTotal] = await db.select({ total: count() }).from(marketingBroadcasts);

  if (voucherTotal.total === 0) {
    await db.insert(vouchersTable).values([
      {
        code: "WINBACK10",
        title: "Win-back Voucher 10K",
        type: "fixed",
        value: 10_000,
        minSpend: 30_000,
        audience: "atRisk",
        status: "active",
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        usageLimit: 200,
      },
      {
        code: "BIRTHDAY15",
        title: "Birthday Reward 15%",
        type: "percent",
        value: 15,
        minSpend: 25_000,
        maxDiscount: 25_000,
        audience: "birthdayWeek",
        status: "active",
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        usageLimit: null,
      },
      {
        code: "NEWBIE5K",
        title: "Welcome Voucher 5K",
        type: "fixed",
        value: 5_000,
        minSpend: 20_000,
        audience: "new",
        status: "active",
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        usageLimit: 500,
      },
    ]);
  }

  if (campaignTotal.total === 0) {
    const yy = new Date().getFullYear().toString().slice(-2);
    const startActive = new Date();
    startActive.setDate(startActive.getDate() - 3);
    const endActive = new Date();
    endActive.setDate(endActive.getDate() + 21);
    const startScheduled = new Date();
    startScheduled.setDate(startScheduled.getDate() + 5);
    const endScheduled = new Date();
    endScheduled.setDate(endScheduled.getDate() + 35);
    const startCompleted = new Date();
    startCompleted.setDate(startCompleted.getDate() - 45);
    const endCompleted = new Date();
    endCompleted.setDate(endCompleted.getDate() - 15);

    await db.insert(marketingCampaigns).values([
      {
        code: `MKT-${yy}-WB01`,
        name: "Win-back September",
        objective: "winback",
        channel: "whatsapp",
        segmentKey: "atRisk",
        audienceSize: 45,
        budget: 750_000,
        spend: 150_000,
        targetOrders: 30,
        targetRevenue: 4_500_000,
        actualOrders: 8,
        actualRevenue: 1_200_000,
        status: "active",
        startsAt: startActive,
        endsAt: endActive,
        ownerName: "Ayu (Marketing)",
        notes: "Target customer hilang >30 hari, kirim WA pakai voucher WINBACK10.",
      },
      {
        code: `MKT-${yy}-BD02`,
        name: "Birthday Reward Bulanan",
        objective: "loyalty",
        channel: "whatsapp",
        segmentKey: "birthdayWeek",
        audienceSize: 12,
        budget: 300_000,
        spend: 0,
        targetOrders: 10,
        targetRevenue: 1_500_000,
        actualOrders: 0,
        actualRevenue: 0,
        status: "scheduled",
        startsAt: startScheduled,
        endsAt: endScheduled,
        ownerName: "Ayu (Marketing)",
        notes: "Trigger birthday week, voucher BIRTHDAY15.",
      },
      {
        code: `MKT-${yy}-RF03`,
        name: "Referral Boost Agustus",
        objective: "acquisition",
        channel: "multi",
        segmentKey: "referralReady",
        audienceSize: 28,
        budget: 500_000,
        spend: 380_000,
        targetOrders: 20,
        targetRevenue: 2_500_000,
        actualOrders: 23,
        actualRevenue: 3_100_000,
        status: "completed",
        startsAt: startCompleted,
        endsAt: endCompleted,
        ownerName: "Bagas (Founder)",
        notes: "Berhasil 115% target. Referral bonus 30 poin per pihak.",
      },
    ]);
  }

  if (broadcastTotal.total === 0) {
    const [activeCampaign] = await db
      .select()
      .from(marketingCampaigns)
      .where(eq(marketingCampaigns.status, "active"))
      .limit(1);

    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + 1);
    scheduledAt.setHours(10, 0, 0, 0);

    const sentAt = new Date();
    sentAt.setDate(sentAt.getDate() - 2);

    await db.insert(marketingBroadcasts).values([
      {
        campaignId: activeCampaign?.id ?? null,
        name: "WA Blast Win-back Wave 2",
        channel: "whatsapp",
        segmentKey: "atRisk",
        templateBody:
          "Halo {name}!\n\nKami kangen kamu di GARAGE Coffee. Pakai kode WINBACK10 untuk diskon Rp10.000 di kunjungan berikutnya.\n\nOrder: {orderUrl}",
        status: "scheduled",
        scheduledAt,
        totalRecipients: 45,
        notes: "Manual blast lewat WA Business.",
      },
      {
        campaignId: activeCampaign?.id ?? null,
        name: "WA Blast Win-back Wave 1",
        channel: "whatsapp",
        segmentKey: "atRisk",
        templateBody:
          "Halo {name}, sudah lama nggak mampir nih. Ada promo win-back khusus kamu — pakai kode WINBACK10.",
        status: "sent",
        scheduledAt: sentAt,
        sentAt,
        totalRecipients: 45,
        sentCount: 42,
        openedCount: 28,
        clickedCount: 9,
      },
    ]);
  }
}

async function seedSiteAssets() {
  const heroPublicUrl = "/garage-uploads/landing/hero-premium-design.webp";
  const heroAbsolute = path.join(process.cwd(), "public", "garage-uploads", "landing", "hero-premium-design.webp");

  if (!fs.existsSync(heroAbsolute)) {
    console.warn("Landing hero file tidak ditemukan; lewati seed site_assets.");
    return;
  }

  const stat = fs.statSync(heroAbsolute);
  const heroValues = {
    slot: landingHeroSlot,
    publicUrl: heroPublicUrl,
    width: 1400,
    height: 933,
    alt: "Garage Coffee — hero premium",
    sizeBytes: stat.size,
    mimeType: "image/webp",
    version: "seed-v1",
    updatedBy: null,
  };
  // Gambar hero yang diunggah owner tidak ditimpa kecuali --sync-catalog.
  if (!syncCatalog) {
    await getDb().insert(siteAssets).values(heroValues).onConflictDoNothing({ target: siteAssets.slot });
    return;
  }
  await getDb()
    .insert(siteAssets)
    .values(heroValues)
    .onConflictDoUpdate({
      target: siteAssets.slot,
      set: {
        publicUrl: heroPublicUrl,
        sizeBytes: stat.size,
        mimeType: "image/webp",
        version: "seed-v1",
        updatedAt: sql`now()`,
      },
    });

  console.log("Site asset seeded: landing_hero");
}

async function main() {
  const usingLocalPglite =
    !process.env.DATABASE_URL?.trim() ||
    process.env.GARAGE_DB_DRIVER?.trim().toLowerCase() === "pglite";

  if (!usingLocalPglite && !process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is required before running db:seed (or set GARAGE_DB_DRIVER=pglite for local DB).",
    );
  }

  await ensureDatabaseReady();

  // Production (Docker migrator/VPS: NODE_ENV=production) tidak boleh membuat
  // akun staf/terminal POS dengan rahasia bawaan kode yang tertulis di repo.
  if (process.env.NODE_ENV === "production") {
    const missing = ["GARAGE_SEED_PASSWORD", "GARAGE_MEMBER_SEED_PASSWORD", "GARAGE_POS_API_KEY"].filter(
      (key) => !process.env[key]?.trim(),
    );
    if (missing.length) {
      throw new Error(
        `Seed production ditolak: set ${missing.join(", ")} di .env.production (jangan pakai nilai bawaan).`,
      );
    }
  }

  const unknownRole = staffSeed.find((staff) => !roles.includes(staff.role));
  if (unknownRole) {
    throw new Error(`Unknown seed role: ${unknownRole.role}`);
  }

  // Demo data (customer, kitchen, finance, approval, audit, marketing, member
  // loyalty contoh) hanya di-seed saat GARAGE_SEED_DEMO=true. Default produksi:
  // hanya data struktural (staff, outlet, menu, katalog bahan baku, resep, POS).
  const seedDemo = process.env.GARAGE_SEED_DEMO?.trim().toLowerCase() === "true";

  // --- Struktural (selalu) ---
  const outlet = await seedOutletAndStaff();
  if (syncCatalog) await assertCatalogOverwriteAllowed();
  await seedMenu();
  await seedInventory(seedDemo);
  await seedBusinessSettings();
  await seedPosTerminal();
  await seedSiteAssets();

  // --- Demo (opsional) ---
  if (seedDemo) {
    await seedCustomers();
    await seedMemberLoyalty();
    await seedKitchen();
    await seedFinance(outlet.id);
    await seedApprovalsAndAudit();
    await seedMarketing();
  }

  const seededEmails = staffSeed.map((staff) => staff.email).join(", ");
  console.log(
    `Garage seed completed (mode: ${seedDemo ? "DEMO" : "PRODUCTION/struktural"}, katalog: ${syncCatalog ? "SELARASKAN PENUH (--sync-catalog)" : "hanya-tambah, data ada tidak ditimpa"}).`,
  );
  console.log(`Seed users: ${seededEmails}`);
  // Rahasia tidak dicetak ke log — hanya sumbernya.
  const secretSource = (envKey: string) =>
    process.env[envKey] ? `dari ${envKey}` : `DEFAULT bawaan kode — set ${envKey} sebelum production`;
  console.log(`Seed password: (${secretSource("GARAGE_SEED_PASSWORD")})`);
  console.log(`Seed member password: (${secretSource("GARAGE_MEMBER_SEED_PASSWORD")})`);
  console.log(`Seed POS terminal: GARAGE-POS-01`);
  console.log(`Seed POS API key: (${secretSource("GARAGE_POS_API_KEY")})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const client = getPgPool();
    if ("end" in client && typeof client.end === "function") {
      await client.end();
    } else if ("close" in client && typeof (client as { close: () => Promise<void> }).close === "function") {
      await (client as { close: () => Promise<void> }).close();
    }
  });
