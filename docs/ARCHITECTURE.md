# Architecture & Big-Bang Rewrite — Operating Manual

This document explains the structural shape of the codebase **after** the
big-bang rewrite, and how the new and legacy surfaces coexist. It is
intended for the next engineer who has to maintain or extend the system.

---

## 1. Bird's-eye view

```
                            ┌────────────────────────────────┐
                            │       SPA (React, Vite)         │
                            │  - Pages, hooks, ErrorBoundary   │
                            │  - useMasterCodes / useDept hooks│
                            └────────────────┬───────────────┘
                                             │ HTTPS / httpOnly cookies
                                             ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │                    nginx (TLS, rate-limit, gzip)                  │
   │   - HTTPS redirect, HSTS, security headers, /api → backend:5000   │
   └─────────────────────────────┬───────────────────────────────────┘
                                 │ internal Docker network
                                 ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │  Backend (Node 20 + Express + TypeScript)                       │
   │  ┌──────────────┐  ┌────────────────┐  ┌────────────────────┐   │
   │  │  middleware   │  │   routes/      │  │   services/         │   │
   │  │  - auth       │  │  - index.ts     │  │  - MasterCode       │   │
   │  │  - errorHandler│  │  - masterCodes │  │  - Department       │   │
   │  │  - uploads    │  │  - departments │  │  - Audit            │   │
   │  │  - rate limit │  │  - auditLogs   │  │  - Workflow         │   │
   │  │  - helmet     │  │  - workflows   │  │  - LeaveRule        │   │
   │  └──────────────┘  │  - adminUserRts │  │  - (... more)       │   │
   │                     │  - auth ctrl    │  │                     │   │
   │                     └────────────────┘  └────────────────────┘   │
   │  ┌──────────────┐  ┌────────────────┐  ┌────────────────────┐   │
   │  │  controllers/ │  │   config/      │  │     utils/          │   │
   │  │  (legacy SP-  │  │  - database    │  │  - mailer, timeFmt, │   │
   │  │   based)      │  │  - env, loadEnv │  │  - pagination, ...  │   │
   │  └──────────────┘  └────────────────┘  └────────────────────┘   │
   └─────────────────────────────┬───────────────────────────────────┘
                                 │ mysql2 prepared statements
                                 ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │                MySQL 8.0 (persistent volume)                     │
   │  Legacy tables (kept)        New tables (added by migration 002)│
   │  - faculty, leave_rules,     - master_codes, departments,        │
   │    leave_applications, ...     organizations, campuses,         │
   │  - sp_* stored procedures      audit_logs, workflow_*,          │
   │                                 rule_conditions, rule_actions,  │
   │                                 leave_rule_versions,            │
   │                                 leave_rule_version_actions,    │
   │                                 faculty.marked_for_purge_after, │
   │                                 faculty.organization_id,        │
   │                                 faculty.department_id          │
   └─────────────────────────────────────────────────────────────────┘
```

---

## 2. The "two surfaces" model    

For the duration of the rewrite, every business concept has **two** ways
to be addressed:

| Concept       | Legacy surface                                  | New surface                              |
|---------------|--------------------------------------------------|------------------------------------------|
| **Lookups**  | MySQL `ENUM` columns, hard-coded role strings    | `master_codes` table, `MasterCodeService` |
| **Departments** | `faculty.department VARCHAR(100)` free text    | `departments` table, `DepartmentService`  |
| **Audit**    | `admin_logs` + `faculty_activity_logs` tables    | Unified `audit_logs` table, `AuditService` |
| **Approvals**| Per-entity `status` columns updated by controllers| `workflow_definitions/steps/instances/assignments`, `WorkflowService` |
| **Leave rules** | `leave_rules` columns (`accrual_rate`, ...)    | `rule_conditions` + `rule_actions`, `LeaveRuleService` |
| **Leave versions** | None                                   | `leave_rule_versions` + `leave_rule_version_actions` |
| **User delete** | `sp_permanent_delete_user` (real DELETE)         | Soft delete via `marked_for_purge_after` |
| **Multi-tenant** | Single-tenant (no `organization_id`)          | `organizations` + `campuses`, `organization_id` on every business table |

