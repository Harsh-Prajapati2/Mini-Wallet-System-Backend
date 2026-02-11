const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    month: {
      type: String, // YYYY-MM
      required: true,
      match: /^\d{4}-\d{2}$/,
    },
    category: {
      type: String,
      enum: ['salary', 'food', 'rent', 'travel', 'bills', 'shopping', 'health', 'entertainment', 'other'],
      required: true,
    },
    limitAmount: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { timestamps: true }
);

budgetSchema.index({ userId: 1, month: 1, category: 1 }, { unique: true });

module.exports = mongoose.model('Budget', budgetSchema);
