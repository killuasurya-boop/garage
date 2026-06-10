const express = require('express');
const router = express.Router();
const ingredientController = require('./ingredient.controller');
const authMiddleware = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');

router.get('/', authMiddleware, ingredientController.getAllIngredients);
router.get('/:id', authMiddleware, ingredientController.getIngredientById);
router.post('/', authMiddleware, roleGuard(['MANAGER', 'SUPER_ADMIN']), ingredientController.createIngredient);
router.put('/:id', authMiddleware, roleGuard(['MANAGER', 'SUPER_ADMIN']), ingredientController.updateIngredient);

module.exports = router;
