const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runVerification() {
  console.log('🔄 Memulai Verifikasi Sistem GARAGE ProfitMax...\n');

  try {
    // 1. Cek Koneksi & Seed Data Karyawan
    const usersCount = await prisma.user.count();
    console.log(`✅ [Users/Auth] Ditemukan ${usersCount} users.`);
    if (usersCount === 0) throw new Error('Data User belum di-seed!');

    const employeeCount = await prisma.employee.count();
    console.log(`✅ [Employees] Ditemukan ${employeeCount} employees.`);

    // 2. Cek Bahan Baku & Inventory
    const ingredientCount = await prisma.ingredient.count();
    console.log(`✅ [Ingredients] Ditemukan ${ingredientCount} bahan baku.`);

    // 3. Cek Menu & Kategori
    const categoryCount = await prisma.menuCategory.count();
    const menuCount = await prisma.menu.count();
    console.log(`✅ [Menu] Ditemukan ${menuCount} SKU menu dan ${categoryCount} kategori.`);

    // 4. Cek Config
    const configCount = await prisma.businessConfig.count();
    const overheadCount = await prisma.overheadConfig.count();
    console.log(`✅ [Config] Ditemukan config bisnis: ${configCount > 0}, Overhead configs: ${overheadCount}`);

    // 5. Test Relasi (Simulasi ambil recipe untuk HPP)
    const menuWithRecipe = await prisma.menu.findFirst({
      where: { recipe: { isNot: null } },
      include: { recipe: { include: { ingredients: true } } }
    });

    if (menuWithRecipe) {
      console.log(`✅ [Recipe Logic] Menu "${menuWithRecipe.name}" memiliki ${menuWithRecipe.recipe.ingredients.length} bahan resep.`);
    } else {
      console.log(`⚠️ [Recipe Logic] Tidak ada resep yang terkait dengan menu saat ini.`);
    }

    console.log('\n🎉 VERIFIKASI SELESAI. SISTEM SIAP DIGUNAKAN!');
  } catch (err) {
    console.error('❌ VERIFIKASI GAGAL:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

runVerification();
