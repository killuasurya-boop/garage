const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getAllBundlings = async (req, res, next) => {
  try {
    const bundlings = await prisma.bundling.findMany({
      include: { items: { include: { menu: true } } }
    });
    res.json(bundlings);
  } catch (error) {
    next(error);
  }
};

exports.calculateBundling = async (req, res, next) => {
  try {
    const { menuIdsWithQuantity, bundlePrice } = req.body;
    // menuIdsWithQuantity: [{ menuId, quantity }]
    
    let totalHpp = 0;
    let normalPrice = 0;

    for (const item of menuIdsWithQuantity) {
      const menu = await prisma.menu.findUnique({ where: { id: item.menuId } });
      if (!menu) throw new Error(`Menu ${item.menuId} not found`);
      totalHpp += menu.hpp * item.quantity;
      normalPrice += menu.currentPrice * item.quantity;
    }

    const profit = bundlePrice - totalHpp;
    const margin = (profit / bundlePrice) * 100;
    const discount = ((normalPrice - bundlePrice) / normalPrice) * 100;

    let marginStatus = 'HEALTHY';
    if (margin < 35) marginStatus = 'WARNING'; // Bundling threshold

    res.json({
      totalHpp,
      normalPrice,
      bundlePrice,
      profit,
      margin,
      discount,
      marginStatus
    });
  } catch (error) {
    next(error);
  }
};

exports.createBundling = async (req, res, next) => {
  try {
    const data = req.body;
    // Assume data includes items array to create in relation
    const bundling = await prisma.bundling.create({
      data: {
        code: data.code,
        name: data.name,
        description: data.description,
        hpp: data.hpp,
        normalPrice: data.normalPrice,
        bundlePrice: data.bundlePrice,
        profit: data.profit,
        margin: data.margin,
        discount: data.discount,
        items: {
          create: data.items.map(i => ({ menuId: i.menuId, quantity: i.quantity }))
        }
      }
    });
    res.status(201).json(bundling);
  } catch (error) {
    next(error);
  }
};
