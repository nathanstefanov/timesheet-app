# Timesheet App - TODO List

> **Last Updated:** 2024-12-24
> **Status:** 📋 Planning Complete - Ready to Begin Implementation

---

## 🚨 PHASE 1: CRITICAL SECURITY FIXES (Do This Week!)

**Priority:** P0 - CRITICAL ⚠️
**Duration:** 1-2 days
**Status:** 🔴 NOT STARTED

### Security Tasks

- [ ] **Task 1.1: Create Authentication Middleware** (4 hours)
  - [ ] Create `lib/middleware/withAuth.ts`
  - [ ] Implement token validation
  - [ ] Implement role-based access control
  - [ ] Add error handling
  - [ ] Test with employee and admin tokens
  - **Files:** `lib/middleware/withAuth.ts`

- [ ] **Task 1.2: Protect API Routes** (3 hours)
  - [ ] Wrap `/api/schedule/shifts` with `withAuth(..., { adminOnly: true })`
  - [ ] Wrap `/api/schedule/shifts/[id]` with auth
  - [ ] Wrap `/api/schedule/shifts/[id]/assign` with auth
  - [ ] Wrap `/api/sendShiftSms` with auth
  - [ ] Wrap `/api/sendShiftUpdateSms` with auth
  - [ ] Wrap `/api/schedule/me` with `withAuth(..., { requireAuth: true })`
  - [ ] Test all routes return 401/403 without proper auth
  - **Files:** All API routes in `pages/api/**/*`

- [ ] **Task 1.3: Fix Supabase Client Inconsistencies** (1 hour)
  - [ ] Remove ad-hoc client creation in `pages/api/sendShiftSms.ts`
  - [ ] Import and use `supabaseAdmin` from centralized module
  - [ ] Verify no other files create clients ad-hoc
  - **Files:** `pages/api/sendShiftSms.ts`, `pages/api/sendShiftUpdateSms.ts`

- [ ] **Task 1.4: Environment Variable Validation** (2 hours)
  - [ ] Create `lib/env.ts` with Zod schema
  - [ ] Update all imports to use typed `env` object
  - [ ] Test app fails fast with clear error if vars missing
  - [ ] Document all required vars in `.env.example` ✅ (Done)
  - **Files:** `lib/env.ts`, `lib/supabaseClient.ts`, `lib/supabaseAdmin.ts`, all API routes

- [ ] **Task 1.5: Document & Verify RLS Policies** (3 hours)
  - [ ] Document existing RLS policies in `docs/DATABASE_SECURITY.md`
  - [ ] Create migration file `supabase/migrations/YYYYMMDD_rls_policies.sql`
  - [ ] Verify employees can't see others' data
  - [ ] Verify admins can see all data
  - [ ] Write tests for RLS enforcement
  - **Files:** `docs/DATABASE_SECURITY.md`, `supabase/migrations/`

- [ ] **Task 1.6: Sanitize Error Messages** (2 hours)
  - [ ] Create `lib/middleware/errorHandler.ts`
  - [ ] Update all API routes to use error handler
  - [ ] Remove raw error message exposure
  - [ ] Test errors are logged but not exposed
  - **Files:** `lib/middleware/errorHandler.ts`, all API routes

**Estimated Total:** 15 hours

---

## 🔧 PHASE 2: DATA INTEGRITY FIXES

**Priority:** P1 - HIGH
**Duration:** 2-3 days
**Status:** 🔴 NOT STARTED

### Data Quality Tasks

- [ ] **Task 2.1: Fix Shift Creation to Calculate Pay** (3 hours)
  - [ ] Update `pages/new-shift.tsx` to calculate hours
  - [ ] Update to calculate pay_due
  - [ ] Update to include pay_rate
  - [ ] Update to set is_paid: false
  - [ ] Test shift creation includes all fields
  - **Files:** `pages/new-shift.tsx`

