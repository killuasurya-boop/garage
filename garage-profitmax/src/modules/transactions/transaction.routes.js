const express = require('express');
const router = express.Router();
const transactionController = require('./transaction.controller');
const authMiddleware = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');

router.get('/', authMiddleware, transactionController.getTransactions);
router.post('/', authMiddleware, roleGuard(['KASIR', 'MANAGER', 'SUPER_ADMIN']), transactionController.createTransaction);

module.exports = router;
