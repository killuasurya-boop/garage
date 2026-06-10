const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const authMiddleware = require('../../middleware/auth');

router.post('/login', authController.login);
router.get('/me', authMiddleware, authController.getMe);

module.exports = router;
