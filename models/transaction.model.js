const mongoose = require('mongoose');

const transactionSchema = mongoose.Schema({
    userId : {
        type : mongoose.Schema.Types.ObjectId,
        ref : 'User',
        required : true
    },
    walletId :{
        type : mongoose.Schema.Types.ObjectId,
        ref : 'Wallet',
        required : true
    },
    amount : {
        type : Number,
        required : true
    },
    transactionType : {
        type : String,
        enum : ['credit','debit'],
        required : true
    },
    transactionDate : {
        type : Date,
        default : Date.now
    },
    description : {
        type : String,
    },
    category: {
        type: String,
        enum: ['salary', 'food', 'rent', 'travel', 'bills', 'shopping', 'health', 'entertainment', 'other'],
        default: 'other',
    },
    recurringSourceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'RecurringRule',
    },
    balanceAfterTransaction : {
        type : Number,
        required : true
    }
}, {
    timestamps: true,
});

module.exports = mongoose.model('Transaction',transactionSchema)
