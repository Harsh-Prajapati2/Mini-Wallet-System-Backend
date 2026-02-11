const mongoose = require('mongoose');
const Wallet = require('../models/wallet.model');
const Transaction = require('../models/transaction.model');
const Budget = require('../models/budget.model');
const RecurringRule = require('../models/recurringRule.model');

const CATEGORY_VALUES = ['salary', 'food', 'rent', 'travel', 'bills', 'shopping', 'health', 'entertainment', 'other'];
const FREQUENCY_VALUES = ['daily', 'weekly', 'monthly'];

function getMonthKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function nextRunDateForFrequency(fromDate, frequency) {
  const base = new Date(fromDate);
  if (frequency === 'daily') {
    base.setDate(base.getDate() + 1);
    return base;
  }
  if (frequency === 'weekly') {
    base.setDate(base.getDate() + 7);
    return base;
  }
  base.setMonth(base.getMonth() + 1);
  return base;
}

// get or create wallet for userId
async function getOrCreateWallet(userId, session = null) {
  let wallet = await Wallet.findOne({ userId }).session(session);
  if (!wallet) {
    wallet = new Wallet({ userId, balance: 0 });
    await wallet.save({ session });
  }
  return wallet;
}

function buildTransactionsQuery(userId, query) {
  const mongoQuery = { userId };

  if (query.transactionType && (query.transactionType === 'credit' || query.transactionType === 'debit')) {
    mongoQuery.transactionType = query.transactionType;
  }

  if (query.category && CATEGORY_VALUES.includes(query.category)) {
    mongoQuery.category = query.category;
  }

  if (query.startDate || query.endDate || query.month) {
    mongoQuery.transactionDate = {};
  }

  if (query.month && /^\d{4}-\d{2}$/.test(query.month)) {
    const [year, month] = query.month.split('-').map(Number);
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 1);
    mongoQuery.transactionDate.$gte = monthStart;
    mongoQuery.transactionDate.$lt = monthEnd;
  }

  if (query.startDate) {
    const startDate = new Date(query.startDate);
    if (!Number.isNaN(startDate.getTime())) {
      mongoQuery.transactionDate.$gte = startDate;
    }
  }

  if (query.endDate) {
    const endDate = new Date(query.endDate);
    if (!Number.isNaN(endDate.getTime())) {
      endDate.setHours(23, 59, 59, 999);
      mongoQuery.transactionDate.$lte = endDate;
    }
  }

  if (mongoQuery.transactionDate && Object.keys(mongoQuery.transactionDate).length === 0) {
    delete mongoQuery.transactionDate;
  }

  return mongoQuery;
}

function decorateTransaction(tx) {
  return {
    ...tx,
    category: tx.category || 'other',
    type: tx.transactionType,
    date: tx.transactionDate,
  };
}

async function recalculateBalances(userId, session) {
  const transactions = await Transaction.find({ userId })
    .sort({ transactionDate: 1, _id: 1 })
    .session(session);

  let runningBalance = 0;
  const bulkOps = [];

  for (const tx of transactions) {
    const amount = Number(tx.amount || 0);
    if (tx.transactionType === 'debit' && runningBalance < amount) {
      return {
        ok: false,
        message: 'Operation would create an invalid balance sequence',
      };
    }

    runningBalance = tx.transactionType === 'credit'
      ? runningBalance + amount
      : runningBalance - amount;

    if (Number(tx.balanceAfterTransaction) !== runningBalance) {
      bulkOps.push({
        updateOne: {
          filter: { _id: tx._id },
          update: { $set: { balanceAfterTransaction: runningBalance } },
        },
      });
    }
  }

  if (bulkOps.length > 0) {
    await Transaction.bulkWrite(bulkOps, { session });
  }

  const wallet = await getOrCreateWallet(userId, session);
  wallet.balance = runningBalance;
  await wallet.save({ session });

  return { ok: true, balance: runningBalance };
}

async function processRecurringRules(userId, session) {
  const now = new Date();
  const rules = await RecurringRule.find({
    userId,
    isActive: true,
    nextRunDate: { $lte: now },
  })
    .sort({ nextRunDate: 1 })
    .session(session);

  if (!rules.length) {
    return;
  }

  const wallet = await getOrCreateWallet(userId, session);

  for (const rule of rules) {
    let iterations = 0;
    while (rule.isActive && rule.nextRunDate && rule.nextRunDate <= now && iterations < 36) {
      const amt = Number(rule.amount || 0);
      const canApply = rule.transactionType === 'credit' || wallet.balance >= amt;

      if (canApply) {
        wallet.balance = rule.transactionType === 'credit'
          ? Number(wallet.balance) + amt
          : Number(wallet.balance) - amt;

        const tx = new Transaction({
          userId,
          walletId: wallet._id,
          amount: amt,
          transactionType: rule.transactionType,
          category: rule.category || 'other',
          description: rule.description || `Recurring: ${rule.title}`,
          balanceAfterTransaction: wallet.balance,
          recurringSourceId: rule._id,
          transactionDate: new Date(),
        });

        await tx.save({ session });
      }

      rule.nextRunDate = nextRunDateForFrequency(rule.nextRunDate, rule.frequency);
      iterations += 1;
    }

    await rule.save({ session });
  }

  await wallet.save({ session });
}

