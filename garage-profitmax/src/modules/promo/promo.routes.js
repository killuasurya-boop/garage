const express = require('express');
const router = express.Router();
const promoController = require('./promo.controller');
const authMiddleware = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');

router.get('/', authMiddleware, promoController.getAllPromos);
router.post('/', authMiddleware, roleGuard(['MARKETING', 'MANAGER', 'SUPER_ADMIN']), promoController.createPromo);
router.post('/simulate', authMiddleware, roleGuard(['MARKETING', 'MANAGER', 'SUPER_ADMIN']), promoController.simulatePromo);

module.exports = router;
