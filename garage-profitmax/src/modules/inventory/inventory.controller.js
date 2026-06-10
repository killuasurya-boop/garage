const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getInventoryStatus = async (req, res, next) => {
  try {
    const ingredients = await prisma.ingredient.findMany();
    res.json(ingredients);
  } catch (error) {
    next(error);
  }
};

exports.getStockAlerts = async (req, res, next) => {
  try {
    // Cari bahan baku yang stoknya di bawah minimumStock
    const alerts = await prisma.ingredient.findMany({
      where: {
        currentStock: {
          lt: prisma.ingredient.fields.minimumStock
        }
      }
    });
    res.json(alerts);
  } catch (error) {
    next(error);
  }
};

exports.stockIn = async (req, res, next) => {
  try {
    const { ingredientId, quantity, unitCost, notes } = req.body;

    const updatedIngredient = await prisma.ingredient.update({
      where: { id: ingredientId },
      data: { currentStock: { increment: quantity } }
    });

    const stockLog = await prisma.stockLog.create({
      data: {
        ingredientId,
        type: 'IN',
        quantity,
        unitCost,
        notes: notes || 'Pembelian bahan baru'
      }
    });

    res.status(201).json({ updatedIngredient, stockLog });
  } catch (error) {
    next(error);
  }
};

exports.logWaste = async (req, res, next) => {
  try {
    const { ingredientId, quantity, notes } = req.body;

    const updatedIngredient = await prisma.ingredient.update({
      where: { id: ingredientId },
      data: { currentStock: { decrement: quantity } }
    });

    const stockLog = await prisma.stockLog.create({
      data: {
        ingredientId,
        type: 'WASTE',
        quantity,
        notes: notes || 'Bahan terbuang/basi'
      }
    });

    res.status(201).json({ updatedIngredient, stockLog });
  } catch (error) {
    next(error);
  }
};
