const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.createTransaction = async (req, res, next) => {
  try {
    const { items, paymentMethod, channel, notes, promoId } = req.body;
    // items: [{ menuId, quantity }]
    
    let subtotal = 0;
    const transactionItemsData = [];

    // 1. Calculate subtotal and build items
    for (const item of items) {
      const menu = await prisma.menu.findUnique({ 
        where: { id: item.menuId },
        include: { recipe: { include: { ingredients: true } } }
      });
      if (!menu) throw new Error(`Menu ${item.menuId} not found`);

      const itemSubtotal = menu.currentPrice * item.quantity;
      subtotal += itemSubtotal;

      transactionItemsData.push({
        menuId: menu.id,
        quantity: item.quantity,
        priceAtTime: menu.currentPrice,
        hppAtTime: menu.hpp,
        subtotal: itemSubtotal
      });

      // 2. Auto Stock Deduction
      if (menu.recipe && menu.recipe.ingredients.length > 0) {
        for (const ri of menu.recipe.ingredients) {
          const deductAmount = ri.quantity * item.quantity;
          
          await prisma.ingredient.update({
            where: { id: ri.ingredientId },
            data: { currentStock: { decrement: deductAmount } }
          });

          await prisma.stockLog.create({
            data: {
              ingredientId: ri.ingredientId,
              type: 'OUT',
              quantity: deductAmount,
              notes: `Auto deduct for Transaction (Menu: ${menu.name})`
            }
          });
        }
      }
    }

    // 3. Apply Promo (Simplified logic)
    let discountAmount = 0;
    if (promoId) {
      const promo = await prisma.promo.findUnique({ where: { id: promoId } });
      if (promo && promo.isActive) {
        if (promo.type === 'PERCENTAGE') {
          discountAmount = subtotal * (promo.value / 100);
        } else if (promo.type === 'FIXED_AMOUNT') {
          discountAmount = promo.value;
        }
        await prisma.promo.update({
          where: { id: promoId },
          data: { usageCount: { increment: 1 } }
        });
      }
    }

    const total = subtotal - discountAmount;

    // 4. Create Transaction
    const transactionCode = `TRX-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(1000 + Math.random() * 9000)}`;

    const transaction = await prisma.transaction.create({
      data: {
        transactionCode,
        userId: req.user.id,
        subtotal,
        discountAmount,
        promoId,
        total,
        paymentMethod,
        channel,
        notes,
        items: {
          create: transactionItemsData
        }
      },
      include: { items: true }
    });

    res.status(201).json(transaction);
  } catch (error) {
    next(error);
  }
};

exports.getTransactions = async (req, res, next) => {
  try {
    const transactions = await prisma.transaction.findMany({
      include: { items: { include: { menu: true } }, user: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(transactions);
  } catch (error) {
    next(error);
  }
};
