const express = require('express');
const router = express.Router();
const menuController = require('./menu.controller');
const authMiddleware = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');

router.get('/', authMiddleware, menuController.getAllMenus);
router.get('/categories', authMiddleware, menuController.getCategories);
router.post('/calculate-hpp', authMiddleware, roleGuard(['MANAGER', 'SUPER_ADMIN']), menuController.calculateHPP);
router.get('/:code', authMiddleware, menuController.getMenuByCode);
router.post('/', authMiddleware, roleGuard(['MANAGER', 'SUPER_ADMIN']), menuController.createMenu);
router.put('/:code', authMiddleware, roleGuard(['MANAGER', 'SUPER_ADMIN']), menuController.updateMenu);
router.delete('/:code', authMiddleware, roleGuard(['SUPER_ADMIN']), menuController.deleteMenu);

module.exports = router;
