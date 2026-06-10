const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getAllMenus = async (req, res, next) => {
  try {
    const menus = await prisma.menu.findMany({
      include: { category: true }
    });
    res.json(menus);
  } catch (error) {
    next(error);
  }
};

exports.getMenuByCode = async (req, res, next) => {
  try {
    const { code } = req.params;
    const menu = await prisma.menu.findUnique({
      where: { code },
      include: { category: true, recipe: { include: { ingredients: { include: { ingredient: true } } } } }
    });
    if (!menu) return res.status(404).json({ message: 'Menu not found' });
    res.json(menu);
  } catch (error) {
    next(error);
  }
};

exports.createMenu = async (req, res, next) => {
  try {
    const data = req.body;
    const menu = await prisma.menu.create({ data });
    res.status(201).json(menu);
  } catch (error) {
    next(error);
  }
};

exports.updateMenu = async (req, res, next) => {
  try {
    const { code } = req.params;
    const data = req.body;
    const menu = await prisma.menu.update({ where: { code }, data });
    res.json(menu);
  } catch (error) {
    next(error);
  }
};

exports.deleteMenu = async (req, res, next) => {
  try {
    const { code } = req.params;
    await prisma.menu.update({ where: { code }, data: { isActive: false } });
    res.json({ message: 'Menu deactivated successfully' });
  } catch (error) {
    next(error);
  }
};

exports.getCategories = async (req, res, next) => {
  try {
    const categories = await prisma.menuCategory.findMany();
    res.json(categories);
  } catch (error) {
    next(error);
  }
};

const calculators = require('../../utils/calculators');

exports.calculateHPP = async (req, res, next) => {
  try {
    const { ingredients, targetPrice, includeOverhead } = req.body;
    
    // Fetch ingredient details to get pricePerUnit
    const detailedIngredients = await Promise.all(ingredients.map(async (item) => {
      const dbIng = await prisma.ingredient.findUnique({ where: { id: item.ingredientId } });
      if (!dbIng) throw new Error(`Ingredient ${item.ingredientId} not found`);
      return { pricePerUnit: dbIng.pricePerUnit, quantity: item.quantity };
    }));

    let overheadPerPortion = 0;
    if (includeOverhead) {
      // Calculate overhead based on configs
      const configs = await prisma.businessConfig.findFirst();
      const overheads = await prisma.overheadConfig.findMany({ where: { isActive: true } });
      const totalOverhead = overheads.reduce((sum, o) => sum + o.amount, 0);
      const targetMonthlyTx = configs.dailyTargetVisitors * 30;
      overheadPerPortion = calculators.calculateOverheadPerPortion(totalOverhead, targetMonthlyTx);
    }

    const hppResult = calculators.calculateHPP(detailedIngredients, overheadPerPortion);
    const { totalHpp } = hppResult;

    const suggestedPrice = targetPrice || calculators.suggestSellingPrice(totalHpp, 50); // Default to 50% margin
    const marginResult = calculators.calculateMargin(suggestedPrice, totalHpp);

    let marginStatus = 'GOOD';
    if (marginResult.margin < 30) marginStatus = 'DANGER';
    else if (marginResult.margin < 50) marginStatus = 'WARNING';

    // Break even quantity for overhead
    let breakEvenQuantity = 0;
    if (overheadPerPortion > 0) {
      // rough estimate for this specific item's contribution to fixed cost
      breakEvenQuantity = Math.ceil(overheadPerPortion / marginResult.profit);
    }

    res.json({
      ingredientCost: hppResult.materialCost,
      overheadPerPortion,
      totalHpp,
      suggestedPrice,
      profit: marginResult.profit,
      margin: marginResult.margin,
      marginStatus,
      breakEvenQuantity,
      priceRecommendations: {
        margin40: calculators.suggestSellingPrice(totalHpp, 40),
        margin50: calculators.suggestSellingPrice(totalHpp, 50),
        margin60: calculators.suggestSellingPrice(totalHpp, 60),
      }
    });
  } catch (error) {
    next(error);
  }
};
