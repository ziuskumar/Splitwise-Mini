# AI Usage Reflection - Shared Expenses App

This document outlines how AI was utilized to accelerate development, co-pilot architectural designs, and debug configuration issues during the building of this application.

## 🤖 AI Co-Pilot Summary

AI was used throughout the life cycle of the project in four main areas:

### 1. Scaffolding and Boilerplate Generation (Stage 0)
- Configured project directories, `.gitignore`, `.env.example`, and initialized Django/Vite setups.
- Scaffolded database schemas for Profiles, Groups, memberships, expenses, payments, batches, and anomalies.

### 2. Business Logic Validation (Stage 1 & 2)
- Generated Active Membership checks ensuring transaction dates match member timelines.
- Designed 12 validation rules inside `csv_importer.py` (duplicate detection, refund candidate matching, note exclusion parser, and Goa trip auto-group routing).
- Integrated Anthropic Sonnet API in `llm_split_parser.py` to extract structured JSON splits from unstructured transaction description notes.

### 3. Frontend & Visual Components (Stage 3)
- Built interactive React pages using Tailwind CSS and Recharts.
- Implemented slide-over itemized math drawers (`BalanceDetailDrawer.jsx`), split input modals (`AddExpenseModal.jsx`), and drag-and-drop file ingestion zones.
- Designed an interactive anomaly review dashboard.

### 4. Configuration and Debugging (Stage 4)
- Formulated Gunicorn `Procfile`, WhiteNoise static file configurations, and PostgreSQL connectivity setup via `dj-database-url`.
- Created an idempotent CLI `seed_data` command to flush and populate test profiles and transactions.
- **Troubleshooting**: Diagnosed and repaired UTF-16 file encoding corruptions and hidden directional formatting character syntax errors (`stream did not contain valid UTF-8` and `Invalid Character`) that occurred during Vite bundle builds.

---

## 💡 Key Learnings & AI Alignment
- **Verify Compiled Code**: Code generated across multiple compacting steps may contain hidden unicode formatting characters or formatting flags (like bidi override characters). Validation tools like `npm run build` are crucial to catch these early.
- **Row Ingestion Isolation**: Designing transaction-isolated loops ensures that one broken CSV row does not corrupt a whole import batch, logging review flags instead.
- **Traceability**: Providing itemized ledger views instead of static "magic numbers" makes debugging complex split balances transparent for both users and developers.
