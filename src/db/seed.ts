import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";

import { count, eq, sql } from "drizzle-orm";

import { ensureDatabaseReady, getDb, getPgPool } from "@/db";
import {
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
    role: "Owner / CEO",
    email: "owner@garage.local",
    name: "Owner Garage",
    deviceLabel: "WEB-OWNER-01",
  },
  {
    role: "Admin",
    email: "admin@garage.local",
    name: "Admin Garage",
    deviceLabel: "WEB-ADMIN-01",
  },
  {
    role: "Manager Operasional",
    email: "manager@garage.local",
    name: "Manager Operasional",
    deviceLabel: "WEB-OPS-01",
  },
  {
    role: "Finance / CFO",
    email: "finance@garage.local",
    name: "Finance Garage",
    deviceLabel: "WEB-FIN-01",
  },
  {
    role: "Kasir",
    email: "kasir@garage.local",
    name: "Kasir Garage",
    deviceLabel: "POS-01",
  },
  {
    role: "Kasir",
    email: "kasir2@garage.local",
    name: "Kasir 2 Garage",
    deviceLabel: "POS-02",
  },
  {
    role: "Barista",
    email: "barista@garage.local",
    name: "Barista Garage",
    deviceLabel: "KDS-BAR-01",
  },
  {
    role: "Koki",
    email: "koki@garage.local",
    name: "Koki Garage",
    deviceLabel: "KDS-KOKI-01",
  },
  {
    role: "Asisten Koki",
    email: "asisten-koki@garage.local",
    name: "Asisten Koki Garage",
    deviceLabel: "KDS-KOKI-02",
  },
  {
    role: "Waiter 1",
    email: "waiter1@garage.local",
    name: "Waiter 1 Garage",
    deviceLabel: "TABLE-WTR-01",
  },
  {
    role: "Waiter 2",
    email: "waiter2@garage.local",
    name: "Waiter 2 Garage",
    deviceLabel: "TABLE-WTR-02",
  },
  {
    role: "Kitchen / Barista",
    email: "kitchen@garage.local",
    name: "Kitchen Garage",
    deviceLabel: "KDS-BAR-01",
  },
  {
    role: "Gudang",
    email: "gudang@garage.local",
    name: "Gudang Garage",
    deviceLabel: "WAREHOUSE-02",
  },
  {
    role: "Supervisor Shift",
    email: "supervisor@garage.local",
    name: "Supervisor Shift",
    deviceLabel: "WEB-SPV-01",
  },
  {
    role: "Delivery Admin",
    email: "delivery@garage.local",
    name: "Delivery Admin",
    deviceLabel: "DLV-ADMIN-01",
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

async function seedOutletAndStaff() {
  const db = getDb();
  const [outlet] = await db
    .insert(outlets)
    .values({
      code: "OUTLET-A",
      name: "Outlet A",
      timezone: "Asia/Jakarta",
      status: "active",
    })
    .onConflictDoUpdate({
      target: outlets.code,
      set: {
        name: "Outlet A",
        timezone: "Asia/Jakarta",
        status: "active",
        updatedAt: new Date(),
      },
    })
    .returning();

  for (const staff of staffSeed) {
    const seededUser = await ensureAuthUser(staff.email, staff.name);
    await db
      .insert(staffProfiles)
      .values({
        userId: seededUser.id,
        outletId: outlet.id,
        role: staff.role,
        shiftLabel: "Shift aktif",
        deviceLabel: staff.deviceLabel,
      })
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
  }

  return outlet;
}

async function seedMenu() {
  const db = getDb();

  for (const [index, item] of menuItems.entries()) {
    await db
      .insert(menuItemsTable)
      .values({
        id: item.id,
        name: item.name,
        category: item.category,
        section: item.section,
        stock: item.stock,
        status: item.status ?? "active",
        prep: item.prep,
        tags: item.tags,
        sortOrder: index,
      })
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

    for (const [variantIndex, variant] of item.variants.entries()) {
      await db
        .insert(menuVariants)
        .values({
          itemId: item.id,
          variantId: variant.id,
          label: variant.label,
          price: variant.price,
          baseCost: variant.baseCost ?? 0,
          sortOrder: variantIndex,
        })
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
    }
  }

  await db.execute(sql`
    UPDATE menu_items
    SET status = 'archived',
        updated_at = now()
    WHERE (id LIKE 'burger-%' OR id LIKE 'kebab-%')
      AND id NOT IN ('burger-garage', 'kebab-garage')
  `);
}

async function seedInventory() {
  const db = getDb();
  const unitCostByName = new Map<string, number>([
    ["Kopi bubuk (espresso)", 120000],
    ["Kopi bubuk (arabika)", 160000],
    ["Susu UHT", 18000],
    ["Gula pasir", 15000],
    ["Cup plastik", 650],
    ["Tutup cup", 350],
    ["Roti burger", 18000],
    ["Tortilla kebab", 20000],
    ["Daging kebab slice", 90000],
    ["Fillet ayam beku", 65000],
    ["Nugget ayam", 45000],
    ["Nugget stick", 35000],
    ["Sosis ayam", 45000],
    ["Keju slice", 18000],
    ["Tepung crispy", 13000],
    ["Kertas burger", 8000],
    ["Kertas kebab", 8000],
    ["Kotak burger", 35000],
    ["Patty burger", 85000],
    ["Telur ayam", 2200],
    ["Kentang beku", 32000],
    ["Minyak goreng", 17000],
  ]);

  for (const item of inventoryItems) {
    const unitCost = unitCostByName.get(item.name) ?? 0;
    await db
      .insert(inventoryItemsTable)
      .values({ ...item, unitCost })
      .onConflictDoUpdate({
        target: inventoryItemsTable.sku,
        set: {
          name: item.name,
          alternativeName: item.alternativeName,
          category: item.category,
          unit: item.unit,
          packageSize: item.packageSize,
          unitCost,
          onHand: item.onHand,
          min: item.min,
          status: item.status,
          movement: item.movement,
          updatedAt: new Date(),
        },
      });
  }

  const skuRows = await db
    .select({ sku: inventoryItemsTable.sku, name: inventoryItemsTable.name, unit: inventoryItemsTable.unit })
    .from(inventoryItemsTable);
  const skuByName = new Map(skuRows.map((row) => [row.name, row]));
  // Recipe seed: bahan baku per menu item / variant.
  // Untuk varian Burger+Telur*, kita generate otomatis dari nama menu —
  // semua butuh roti burger + telur + kertas burger, lalu tambahan ayam,
  // sosis, nugget, keju, crispy/tepung sesuai komposisi nama.
  type RecipeRow = readonly [string, string, string, number, string, number];
  const baseRecipeSeed: RecipeRow[] = [
    ["coffee-americano", "all", "Kopi bubuk (espresso)", 0.018, "kg", 3],
    ["coffee-americano", "all", "Cup plastik", 1, "pcs", 0],
    ["coffee-latte", "all", "Kopi bubuk (espresso)", 0.018, "kg", 3],
    ["coffee-latte", "all", "Susu UHT", 0.18, "liter", 4],
    ["coffee-latte", "all", "Cup plastik", 1, "pcs", 0],
    ["burger-garage", "all", "Roti burger", 0.1, "pack", 0],
    ["burger-garage", "all", "Telur ayam", 1, "pcs", 0],
    ["burger-garage", "all", "Kertas burger", 0.01, "pack", 0],
    ["burger-garage", "telur-keju", "Keju slice", 0.05, "pack", 0],
    ["burger-garage", "telur-ayam", "Fillet ayam beku", 0.08, "pack", 0],
    ["burger-garage", "telur-sosis", "Sosis ayam", 0.05, "pack", 0],
    ["burger-garage", "telur-nugget", "Nugget stick", 0.08, "pack", 0],
    ["burger-garage", "telur-crispy", "Fillet ayam beku", 0.08, "pack", 0],
    ["burger-garage", "telur-crispy", "Tepung crispy", 0.03, "kg", 0],
    ["burger-garage", "telur-keju-crispy", "Keju slice", 0.05, "pack", 0],
    ["burger-garage", "telur-keju-crispy", "Fillet ayam beku", 0.08, "pack", 0],
    ["burger-garage", "telur-keju-crispy", "Tepung crispy", 0.03, "kg", 0],
    ["burger-garage", "spesial-komplit", "Keju slice", 0.05, "pack", 0],
    ["burger-garage", "spesial-komplit", "Fillet ayam beku", 0.08, "pack", 0],
    ["burger-garage", "spesial-komplit", "Sosis ayam", 0.05, "pack", 0],
    ["burger-garage", "spesial-komplit", "Nugget stick", 0.08, "pack", 0],
    ["burger-garage", "spesial-komplit", "Tepung crispy", 0.03, "kg", 0],
    ["burger-garage", "spesial-komplit", "Kotak burger", 0.01, "pack", 0],
    ["kebab-garage", "all", "Tortilla kebab", 0.1, "pack", 0],
    ["kebab-garage", "all", "Telur ayam", 1, "pcs", 0],
    ["kebab-garage", "all", "Daging kebab slice", 0.05, "pack", 0],
    ["kebab-garage", "all", "Kertas kebab", 0.01, "pack", 0],
    ["kebab-garage", "telur-ayam", "Fillet ayam beku", 0.06, "pack", 0],
    ["kebab-garage", "telur-sosis", "Sosis ayam", 0.05, "pack", 0],
    ["kebab-garage", "telur-nugget", "Nugget ayam", 0.08, "pack", 0],
    ["kebab-garage", "telur-ayam-sosis", "Fillet ayam beku", 0.06, "pack", 0],
    ["kebab-garage", "telur-ayam-sosis", "Sosis ayam", 0.05, "pack", 0],
    ["kebab-garage", "telur-ayam-nugget", "Fillet ayam beku", 0.06, "pack", 0],
    ["kebab-garage", "telur-ayam-nugget", "Nugget ayam", 0.08, "pack", 0],
    ["kebab-garage", "spesial-komplit", "Fillet ayam beku", 0.06, "pack", 0],
    ["kebab-garage", "spesial-komplit", "Sosis ayam", 0.05, "pack", 0],
    ["kebab-garage", "spesial-komplit", "Nugget ayam", 0.08, "pack", 0],
    ["snack-kentang-goreng", "all", "Kentang beku", 0.18, "kg", 5],
    ["snack-kentang-goreng", "all", "Minyak goreng", 0.03, "liter", 8],
    ["snack-sosis", "all", "Sosis ayam", 0.05, "pack", 0],
    ["snack-sosis", "all", "Minyak goreng", 0.02, "liter", 5],
    ["snack-nugget", "all", "Nugget ayam", 0.08, "pack", 0],
    ["snack-nugget", "all", "Minyak goreng", 0.02, "liter", 5],
  ];

  // Burger variant items (Burger + Telur, Burger + Telur + Ayam, dll) —
  // semua share base ingredients + tambahan sesuai nama.
  const burgerVariantIds = [
    "burger-telur",
    "burger-telur-ayam",
    "burger-telur-ayam-sosis",
    "burger-telur-ayam-nugget-stick",
    "burger-telur-ayam-sosis-nugget-stick",
    "burger-telur-sosis",
    "burger-telur-sosis-nugget",
    "burger-telur-nugget",
    "burger-telur-keju",
    "burger-telur-keju-ayam",
    "burger-telur-keju-ayam-sosis",
    "burger-telur-keju-ayam-nugget-stick",
    "burger-telur-keju-ayam-sosis-nugget-stick",
    "burger-telur-crispy",
    "burger-telur-crispy-sosis",
    "burger-telur-crispy-nugget",
    "burger-telur-keju-crispy",
    "burger-telur-crispy-sosis-nugget",
    "burger-telur-keju-crispy-sosis",
    "burger-telur-keju-crispy-nugget",
    "burger-telur-keju-crispy-sosis-nugget",
    "burger-spesial-komplit",
  ];
  const generatedBurgerRecipes: RecipeRow[] = [];
  for (const id of burgerVariantIds) {
    // Base untuk semua burger varian
    generatedBurgerRecipes.push([id, "all", "Roti burger", 0.1, "pack", 0]);
    generatedBurgerRecipes.push([id, "all", "Telur ayam", 1, "pcs", 0]);
    generatedBurgerRecipes.push([id, "all", "Kertas burger", 0.01, "pack", 0]);
    if (id.includes("ayam"))
      generatedBurgerRecipes.push([id, "all", "Fillet ayam beku", 0.08, "pack", 0]);
    if (id.includes("sosis"))
      generatedBurgerRecipes.push([id, "all", "Sosis ayam", 0.05, "pack", 0]);
    if (id.includes("nugget"))
      generatedBurgerRecipes.push([id, "all", "Nugget stick", 0.08, "pack", 0]);
    if (id.includes("keju"))
      generatedBurgerRecipes.push([id, "all", "Keju slice", 0.05, "pack", 0]);
    if (id.includes("crispy"))
      generatedBurgerRecipes.push([id, "all", "Tepung crispy", 0.03, "kg", 0]);
    if (id.includes("spesial") || id.includes("komplit"))
      generatedBurgerRecipes.push([id, "all", "Kotak burger", 0.01, "pack", 0]);
  }

  const recipeSeed: RecipeRow[] = [...baseRecipeSeed, ...generatedBurgerRecipes];

  for (const [menuItemId, variantId, inventoryName, qty, unit, wastePct] of recipeSeed) {
    const inventory = skuByName.get(inventoryName);
    if (!inventory) continue;
    await db
      .insert(menuRecipes)
      .values({
        menuItemId,
        variantId,
        inventorySku: inventory.sku,
        qty,
        unit,
        wastePct,
        status: "active",
      })
      .onConflictDoUpdate({
        target: [menuRecipes.menuItemId, menuRecipes.variantId, menuRecipes.inventorySku],
        set: {
          qty,
          unit,
          wastePct,
          status: "active",
          updatedAt: new Date(),
        },
      });
  }

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

async function seedMemberLoyalty() {
  const db = getDb();
  await ensureGarageMemberLoyaltySeed(seedMemberPassword);

  await db
    .insert(posTerminals)
    .values({
      terminalCode: "GARAGE-POS-01",
      location: "Main cashier",
      apiKeyHash: hashPosApiKey(seedPosApiKey),
      status: "active",
    })
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
          "Halo {name}!\n\nKami kangen kamu di GARAGE Coffee & Motor. Pakai kode WINBACK10 untuk diskon Rp10.000 di kunjungan berikutnya.\n\nOrder: {orderUrl}",
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
  await getDb()
    .insert(siteAssets)
    .values({
      slot: landingHeroSlot,
      publicUrl: heroPublicUrl,
      width: 1400,
      height: 933,
      alt: "Garage Coffee & Motor — hero premium",
      sizeBytes: stat.size,
      mimeType: "image/webp",
      version: "seed-v1",
      updatedBy: null,
    })
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

  const unknownRole = staffSeed.find((staff) => !roles.includes(staff.role));
  if (unknownRole) {
    throw new Error(`Unknown seed role: ${unknownRole.role}`);
  }

  const outlet = await seedOutletAndStaff();
  await seedMenu();
  await seedInventory();
  await seedCustomers();
  await seedMemberLoyalty();
  await seedKitchen();
  await seedFinance(outlet.id);
  await seedApprovalsAndAudit();
  await seedMarketing();
  await seedSiteAssets();

  const seededEmails = staffSeed.map((staff) => staff.email).join(", ");
  console.log("Garage seed completed.");
  console.log(`Seed users: ${seededEmails}`);
  console.log(`Seed password: ${seedPassword}`);
  console.log(`Seed member password: ${seedMemberPassword}`);
  console.log(`Seed POS terminal: GARAGE-POS-01`);
  console.log(`Seed POS API key: ${seedPosApiKey}`);
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
