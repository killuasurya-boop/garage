const express = require('express');
const router = express.Router();
const reportController = require('./report.controller');
const authMiddleware = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');

router.get('/hpp-all', authMiddleware, roleGuard(['MANAGER', 'SUPER_ADMIN']), reportController.exportHppAllMenus);
router.get('/profit-loss', authMiddleware, roleGuard(['MANAGER', 'SUPER_ADMIN']), reportController.getProfitLoss);

module.exports = router;