- [ ] **Task 2.2: Add Database Triggers for Calculations** (4 hours)
  - [ ] Create migration `supabase/migrations/YYYYMMDD_shift_calculations.sql`
  - [ ] Create function `calculate_shift_pay()`
  - [ ] Create trigger `calculate_shift_pay_trigger`
  - [ ] Add constraints for data validation
  - [ ] Test trigger calculates hours correctly
  - [ ] Test trigger applies $50 minimum for Breakdown
  - **Files:** `supabase/migrations/YYYYMMDD_shift_calculations.sql`

- [ ] **Task 2.3: Fix Timezone Handling** (6 hours)
  - [ ] Install `date-fns-tz` package
  - [ ] Create `lib/timezone.ts` utilities
  - [ ] Update `pages/new-shift.tsx` to use timezone utils
  - [ ] Update SMS notifications to show correct timezone
  - [ ] Add timezone column to profiles table
  - [ ] Update all date displays to use user timezone
  - [ ] Test shifts display correctly across timezones
  - **Files:** `lib/timezone.ts`, `pages/new-shift.tsx`, `pages/api/sendShiftSms.ts`, `supabase/migrations/`

- [ ] **Task 2.4: Centralize Pay Calculation Logic** (3 hours)
  - [ ] Extract pay logic from `pages/admin.tsx` to `lib/pay.ts`
  - [ ] Remove duplicate calculations
  - [ ] Update all references to use centralized function
  - [ ] Add unit tests for pay calculations
  - **Files:** `lib/pay.ts`, `pages/admin.tsx`

- [ ] **Task 2.5: Fix Optimistic Updates** (4 hours)
  - [ ] Install `@tanstack/react-query`
  - [ ] Set up QueryClient provider
  - [ ] Replace manual optimistic updates with React Query
  - [ ] Implement proper error rollback
  - [ ] Test network failure scenarios
  - **Files:** `pages/_app.tsx`, admin/dashboard components

**Estimated Total:** 20 hours

---

## 🏗️ PHASE 3: ARCHITECTURE REFACTOR

**Priority:** P2 - MEDIUM
**Duration:** 1 week
**Status:** 🔴 NOT STARTED

### Refactoring Tasks

- [ ] **Task 3.1: Extract Custom Hooks** (8 hours)
  - [ ] Create `hooks/useAuth.ts`
  - [ ] Create `hooks/useShifts.ts`
  - [ ] Create `hooks/useProfile.ts`
  - [ ] Create `hooks/useEmployees.ts`
  - [ ] Create `hooks/useSchedule.ts`
  - [ ] Update components to use hooks
  - **Files:** Create `hooks/` directory

- [ ] **Task 3.2: Break Down Admin Component** (12 hours)
  - [ ] Create `pages/admin/index.tsx` (< 200 lines)
  - [ ] Extract `components/admin/ShiftTable.tsx`
  - [ ] Extract `components/admin/EmployeeTotalsTable.tsx`
  - [ ] Extract `components/admin/DateFilters.tsx`
  - [ ] Extract `components/admin/NoteModal.tsx`
  - [ ] Extract `components/admin/BulkActions.tsx`
  - [ ] Create `hooks/useAdminShifts.ts`
  - [ ] Create `hooks/useAdminFilters.ts`
  - [ ] Create `lib/admin/payCalculations.ts`
  - **Files:** Refactor `pages/admin.tsx`

- [ ] **Task 3.3: Break Down Dashboard Component** (6 hours)
  - [ ] Create `pages/dashboard/index.tsx` (< 200 lines)
  - [ ] Extract `components/dashboard/ShiftTable.tsx`
  - [ ] Extract `components/dashboard/ShiftFilters.tsx`
  - [ ] Extract `components/dashboard/TotalsSummary.tsx`
  - **Files:** Refactor `pages/dashboard.tsx`

- [ ] **Task 3.4: Add Error Boundaries** (4 hours)
  - [ ] Create `components/ErrorBoundary.tsx`
  - [ ] Wrap app in error boundary
  - [ ] Add error boundaries to major features
  - [ ] Test error handling
  - **Files:** `components/ErrorBoundary.tsx`, `pages/_app.tsx`

