const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding GARAGE ProfitMax database...');

  const bcrypt = require('bcrypt');
  const hashedPassword = await bcrypt.hash('admin123', 10);
  
  console.log('Seeding users...');
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      name: 'Super Admin',
      username: 'admin',
      password: hashedPassword,
      role: 'SUPER_ADMIN'
    }
  });

  // 1. Seed Categories
  const categoryCoffeeDasar = await prisma.menuCategory.upsert({
    where: { code: 'COFFEE_DASAR' },
    update: {},
    create: { code: 'COFFEE_DASAR', name: 'Coffee Dasar' },
  });
  
  const categoryCoffeeBaru = await prisma.menuCategory.upsert({
    where: { code: 'COFFEE_BARU' },
    update: {},
    create: { code: 'COFFEE_BARU', name: 'Coffee Baru (Signature)' },
  });

  // 2. Seed Ingredients
  console.log('Seeding ingredients...');
  const ing1 = await prisma.ingredient.upsert({
    where: { code: 'ING-001' },
    update: {},
    create: {
      code: 'ING-001', name: 'Biji Kopi Robusta/Mandailing (roasted)', unit: 'gram',
      buyUnit: '1 kg', buyPrice: 90000, pricePerUnit: 90, category: 'KOPI', minimumStock: 500
    }
  });

  const ing2 = await prisma.ingredient.upsert({
    where: { code: 'ING-002' },
    update: {},
    create: {
      code: 'ING-002', name: 'Susu UHT Full Cream', unit: 'ml',
      buyUnit: '1 liter', buyPrice: 22000, pricePerUnit: 22, category: 'SUSU_DAIRY', minimumStock: 10000
    }
  });

  const ing3 = await prisma.ingredient.upsert({
    where: { code: 'ING-003' },
    update: {},
    create: {
      code: 'ING-003', name: 'Susu Kental Manis (SKM)', unit: 'gram',
      buyUnit: '385g', buyPrice: 15000, pricePerUnit: 39, category: 'SUSU_DAIRY', minimumStock: 2000
    }
  });

  // 3. Seed Menu
  console.log('Seeding menus...');
  const menu1 = await prisma.menu.upsert({
    where: { code: 'C-01' },
    update: {},
    create: {
      code: 'C-01', name: 'Espresso Single', variant: 'Hot', categoryId: categoryCoffeeDasar.id,
      hpp: 1710, currentPrice: 10000, priceStatus: 'OK', profit: 8290, margin: 82.9
    }
  });

  const menu2 = await prisma.menu.upsert({
    where: { code: 'C-12' },
    update: {},
    create: {
      code: 'C-12', name: 'Sanger', variant: 'Cold', categoryId: categoryCoffeeDasar.id,
      hpp: 3525, oldPrice: 12000, currentPrice: 14000, priceStatus: 'NAIK', profit: 10475, margin: 74.8
    }
  });

  const menu3 = await prisma.menu.upsert({
    where: { code: 'CN-01' },
    update: {},
    create: {
      code: 'CN-01', name: 'Dirty Matcha', variant: 'Cold', categoryId: categoryCoffeeBaru.id,
      hpp: 8120, currentPrice: 24000, priceStatus: 'BARU', isSecretMenu: true, profit: 15880, margin: 66.2
    }
  });

  // 4. Seed Employees
  console.log('Seeding employees...');
  const employeesData = [
    { name: 'Staff Manajer', position: 'Manajer', baseSalary: 2000000, joinDate: new Date() },
    { name: 'Staff Koki Utama', position: 'Koki Utama', baseSalary: 2000000, joinDate: new Date() },
    { name: 'Staff Asisten Koki', position: 'Asisten Koki', baseSalary: 1500000, joinDate: new Date() },
    { name: 'Barista 1', position: 'Barista', baseSalary: 1800000, joinDate: new Date() },
    { name: 'Barista 2', position: 'Barista', baseSalary: 1800000, joinDate: new Date() },
    { name: 'Staff Kasir', position: 'Kasir', baseSalary: 1800000, joinDate: new Date() },
    { name: 'Staff Satpam', position: 'Satpam', baseSalary: 1500000, joinDate: new Date() },
    { name: 'Waiters 1', position: 'Waiters', baseSalary: 1500000, joinDate: new Date() },
    { name: 'Waiters 2', position: 'Waiters', baseSalary: 1500000, joinDate: new Date() },
    { name: 'Waiters 3', position: 'Waiters', baseSalary: 1500000, joinDate: new Date() },
  ];

  for (const emp of employeesData) {
    await prisma.employee.create({
      data: emp
    });
  }

  // 5. Seed Configs
  console.log('Seeding configs...');
  await prisma.businessConfig.create({
    data: {
      totalInitialCapital: 200000000,
      monthlyTargetRevenue: 112500000,
      dailyTargetVisitors: 150,
      avgTicketSize: 25000,
      hppPercentageTarget: 45,
      marginAlertThreshold: 30
    }
  });

  const overheads = [
    { name: 'Gaji Karyawan', amount: 16900000, category: 'HR' },
    { name: 'Sewa Tempat', amount: 833333, category: 'Rent' },
    { name: 'Listrik, Air, Wifi', amount: 2500000, category: 'Utilities' },
    { name: 'Pemeliharaan', amount: 1500000, category: 'Maintenance' },
  ];
  for (const ov of overheads) {
    await prisma.overheadConfig.create({
      data: ov
    });
  }

  console.log('✅ Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
