/* eslint-disable @typescript-eslint/no-explicit-any */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

export function generateFinancePdf(data: any, summary: any) {
  const doc = new jsPDF();
  
  // Title
  doc.setFontSize(20);
  doc.text("GARAGE OS - CEO Finance Report", 14, 22);
  
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated at: ${format(new Date(), "dd MMM yyyy HH:mm")}`, 14, 30);
  
  // Summary Section
  doc.setFontSize(14);
  doc.setTextColor(20);
  doc.text("Executive Summary", 14, 45);
  
  autoTable(doc, {
    startY: 50,
    head: [["Metric", "Value"]],
    body: [
      ["Total Revenue", summary.revenue],
      ["Active Orders", summary.activeOrders],
      ["Cash Session Status", summary.cashStatus],
      ["Cash Discrepancy", summary.cashDiscrepancy]
    ],
    theme: "grid",
    headStyles: { fillColor: [245, 165, 36] }, // #f5a524 GARAGE Amber
  });
  
  // Payment Mix
  doc.setFontSize(14);
  doc.text("Payment Breakdown", 14, (doc as any).lastAutoTable.finalY + 15);
  
  const paymentBody = data.paymentBreakdown.map((p: any) => [
    p.method,
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(p.amount),
    `${p.share}%`
  ]);
  
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 20,
    head: [["Method", "Amount", "Share"]],
    body: paymentBody,
    theme: "striped",
    headStyles: { fillColor: [40, 40, 40] }
  });
  
  doc.save(`GARAGE_Finance_Report_${format(new Date(), "yyyyMMdd")}.pdf`);
}
