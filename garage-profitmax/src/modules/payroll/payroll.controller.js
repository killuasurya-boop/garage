const { PrismaClient } = require('@prisma/client');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

exports.generatePayroll = async (req, res, next) => {
  try {
    const { employeeId, periodMonth, periodYear, allowances, deductions } = req.body;

    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new Error('Employee not found');

    const allowanceTotal = (allowances?.transport || 0) + (allowances?.meal || 0);
    const deductionTotal = (deductions?.absence || 0);
    const totalSalary = employee.baseSalary + allowanceTotal - deductionTotal;

    const payroll = await prisma.payroll.create({
      data: {
        employeeId,
        periodMonth,
        periodYear,
        baseSalary: employee.baseSalary,
        allowances: allowanceTotal,
        deductions: deductionTotal,
        totalSalary,
        status: 'DRAFT',
        paidBy: req.user.id
      }
    });

    // Generate PDF
    const doc = new PDFDocument();
    
    // In a real app we'd save to cloud storage, here we stream back or save to disk.
    // For demo, we just generate and pipe directly to response.
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Slip_Gaji_${employee.name}_${periodMonth}_${periodYear}.pdf`);
    
    doc.pipe(res);

    doc.fontSize(20).text('GARAGE Coffee & Motor', { align: 'center' });
    doc.fontSize(12).text('SLIP GAJI KARYAWAN', { align: 'center' });
    doc.moveDown();
    
    doc.fontSize(10).text(`No. Slip: PR-${payroll.id}`);
    doc.text(`Periode: ${periodMonth}/${periodYear}`);
    doc.text(`Nama: ${employee.name}`);
    doc.text(`Posisi: ${employee.position}`);
    doc.moveDown();

    doc.text('Rincian:');
    doc.text(`Gaji Pokok: Rp ${employee.baseSalary.toLocaleString()}`);
    doc.text(`Tunjangan: Rp ${allowanceTotal.toLocaleString()}`);
    doc.text(`Potongan: Rp ${deductionTotal.toLocaleString()}`);
    doc.moveDown();
    doc.fontSize(14).text(`Total Take Home Pay: Rp ${totalSalary.toLocaleString()}`, { bold: true });

    doc.end();

  } catch (error) {
    next(error);
  }
};