// GET /api/wallet/balance
async function getBalance(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const userId = req.user.userId;
    await processRecurringRules(userId, session);
    const result = await recalculateBalances(userId, session);

    if (!result.ok) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: result.message });
    }

    await session.commitTransaction();
    session.endSession();
    return res.json({ balance: result.balance });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
}

// POST /api/wallet/credit { amount, description, category }
async function credit(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const userId = req.user.userId;
    const { amount, description, category } = req.body;
    const amt = Number(amount);

    if (!amt || amt <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Amount must be a positive number' });
    }

    const safeCategory = CATEGORY_VALUES.includes(category) ? category : 'other';
    const wallet = await getOrCreateWallet(userId, session);
    wallet.balance = Number(wallet.balance) + amt;
    await wallet.save({ session });

    const tx = new Transaction({
      userId,
      walletId: wallet._id,
      amount: amt,
      transactionType: 'credit',
      category: safeCategory,
      description: description || 'Wallet credit',
      balanceAfterTransaction: wallet.balance,
    });
    await tx.save({ session });

    await session.commitTransaction();
    session.endSession();
    return res.status(201).json({
      balance: wallet.balance,
      transaction: decorateTransaction(tx.toObject()),
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
}

// POST /api/wallet/debit { amount, description, category }
async function debit(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const userId = req.user.userId;
    const { amount, description, category } = req.body;
    const amt = Number(amount);

    if (!amt || amt <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Amount must be a positive number' });
    }

    const wallet = await getOrCreateWallet(userId, session);
    if (wallet.balance < amt) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    const safeCategory = CATEGORY_VALUES.includes(category) ? category : 'other';
    wallet.balance = Number(wallet.balance) - amt;
    await wallet.save({ session });

    const tx = new Transaction({
      userId,
      walletId: wallet._id,
      amount: amt,
      transactionType: 'debit',
      category: safeCategory,
      description: description || 'Wallet debit',
      balanceAfterTransaction: wallet.balance,
    });
    await tx.save({ session });

    await session.commitTransaction();
    session.endSession();
    return res.json({
      balance: wallet.balance,
      transaction: decorateTransaction(tx.toObject()),
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
}

// GET /api/wallet/transactions
async function transactions(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const userId = req.user.userId;
    await processRecurringRules(userId, session);
    const recalcResult = await recalculateBalances(userId, session);

    if (!recalcResult.ok) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: recalcResult.message });
    }

    await session.commitTransaction();
    session.endSession();

    const limit = Math.min(Number(req.query.limit) || 20, 200);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const skip = (page - 1) * limit;
    const search = String(req.query.search || '').trim();

    const mongoQuery = buildTransactionsQuery(userId, req.query);

    if (search) {
      mongoQuery.$or = [
        { description: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      Transaction.find(mongoQuery)
        .sort({ transactionDate: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Transaction.countDocuments(mongoQuery),
    ]);

    return res.json({
      total,
      page,
      limit,
      items: items.map(decorateTransaction),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
}

// PUT /api/wallet/transactions/:id
async function updateTransaction(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const userId = req.user.userId;
    const tx = await Transaction.findOne({ _id: req.params.id, userId }).session(session);

    if (!tx) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Transaction not found' });
    }

    const nextType = req.body.transactionType || tx.transactionType;
    const nextAmount = req.body.amount !== undefined ? Number(req.body.amount) : Number(tx.amount);
    const nextCategory = req.body.category || tx.category || 'other';

    if (!['credit', 'debit'].includes(nextType)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Invalid transaction type' });
    }

    if (!nextAmount || nextAmount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Amount must be positive' });
    }

    if (!CATEGORY_VALUES.includes(nextCategory)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Invalid category' });
    }

    tx.transactionType = nextType;
    tx.amount = nextAmount;
    tx.category = nextCategory;

    if (req.body.description !== undefined) {
      tx.description = req.body.description;
    }

    if (req.body.transactionDate) {
      const nextDate = new Date(req.body.transactionDate);
      if (Number.isNaN(nextDate.getTime())) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: 'Invalid transaction date' });
      }
      tx.transactionDate = nextDate;
    }

    await tx.save({ session });

    const result = await recalculateBalances(userId, session);
    if (!result.ok) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: result.message });
    }

    await session.commitTransaction();
    session.endSession();
    return res.json({
      message: 'Transaction updated',
      balance: result.balance,
      transaction: decorateTransaction(tx.toObject()),
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
}

// DELETE /api/wallet/transactions/:id
async function deleteTransaction(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const userId = req.user.userId;
    const tx = await Transaction.findOne({ _id: req.params.id, userId }).session(session);

    if (!tx) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Transaction not found' });
    }

    await Transaction.deleteOne({ _id: tx._id }).session(session);

    const result = await recalculateBalances(userId, session);
    if (!result.ok) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: result.message });
    }

    await session.commitTransaction();
    session.endSession();
    return res.json({ message: 'Transaction deleted', balance: result.balance });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
}