- [ ] **Task 3.5: Replace Custom Date Helpers** (2 hours)
  - [ ] Remove custom date functions from `pages/admin.tsx`
  - [ ] Use `date-fns` functions instead
  - [ ] Update all usages
  - [ ] Remove dead code
  - **Files:** `pages/admin.tsx`

- [ ] **Task 3.6: Add Global State Management** (6 hours)
  - [ ] Install Zustand
  - [ ] Create auth store
  - [ ] Create UI state store
  - [ ] Update components to use stores
  - **Files:** `store/` directory

**Estimated Total:** 38 hours

---

## 🧪 PHASE 4: TESTING INFRASTRUCTURE

**Priority:** P2 - MEDIUM
**Duration:** 3-4 days
**Status:** 🔴 NOT STARTED

### Testing Setup

- [ ] **Task 4.1: Setup Testing Framework** (4 hours)
  - [ ] Install Jest, Testing Library, MSW
  - [ ] Create `jest.config.js`
  - [ ] Create `jest.setup.js`
  - [ ] Configure coverage thresholds
  - [ ] Add test scripts to `package.json`
  - **Files:** Configuration files

- [ ] **Task 4.2: Write Critical Unit Tests** (12 hours)
  - [ ] Test pay calculation logic (100% coverage)
  - [ ] Test timezone utilities (100% coverage)
  - [ ] Test environment validation (100% coverage)
  - [ ] Test auth middleware (100% coverage)
  - [ ] Test validation schemas (90% coverage)
  - **Files:** `__tests__/lib/`

- [ ] **Task 4.3: Write Integration Tests** (8 hours)
  - [ ] Test API authentication
  - [ ] Test API authorization (admin-only)
  - [ ] Test shift creation API
  - [ ] Test shift update API
  - [ ] Test database triggers
  - **Files:** `__tests__/api/`, `__tests__/database/`

- [ ] **Task 4.4: Write E2E Tests** (8 hours)
  - [ ] Install Playwright
  - [ ] Configure Playwright
  - [ ] Test employee shift creation flow
  - [ ] Test admin mark paid flow
  - [ ] Test schedule creation flow
  - **Files:** `e2e/`

- [ ] **Task 4.5: Setup CI/CD** (4 hours)
  - [ ] Create GitHub Actions workflow
  - [ ] Configure test jobs
  - [ ] Add coverage reporting
  - [ ] Test PR checks
  - **Files:** `.github/workflows/test.yml`

**Estimated Total:** 36 hours

---

## 📊 PHASE 5: MONITORING & OBSERVABILITY

**Priority:** P2 - MEDIUM
**Duration:** 2-3 days
**Status:** 🔴 NOT STARTED

### Monitoring Tasks

- [ ] **Task 5.1: Add Error Tracking** (3 hours)
  - [ ] Install Sentry
  - [ ] Configure Next.js integration
  - [ ] Test error reporting
  - [ ] Add custom context
  - **Files:** `sentry.*.config.js`

- [ ] **Task 5.2: Add Audit Logging** (6 hours)
  - [ ] Create `audit_logs` table
  - [ ] Create `lib/auditLog.ts` utility
  - [ ] Log shift paid/unpaid changes
  - [ ] Log schedule modifications
  - [ ] Log SMS sent
  - [ ] Create admin audit log viewer
  - **Files:** `supabase/migrations/`, `lib/auditLog.ts`

- [ ] **Task 5.3: Add SMS Tracking** (4 hours)
  - [ ] Create `sms_logs` table
  - [ ] Update SMS sending to log all attempts
  - [ ] Track delivery status
  - [ ] Create admin SMS log viewer
  - **Files:** `supabase/migrations/`, `pages/api/sendShiftSms.ts`

- [ ] **Task 5.4: Add Performance Monitoring** (3 hours)
  - [ ] Install Vercel Analytics
  - [ ] Add Web Vitals tracking
  - [ ] Add custom metrics
  - [ ] Create performance dashboard
  - **Files:** `pages/_app.tsx`

- [ ] **Task 5.5: Add Health Checks** (2 hours)
  - [ ] Create `/api/health` endpoint
  - [ ] Check database connectivity
  - [ ] Check Twilio connectivity
  - [ ] Return service status
  - **Files:** `pages/api/health.ts`

