/**
 * GARAGE ProfitMax Core Calculators
 */

/**
 * Hitung HPP per menu
 * @param {Array} ingredients - Array {pricePerUnit, quantity}
 * @param {Number} overheadPerPortion - Overhead per porsi (opsional)
 * @returns {Object} HPP breakdown
 */
function calculateHPP(ingredients, overheadPerPortion = 0) {
  const materialCost = ingredients.reduce((sum, item) => {
    return sum + (item.pricePerUnit * item.quantity);
  }, 0);
  
  const totalHpp = materialCost + overheadPerPortion;
  return { materialCost, overheadPerPortion, totalHpp };
}

/**
 * Hitung margin berdasarkan harga jual dan HPP
 */
function calculateMargin(sellingPrice, hpp) {
  const profit = sellingPrice - hpp;
  const margin = (profit / sellingPrice) * 100;
  return { profit, margin: parseFloat(margin.toFixed(2)) };
}

/**
 * Rekomendasi harga jual berdasarkan target margin
 */
function suggestSellingPrice(hpp, targetMarginPercent) {
  return hpp / (1 - targetMarginPercent / 100);
}

/**
 * Break Even Point (Unit)
 */
function calculateBEP(fixedCost, avgSellingPrice, avgVariableCost) {
  const contributionMarginPerUnit = avgSellingPrice - avgVariableCost;
  if (contributionMarginPerUnit <= 0) return { bepUnits: -1, bepRevenue: -1 }; // Impossible to BEP
  const bepUnits = fixedCost / contributionMarginPerUnit;
  const bepRevenue = bepUnits * avgSellingPrice;
  return { bepUnits: Math.ceil(bepUnits), bepRevenue };
}

/**
 * BEP Balik Modal (Bulan)
 */
function calculateCapitalRecovery(totalInvestment, netProfitPerMonth) {
  if (netProfitPerMonth <= 0) return -1;
  return totalInvestment / netProfitPerMonth;
}

/**
 * Return on Investment (Tahunan)
 */
function calculateROI(totalRevenue, totalInvestment) {
  return ((totalRevenue - totalInvestment) / totalInvestment) * 100;
}

/**
 * Overhead Per Porsi
 */
function calculateOverheadPerPortion(totalMonthlyOverhead, targetMonthlyTransactions) {
  return totalMonthlyOverhead / targetMonthlyTransactions;
}

module.exports = {
  calculateHPP,
  calculateMargin,
  suggestSellingPrice,
  calculateBEP,
  calculateCapitalRecovery,
  calculateROI,
  calculateOverheadPerPortion
};