**Both surfaces are populated for every action.** This is the
backward-compatibility guarantee: the existing endpoints work without
modification, while the new surface gains ground under the hood.

---

## 3. What lands when — the migration story

The migration is split across **two SQL files** to keep each step
reversible:

| File                       | What it adds                                                                         | Reversible? |
|----------------------------|--------------------------------------------------------------------------------------|-------------|
| `001_add_auth_token_revocations.sql` | `auth_token_revocations`, `password_reset_tokens` tables; `auth_tokens.jti` | Yes — the columns are nullable and additive. |
| `002_foundation_rewrite.sql` + `002_part2.sql` | All other new tables, all seeded data, all backfilled `audit_logs` and `rule_*` from the legacy tables. New columns on `faculty` are nullable. | Yes — nothing is dropped or truncated. |

Both files use `CREATE TABLE IF NOT EXISTS`, `INSERT IGNORE`, and
information-schema-guarded `ALTER TABLE` so re-running is safe.

### Migration order

```
schema.sql           # the legacy baseline (unchanged)
+ 001_*.sql          # adds the auth-token revocation infrastructure
+ 002_foundation_*.sql
+ 002_part2.sql      # the rest of the new tables + backfills
```

The legacy `DROP TABLE IF EXISTS` block at the top of `schema.sql` is
left in place for greenfield installs. **Do not run `schema.sql` against
an existing production database** — that wipes data. Use the migration
files instead.

---

## 4. The service layer — the heart of the rewrite

```
backend/src/services/
├── MasterCodeService.ts       # Master codes (lookups)
├── DepartmentService.ts       # Departments (normalized)
├── AuditService.ts            # Unified audit (dual-write)
├── WorkflowService.ts         # Approval workflow engine
└── LeaveRuleService.ts        # Extensible leave-rule engine
```

### 4.1 MasterCodeService

The single source of truth for "what codes are valid for category X".

- `MasterCodeService.listByCategory(category, includeInactive?)` — used by the frontend to populate dropdowns.
- `MasterCodeService.assertActive(category, code)` — throws `AppError(400)` if a code is unknown or inactive. Use this at request boundaries to validate form input.
- `MasterCodeService.asMap(category)` — returns a plain `{code: name}` object. Convenient for backend lookups.

The existing ENUMs in the database are kept; this is a parallel
authoritative source that the application is gradually adopting.

### 4.2 DepartmentService

Reads and writes to the new `departments` table; resolves the legacy
free-text `faculty.department` column to a `department_id`.

- `DepartmentService.list(orgId, includeInactive?)`
- `DepartmentService.getById(id)` / `getByCode(code, orgId)`
- `DepartmentService.resolveId(input, orgId)` — accepts id, code, or name and returns the id (or null)
- `DepartmentService.create({code, name, orgId})` — idempotent
- `DepartmentService.deactivate(id)` — soft delete (sets `active = FALSE`)

The migration pre-populates `departments` from any non-empty distinct
values of `faculty.department` and backfills `faculty.department_id`.

### 4.3 AuditService

Writes to **both** `audit_logs` and `admin_logs` during the migration
period. The application reads from `admin_logs` (existing API) and
`audit_logs` (new API).

```ts
await AuditService.logFromRequest(req, {
  action: 'user.soft_deleted',
  entityType: 'faculty',
  entityId: id,
  entityLabel: 'user@example.com',
  beforeState: { active: true, deleted: false },
  metadata: { reason: 'GDPR data subject request' }
});
```

`AuditService.list({...})` paginates and filters the new table for the
`/api/audit-logs` endpoint.

### 4.4 WorkflowService

A minimal but extensible approval engine.

```ts
const { instanceId } = await WorkflowService.start(req, {
  workflowCode: 'LEAVE',
  entityType: 'leave_application',
  entityId: 42
});
// Later:
const { status } = await WorkflowService.act(req, instanceId, 'APPROVE', 'Looks good');
```

The default `LEAVE` workflow has two steps (HOD then ADMIN). The
default `PRODUCT_REQUEST`, `FORM_SUBMISSION`, and `TIMETABLE` workflows
have a single ADMIN step. The role-based assignment expansion is
implemented for `assignee_type = 'ROLE'`.

