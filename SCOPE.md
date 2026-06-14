# Project Scope & Feature Checklist - Shared Expenses App

This document outlines the implemented features and deliverables in the project, tracing them back to the core assignment requirements.

## 🎯 Implemented Features

### 1. Dynamic Group & Membership Timeline
- **Timestamps Verification**: Enforces date guards checking `joined_at` and `left_at` limits so expenses cannot be recorded or split with members who were not active on that date.
- **Group CRUD**: Supports group creation, joining, and marking members as left.

### 2. Multi-Mode Splits & Currency Conversion
- **Equal Splits**: Evenly divides expenses with automated rounding remainder correction (allocated to the payer).
- **Unequal Splits**: Handles custom absolute share amounts per member with server-side sum validations.
- **Percentage Splits**: Splits based on custom percentage allocations summing to exactly 100%.
- **USD Conversion**: Automatic conversion of USD values using a baseline exchange rate (83.0 INR), tracking both original and converted totals.

### 3. Math Auditor Drawer ("Show Math")
- **Anti-Magic Numbers Detail Panel**: Provides a slide-over audit ledger returning every transaction, original versus converted shares, split percentages, and sent/received payments for complete transparency.

### 4. Smart CSV Import Pipeline
- **Row-by-Row Ingestion**: Guarantees transaction-level isolation (partial failures do not corrupt the import state).
- **Date Normalization**: Resolves ambiguous slash formats and missing years chronologically.
- **Alias Resolution**: Normalizes name variants (e.g., "Priya S" -> "priya") and auto-registers new profiles.
- **Duplicate Checks**: Flags identical-day duplicates using string similarity (>0.6) and amount matching.
- **Refund Linking**: Matches negative values to original expense records.
- **Settlement Detection**: Automatically converts settlement entries into Payments rather than Expenses.
- **Exclusion Notes Parsing**: Automatically overrides splits using exclusion keywords ("Aisha not charged").
- **Trip Indicators Routing**: Detects non-member entries and creates separate trip groups (e.g., "Flat 202a - Goa Trip").
- **AI Split Parsing**: Claude Sonnet model integration to parse unstructured free-text note fields.

### 5. Interactive Resolution Queue
- Shows ingestion logs and anomalies log.
- Provides inline actions (**Approve**, **Reject/Delete**, **Manual Split Override**) to clear queue flags.

---

## 🚀 Future Enhancements (Out of Scope for Prototype)
- **Multi-Currency Live Rates API**: Integrate external rates API rather than relying on a static config rate.
- **Automatic Settlement Optimizer**: Run a debt-simplification algorithm (Splitwise style) to minimize total transactions.
- **Real-Time Push Notifications**: Notify members via email/push when they are added to a group or tagged in an expense.
