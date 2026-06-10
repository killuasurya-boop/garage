const express = require('express');
const router = express.Router();
const bundlingController = require('./bundling.controller');
const authMiddleware = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');

router.get('/', authMiddleware, bundlingController.getAllBundlings);
router.post('/', authMiddleware, roleGuard(['MARKETING', 'MANAGER', 'SUPER_ADMIN']), bundlingController.createBundling);
router.post('/calculate', authMiddleware, roleGuard(['MARKETING', 'MANAGER', 'SUPER_ADMIN']), bundlingController.calculateBundling);

module.exports = router;