### 4.5 LeaveRuleService

The new `rule_conditions` + `rule_actions` shape, plus rule versioning.

```ts
const evaluated = await LeaveRuleService.evaluateForFaculty(profile, leaveTypeId);
const matched = evaluated.find((r) => r.matched);
const rate = Number(matched?.actionMap.ACCRUAL_RATE ?? 0);
```

The legacy `leave_rules` columns are still the source of truth for
**active rules** until each rule is migrated; the service transparently
falls back to them when no `rule_conditions`/`rule_actions` exist for a
given rule.

---

## 5. Auth — the most critical part

`backend/src/middleware/auth.ts`:

- **Server-authoritative.** On every request, the user is re-read from the
  database; the role from the JWT is discarded. This means role changes
  take effect on the next request, not on the next access-token refresh.
- **JTI-based revocation.** The access token's `jti` is checked against
  `auth_token_revocations` so logout / force-logout take effect
  immediately, even before the access token's `exp`.
- **Cookie-friendly.** The middleware also accepts the access token via
  the `accessToken` httpOnly cookie, in addition to the `Authorization:
  Bearer ...` header. The login endpoint sets both.
- **Role-escalation guard** lives in `adminUserController.createUser`,
  `updateUser`, and `promoteUser`. Only a SUPER_ADMIN can grant or
  revoke SUPER_ADMIN. All denied attempts are logged to
  `admin_logs.action_type = 'DENIED_ROLE_ESCALATION'`.

---

## 6. Soft delete — no more `DELETE`

Per area 8 of the rewrite, **nothing is `DELETE`d from the production
tables anymore.** The legacy `sp_permanent_delete_user` procedure is
still callable for backwards compatibility with the stored-procedure
shape, but the application-layer wrappers
(`adminUserController.permanentDelete` and `bulkPermanentDelete`) now
soft-delete:

```sql
UPDATE faculty
SET deleted = TRUE,
    deleted_at = NOW(),
    active = FALSE,
    marked_for_purge_after = DATE_ADD(NOW(), INTERVAL 7 YEAR)
WHERE id = ?;
```

A future monthly cron job can `DELETE FROM faculty WHERE
marked_for_purge_after < NOW()` for true GDPR-style right-to-be-forgotten
purge, but that's a separate operational decision.

---

## 7. Multi-tenant — present but dormant

The migration adds:

- `organizations` (with one default row: `(1, 'DEFAULT', ...)`)
- `campuses`
- `organization_id INT NOT NULL DEFAULT 1` on `faculty`

The application uses `organization_id = 1` everywhere; the column exists
as a foundation for future multi-tenant work. **Multi-tenant
query-rewriting is NOT in this rewrite.** When the day comes to
partition by organization, the pattern is:

1. Add a `X-Organization-Id` header.
2. Have `authenticate` middleware read it and put it on `req.user.organizationId`.
3. Wrap all queries in a `QueryBuilder` (TBD) that appends `AND organization_id = ?` automatically.

---

## 8. Endpoints introduced by the rewrite

All are additive — they don't break anything that exists:

| Method | Path                                | Notes                                  |
|--------|-------------------------------------|----------------------------------------|
| GET    | `/api/master-codes`                 | List categories                         |
| GET    | `/api/master-codes/:category`       | List codes for a category              |
| GET    | `/api/master-codes/:category/:code` | Single code                            |
| POST   | `/api/master-codes`                 | SUPER_ADMIN; create code               |
| GET    | `/api/departments`                  | List departments                       |
| GET    | `/api/departments/:id`              | Single department                      |
| POST   | `/api/departments`                  | SUPER_ADMIN; create department         |
| DELETE | `/api/departments/:id`             | SUPER_ADMIN; soft delete               |
| GET    | `/api/audit-logs`                   | ADMIN/SUPER_ADMIN; paginated audit      |
| POST   | `/api/workflows/start`              | Start a workflow instance              |
| POST   | `/api/workflows/:instanceId/act`    | APPROVE / REJECT / SKIP                |
| GET    | `/api/workflows/pending`            | Pending for the caller's role          |
| GET    | `/api/workflows/:instanceId`        | Full state of an instance              |

