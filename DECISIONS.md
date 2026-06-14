# Design Decisions - Shared Expenses App

## 1. Group Membership & Expense Dates
Group membership changes over time. An expense dated `D` is only split among members whose membership is active on `D`.
- Active condition: `joined_at <= D` and (`left_at is None` or `left_at >= D`).
- In addition, new expenses are validated so only users active on that date can be specified as splits (unless imported from CSV).

## 2. Currency Conversion
- Standard base currency is **INR** (Indian Rupee).
- If an expense is recorded in **USD**, we convert it to INR.
- Simplification: We use a fixed exchange rate `settings.USD_TO_INR_RATE` (default `83.0` INR per USD).
- Storing both `original_amount`, `currency`, `converted_amount`, and `exchange_rate_used` ensures audit integrity.

## 3. Split Types and Rounding
- **Equal Splits**: The total converted amount is divided by the number of split users. Any remainder (e.g. splitting ?10.00 among 3 users leaves ?0.01 remainder) is added to the payer's share if the payer is in the split, or the first user's share otherwise.
- **Unequal Splits**: Users submit specific absolute split amounts. The server validates that the sum of these split amounts equals the expense's `original_amount` (before conversion).
- **Percentage Splits**: Users submit percentage values. The server validates that the sum of percentages is exactly 100% (within 0.01% tolerance) and computes the absolute share amounts.

## 4. Balances Calculation
The net balance for any group member is computed dynamically using:
```
Net Balance = (Total Expenses Paid by User)
            - (Total Expense Shares Owed by User)
            - (Total Payments Received by User)
            - (Total Payments Sent by User)
```
- Soft-deleted expenses are excluded from this calculation.
- Payments (settlements) are stored in a separate table (`Payment`) from expenses, allowing clear categorization.

## 5. Audit Trail & Itemized Breakdown
To prevent "magic numbers" (Rohan's requirement), the `/api/groups/:id/balances/:user_id/detail/` endpoint returns the raw list of:
- Every expense where the user paid or split, with absolute share amounts.
- Every payment where they sent or received funds.
