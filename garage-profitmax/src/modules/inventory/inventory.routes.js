const express = require('express');
const router = express.Router();
const inventoryController = require('./inventory.controller');
const authMiddleware = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');

router.get('/', authMiddleware, inventoryController.getInventoryStatus);
router.get('/alerts', authMiddleware, inventoryController.getStockAlerts);
router.post('/stock-in', authMiddleware, roleGuard(['MANAGER', 'SUPER_ADMIN']), inventoryController.stockIn);
router.post('/waste', authMiddleware, roleGuard(['BARISTA', 'MANAGER', 'SUPER_ADMIN']), inventoryController.logWaste);

module.exports = router;