---

## 9. Files added (whole-file)

| File                                             | Purpose                                       |
|--------------------------------------------------|-----------------------------------------------|
| `backend/src/services/MasterCodeService.ts`      | Unified code lookup service                  |
| `backend/src/services/DepartmentService.ts`      | Normalized department service                |
| `backend/src/services/AuditService.ts`           | Dual-write audit service                     |
| `backend/src/services/WorkflowService.ts`        | Approval workflow engine                     |
| `backend/src/services/LeaveRuleService.ts`       | Extensible leave-rule + versioning           |
| `backend/src/routes/masterCodes.ts`              | HTTP routes for master codes                 |
| `backend/src/routes/departments.ts`              | HTTP routes for departments                  |
| `backend/src/routes/auditLogs.ts`                | HTTP routes for audit                        |
| `backend/src/routes/workflows.ts`                | HTTP routes for workflows                    |
| `database/migrations/002_foundation_rewrite.sql` | Foundation tables + seed data                |
| `database/migrations/002_part2.sql`              | Continuation of 002                          |
| `frontend/src/hooks/useMasterCodes.ts`            | Frontend code lookup hook                    |
| `frontend/src/hooks/useDepartments.ts`            | Frontend department hook                     |

---

## 10. Files modified (key call-sites only — full diff in git)

- `backend/src/middleware/auth.ts` — server-authoritative, JTI check, cookie extraction
- `backend/src/middleware/errorHandler.ts` — already created in the security pass
- `backend/src/routes/index.ts` — wires in the new routers
- `backend/src/controllers/adminUserController.ts` — soft-delete in `permanentDelete` and `bulkPermanentDelete`

---

## 11. Rollout / cutover plan

1. **Apply migration 001** (no app changes required).
2. **Apply migration 002** (no app changes required; the new tables exist alongside the old ones).
3. **Deploy the new backend code.** The new endpoints appear at `/api/master-codes`, `/api/departments`, `/api/audit-logs`, `/api/workflows`. The existing endpoints behave identically; soft-delete replaces the previous destructive `permanentDelete`.
4. **Frontend opt-in.** Frontend pages can be migrated to consume the new endpoints one at a time. Until they do, they keep using the legacy endpoints — the two surfaces are independent.
5. **Audit-log adoption.** Once `/api/audit-logs` is wired into the admin dashboard, the legacy `admin_logs` reader can be deprecated.
6. **Workflow adoption.** Once `/api/workflows` is wired into the leave/product review pages, the per-entity `status` columns become derived (read-only). At that point, drop the dual-write from the controllers.
7. **Service-layer migration.** Lift `sp_assign_default_leaves` etc. into `LeaveAccrualService` (TBD). The skeleton in `LeaveRuleService.getAccrualAmount` shows the pattern.
8. **Multi-tenant activation.** Add the `X-Organization-Id` header and the `QueryBuilder` wrapper when the product needs it.

---

## 12. How to test the rewrite

Smoke tests after the rollout:

- `GET /api/health` → 200 with `{ status: 'OK' }`.
- `GET /api/master-codes/role` → 4 codes (FACULTY, ADMIN, HOD, SUPER_ADMIN).
- `GET /api/departments` → list of active departments (any that were pre-existing in `faculty.department` should be present).
- `GET /api/audit-logs?action=user.soft_deleted` → at least one entry (or empty if no soft-delete has happened yet).
- `POST /api/auth/login` with valid creds → 200 + `Set-Cookie: accessToken=...; HttpOnly`.
- `DELETE /api/admin/users/:id/permanent` (SUPER_ADMIN) → user marked `deleted=TRUE, active=FALSE, marked_for_purge_after=<7 years>`; not gone.
- All existing endpoints still work: leave apply, product request, bulk import, vaultify upload, etc.

---

## 13. Known limitations / out-of-scope

- The workflow engine is intentionally minimal: it supports ROLE-based assignment for `HOD` and `ADMIN`. USER/DEPARTMENT_HEAD/REPORTING_MANAGER are wired but logged-and-skipped. A real org chart would let you replace the role-based expansion with explicit user lists per step.
- The service