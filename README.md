# Shared Expenses App (Mini-Splitwise)

A full-stack shared expenses application built for a software engineering assignment. It allows users to create groups, manage memberships, split expenses dynamically, convert currencies (USD/INR), audit balances item-by-item, and import transaction records via CSV using a smart anomaly-detection pipeline.

---

## 🚀 Key Features

1. **Robust Split Configurations**
   - **Equal Split**: Evenly divides the expense among selected active group members.
   - **Unequal Split**: Allocates exact custom INR or USD amounts per member (sums are verified against the total).
   - **Percentage Split**: Allocates splits based on exact percentage shares (must sum to exactly 100%).
   - **USD Base Conversion**: Instantly preview and convert USD expenses using a live exchange rate (defaulting to 83.0 INR).

2. **Math Auditor Detail Panel ("Show Math")**
   - Opens a sliding detail drawer auditing every single expense share and settlement payment for any member. Resolves Rohan's concern about "magic numbers" in balances.

3. **Date-Active Membership Guards**
   - Restricts adding expenses, splits, or settlements to users who were active group members on the chosen transaction date (validates `joined_at` and `left_at` limits).

4. **Transaction CSV Import & Anomaly Review Queue**
   - Upload bank statement files to batch ingest expenses and settlements.
   - Parses date notations chronological/slash formats, cleans formatting, and resolves case-insensitive name aliases.
   - **12 Validation and Anomaly Rules** detected row-by-row:
     - Duplicate transaction detection (date and amount threshold).
     - Settlement transactions misclassified as expenses (automatically converted to payments).
     - Refund/credit entries (negative amounts matched to original expenses).
     - Exclusions ("Aisha not charged" parsed from notes to override split lists).
     - Trip indicator routing (auto-spawns separate trip groups for non-members).
     - Anthropic Sonnet AI parses unstructured free-text note splits (falls back to equal split and logs review flags if parsing fails).
   - **Interactive Review Queue**: Unresolved validation issues are staged in a dashboard where admins can review details, Approve, Reject, or apply Custom Manual Splits.

---

## 🛠️ Tech Stack

* **Backend**: Python 3.11, Django 5.2, Django REST Framework, SQLite (local development) / PostgreSQL (production-ready via `dj-database-url`), SimpleJWT for token authentication, WhiteNoise for static files.
* **Frontend**: React 18, Vite, React Router, Axios, TailwindCSS v3.4, Recharts (balance visualization charts).
* **AI Engine**: Anthropic Claude API (for parsing unstructured split notes).

---

## 📁 Repository Structure

```text
├── client/                 # React Frontend
│   ├── src/
│   │   ├── components/     # Layout, AddExpenseModal, BalanceDetailDrawer, etc.
│   │   ├── contexts/       # AuthContext (JWT session state synced with backend)
│   │   ├── pages/          # Dashboard, Groups, Expenses, Import, Report
│   │   └── services/       # api.js Axios configuration
│   └── package.json
├── server/                 # Django Backend
│   ├── config/             # Django settings & router mapping
│   ├── expenses/           # Core API logic, models, views, and services
│   │   ├── services/       # csv_importer.py, llm_split_parser.py
│   │   ├── management/     # seed_data.py custom command
│   │   └── models.py       # SQL database schemas
│   └── requirements.txt
├── DECISIONS.md            # Architectural design choices
└── README.md               # App instructions
```

---

## ⚙️ Local Setup Instructions

### 1. Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd server
   ```
2. Initialize virtual environment:
   ```bash
   python -m venv venv
   venv\Scripts\activate      # Windows
   source venv/bin/activate   # macOS/Linux
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Create a `.env` file in `/server` based on `.env.example`:
   ```env
   SECRET_KEY=your-django-secret-key
   DEBUG=True
   ANTHROPIC_API_KEY=your-claude-api-key # Optional, falls back to equal split if empty
   ```
5. Apply database migrations:
   ```bash
   python manage.py migrate
   ```
6. Run the database seed script to populate test data:
   ```bash
   python manage.py seed_data
   ```
7. Start the local server:
   ```bash
   python manage.py runserver
   ```
   The backend API will be available at `http://localhost:8000/api/`.

### 2. Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd client
   ```
2. Install npm packages:
   ```bash
   npm install
   ```
3. Create a `.env` file in `/client`:
   ```env
   VITE_API_BASE_URL=http://localhost:8000/api/
   ```
4. Start the Vite development server:
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173/` in your browser.

---

## 🧪 Test Data & Logins

Running `python manage.py seed_data` deletes previous records and populates the database with:
- **Test Users** (password is `password123` for all):
  - `priya`
  - `rohan`
  - `aisha`
  - `vikram`
- **Test Groups**:
  - `Flat 202A` (Members: Rohan, Priya, Aisha)
  - `Road Trip Goa` (Members: Priya, Rohan, Aisha, Vikram)
- **Preconfigured Transactions**: Rent, weekly groceries, car fuel, Airbnb bookings, and recorded settlements.

---

## 🐳 Production Deployment Config

* **Procfile**: Present inside `/server` executing: `web: gunicorn config.wsgi`.
* **WhiteNoise**: Integrated inside `settings.py` for serving compressed static files in production.
* **Database URL**: Automatically switches to PostgreSQL when `DATABASE_URL` environment variable is detected.
