const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.simulatePromo = async (req, res, next) => {
  try {
    const { menuIds, promoType, value, estimatedDailySales } = req.body;
    // promoType: 'PERCENTAGE', 'FIXED_AMOUNT'
    
    const menus = await prisma.menu.findMany({
      where: { id: { in: menuIds } }
    });

    let estimatedRevenueLoss = 0;
    const analysis = menus.map(menu => {
      let promoPrice = menu.currentPrice;
      
      if (promoType === 'PERCENTAGE') {
        promoPrice = menu.currentPrice * (1 - value / 100);
      } else if (promoType === 'FIXED_AMOUNT') {
        promoPrice = menu.currentPrice - value;
      }

      const profitAfterPromo = promoPrice - menu.hpp;
      const marginAfterPromo = (profitAfterPromo / promoPrice) * 100;
      
      let marginStatus = 'HEALTHY';
      let isSafeToRun = true;
      let warningMessage = null;

      if (marginAfterPromo < 0) {
        marginStatus = 'DANGER';
        isSafeToRun = false;
        warningMessage = 'Promo ini akan menyebabkan item dijual di bawah modal (RUGI)!';
      } else if (marginAfterPromo < 30) {
        marginStatus = 'WARNING';
        warningMessage = 'Margin di bawah 30% batas aman.';
      }

      // Hitung loss dari selisih harga normal vs promo
      estimatedRevenueLoss += (menu.currentPrice - promoPrice) * (estimatedDailySales || 0);

      return {
        menuId: menu.id,
        name: menu.name,
        originalPrice: menu.currentPrice,
        promoPrice,
        hpp: menu.hpp,
        profitAfterPromo,
        marginAfterPromo,
        marginStatus,
        isSafeToRun,
        warningMessage
      };
    });

    const isAllItemsSafe = analysis.every(a => a.isSafeToRun);
    const dangerItems = analysis.filter(a => !a.isSafeToRun);

    res.json({
      analysis,
      summary: {
        estimatedRevenueLoss,
        estimatedVolumeIncrease: '15-25%',
        recommendedMaxDuration: '7 hari',
        isAllItemsSafe,
        dangerItems
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getAllPromos = async (req, res, next) => {
  try {
    const promos = await prisma.promo.findMany();
    res.json(promos);
  } catch (error) {
    next(error);
  }
};

exports.createPromo = async (req, res, next) => {
  try {
    const data = req.body;
    // ensure targetMenus is stringified if it's an array
    if (Array.isArray(data.targetMenus)) {
      data.targetMenus = JSON.stringify(data.targetMenus);
    }
    const promo = await prisma.promo.create({ data });
    res.status(201).json(promo);
  } catch (error) {
    next(error);
  }
};
