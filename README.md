# NIT Faculty Management System

> A full-stack faculty lifecycle platform — leave, vaultify, timetable, product requests, bulk import, dynamic forms, and a multi-role admin console.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3.3-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.2.0-blue.svg)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.18.2-lightgrey.svg)](https://expressjs.com/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-blue.svg)](https://mysql.com/)
[![Docker](https://img.shields.io/badge/Docker-ready-blue.svg)](https://www.docker.com/)

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Quick Start — with Docker](#quick-start--with-docker)
- [Quick Start — without Docker](#quick-start--without-docker)
- [Environment Variables](#environment-variables)
- [Seeding the First Admin](#seeding-the-first-admin)
- [Managing Faculty Types](#managing-faculty-types)
- [Managing Leave Types](#managing-leave-types)
- [Bulk Import (Excel)](#bulk-import-excel)
- [Error Logging & Troubleshooting](#error-logging--troubleshooting)
- [Available Scripts](#available-scripts)
- [Production Deployment](#production-deployment)
- [Architecture Reference](#architecture-reference)

---

## Overview

The **NIT Faculty Management System** is a self-contained portal for an academic institution's faculty and administrators. It bundles:

- **Authentication & RBAC** with four roles (`FACULTY`, `HOD`, `ADMIN`, `SUPER_ADMIN`), httpOnly cookies, JWT + JTI revocation, and server-authoritative role checks.
- **Leave management** with monthly / yearly accrual, gender restrictions, probation gating, leave-adjustment (alternate-faculty) workflow, and an approval pipeline.
- **Bulk import** of users from Excel — admins download a template, fill it, and upload. The system hashes a default password, sends a welcome email, and forces a password reset on first login.
- **Vaultify** — a document vault with categories, visibility, sharing, and an access-log trail.
- **Timetable** management with conflict-detection triggers and timetable file uploads (PDF / Excel / image).
- **Product requests** workflow for resource requisition.
- **Dynamic forms** engine (JSON-driven form definitions with conditional fields and auto-fill).
- **Audit logs** (legacy `admin_logs` + new unified `audit_logs`).
- **Master codes, departments, workflows, and rule engine** infrastructure (added during the foundation rewrite; lives alongside the legacy data).

---

## Architecture

```
                ┌────────────────────────┐
                │  React 18 + Vite SPA   │  (port 5173 dev / served by nginx in prod)
                │  Tailwind, Axios, RHF  │
                └────────────┬───────────┘
                             │  HTTPS / httpOnly cookies
                             ▼
                ┌────────────────────────┐
                │  Nginx (TLS, rate-     │  (ports 80/443)
                │  limit, gzip, HSTS)    │
                └────────────┬───────────┘
                             │  internal Docker network (or localhost)
                             ▼
    ┌────────────────────────────────────────────────────┐
    │  Backend — Express 4 + TypeScript                 │
    │  /api/auth, /api/admin, /api/leave, /api/vaultify,│
    │  /api/timetable*, /api/forms, /api/master-codes,  │
    │  /api/departments, /api/audit-logs, /api/workflows│
    │  + node-cron (accrual, carry-forward)             │
    └────────────────────────┬───────────────────────────┘
                             │  mysql2 / promise pool
                             ▼
                ┌────────────────────────┐
                │   MySQL 8.0            │  schema + 3 migrations + stored procs
                │   (persistent volume)  │  (sp_assign_default_leaves,
                │                        │   sp_apply_leave, sp_monthly_leave_accrual,
                │                        │   sp_yearly_leave_accrual, sp_carry_forward_leaves,
                │                        │   sp_admin_update_leave_balance, …)
                └────────────────────────┘
```

---

## Tech Stack

| Layer        | Technology                                                    |
|--------------|---------------------------------------------------------------|
| Frontend     | React 18, TypeScript 5.3, Vite 5, Tailwind CSS 3.4            |
| Frontend libs| React Router 6, React Hook Form + Zod, Axios, Framer Motion, Lucide |
| Backend      | Node.js 20, Express 4.18, TypeScript 5.3, ESM                |
| Backend libs| mysql2/promise, jsonwebtoken, bcrypt, multer, xlsx, zod, helmet, express-rate-limit, cookie-parser, node-cron, nodemailer |
| Database     | MySQL 8.0 with stored procedures, triggers, and views         |
| Web server   | Nginx 1.27 (TLS termination, rate-limit, security headers)    |
| Auth         | JWT (HS256) + httpOnly cookies + JTI revocation               |
| File uploads | Multer (disk storage, MIME whitelist, UUID filenames)         |
| Containerization | Docker + docker compose (multi-stage, non-root users)     |
| Tests        | Vitest (backend + frontend)                                   |

---

## Project Structure

```
.
├── backend/                          # Express + TypeScript API
│   ├── src/
│   │   ├── server.ts                 # App entry — helmet, CORS, rate-limit, routes, /health
│   │   ├── config/                   # env.ts, database.ts (mysql2 pool), loadEnv.ts
│   │   ├── controllers/              # 14 route handlers (auth, admin, leave, vaultify, …)
│   │   ├── services/                 # 9 services (BulkImport, Audit, Workflow, MasterCode, …)
│   │   ├── repositories/             # 8 repositories (BaseRepository + 7 typed)
│   │   ├── routes/                   # 10 route files (mounted under /api)
│   │   ├── middleware/               # auth, errorHandler, uploads, validate
│   │   ├── schemas/                  # Zod request-validation schemas
│   │   ├── scripts/seedAdmin.ts      # First-run SUPER_ADMIN seeder
│   │   └── utils/                    # cronJobs, initStorage, verifyTables, mailer, …
│   ├── uploads/                      # Runtime uploads (temp → vaultify/timetables)
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
├── frontend/                         # React + Vite SPA
│   ├── src/
│   │   ├── pages/                    # Route-level screens (17 pages)
│   │   ├── components/               # Layout, ErrorBoundary, admin/shared components
│   │   ├── contexts/AuthContext.tsx  # httpOnly-cookie based auth
│   │   ├── hooks/                    # useAuth, useAsync, useDepartments, useMasterCodes
│   │   ├── api/                      # auth, dashboard, leave, logs, products, users
│   │   └── utils/api.ts              # Axios instance (interceptors + 401 → /login)
│   ├── package.json
│   ├── vite.config.ts
│   └── Dockerfile
├── database/
│   ├── schema.sql                    # Idempotent schema + stored procedures + triggers
│   └── migrations/
│       ├── 001_add_auth_token_revocations.sql
│       ├── 002_foundation_rewrite.sql
│       └── 002_part2.sql
├── docs/
│   └── ARCHITECTURE.md               # Service-layer / migration operating manual
├── nginx/                            # Production nginx.conf + /certs mount point
├── docker-compose.yml                # 4 services: migration, mysql, backend, frontend, nginx
├── .env.example                      # All environment variables
├── DEPLOYMENT.md                     # Production deployment guide (server hardening, TLS, backups)
└── README.md                         # ← you are here
```

---

## Quick Start — with Docker

This is the recommended path. Docker handles the MySQL, migration, backend, frontend, and nginx containers for you.

### Prerequisites
- Docker Engine 20.10+ and Compose v2
- A local port 80/443 free (or change the nginx port mapping in `docker-compose.yml`)

### Steps

```bash
# 1. Clone
git clone <your-repo-url> faculty-management
cd faculty-management

# 2. Configure environment
cp .env.example .env
chmod 600 .env
```

Generate strong secrets (Linux/macOS):

```bash
echo "JWT_SECRET=$(openssl rand -base64 48)"          >> .env
echo "JWT_REFRESH_SECRET=$(openssl rand -base64 48)"  >> .env
echo "DB_PASSWORD=$(openssl rand -base64 32)"          >> .env
echo "MYSQL_ROOT_PASSWORD=$(openssl rand -base64 32)"  >> .env
echo "BULK_IMPORT_DEFAULT_PASSWORD=$(openssl rand -base64 16)" >> .env
```

Edit `.env` and fill in the SMTP block (`EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM`) if you want welcome emails to work. Without SMTP the app still runs — emails are silently skipped.

```bash
# 3. Build and start all services (mysql, migration, backend, frontend, nginx)
docker compose up -d --build

# 4. Watch the migration + backend logs
docker compose logs -f migration
docker compose logs -f backend
```

The `migration` service runs once, applies `database/schema.sql` and all `database/migrations/*.sql` files (idempotent), then exits. The `mysql` service stays up.

```bash
# 5. Create the first SUPER_ADMIN (interactive)
docker compose exec backend npm run seed:admin
```

You'll be prompted for: employee_id, name, email, password (≥12 chars), department, designation, and faculty_type_id (default 1 = Assistant Professor).

```bash
# 6. Verify
curl http://localhost/health
# → {"status":"OK","timestamp":"…"}

# 7. Open the portal
#    http://localhost           (production-style nginx)
#    http://localhost:5000      (direct backend, JSON API)
```

To stop everything:

```bash
docker compose down              # keep volumes
docker compose down -v           # ⚠ also wipes the database volume
```

---

## Quick Start — without Docker

Use this path if you want to run the stack directly on your machine (e.g. for development or because Docker is unavailable).

### Prerequisites
- **Node.js 20.x** (`node -v` should print `v20.x`)
- **npm 9+**
- **MySQL 8.0** running locally (or reachable over the network)
- `openssl` (for generating secrets)

### 1. Clone and configure

```bash
git clone <your-repo-url> faculty-management
cd faculty-management
cp .env.example .env
chmod 600 .env
```

Open `.env` and adjust:

```dotenv
# Point DB_HOST at your local MySQL (NOT "mysql", which is the docker-compose hostname)
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=faculty_management
DB_USER=faculty_app
DB_PASSWORD=your_local_mysql_password
MYSQL_ROOT_PASSWORD=your_local_mysql_root_password

# Generate with: openssl rand -base64 48
JWT_SECRET=…
JWT_REFRESH_SECRET=…

BULK_IMPORT_DEFAULT_PASSWORD=ChangeMeLater123!
```

Then create the database + user in MySQL (one-off):

```sql
CREATE DATABASE faculty_management CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'faculty_app'@'localhost' IDENTIFIED BY 'your_local_mysql_password';
GRANT ALL PRIVILEGES ON faculty_management.* TO 'faculty_app'@'localhost';
FLUSH PRIVILEGES;
```

### 2. Apply the schema and migrations

```bash
# Load the base schema (idempotent: CREATE TABLE IF NOT EXISTS, INSERT IGNORE, …)
mysql -h 127.0.0.1 -u root -p faculty_management < database/schema.sql

# Then load the migrations in order
mysql -h 127.0.0.1 -u root -p faculty_management < database/migrations/001_add_auth_token_revocations.sql
mysql -h 127.0.0.1 -u root -p faculty_management < database/migrations/002_foundation_rewrite.sql
mysql -h 127.0.0.1 -u root -p faculty_management < database/migrations/002_part2.sql
```

You can also run the bundled `database/migrate.sh` (designed for the docker `migration` service but works against any MySQL once you tweak the host):

```bash
DB_HOST=127.0.0.1 DB_USER=root DB_PASSWORD=… DB_NAME=faculty_management sh database/migrate.sh
```

### 3. Start the backend

```bash
cd backend
npm install
npm run dev
# → "Server running on http://localhost:5000"
```

The backend:
- Loads `.env` from the **repo root** (see `backend/src/config/loadEnv.ts`).
- Calls `validateEnvOnBoot()` and exits with a `[DEBUG ERROR]` line if any required env var is missing.
- Tests the DB connection and exits if it cannot reach MySQL.
- Runs `verifyTables()` to sanity-check vault/timetable tables.
- Calls `initializeStorage()` to create `backend/uploads/{vaultify,timetables,temp}`.
- Schedules cron jobs (monthly accrual, yearly accrual, carry-forward).

### 4. Seed the first admin (in a second terminal, same `backend/` dir)

```bash
cd backend
npm run seed:admin
```

### 5. Start the frontend

```bash
cd frontend
npm install
npm run dev
# → "Local: http://localhost:5173/"
```

Vite's dev server proxies `/api/*` to `http://localhost:5000` (configured in `frontend/vite.config.ts`, override with `VITE_API_PROXY_TARGET`).

Open <http://localhost:5173> and log in with the SUPER_ADMIN credentials you just created.

---

## Environment Variables

All variables live in a single `.env` at the **repo root**. The backend loads it via `backend/src/config/loadEnv.ts`; the frontend reads it at Vite build time (variables must be prefixed `VITE_`).

### Server

| Variable | Default | Required | Purpose |
|---|---|---|---|
| `PORT` | `5000` | ✅ | Backend HTTP port |
| `NODE_ENV` | `production` | ✅ | Express mode (sets helmet CSP, hides internal error messages, etc.) |
| `JSON_BODY_LIMIT` | `5mb` | ❌ | Max JSON payload size |
| `TRUST_PROXY` | `1` | ❌ | `1` = trust the first proxy hop (nginx). Required for correct `req.ip` and rate-limiting behind nginx |

### MySQL

| Variable | Default | Required | Purpose |
|---|---|---|---|
| `DB_HOST` | `mysql` (docker) / `127.0.0.1` (bare) | ✅ | DB hostname — **must match your setup** |
| `DB_PORT` | `3306` | ✅ | DB port |
| `DB_NAME` | `faculty_management` | ✅ | DB name |
| `DB_USER` | `faculty_app` | ✅ | DB user (the app connects as this user) |
| `DB_PASSWORD` | — | ✅ | Password for `DB_USER` |
| `MYSQL_ROOT_PASSWORD` | — | ✅ (docker) | Root password — only used by docker-compose to bootstrap `faculty_app`. The app itself never connects as root |

### JWT

| Variable | Default | Required | Purpose |
|---|---|---|---|
| `JWT_SECRET` | — | ✅ | Access-token signing secret. **MUST** be a long random value. Rotate to invalidate all access tokens |
| `JWT_REFRESH_SECRET` | — | ✅ | Refresh-token signing secret. Use a **different** value from `JWT_SECRET` |
| `JWT_EXPIRES_IN` | `1h` | ❌ | Access-token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | ❌ | Refresh-token lifetime |

Generate with: `openssl rand -base64 48`.

### SMTP (optional but recommended in production)

| Variable | Default | Required | Purpose |
|---|---|---|---|
| `EMAIL_HOST` | — | ❌ | SMTP host (e.g. `smtp.gmail.com`, `smtp.sendgrid.net`) |
| `EMAIL_PORT` | `587` | ❌ | SMTP port |
| `EMAIL_SECURE` | `false` | ❌ | `true` for port 465 (TLS); `false` for STARTTLS |
| `EMAIL_USER` | — | ❌ | SMTP username |
| `EMAIL_PASS` | — | ❌ | SMTP password (use an app password, not your account password) |
| `EMAIL_FROM` | — | ❌ | `From:` address shown in emails |

If left blank, the mailer silently no-ops and bulk-import / password-reset emails are skipped. **The app still works** — emails are best-effort.

### Uploads / Bulk import

| Variable | Default | Required | Purpose |
|---|---|---|---|
| `MAX_UPLOAD_MB` | `25` | ❌ | Max upload size in MB. Must be in sync with `nginx.conf` → `client_max_body_size` |
| `BULK_IMPORT_DEFAULT_PASSWORD` | — | ✅ | Default password assigned to every user created via the Excel bulk import. Users are forced to reset it on first login |

### CORS

| Variable | Default | Required | Purpose |
|---|---|---|---|
| `CORS_ORIGIN` | *(empty)* | ❌ | Comma-separated allowlist of origins for cross-origin API calls. Leave empty if the SPA and backend share an origin (recommended) |

### Frontend (Vite — baked at build time)

| Variable | Default | Required | Purpose |
|---|---|---|---|
| `VITE_API_BASE_URL` | *(empty)* | ❌ | Absolute backend URL used by the Axios instance. **Leave empty** to use the same-origin `/api` (the default and recommended setting) |
| `VITE_API_PROXY_TARGET` | `http://localhost:5000` | ❌ | Dev-only: where Vite's dev server proxies `/api/*` to |
| `VITE_DEV_SERVER_PORT` | `5173` | ❌ | Port for `npm run dev` inside `frontend/` |

### Production-only host ports (compose)

| Variable | Default | Purpose |
|---|---|---|
| `APP_BACKEND_PORT` | `5000` | Localhost port the backend container publishes to (compose only) |
| `APP_FRONTEND_PORT` | `8080` | Localhost port for the standalone frontend container (compose only) |

> Variables prefixed with `${VAR:?...}` in `docker-compose.yml` **abort the boot** if the env var is missing or empty. Treat those as hard requirements.

---

## Seeding the First Admin

The repo intentionally ships **without** any default credentials. You create the first `SUPER_ADMIN` with an interactive script that lives in the backend container.

```bash
# Docker
docker compose exec backend npm run seed:admin

# Bare-metal
cd backend && npm run seed:admin
```

The script (`backend/src/scripts/seedAdmin.ts`) prompts for:

| Prompt | Default | Notes |
|---|---|---|
| `Employee ID` | — | Required, unique |
| `Full name` | — | Required |
| `Email` | — | Required, unique, must be a valid email |
| `Department` | — | Required |
| `Designation` | — | Required |
| `Faculty type id` | `1` (Assistant Professor) | Must be an active `faculty_types.id` |
| `Password` | — | **Minimum 12 characters**. Hashed with bcrypt cost 12 |
| `Confirm password` | — | Must match |

What it does:

1. Validates all required env vars are present (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`).
2. Verifies the `SUPER_ADMIN` role and the chosen `faculty_type` exist.
3. Hashes the password with **bcrypt cost 12** and inserts a row into `faculty` with `approved=TRUE, active=TRUE, force_password_reset=FALSE`.
4. Calls the stored procedure `sp_assign_default_leaves(faculty_id)` to seed initial leave balances.
5. Prints a confirmation line — **clear your shell scrollback** afterwards.

> ⚠ The script does **not** update an existing user. If you need to reset a password, use the admin UI or run an `UPDATE faculty SET password_hash = …` directly.

### Seeding additional admins

Once the first SUPER_ADMIN exists, log in to the portal and use **Admin → Users → Create User** (or **Bulk Import**, see below). The seed script is intentionally limited to first-run only.

---

## Managing Faculty Types

Faculty types drive the leave rules (`leave_rules.faculty_type_id`). The system ships with six seeded types:

| `id` | Name | Category | Default leave entitlements |
|---|---|---|---|
| 1 | Assistant Professor | Teaching | CL, EL, ML, AL, RH |
| 2 | Associate Professor | Teaching | CL, EL, ML, AL, RH |
| 3 | Professor | Teaching | CL, EL, ML, AL, RH |
| 4 | Lab Assistant | NonTeaching | CL, EL, ML, RH |
| 5 | Visiting Faculty | Visiting | CL, RH |
| 6 | Contract Faculty | Contract | CL, EL, ML, RH |

### Add a new faculty type

1. **Insert the row** in `faculty_types`:
   ```sql
   INSERT INTO faculty_types (name, category, description, active)
   VALUES ('Adjunct Faculty', 'Visiting', 'Industry-experienced adjuncts', TRUE);
   ```
   `category` must be one of `Teaching`, `NonTeaching`, `Contract`, `Visiting` (the column is an ENUM — if you need a new category, alter the ENUM first).

2. **Define its leave rules** by inserting one row per leave type you want to grant:
   ```sql
   INSERT INTO leave_rules
     (faculty_type_id, leave_type_id, accrual_rate, accrual_period,
      max_balance, carry_forward, probation_excluded, min_service_months)
   VALUES
     (7, 1, 1.0,  'MONTHLY', 12, FALSE, FALSE, 0),  -- CL
     (7, 2, 1.5,  'MONTHLY', 180, TRUE,  FALSE, 0),  -- EL
     (7, 7, 0.16, 'MONTHLY',  2, FALSE, FALSE, 0);  -- RH
   ```
   Look up `leave_types.id` values in the `leave_types` table. See `database/schema.sql` lines 232–240 for the full list.

3. **(Optional) Add the new code to `master_codes`** if you want it visible in dropdowns built from the unified code table:
   ```sql
   INSERT INTO master_codes (category, code, name, display_order)
   VALUES ('faculty_type_category', 'Adjunct', 'Adjunct', 50)
   ON DUPLICATE KEY UPDATE name = VALUES(name);
   ```

4. **Verify** the new type appears:
   - `GET /api/auth/faculty-types` returns the list (used by the signup + admin create-user pages).
   - `GET /api/admin/users/sample-format` returns a bulk-import template that includes the new `id` in its `Instructions` sheet.

### Remove a faculty type

You can only safely remove a type that is **not** referenced by any `faculty.faculty_type_id` row.

```sql
-- 1. Find any users still pointing at it
SELECT id, employee_id, name, email
FROM faculty
WHERE faculty_type_id = 5;  -- example: Visiting Faculty

-- 2a. Reassign them to a different type
UPDATE faculty SET faculty_type_id = 1 WHERE faculty_type_id = 5;

-- 2b. OR mark them inactive / move department before deletion
UPDATE faculty SET active = FALSE WHERE faculty_type_id = 5;

-- 3. Soft-disable the type (do NOT hard-delete — leave_rules will FK-fail)
UPDATE faculty_types SET active = FALSE WHERE id = 5;
```

The bulk-import template, signup form, and `GET /api/auth/faculty-types` automatically stop returning it once `active = FALSE`.

### Promote a category ENUM (e.g. add `Emeritus`)

The `faculty_types.category` column is a MySQL ENUM. Adding a new category requires an `ALTER TABLE` that may rewrite the table on large datasets — do it during a maintenance window:

```sql
ALTER TABLE faculty_types
  MODIFY COLUMN category ENUM('Teaching','NonTeaching','Contract','Visiting','Emeritus') NOT NULL;

-- Then update master_codes
INSERT INTO master_codes (category, code, name, display_order) VALUES
  ('faculty_type_category', 'Emeritus', 'Emeritus', 50);
```

---

## Managing Leave Types

The leave types live in the `leave_types` table and are seeded in `database/schema.sql`:

| `id` | Code | Name | Accrual | Max balance | Gender | Notes |
|---|---|---|---|---|---|---|
| 1 | CL  | Casual Leave | 1.0 / month | 12  | All | |
| 2 | EL  | Earned Leave | 2.5 / month | 300 | All | Carry-forward allowed |
| 3 | ML  | Medical Leave | 1.66 / month | 20  | All | |
| 4 | MAT | Maternity Leave | 180 one-time | 180 | Female | 12-month min service |
| 5 | PAT | Paternity Leave | 15 one-time | 15 | Male | 6-month min service |
| 6 | AL  | Academic Leave | 1.25 / month | 15 | All | Probation excluded, 6-month min service |
| 7 | RH  | Restricted Holiday | 0.16 / month | 2 | All | |
| 8 | OD  | On Duty | one-time | — | All | |

### Add a new leave type

```sql
INSERT INTO leave_types
  (name, code, description, accrual_rate, accrual_period, max_balance,
   carry_forward, probation_excluded, min_service_months, gender_restriction, active)
VALUES
  ('Compensatory Leave', 'CO',
   'Compensation for extra working days',
   1.0, 'MONTHLY', 12, FALSE, FALSE, 0, 'ALL', TRUE);
```

Then add a `leave_rules` row for every `faculty_types.id` that should get it (see "Add a new faculty type" above for the pattern).

### Remove a leave type

```sql
-- 1. Re-check references
SELECT * FROM leave_rules WHERE leave_type_id = 8;   -- rules
SELECT * FROM leave_balances WHERE leave_type_id = 8; -- balances
SELECT * FROM leave_applications WHERE leave_type_id = 8;

-- 2. Soft-disable (preferred — preserves history)
UPDATE leave_types SET active = FALSE WHERE id = 8;

-- 3. Hard-delete (only after the soft-disable grace period)
DELETE FROM leave_rules     WHERE leave_type_id = 8;
DELETE FROM leave_balances  WHERE leave_type_id = 8;
DELETE FROM leave_applications WHERE leave_type_id = 8;
DELETE FROM leave_types     WHERE id = 8;
```

---

## Bulk Import (Excel)

The bulk-import feature lets an ADMIN / SUPER_ADMIN onboard dozens of users at once. It's exposed as two endpoints under `/api/admin/users`:

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/admin/users/sample-format` | Returns a two-sheet Excel template (Users + Instructions) |
| `POST` | `/api/admin/users/bulk-import`   | Accepts the filled template and creates users |

### Step 1 — download the template

In the admin UI: **Admin → Users → "Download Excel template"**, or call:

```bash
curl -b cookies.txt -o faculty_bulk_import_template.xlsx \
  http://localhost:5000/api/admin/users/sample-format
```

The template has two sheets:

- **Users** — the columns the importer reads.
- **Instructions** — human-readable column definitions, the list of valid `faculty_type_id` values (pulled live from the DB), and the role list.

### Step 2 — fill the template

Required columns (header names are case-insensitive — both `Employee ID` and `employee_id` work):

| Column | Required | Format | Example |
|---|---|---|---|
| `employee_id` | ✅ | Unique alphanumeric | `EMP001` |
| `name` | ✅ | Text, ≤ 100 chars | `Jane Doe` |
| `email` | ✅ | Valid email, unique | `jane.doe@example.com` |
| `department` | ✅ | Text, ≤ 100 chars | `Computer Science` |
| `designation` | ✅ | Text, ≤ 100 chars | `Assistant Professor` |
| `faculty_type_id` | ✅ | Numeric id from the **Instructions** sheet | `1` |
| `joining_date` | ✅ | `YYYY-MM-DD` or `DD/MM/YYYY` | `2024-01-15` |
| `gender` | ❌ | `MALE`, `FEMALE`, `OTHER` | `FEMALE` |
| `experience_years` | ❌ | Non-negative integer | `3` |
| `qualification` | ❌ | Text, ≤ 255 chars | `M.Tech` |
| `role` | ❌ | `FACULTY`, `HOD`, `ADMIN`, `SUPER_ADMIN` (default `FACULTY`) | `FACULTY` |

> Each `joining_date` is stored as the user's `doj` (date of joining), which drives probation and minimum-service leave checks.

### Step 3 — upload

```bash
curl -b cookies.txt \
  -F "file=@faculty_bulk_import_template.xlsx" \
  http://localhost:5000/api/admin/users/bulk-import
```

Under the hood, the controller (`backend/src/controllers/bulkImportController.ts`):

1. Validates the upload is an Excel file (`.xls` or `.xlsx`), ≤ 10 MB, exactly one file.
2. Parses the **first sheet** with `xlsx` (`XLSX.readFile`).
3. For each row, validates `employee_id`, `name`, and `email`; collects `{ row, error }` for invalid rows.
4. Opens a single MySQL transaction and inserts valid rows into `faculty` with:
   - `password_hash = bcrypt(BULK_IMPORT_DEFAULT_PASSWORD, cost=10)`
   - `role_id = (SELECT id FROM roles WHERE name = 'FACULTY')`
   - `faculty_type_id = 1` (default) — *Note: the controller currently doesn't read `faculty_type_id` from the row; if you need it honored, extend `BulkImportService.importUsers` and add the column to the `INSERT`.*
   - `imported = TRUE`
   - `force_password_reset = TRUE` — the user is forced to reset on first login.
5. For each inserted user, calls the stored procedure `sp_assign_default_leaves(faculty_id)`. If the SP returns a non-`OK` diagnostic, the row is added to `leaveWarnings` (not a fatal error).
6. Sends a welcome email (best-effort, silently skipped on failure) with the default password.
7. Writes a single `BULK_IMPORT_USERS` entry to `audit_logs` and `admin_logs`.

### Step 4 — read the response

```json
{
  "message": "Imported 47 users. 2 user(s) have leave warnings.",
  "totalRows": 50,
  "successCount": 47,
  "failedCount": 3,
  "leaveWarningCount": 2,
  "errors": [
    { "row": 5,  "error": "Invalid email: \"foo\"" },
    { "row": 12, "error": "Missing name" },
    { "row": 23, "error": "Duplicate entry: jane@example.com or EMP014" }
  ],
  "leaveWarnings": [
    { "row": 8,  "email": "alex@example.com", "warning": "NO_RULES_DEFINED — No leave rules are defined for faculty_type_id=1." }
  ]
}
```

### Operational notes

- `BULK_IMPORT_DEFAULT_PASSWORD` is **the same for every user** in the import. Force a password reset (`force_password_reset = TRUE`) on first login.
- Welcome emails silently fail if SMTP is not configured. Users can still log in with the default password from your own tracking sheet — print or save it before uploading.
- The whole import is one transaction. If a row triggers a `ER_DUP_ENTRY` (duplicate `employee_id` or `email`), only that row is recorded as a failure; valid rows still commit.
- Re-importing the same file is safe: duplicates are caught and reported. No `ON DUPLICATE KEY UPDATE` is performed.

---

## Error Logging & Troubleshooting

The codebase uses plain `console.*` with structured prefixes (no Winston / Pino, despite `winston` being listed as a dependency). Each subsystem has its own prefix:

| Prefix | Source | What it means |
|---|---|---|
| `[OK]` | server, db, storage | Success message |
| `[DEBUG ERROR]` | server, db, auth, env | Something is wrong — read the next line for details |
| `[WARN]` | server, verifyTables | Non-fatal issue (e.g. optional table missing) |
| `[CRON]` | cronJobs | Cron job lifecycle (start / done / failure) |
| `[ENV]` | loadEnv | Where the `.env` was loaded from, or that it was missing |
| `[UNHANDLED ERROR]` | errorHandler | An error that wasn't a known `AppError`, Zod error, MySQL error, Multer error, or JWT error. Always followed by a 500 to the client |
| `[DB]`, `[Host]` | database.ts | Connection diagnostics |

### Where to look

```bash
# Docker
docker compose logs -f backend       # all backend output
docker compose logs -f migration     # schema/migration output
docker compose logs -f mysql         # DB engine logs

# Bare-metal
# All backend output is on stdout/stderr of the `npm run dev` (or `npm start`) process
```

### Common boot-time errors and fixes

| Symptom in logs | Cause | Fix |
|---|---|---|
| `Missing required environment variable: JWT_SECRET — check .env file…` | `JWT_SECRET` not set in `.env` | Add it to repo-root `.env` and restart |
| `JWT_SECRET environment variable may be missing or empty — check .env file.` | Same, but caught inside the auth middleware | Same as above |
| `DB host "mysql" refused connection` | docker: MySQL container not ready yet, or you set `DB_HOST=mysql` on bare metal | Wait, or change `DB_HOST` to `127.0.0.1` for bare-metal |
| `DB host "127.0.0.1" not found` | MySQL is not running locally | Start MySQL: `net start MySQL80` (Windows) / `brew services start mysql@8.0` (macOS) / `sudo systemctl start mysql` (Linux) |
| `Database "faculty_management" does not exist` | Schema not applied | Re-run `database/schema.sql` (idempotent) |
| `Port 5000 is already in use` | Another process bound to 5000 | Set `PORT=5050` in `.env` and update nginx's `proxy_pass` / `VITE_API_PROXY_TARGET` |
| `JWT verification failed — invalid or tampered token. Check JWT_SECRET matches between backend builds.` | You redeployed with a different `JWT_SECRET` and the client still has a token from the old secret | Users must log in again. Tell them, or roll back the secret |
| `jwt expired` (in client console) | The 1-hour access token expired; the client should call `/api/auth/refresh` automatically | If refresh also fails, the user is logged out — they must log in again |
| `[CRON] Monthly leave accrual failed: …` | Stored procedure threw | Read the SQLSTATE/message; usually a missing `leave_rules` row for a `faculty_type_id`. Add the rule or fix the type |
| `[UNHANDLED ERROR]` with no obvious cause | Code path that doesn't throw an `AppError` | Check the full stack trace in the line directly above the `[UNHANDLED ERROR]` line; this is the central handler's catch-all |

### Stored-procedure diagnostic codes

`sp_assign_default_leaves` and `sp_apply_leave` return a single-row result set you can read to understand why a leave was rejected or a balance is 0:

| `status` | Source | Meaning | Fix |
|---|---|---|---|
| `OK` | sp_assign_default_leaves | Leave balances were inserted | — |
| `FACULTY_NOT_FOUND` | sp_assign_default_leaves | The supplied `faculty_id` doesn't exist | Don't call the SP for non-existent users |
| `NO_RULES_DEFINED` | sp_assign_default_leaves | No `leave_rules` row for this `faculty_type_id` | Add a `leave_rules` row (see "Managing Faculty Types") |
| `GENDER_NOT_ELIGIBLE` | sp_apply_leave (OUT param) | Leave type has a gender restriction that doesn't match the user (e.g. maternity for a male) | User picked the wrong leave type |
| `PROBATION_PERIOD` | sp_apply_leave | The rule has `probation_excluded = TRUE` and the user is < 6 months in | Wait until 6 months of service |
| `MIN_SERVICE_NOT_MET` | sp_apply_leave | User's service months < `min_service_months` for this rule | Wait, or adjust the rule |
| `INSUFFICIENT_BALANCE` | sp_apply_leave | `(balance - reserved) < total_days` | Reduce the request or accrue more |
| `OVERLAPPING_LEAVE` | sp_apply_leave | An existing PENDING/APPROVED application overlaps the requested dates | Cancel the overlap or pick different dates |
| `SUCCESS` | sp_apply_leave (OUT param) | Application inserted | — |

### Looking at the audit trail

Two tables log admin actions, both queryable by SUPER_ADMIN:

```sql
-- Legacy
SELECT * FROM admin_logs ORDER BY created_at DESC LIMIT 50;

-- New unified audit
SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 50;
```

The bulk import writes one `BULK_IMPORT_USERS` entry per import. Soft-deletes write `user.soft_deleted`. Permission denials write `DENIED_ROLE_ESCALATION`.

---

## Available Scripts

### Backend (`backend/`)

| Script | What it does |
|---|---|
| `npm run dev` | Run with `tsx watch src/server.ts` — auto-reload on file changes |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled `dist/server.js` (used in Docker) |
| `npm test` | Run Vitest once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:coverage` | Vitest with V8 coverage report |
| `npm run seed:admin` | Interactive SUPER_ADMIN seeder |

### Frontend (`frontend/`)

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server on port 5173 with `/api` proxy |
| `npm run build` | Type-check + production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run Vitest once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:coverage` | Vitest with V8 coverage report |

### Database (`database/migrate.sh`)

The bundled migration script (used by the docker `migration` service) is also runnable by hand against any MySQL host by exporting the env vars first.

---

Quick checklist before going live:

- [ ] `NODE_ENV=production`
- [ ] All `JWT_*` and DB passwords replaced with `openssl rand -base64 48`
- [ ] `BULK_IMPORT_DEFAULT_PASSWORD` set to a strong unique value
- [ ] SMTP credentials filled in (welcome emails + password resets)
- [ ] TLS certificates in `nginx/certs/`
- [ ] Firewall: only 22, 80, 443 open
- [ ] MySQL port **not** published to the host (it isn't, by default)
- [ ] Daily `mysqldump` to a separate host, retained 30+ days
- [ ] `docker compose ps` shows all services `(healthy)`
- [ ] `curl https://<your-domain>/health` returns `{"status":"OK"}`
- [ ] Uptime monitoring (UptimeRobot, Healthchecks.io) on `/health`

---

## Architecture Reference

For a deep dive on the service-layer / migration / workflow design, see **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)**. It covers:

- The "two surfaces" model (legacy ENUMs + new `master_codes`)
- The four default workflows (`LEAVE`, `PRODUCT_REQUEST`, `FORM_SUBMISSION`, `TIMETABLE`)
- How `MasterCodeService`, `DepartmentService`, `AuditService`, `WorkflowService`, and `LeaveRuleService` interact
- Soft-delete behavior (no more `DELETE`s from production tables)
- The dormant multi-tenant foundation (`organizations`, `campuses`, `organization_id`)

---
