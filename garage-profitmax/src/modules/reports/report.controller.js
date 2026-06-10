const { PrismaClient } = require('@prisma/client');
const ExcelJS = require('exceljs');
const prisma = new PrismaClient();

exports.exportHppAllMenus = async (req, res, next) => {
  try {
    const menus = await prisma.menu.findMany({
      include: { category: true }
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('HPP Master Data');

    worksheet.columns = [
      { header: 'Code', key: 'code', width: 10 },
      { header: 'Nama Menu', key: 'name', width: 30 },
      { header: 'Kategori', key: 'category', width: 20 },
      { header: 'HPP (Rp)', key: 'hpp', width: 15 },
      { header: 'Harga Jual (Rp)', key: 'price', width: 15 },
      { header: 'Profit (Rp)', key: 'profit', width: 15 },
      { header: 'Margin (%)', key: 'margin', width: 15 },
      { header: 'Status', key: 'status', width: 15 }
    ];

    menus.forEach(menu => {
      worksheet.addRow({
        code: menu.code,
        name: menu.name,
        category: menu.category?.name || '-',
        hpp: menu.hpp,
        price: menu.currentPrice,
        profit: menu.profit,
        margin: menu.margin,
        status: menu.priceStatus
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Garage_HPP_Master.xlsx');
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
};

exports.getProfitLoss = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    
    // In a real app we filter by date
    const transactions = await prisma.transaction.findMany();
    const overheads = await prisma.overheadConfig.findMany({ where: { isActive: true } });
    const payrolls = await prisma.payroll.findMany();

    const totalRevenue = transactions.reduce((sum, trx) => sum + trx.total, 0);
    const totalDiscounts = transactions.reduce((sum, trx) => sum + trx.discountAmount, 0);
    
    let totalCogs = 0;
    const allItems = await prisma.transactionItem.findMany();
    totalCogs = allItems.reduce((sum, item) => sum + (item.hppAtTime * item.quantity), 0);

    const grossProfit = totalRevenue - totalCogs;

    const totalOverhead = overheads.reduce((sum, o) => sum + o.amount, 0);
    const totalPayroll = payrolls.reduce((sum, p) => sum + p.totalSalary, 0);
    const totalOperationalExpenses = totalOverhead + totalPayroll;

    const netProfit = grossProfit - totalOperationalExpenses;

    res.json({
      period: { startDate, endDate },
      revenue: {
        grossRevenue: totalRevenue + totalDiscounts,
        discounts: totalDiscounts,
        netRevenue: totalRevenue
      },
      cogs: totalCogs,
      grossProfit,
      operationalExpenses: {
        overhead: totalOverhead,
        payroll: totalPayroll,
        total: totalOperationalExpenses
      },
      netProfit,
      marginPercent: totalRevenue ? ((netProfit / totalRevenue) * 100).toFixed(2) : 0
    });
  } catch (error) {
    next(error);
  }
};
