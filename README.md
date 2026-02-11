# Mini Wallet Backend

Node.js + Express + MongoDB API for authentication, wallet operations, transaction history, budgets, and recurring rules.

Base URL: `http://localhost:5000`

## Stack
- Express
- Mongoose
- JWT (`jsonwebtoken`)
- Password hashing (`bcrypt`)
- CORS + dotenv

## Run Locally
```bash
cd backend
npm install
```

Create `.env`:
```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET_KEY=your_strong_secret
```

Start:
```bash
npm start
```

Dev mode:
```bash
npm run dev
```

## Middleware
- `auth.middleware.js` validates Bearer token and sets:
  - `req.user` (decoded token)
  - `req.userId` (for route compatibility)

## API Endpoints

### Auth (Public)
- `POST /api/auth/register`
  - body: `{ fullName, aadharCard, mobileNo, email, password }`
- `POST /api/auth/login`
  - body: `{ email, password }`
  - response: `{ message, token }`

### User Profile (Protected)
- `GET /api/user/profile`
- `PUT /api/user/profile`
  - body: `{ fullName, email, mobileNo }`

### Wallet Core (Protected)
- `GET /api/wallet/balance`
  - runs recurring processing + balance reconciliation, returns `{ balance }`
- `POST /api/wallet/credit`
  - body: `{ amount, description?, category? }`
- `POST /api/wallet/debit`
  - body: `{ amount, description?, category? }`
  - validates available balance
- `GET /api/wallet/transactions`
  - query params:
    - `limit`, `page`
    - `search`
    - `transactionType`
    - `category`
    - `month` (`YYYY-MM`)
    - `startDate`, `endDate`
- `PUT /api/wallet/transactions/:id`
- `DELETE /api/wallet/transactions/:id`

### Budgets (Protected)
- `GET /api/wallet/budgets?month=YYYY-MM`
- `PUT /api/wallet/budgets`
  - body: `{ month, category, limitAmount }`
  - `limitAmount = 0` removes the budget

### Recurring Rules (Protected)
- `GET /api/wallet/recurring`
- `POST /api/wallet/recurring`
  - body: `{ title, amount, transactionType, category, description, frequency, nextRunDate }`
- `PUT /api/wallet/recurring/:id`
- `DELETE /api/wallet/recurring/:id`

### Additional Transaction Routes (Protected, legacy/alternate)
- `GET /api/transactions`
- `GET /api/transactions/:id`
- `POST /api/transactions`
- `GET /api/transactions/summary/stats`

Frontend primarily uses `/api/wallet/*` and `/api/user/profile`.

## Data Models
- `User`
- `Wallet`
- `Transaction`
  - includes `balanceAfterTransaction` snapshot
  - includes optional `recurringSourceId`
- `Budget` (month + category limit)
- `RecurringRule` (scheduled debit/credit rule)

## Consistency and Balance Logic
- Credit/debit/update/delete operations run in DB transactions (Mongoose session).
- Balance integrity is maintained via recalculation logic:
  - transactions are sorted by date
  - running balance is recomputed
  - wallet balance is synchronized
- Recurring rules are auto-processed when balance/transactions endpoints are hit.

## CORS and Port Notes
- `server.js` currently allows frontend origin `http://localhost:5173`.
- If frontend host changes, update CORS config.

## Error Behavior
- Invalid auth: `401`
- Validation errors: `400`
- Missing resource: `404`
- Server/internal failures: `500`
