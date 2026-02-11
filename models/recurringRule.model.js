const mongoose = require('mongoose');

const recurringRuleSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    transactionType: {
      type: String,
      enum: ['credit', 'debit'],
      required: true,
    },
    category: {
      type: String,
      enum: ['salary', 'food', 'rent', 'travel', 'bills', 'shopping', 'health', 'entertainment', 'other'],
      default: 'other',
    },
    description: {
      type: String,
      default: '',
    },
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      required: true,
    },
    nextRunDate: {
      type: Date,
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

recurringRuleSchema.index({ userId: 1, isActive: 1, nextRunDate: 1 });

module.exports = mongoose.model('RecurringRule', recurringRuleSchema);
