Database Schema - Mini Wallet (MongoDB / Mongoose)

Collections:

1) users
- _id: ObjectId (primary key)
- fullName: String (user name)
- aadharCard: String (unique identifier)
- mobileNo: Number (unique)
- email: String (unique)
- password: String (hashed via bcrypt)
- createdAt: Date

2) wallets
- _id: ObjectId (primary key)
- userId: ObjectId (ref -> users._id) - indexed, unique per user
- balance: Number (current balance, stored for quick reads)
- createdAt / updatedAt: timestamps

3) transactions
- _id: ObjectId
- userId: ObjectId (ref -> users._id) - index for query
- walletId: ObjectId (ref -> wallets._id)
- amount: Number (positive)
- transactionType: String enum ['credit','debit']
- transactionDate: Date
- description: String
- balanceAfterTransaction: Number (wallet balance snapshot after the transaction)

Design rationale:
- Storing `balance` on the `wallets` collection enables fast read for dashboards and avoids aggregating full transaction history for every request.
- Each `transaction` records `balanceAfterTransaction` which provides an immutable ledger and allows auditing and reconciliation.
- `userId` is present on both `wallets` and `transactions` for fast lookups by user and to enforce referential integrity in application logic.
- Use MongoDB transactions (multi-document) during credit/debit to update `wallets` and insert `transactions` atomically so balance never drifts.

Indexes and constraints:
- Unique index on `users.email`, `users.mobileNo`, `users.aadharCard` to enforce uniqueness.
- Unique index on `wallets.userId` to ensure one wallet per user.
- Index on `transactions.userId` and `transactions.transactionDate` for fast history queries.

Balance calculation:
- The canonical balance is `wallets.balance`.
- For reconciliation: sum of transactions for a wallet from creation should equal current `wallets.balance` (snapshot stored in `balanceAfterTransaction`).
