const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const {
  getBalance,
  credit,
  debit,
  transactions,
  updateTransaction,
  deleteTransaction,
  getBudgets,
  upsertBudget,
  getRecurringRules,
  createRecurringRule,
  updateRecurringRule,
  deleteRecurringRule,
} = require('../controllers/wallet.controller');

router.get('/balance', authMiddleware, getBalance);
router.post('/credit', authMiddleware, credit);
router.post('/debit', authMiddleware, debit);
router.get('/transactions', authMiddleware, transactions);
router.put('/transactions/:id', authMiddleware, updateTransaction);
router.delete('/transactions/:id', authMiddleware, deleteTransaction);

router.get('/budgets', authMiddleware, getBudgets);
router.put('/budgets', authMiddleware, upsertBudget);

router.get('/recurring', authMiddleware, getRecurringRules);
router.post('/recurring', authMiddleware, createRecurringRule);
router.put('/recurring/:id', authMiddleware, updateRecurringRule);
router.delete('/recurring/:id', authMiddleware, deleteRecurringRule);

module.exports = router;
