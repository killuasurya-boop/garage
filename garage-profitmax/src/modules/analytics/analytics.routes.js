const express = require('express');
const router = express.Router();
const analyticsController = require('./analytics.controller');
const authMiddleware = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');

router.get('/dashboard', authMiddleware, roleGuard(['MANAGER', 'SUPER_ADMIN']), analyticsController.getDashboardOverview);
router.get('/bep-roi', authMiddleware, roleGuard(['MANAGER', 'SUPER_ADMIN']), analyticsController.getBepRoi);
router.get('/health', authMiddleware, roleGuard(['MANAGER', 'SUPER_ADMIN']), analyticsController.getHealth);

module.exports = router;
