# 🎷 Jazz Club - Restaurant SaaS Bill Splitter

A professional restaurant management system for real-time bill splitting and kitchen order tracking. Built with **Next.js 15**, **Supabase**, and **Framer Motion**.

## 🚀 Professional Workflow

This project is configured with a high-standard development workflow:

-   **CI/CD:** Automated builds and linting via **GitHub Actions** (`.github/workflows/ci.yml`).
-   **E2E Testing:** Robust UI testing with **Playwright**. Run `npx playwright test` to verify flows.
-   **API Client:** Pre-configured **Postman Collection** (`postman_collection.json`) for REST API testing.
-   **Database Security:** Row Level Security (RLS) hardened policies in Supabase.

## 🏗️ Technical Stack

-   **Framework:** Next.js (App Router, Turbopack)
-   **Realtime DB:** Supabase (PostgreSQL + Realtime)
-   **Animations:** Framer Motion (State of the art UI/UX)
-   **Icons:** Lucide React
-   **Styling:** Tailwind CSS

## 📋 Core Views

1.  **PC Central (Dashboard):** `/dashboard`
    -   Manage active tables.
    -   Add orders in real-time.
    -   Monitor kitchen progress (preparing/ready).
    -   Rotate tables (archive and open new sessions).
2.  **Kitchen Display (KDS):** `/kitchen`
    -   Command-style grouping by table.
    -   Real-time ticket updates as waiters add orders.
    -   One-touch "Mark Ready" status for chefs.
3.  **Customer App:** `/?table_id=[UUID]`
    -   Real-time bill visibility.
    -   Lock/Split items with other diners.
    -   "Cooking..." and "Ready!" status indicators for orders.
4.  **QR Manager:** `/qr`
    -   Generate permanent QRs for each physical table.

## 🛠️ Setup & Development

### 1. Database Initialization
Run the contents of [supabase_schema.sql](supabase_schema.sql) in your Supabase SQL Editor. This sets up all tables, triggers, and security policies.

### 2. Environment Variables
Create a `.env.local` file with your credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### 3. Run Locally
```bash
npm install
npm run dev
```

### 4. Testing
Run end-to-end tests to ensure core stability:
```bash
npx playwright test
```

## 📐 Agile Roadmap
Find the active development phases and backlog in `.gemini/antigravity/brain/.../task.md`.