**Estimated Total:** 18 hours

---

## 🎨 PHASE 6: UX & POLISH

**Priority:** P3 - LOW
**Duration:** 1 week
**Status:** 🔴 NOT STARTED

### UX Improvements

- [ ] **Task 6.1: Add Loading States** (6 hours)
  - [ ] Add loading spinners to forms
  - [ ] Add skeleton screens to tables
  - [ ] Disable buttons during operations
  - [ ] Add progress indicators
  - **Files:** All page components

- [ ] **Task 6.2: Improve Mobile Experience** (12 hours)
  - [ ] Optimize admin table for mobile
  - [ ] Add swipe gestures
  - [ ] Improve touch targets
  - [ ] Test on real devices
  - **Files:** CSS files, table components

- [ ] **Task 6.3: Add Accessibility** (8 hours)
  - [ ] Install `eslint-plugin-jsx-a11y`
  - [ ] Fix missing labels
  - [ ] Add ARIA attributes
  - [ ] Test with screen reader
  - [ ] Add keyboard navigation
  - **Files:** All components

- [ ] **Task 6.4: Add Input Validation Feedback** (4 hours)
  - [ ] Show character limits
  - [ ] Show validation errors inline
  - [ ] Add helpful error messages
  - [ ] Add field-level validation
  - **Files:** Form components

- [ ] **Task 6.5: Add Offline Support** (16 hours) [OPTIONAL]
  - [ ] Add service worker
  - [ ] Cache static assets
  - [ ] Add offline indicator
  - [ ] Queue failed requests
  - **Files:** `public/sw.js`, `pages/_app.tsx`

**Estimated Total:** 30-46 hours

---

## 📜 PHASE 7: COMPLIANCE & LEGAL

**Priority:** P2 - MEDIUM
**Duration:** Ongoing
**Status:** 🔴 NOT STARTED

### Compliance Tasks

- [ ] **Task 7.1: Add Privacy Policy** (4 hours + legal review)
  - [ ] Draft privacy policy
  - [ ] Legal review
  - [ ] Add privacy policy page
  - [ ] Link from footer
  - **Files:** `pages/privacy.tsx`

- [ ] **Task 7.2: Add Terms of Service** (4 hours + legal review)
  - [ ] Draft terms of service
  - [ ] Legal review
  - [ ] Add terms page
  - [ ] Require acceptance on signup
  - **Files:** `pages/terms.tsx`

- [ ] **Task 7.3: Add Data Export (GDPR)** (6 hours)
  - [ ] Create `/api/me/export` endpoint
  - [ ] Export all user data as JSON
  - [ ] Add UI to request export
  - [ ] Test export includes all data
  - **Files:** `pages/api/me/export.ts`, `pages/me/settings.tsx`

- [ ] **Task 7.4: Add Data Deletion (GDPR)** (4 hours)
  - [ ] Create `/api/me/delete` endpoint
  - [ ] Anonymize shift data (keep for records)
  - [ ] Delete profile
  - [ ] Add confirmation flow
  - **Files:** `pages/api/me/delete.ts`

- [ ] **Task 7.5: Add SMS Consent Management** (4 hours)
  - [ ] Add SMS opt-in/opt-out UI
  - [ ] Update phone number UI
  - [ ] View SMS history
  - [ ] Sync with Twilio opt-outs
  - **Files:** `pages/me/settings.tsx`

**Estimated Total:** 22 hours (excluding legal review)

---

## 🚀 QUICK WINS (Do This Week!)

**Priority:** P1 - HIGH
**Duration:** 4-6 hours
**Status:** 🔴 NOT STARTED

These are high-impact, low-effort fixes you should do ASAP:

- [ ] **Fix Next.js Version** (15 minutes)
  ```bash
  npm install next@15.0.0
  ```

- [ ] **Fix Zod Version** (15 minutes)
  ```bash
  npm install zod@^3.22.4
  ```

- [ ] **Enable TypeScript Strict Checks** (30 minutes)
  - Update `next.config.js`:
  ```javascript
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false }
  ```