// GET /api/wallet/budgets?month=YYYY-MM
async function getBudgets(req, res) {
  try {
    const userId = req.user.userId;
    const month = req.query.month;
    const query = { userId };

    if (month) {
      query.month = month;
    }

    const items = await Budget.find(query).sort({ month: -1, category: 1 }).lean();
    return res.json({ items });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
}

// PUT /api/wallet/budgets { month, category, limitAmount }
async function upsertBudget(req, res) {
  try {
    const userId = req.user.userId;
    const month = String(req.body.month || '');
    const category = String(req.body.category || '');
    const limitAmount = Number(req.body.limitAmount);

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ message: 'Month must be YYYY-MM' });
    }

    if (!CATEGORY_VALUES.includes(category)) {
      return res.status(400).json({ message: 'Invalid category' });
    }

    if (Number.isNaN(limitAmount) || limitAmount < 0) {
      return res.status(400).json({ message: 'Limit amount must be zero or positive' });
    }

    if (limitAmount === 0) {
      await Budget.deleteOne({ userId, month, category });
      return res.json({ message: 'Budget removed' });
    }

    const item = await Budget.findOneAndUpdate(
      { userId, month, category },
      { $set: { limitAmount } },
      { new: true, upsert: true, runValidators: true }
    ).lean();

    return res.json({ item });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
}

// GET /api/wallet/recurring
async function getRecurringRules(req, res) {
  try {
    const userId = req.user.userId;
    const items = await RecurringRule.find({ userId }).sort({ createdAt: -1 }).lean();
    return res.json({ items });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
}

// POST /api/wallet/recurring
async function createRecurringRule(req, res) {
  try {
    const userId = req.user.userId;
    const { title, amount, transactionType, category, description, frequency, nextRunDate } = req.body;

    const amt = Number(amount);
    if (!title || !amt || amt <= 0) {
      return res.status(400).json({ message: 'Title and positive amount are required' });
    }

    if (!['credit', 'debit'].includes(transactionType)) {
      return res.status(400).json({ message: 'Invalid transaction type' });
    }

    if (!FREQUENCY_VALUES.includes(frequency)) {
      return res.status(400).json({ message: 'Invalid frequency' });
    }

    const safeCategory = CATEGORY_VALUES.includes(category) ? category : 'other';
    const parsedNextRun = new Date(nextRunDate || new Date());

    if (Number.isNaN(parsedNextRun.getTime())) {
      return res.status(400).json({ message: 'Invalid next run date' });
    }

    const rule = await RecurringRule.create({
      userId,
      title,
      amount: amt,
      transactionType,
      category: safeCategory,
      description: description || '',
      frequency,
      nextRunDate: parsedNextRun,
      isActive: true,
    });

    return res.status(201).json({ item: rule });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
}

// PUT /api/wallet/recurring/:id
async function updateRecurringRule(req, res) {
  try {
    const userId = req.user.userId;
    const updates = {};

    if (req.body.title !== undefined) updates.title = req.body.title;

    if (req.body.amount !== undefined) {
      const amt = Number(req.body.amount);
      if (!amt || amt <= 0) return res.status(400).json({ message: 'Amount must be positive' });
      updates.amount = amt;
    }

    if (req.body.transactionType !== undefined) {
      if (!['credit', 'debit'].includes(req.body.transactionType)) {
        return res.status(400).json({ message: 'Invalid transaction type' });
      }
      updates.transactionType = req.body.transactionType;
    }

    if (req.body.category !== undefined) {
      if (!CATEGORY_VALUES.includes(req.body.category)) {
        return res.status(400).json({ message: 'Invalid category' });
      }
      updates.category = req.body.category;
    }

    if (req.body.frequency !== undefined) {
      if (!FREQUENCY_VALUES.includes(req.body.frequency)) {
        return res.status(400).json({ message: 'Invalid frequency' });
      }
      updates.frequency = req.body.frequency;
    }

    if (req.body.description !== undefined) updates.description = req.body.description;
    if (req.body.isActive !== undefined) updates.isActive = Boolean(req.body.isActive);

    if (req.body.nextRunDate !== undefined) {
      const nextRun = new Date(req.body.nextRunDate);
      if (Number.isNaN(nextRun.getTime())) {
        return res.status(400).json({ message: 'Invalid next run date' });
      }
      updates.nextRunDate = nextRun;
    }

    const item = await RecurringRule.findOneAndUpdate(
      { _id: req.params.id, userId },
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();

    if (!item) {
      return res.status(404).json({ message: 'Recurring rule not found' });
    }

    return res.json({ item });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
}

// DELETE /api/wallet/recurring/:id
async function deleteRecurringRule(req, res) {
  try {
    const userId = req.user.userId;
    const result = await RecurringRule.deleteOne({ _id: req.params.id, userId });
    if (!result.deletedCount) {
      return res.status(404).json({ message: 'Recurring rule not found' });
    }
    return res.json({ message: 'Recurring rule deleted' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports = {
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
};
