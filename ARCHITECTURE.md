# Architecture Documentation

> **Version:** 1.0
> **Last Updated:** 2024-12-24

---

## Table of Contents

- [Current Architecture](#current-architecture)
- [Target Architecture](#target-architecture)
- [Migration Strategy](#migration-strategy)
- [Technology Stack](#technology-stack)
- [Data Models](#data-models)
- [API Design](#api-design)
- [Security Architecture](#security-architecture)

---

## Current Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────┐
│                     CLIENT (Browser)                     │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Dashboard   │  │    Admin     │  │   Schedule   │  │
│  │   (React)    │  │   (React)    │  │   (React)    │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                 │           │
│         └─────────────────┴─────────────────┘           │
│                           │                             │
└───────────────────────────┼─────────────────────────────┘
                            │
                 ┌──────────┴──────────┐
                 │   Next.js Server    │
                 │   (API Routes)      │
                 │                     │
                 │  ❌ NO AUTH CHECK   │
                 │  ❌ NO MIDDLEWARE   │
                 └──────────┬──────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
         ┌────▼─────┐  ┌────▼────┐  ┌────▼────┐
         │ Supabase │  │ Twilio  │  │  Google │
         │ (PostSQL)│  │  (SMS)  │  │  Maps   │
         └──────────┘  └─────────┘  └─────────┘
```

### Current Issues

**Authentication Flow:**
```
1. User logs in → Supabase Auth (PKCE) ✅
2. Session stored in browser ✅
3. Client-side role check in React ⚠️ (bypassable)
4. API calls with no auth ❌ (vulnerable)
5. Admin pages fetch data before redirect ❌ (data leak)
```

**Data Flow (Shift Creation):**
```
Employee → new-shift.tsx
  ↓
  Calculate hours & pay (client-side) ⚠️
  ↓
  supabase.from('shifts').insert() ✅
  ↓
  Missing: hours_worked, pay_due ❌
  ↓
  Database (incomplete data)
```

**Problems:**
- ❌ API routes have no authentication
- ❌ Authorization only on client-side
- ❌ Business logic scattered (frontend, backend, admin)
- ❌ No centralized state management
- ❌ God components (1000+ lines)
- ❌ Duplicate code

---

## Target Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────┐
│                     CLIENT (Browser)                     │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │          React Context Providers                 │   │
│  │   - AuthContext                                  │   │
│  │   - ErrorBoundary                                │   │
│  └────────────────────┬─────────────────────────────┘   │
│                       │                                  │
│  ┌────────────────────┼─────────────────────────────┐   │
│  │  Feature Modules (Separated)                     │   │
│  │                                                   │   │
│  │  ├── employee/                                   │   │
│  │  │   ├── Dashboard.tsx (< 200 lines)            │   │
│  │  │   ├── NewShift.tsx                           │   │
│  │  │   └── hooks/useShifts.ts                     │   │
│  │  │                                               │   │
│  │  ├── admin/                                      │   │
│  │  │   ├── ShiftManagement.tsx (< 200 lines)      │   │
│  │  │   ├── components/ShiftTable.tsx              │   │
│  │  │   └── hooks/useAdminShifts.ts                │   │
│  │  │                                               │   │
│  │  └── shared/                                     │   │
│  │      ├── components/                             │   │
│  │      └── hooks/                                  │   │
│  └───────────────────────────────────────────────────   │
└───────────────────────────┼─────────────────────────────┘
                            │
                            │ Bearer Token
                            │
                 ┌──────────▼──────────┐
                 │   Next.js Server    │
                 │                     │
                 │  ┌───────────────┐  │
                 │  │   Middleware  │  │
                 │  │  - withAuth   │  │
                 │  │  - errorLog   │  │
                 │  │  - rateLimit  │  │
                 │  └───────┬───────┘  │
                 │          │          │
                 │  ┌───────▼───────┐  │
                 │  │  API Routes   │  │
                 │  │  (Protected)  │  │
                 │  │               │  │
                 │  │  ✅ Auth      │  │
                 │  │  ✅ Validate  │  │
                 │  │  ✅ Sanitize  │  │
                 │  └───────┬───────┘  │
                 └──────────┼──────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
         ┌────▼─────┐  ┌────▼────┐  ┌────▼────┐
         │ Supabase │  │ Twilio  │  │  Google │
         │          │  │         │  │  Maps   │
         │ ✅ RLS   │  │ Queue   │  │         │
         │ ✅ Trig. │  │ Retry   │  │         │
         └──────────┘  └─────────┘  └─────────┘
              │
         ┌────▼─────┐
         │  Sentry  │
         │  Logging │
         └──────────┘
```

### Improved Authentication Flow

```
1. User logs in → Supabase Auth (PKCE) ✅
2. Token stored securely (httpOnly cookie option) ✅
3. Server-side auth check (getServerSideProps) ✅
4. API calls with Bearer token ✅
5. Middleware validates token & role ✅
6. RLS enforces data access rules ✅
```

### Improved Data Flow (Shift Creation)

```
Employee → NewShift.tsx
  ↓
  Input validation (Zod schema) ✅
  ↓
  POST /api/shifts (with token)
  ↓
  withAuth middleware ✅
  │ - Verify token
  │ - Get user ID & role
  ↓
  API handler
  │ - Validate data (Zod)
  │ - Business logic (optional)
  ↓
  Database INSERT
  ↓
  Database trigger ✅
  │ - Calculate hours_worked
  │ - Calculate pay_due
  │ - Apply minimums
  ↓
  Return complete shift data
  ↓
  Client updates UI
```

---

## Migration Strategy

### Phase-by-Phase Approach

**Phase 1: Add Security Layer (No Breaking Changes)**
- Add middleware (routes still work without it initially)
- Add RLS policies (admin client bypasses them)
- Add validation (optional at first)
- **Result:** Backwards compatible, can deploy incrementally

**Phase 2: Enforce Security (Breaking Changes)**
- Require auth on all routes
- Enforce RLS
- Block unauthenticated requests
- **Result:** Secure but requires coordination

**Phase 3: Refactor Components (No Breaking Changes)**
- Extract hooks
- Split components
- Add error boundaries
- **Result:** Better code, same functionality

**Phase 4: Database Changes (Carefully Coordinated)**
- Add triggers
- Add constraints
- Backfill missing data
- **Result:** Data integrity guaranteed

### Deployment Strategy

```
┌─────────────┐
│ Development │
│   (Local)   │  ← Test all changes here first
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Staging   │
│  (Vercel)   │  ← Deploy & test with real-ish data
└──────┬──────┘
       │
       ▼ Smoke tests pass
┌─────────────┐
│ Production  │
│  (Vercel)   │  ← Deploy during low-traffic window
└─────────────┘
```

**Rollback Plan:**
- Keep previous deployment active
- Database migrations reversible
- Feature flags for major changes

---

## Technology Stack

### Current Stack

| Layer | Technology | Version | Status |
|-------|-----------|---------|--------|
| **Framework** | Next.js | 15.6.0-canary.58 | ⚠️ Canary |
| **Language** | TypeScript | 5.x | ✅ Good |
| **UI Library** | React | 19.2.1 | ✅ Latest |
| **Styling** | Tailwind CSS | 4.x | ✅ Latest |
| **Database** | Supabase (PostgreSQL) | Cloud | ✅ Good |
| **Auth** | Supabase Auth | Cloud | ✅ Good |
| **SMS** | Twilio | 5.10.7 | ✅ Good |
| **Validation** | Zod | 4.1.12 | ⚠️ Invalid version |
| **Date Utils** | date-fns | 4.1.0 | ✅ Good |
| **State** | React useState | Built-in | ⚠️ No global state |
| **Testing** | None | - | ❌ Missing |
| **Monitoring** | None | - | ❌ Missing |

### Recommended Stack Changes

| Change | From | To | Reason |
|--------|------|-----|--------|
| **Next.js** | 15.6.0-canary | 15.0.0 stable | Stability |
| **Zod** | 4.1.12 | 3.22.4 | Correct version |
| **State** | useState | React Query + Zustand | Server & client state |
| **Testing** | None | Jest + Testing Library | Code quality |
| **Monitoring** | None | Sentry | Error tracking |
| **Timezone** | None | date-fns-tz | Proper TZ handling |

### New Dependencies to Add

```json
{
  "dependencies": {
    "@tanstack/react-query": "^5.0.0",
    "zustand": "^4.5.0",
    "date-fns-tz": "^3.0.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "@testing-library/react": "^14.1.0",
    "@testing-library/jest-dom": "^6.1.0",
    "@testing-library/user-event": "^14.5.0",
    "msw": "^2.0.0",
    "husky": "^9.0.0",
    "lint-staged": "^15.0.0"
  }
}
```

---

## Data Models

### Current Schema (Simplified)

```sql
-- profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  full_name TEXT,
  role TEXT CHECK (role IN ('admin', 'employee')),
  phone TEXT,
  sms_opt_in BOOLEAN DEFAULT false,
  venmo_url TEXT
);

-- shifts table (employee work logs)
CREATE TABLE shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id),
  shift_date DATE NOT NULL,
  shift_type TEXT, -- 'Setup', 'Breakdown', 'Shop'
  time_in TIMESTAMPTZ,
  time_out TIMESTAMPTZ,
  hours_worked NUMERIC,  -- ⚠️ Often NULL
  pay_due NUMERIC,       -- ⚠️ Often NULL
  pay_rate NUMERIC DEFAULT 25,
  is_paid BOOLEAN DEFAULT false,
  paid_at TIMESTAMPTZ,
  paid_by UUID REFERENCES profiles(id),
  notes TEXT,
  admin_flag BOOLEAN DEFAULT false,
  admin_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- schedule_shifts (admin-created scheduled work)
CREATE TABLE schedule_shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  location_name TEXT,
  address TEXT,
  job_type TEXT, -- 'setup', 'lights', 'breakdown', 'other'
  notes TEXT,
  status TEXT DEFAULT 'draft', -- 'draft', 'confirmed', 'changed'
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- schedule_assignments (which employees assigned to scheduled shifts)
CREATE TABLE schedule_assignments (
  schedule_shift_id UUID REFERENCES schedule_shifts(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES profiles(id),
  PRIMARY KEY (schedule_shift_id, employee_id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Proposed Schema Improvements

```sql
-- Add timezone support
ALTER TABLE profiles ADD COLUMN timezone TEXT DEFAULT 'America/Chicago';

-- Add audit logging
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL, -- 'shift.create', 'shift.mark_paid', etc.
  resource_type TEXT,   -- 'shift', 'schedule', etc.
  resource_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add SMS tracking
CREATE TABLE sms_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id UUID REFERENCES profiles(id),
  phone_number TEXT NOT NULL,
  message_body TEXT NOT NULL,
  twilio_sid TEXT,
  status TEXT, -- 'queued', 'sent', 'delivered', 'failed'
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add pay rate history (for accurate historical tracking)
CREATE TABLE pay_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id),
  rate NUMERIC NOT NULL,
  effective_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_shifts_user_date ON shifts(user_id, shift_date);
CREATE INDEX idx_shifts_paid ON shifts(is_paid);
CREATE INDEX idx_shifts_date_range ON shifts(shift_date);
CREATE INDEX idx_schedule_shifts_start ON schedule_shifts(start_time);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at);
```

---

## API Design

### Current API Routes (Unprotected)

```
GET    /api/hello                           ❌ No auth
POST   /api/sendShiftSms                    ❌ No auth
POST   /api/sendShiftUpdateSms              ❌ No auth
GET    /api/schedule/shifts                 ❌ No auth
POST   /api/schedule/shifts                 ❌ No auth
PATCH  /api/schedule/shifts/[id]            ❌ No auth
DELETE /api/schedule/shifts/[id]            ❌ No auth
POST   /api/schedule/shifts/[id]/assign     ❌ No auth
DELETE /api/schedule/shifts/[id]/assign     ❌ No auth
GET    /api/schedule/me                     ❌ No auth
POST   /api/twilio/inbound                  ✅ Public (webhook)
```

### Target API Design (Protected)

```
# Health & Status
GET    /api/health                          ✅ Public

# Employee Routes
GET    /api/shifts                          ✅ Auth required
POST   /api/shifts                          ✅ Auth required
PATCH  /api/shifts/:id                      ✅ Auth required (own shifts only)
DELETE /api/shifts/:id                      ✅ Auth required (own shifts only)
GET    /api/schedule/me                     ✅ Auth required

# Admin Routes
GET    /api/admin/shifts                    ✅ Admin only
PATCH  /api/admin/shifts/:id                ✅ Admin only
DELETE /api/admin/shifts/:id                ✅ Admin only
GET    /api/admin/employees                 ✅ Admin only

# Schedule Management (Admin)
GET    /api/admin/schedule                  ✅ Admin only
POST   /api/admin/schedule                  ✅ Admin only
PATCH  /api/admin/schedule/:id              ✅ Admin only
DELETE /api/admin/schedule/:id              ✅ Admin only
POST   /api/admin/schedule/:id/assign       ✅ Admin only

# SMS (Admin)
POST   /api/admin/sms/send                  ✅ Admin only + rate limit

# Webhooks
POST   /api/webhooks/twilio/inbound         ✅ Validate signature
POST   /api/webhooks/twilio/status          ✅ Validate signature

# User Profile
GET    /api/me                              ✅ Auth required
PATCH  /api/me                              ✅ Auth required
GET    /api/me/export                       ✅ Auth required (GDPR)
```

### API Standards

**Request Format:**
```typescript
// Authentication
Headers: {
  'Authorization': 'Bearer <token>',
  'Content-Type': 'application/json'
}

// Body (validated with Zod)
{
  "field": "value"
}
```

**Response Format:**
```typescript
// Success
{
  "data": { /* response data */ },
  "meta": {
    "timestamp": "2024-12-24T10:00:00Z",
    "requestId": "uuid"
  }
}

// Error
{
  "error": "Human readable message",
  "code": "ERROR_CODE",
  "details": { /* validation errors if applicable */ },
  "meta": {
    "timestamp": "2024-12-24T10:00:00Z",
    "requestId": "uuid"
  }
}
```

**Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad request (validation error)
- `401` - Unauthorized (not logged in)
- `403` - Forbidden (insufficient permissions)
- `404` - Not found
- `429` - Too many requests (rate limited)
- `500` - Internal server error

---

## Security Architecture

### Authentication Flow

```
┌──────────┐
│  Client  │
└────┬─────┘
     │
     │ 1. Login (email/password)
     ▼
┌─────────────────┐
│  Supabase Auth  │
│     (PKCE)      │
└────┬────────────┘
     │
     │ 2. Returns access token + refresh token
     ▼
┌──────────────────┐
│  Client Storage  │
│  (localStorage)  │
└────┬─────────────┘
     │
     │ 3. Include in API calls
     ▼
┌─────────────────────┐
│  API Route Handler  │
│                     │
│  withAuth wrapper   │
└────┬────────────────┘
     │
     │ 4. Validate token
     ▼
┌─────────────────────┐
│  Supabase Admin     │
│  .auth.getUser()    │
└────┬────────────────┘
     │
     │ 5. Fetch role from profiles
     ▼
┌─────────────────────┐
│  Check permissions  │
│  (admin/employee)   │
└────┬────────────────┘
     │
     │ 6. Allow/Deny
     ▼
┌─────────────────────┐
│  Execute handler    │
└─────────────────────┘
```

### Row Level Security (RLS)

**Principle:** Defense in depth - even if API auth fails, RLS prevents data leaks

```sql
-- Example: Employees can only see own shifts
CREATE POLICY "employees_own_shifts"
ON shifts FOR SELECT
USING (
  auth.uid() = user_id
  OR
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);
```

### Secrets Management

```
Development:
  .env.local (gitignored)

Staging:
  Vercel Environment Variables

Production:
  Vercel Environment Variables
  + Secret rotation policy
```

---

## Component Architecture

### Current Structure (Problematic)

```
pages/
  ├── _app.tsx (150 lines) ✅
  ├── admin.tsx (1005 lines) ❌ God component
  ├── dashboard.tsx (360 lines) ⚠️ Large
  └── admin-schedule.tsx (likely large) ⚠️
```

### Target Structure (Modular)

```
src/
├── features/
│   ├── auth/
│   │   ├── components/
│   │   │   ├── LoginForm.tsx
│   │   │   └── PasswordReset.tsx
│   │   ├── hooks/
│   │   │   └── useAuth.ts
│   │   └── context/
│   │       └── AuthContext.tsx
│   │
│   ├── shifts/
│   │   ├── components/
│   │   │   ├── ShiftForm.tsx
│   │   │   ├── ShiftTable.tsx
│   │   │   └── ShiftFilters.tsx
│   │   ├── hooks/
│   │   │   ├── useShifts.ts
│   │   │   └── useShiftMutations.ts
│   │   └── pages/
│   │       ├── DashboardPage.tsx
│   │       └── NewShiftPage.tsx
│   │
│   ├── admin/
│   │   ├── components/
│   │   │   ├── EmployeeTotals.tsx
│   │   │   ├── ShiftManagement.tsx
│   │   │   ├── BulkActions.tsx
│   │   │   └── NoteModal.tsx
│   │   ├── hooks/
│   │   │   ├── useAdminShifts.ts
│   │   │   └── useEmployees.ts
│   │   └── pages/
│   │       └── AdminDashboard.tsx
│   │
│   └── schedule/
│       ├── components/
│       │   ├── ScheduleCalendar.tsx
│       │   └── ShiftAssignment.tsx
│       ├── hooks/
│       │   └── useSchedule.ts
│       └── pages/
│           └── SchedulePage.tsx
│
├── shared/
│   ├── components/
│   │   ├── Button.tsx
│   │   ├── Table.tsx
│   │   ├── Modal.tsx
│   │   └── ErrorBoundary.tsx
│   ├── hooks/
│   │   ├── useDebounce.ts
│   │   └── useLocalStorage.ts
│   └── utils/
│       ├── formatting.ts
│       └── validation.ts
│
└── lib/
    ├── supabaseClient.ts
    ├── supabaseAdmin.ts
    ├── env.ts
    ├── timezone.ts
    └── middleware/
        ├── withAuth.ts
        └── errorHandler.ts
```

### Component Size Guidelines

- **Page components:** < 200 lines
- **Feature components:** < 150 lines
- **UI components:** < 100 lines
- **Hooks:** < 80 lines

**If larger:** Extract into smaller pieces

---

## Performance Considerations

### Current Issues

1. **N+1 Queries** - Admin page fetches shifts, then profiles separately
2. **No Virtualization** - Long tables render all rows
3. **No Code Splitting** - Everything loads upfront
4. **No Memoization** - Expensive calculations on every render

### Performance Targets

| Metric | Current | Target |
|--------|---------|--------|
| **First Contentful Paint** | ? | < 1.5s |
| **Largest Contentful Paint** | ? | < 2.5s |
| **Time to Interactive** | ? | < 3.5s |
| **API Response Time** | ? | < 200ms (p95) |
| **Database Query Time** | ? | < 50ms (p95) |

### Optimizations

1. **Database:** Add indexes, use JOINs instead of multiple queries
2. **API:** Implement caching, pagination
3. **Frontend:** Code splitting, lazy loading, virtualization
4. **Assets:** Image optimization, font subsetting

---

## Monitoring & Observability

### What to Monitor

**Application Metrics:**
- API response times
- Error rates
- Request volume
- User sessions

**Business Metrics:**
- Shifts created per day
- Time to mark shifts paid
- SMS delivery rate
- Employee active users

**Infrastructure:**
- Database connection pool
- Memory usage
- CPU usage
- Vercel function invocations

### Tools

- **Error Tracking:** Sentry
- **Performance:** Vercel Analytics
- **Logs:** Vercel Logs + Supabase Logs
- **Uptime:** Better Uptime or similar

---

This architecture document will be updated as the refactoring progresses.
