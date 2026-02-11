// routes/transaction.routes.js - Updated to match your model
const express = require('express');
const router = express.Router();
const Transaction = require('../models/transaction.model');
const Wallet = require('../models/wallet.model');
const auth = require('../middlewares/auth.middleware');

// GET /api/transactions - Get all transactions for logged-in user
router.get('/', auth, async (req, res) => {
  try {
    const { transactionType, limit = 50, skip = 0 } = req.query;

    // Build query
    const query = { userId: req.userId };
    if (transactionType && (transactionType === 'credit' || transactionType === 'debit')) {
      query.transactionType = transactionType;
    }

    // Fetch transactions
    const transactions = await Transaction.find(query)
      .sort({ transactionDate: -1 }) // Most recent first
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .populate('walletId', 'balance');

    // Get total count
    const total = await Transaction.countDocuments(query);

    // Format response to match frontend expectations
    const formattedTransactions = transactions.map(txn => ({
      id: txn._id,
      _id: txn._id,
      userId: txn.userId,
      walletId: txn.walletId,
      amount: txn.amount,
      type: txn.transactionType, // Map transactionType to type for frontend
      description: txn.description,
      date: txn.transactionDate, // Map transactionDate to date for frontend
      balanceAfterTransaction: txn.balanceAfterTransaction,
      status: 'completed' // Your model doesn't have status, so we set it as completed
    }));

    res.json({
      transactions: formattedTransactions,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip)
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/transactions/summary/stats - Get transaction summary
router.get('/summary/stats', auth, async (req, res) => {
  try {
    const summary = await Transaction.aggregate([
      { $match: { userId: req.userId } },
      {
        $group: {
          _id: '$transactionType',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const result = {
      totalCredit: 0,
      totalDebit: 0,
      creditCount: 0,
      debitCount: 0
    };

    summary.forEach(item => {
      if (item._id === 'credit') {
        result.totalCredit = item.total;
        result.creditCount = item.count;
      } else if (item._id === 'debit') {
        result.totalDebit = item.total;
        result.debitCount = item.count;
      }
    });

    result.netBalance = result.totalCredit - result.totalDebit;

    res.json(result);
  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/transactions/:id - Get single transaction
router.get('/:id', auth, async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      userId: req.userId
    }).populate('walletId', 'balance');

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Format response
    const formattedTransaction = {
      id: transaction._id,
      _id: transaction._id,
      userId: transaction.userId,
      walletId: transaction.walletId,
      amount: transaction.amount,
      type: transaction.transactionType,
      description: transaction.description,
      date: transaction.transactionDate,
      balanceAfterTransaction: transaction.balanceAfterTransaction,
      status: 'completed'
    };

    res.json(formattedTransaction);
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/transactions - Create new transaction
router.post('/', auth, async (req, res) => {
  try {
    const { type, amount, description } = req.body;

    // Validate input
    if (!type || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid transaction data' });
    }

    if (type !== 'credit' && type !== 'debit') {
      return res.status(400).json({ error: 'Type must be credit or debit' });
    }

    // Get user's wallet
    const wallet = await Wallet.findOne({ userId: req.userId });
    
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // Check balance for debit transactions
    if (type === 'debit' && wallet.balance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Calculate new balance
    const newBalance = type === 'credit' 
      ? wallet.balance + amount 
      : wallet.balance - amount;

    // Create transaction
    const transaction = new Transaction({
      userId: req.userId,
      walletId: wallet._id,
      amount: amount,
      transactionType: type,
      description: description || `${type.charAt(0).toUpperCase() + type.slice(1)} transaction`,
      balanceAfterTransaction: newBalance,
      transactionDate: new Date()
    });

    await transaction.save();

    // Update wallet balance
    wallet.balance = newBalance;
    await wallet.save();

    // Format response
    const formattedTransaction = {
      id: transaction._id,
      _id: transaction._id,
      userId: transaction.userId,
      walletId: transaction.walletId,
      amount: transaction.amount,
      type: transaction.transactionType,
      description: transaction.description,
      date: transaction.transactionDate,
      balanceAfterTransaction: transaction.balanceAfterTransaction,
      status: 'completed'
    };

    res.status(201).json(formattedTransaction);
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;