const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getAllIngredients = async (req, res, next) => {
  try {
    const ingredients = await prisma.ingredient.findMany();
    res.json(ingredients);
  } catch (error) {
    next(error);
  }
};

exports.getIngredientById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const ingredient = await prisma.ingredient.findUnique({ where: { id } });
    if (!ingredient) return res.status(404).json({ message: 'Ingredient not found' });
    res.json(ingredient);
  } catch (error) {
    next(error);
  }
};

exports.createIngredient = async (req, res, next) => {
  try {
    const data = req.body;
    const ingredient = await prisma.ingredient.create({ data });
    res.status(201).json(ingredient);
  } catch (error) {
    next(error);
  }
};

exports.updateIngredient = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = req.body;
    
    // Check old price
    const oldIngredient = await prisma.ingredient.findUnique({ where: { id } });
    const ingredient = await prisma.ingredient.update({ where: { id }, data });

    if (oldIngredient && data.pricePerUnit && oldIngredient.pricePerUnit !== data.pricePerUnit) {
      // Recalculate affected menus
      const affectedRecipes = await prisma.recipeIngredient.findMany({
        where: { ingredientId: id },
        include: { recipe: { include: { menu: true } } }
      });
      
      for (const ri of affectedRecipes) {
        if (!ri.recipe || !ri.recipe.menu) continue;
        const menu = ri.recipe.menu;
        const costDelta = (data.pricePerUnit - oldIngredient.pricePerUnit) * ri.quantity;
        const newHpp = menu.hpp + costDelta;
        const newMargin = ((menu.currentPrice - newHpp) / menu.currentPrice) * 100;
        
        let newStatus = menu.priceStatus;
        if (newMargin < 30 && newStatus !== 'URGENT') newStatus = 'URGENT';
        if (newMargin < 0) newStatus = 'RUGI';

        await prisma.menu.update({
          where: { id: menu.id },
          data: { hpp: newHpp, profit: menu.currentPrice - newHpp, margin: newMargin, priceStatus: newStatus }
        });
      }
    }

    res.json(ingredient);
  } catch (error) {
    next(error);
  }
};
