const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();
const port = process.env.PORT || 3001;

// Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

const authRoutes = require('./modules/auth/auth.routes');
const menuRoutes = require('./modules/menu/menu.routes');
const ingredientRoutes = require('./modules/ingredients/ingredient.routes');
const payrollRoutes = require('./modules/payroll/payroll.routes');
const analyticsRoutes = require('./modules/analytics/analytics.routes');
const promoRoutes = require('./modules/promo/promo.routes');
const bundlingRoutes = require('./modules/bundling/bundling.routes');
const transactionRoutes = require('./modules/transactions/transaction.routes');
const inventoryRoutes = require('./modules/inventory/inventory.routes');
const reportRoutes = require('./modules/reports/report.routes');
const errorHandler = require('./middleware/errorHandler');

// Basic health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', version: '1.0.0', message: 'GARAGE ProfitMax API is running.' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/ingredients', ingredientRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/promo', promoRoutes);
app.use('/api/bundling', bundlingRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/reports', reportRoutes);

// Error Handler
app.use(errorHandler);

// Start Server
if (require.main === module) {
  app.listen(port, () => {
    console.log(`[SERVER] GARAGE ProfitMax running on port ${port}`);
  });
}

module.exports = app;
