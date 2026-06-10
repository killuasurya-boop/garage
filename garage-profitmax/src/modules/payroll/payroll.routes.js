const express = require('express');
const router = express.Router();
const employeeController = require('./employee.controller');
const authMiddleware = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');

const payrollController = require('./payroll.controller');

router.get('/employees', authMiddleware, employeeController.getAllEmployees);
router.get('/employees/:id', authMiddleware, employeeController.getEmployeeById);
router.post('/employees', authMiddleware, roleGuard(['MANAGER', 'SUPER_ADMIN']), employeeController.createEmployee);
router.put('/employees/:id', authMiddleware, roleGuard(['MANAGER', 'SUPER_ADMIN']), employeeController.updateEmployee);

router.post('/generate', authMiddleware, roleGuard(['MANAGER', 'SUPER_ADMIN']), payrollController.generatePayroll);

module.exports = router;