- [ ] **Add Pre-commit Hooks** (30 minutes)
  ```bash
  npm install -D husky lint-staged
  npx husky init
  ```

- [ ] **Add Database Indexes** (1 hour)
  ```sql
  CREATE INDEX idx_shifts_user_date ON shifts(user_id, shift_date);
  CREATE INDEX idx_shifts_paid ON shifts(is_paid);
  CREATE INDEX idx_shifts_date_range ON shifts(shift_date);
  ```

- [ ] **Remove Unused Dependencies** (30 minutes)
  - Remove `swr` (unused)
  - Remove duplicate auth helpers
  - Clean up package.json

- [ ] **Add .gitignore Entries** (15 minutes)
  - Ensure `.env.local` is ignored
  - Add test coverage output
  - Add build artifacts

- [ ] **Create README.md** (1 hour)
  - Document setup steps
  - Document environment variables
  - Document deployment process

**Estimated Total:** 4-6 hours

---

## 📈 PROGRESS TRACKING

### Overall Progress

- **Phase 1 (Security):** ⬜️⬜️⬜️⬜️⬜️⬜️ 0% (0/6 tasks)
- **Phase 2 (Data):** ⬜️⬜️⬜️⬜️⬜️ 0% (0/5 tasks)
- **Phase 3 (Architecture):** ⬜️⬜️⬜️⬜️⬜️⬜️ 0% (0/6 tasks)
- **Phase 4 (Testing):** ⬜️⬜️⬜️⬜️⬜️ 0% (0/5 tasks)
- **Phase 5 (Monitoring):** ⬜️⬜️⬜️⬜️⬜️ 0% (0/5 tasks)
- **Phase 6 (UX):** ⬜️⬜️⬜️⬜️⬜️ 0% (0/5 tasks)
- **Phase 7 (Compliance):** ⬜️⬜️⬜️⬜️⬜️ 0% (0/5 tasks)
- **Quick Wins:** ⬜️⬜️⬜️⬜️⬜️⬜️⬜️⬜️ 0% (0/8 tasks)

**Total Tasks:** 45
**Completed:** 0
**In Progress:** 0
**Not Started:** 45

---

## 🎯 RECOMMENDED EXECUTION ORDER

### Week 1: Security & Quick Wins
1. ✅ Quick Wins (all 8 tasks) - **Day 1**
2. ✅ Phase 1: Security (all 6 tasks) - **Days 2-3**

### Week 2: Data Integrity
3. ✅ Phase 2: Data (all 5 tasks) - **Days 4-7**

### Week 3-4: Architecture & Testing
4. ✅ Phase 3: Architecture (all 6 tasks) - **Week 3**
5. ✅ Phase 4: Testing (all 5 tasks) - **Week 4**

### Week 5: Monitoring & UX
6. ✅ Phase 5: Monitoring (all 5 tasks) - **Days 1-3**
7. ✅ Phase 6: UX (priority tasks) - **Days 4-5**

### Ongoing: Compliance
8. ✅ Phase 7: Compliance (as needed)

---

## 📋 DAILY CHECKLIST TEMPLATE

Copy this for daily standup:

```markdown
## Daily TODO - [DATE]

### Today's Focus: [Phase/Task Name]

**Planned:**
- [ ] Task 1
- [ ] Task 2
- [ ] Task 3

**Blockers:**
- None / [Describe blocker]

**Completed:**
- [X] Previous task
- [X] Previous task

**Notes:**
- [Any important notes or decisions]
```

---

## 🔄 UPDATE LOG

- **2024-12-24:** Initial TODO list created
- All tasks organized into phases
- Estimated efforts added
- Quick wins identified

---

## 📞 NEED HELP?

If you get stuck on any task:

1. Check the relevant documentation:
   - `REFACTORING_PLAN.md` - Detailed implementation guidance
   - `ARCHITECTURE.md` - Architecture decisions
   - `SECURITY.md` - Security vulnerabilities and fixes
   - `TESTING_STRATEGY.md` - Testing approach

2. Ask questions in team chat or create an issue

3. Document your decision in the appropriate markdown file

---

**Let's build something great! 🚀**
