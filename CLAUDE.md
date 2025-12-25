# Claude Context File

> **Purpose:** This file helps Claude (and other AI assistants) understand the project context, current state, and development guidelines when assisting with this codebase.
>
> **Last Updated:** 2024-12-24

---

## 🎯 Project Overview

This is a **Next.js timesheet management application** for tracking employee work shifts and payroll. The app is currently **undergoing major refactoring** to address critical security vulnerabilities and technical debt.

### Current Status
- **Phase:** Planning Complete, Ready for Implementation
- **Priority:** Phase 1 - Critical Security Fixes
- **Risk Level:** 🔴 HIGH - Production app with unprotected API routes

---

## 📋 Essential Context for Claude

### When Working on This Project:

1. **ALWAYS read these files first:**
   - [TODO.md](TODO.md) - Current priorities and task status
   - [SECURITY.md](SECURITY.md) - Known vulnerabilities
   - [REFACTORING_PLAN.md](REFACTORING_PLAN.md) - Implementation details
   - [ARCHITECTURE.md](ARCHITECTURE.md) - Design decisions

2. **NEVER do these without explicit approval:**
   - Skip security fixes to work on features
   - Introduce new architectural patterns that conflict with the plan
   - Make breaking changes without migration strategy
   - Deploy to production without completing Phase 1
   - Modify database schema without creating migrations

3. **ALWAYS follow these principles:**
   - Security first (Phase 1 has highest priority)
   - Follow the phased approach (don't skip phases)
   - Write tests for new code (after Phase 4 setup)
   - Update documentation when making changes
   - Mark tasks in TODO.md as you work

---

## 🚨 Critical Issues to Remember

### Security Vulnerabilities (See SECURITY.md)

**🔴 CRITICAL - Fix Immediately:**
1. **No API authentication** - All routes in `pages/api/**/*` are publicly accessible
2. **No RLS verification** - Database policies not documented/tested
3. **Environment variable chaos** - Inconsistent naming, no validation
4. **Error message exposure** - Raw database errors sent to clients

**⚠️ HIGH - Fix Soon:**
5. **Client-side auth only** - Admin pages check role after data loads
6. **SMS spam vector** - No rate limiting on SMS endpoints
7. **Using canary builds** - Next.js 15.6.0-canary.58 in production

### Data Integrity Issues

1. **Missing calculations** - Shifts created without `hours_worked` or `pay_due`
2. **Timezone bugs** - All times handled incorrectly (will cause payroll errors)
3. **Duplicate logic** - Pay calculations in 3+ different places
4. **No database triggers** - Business logic should be in database

### Architecture Problems

1. **God components** - `pages/admin.tsx` is 1005 lines
2. **No state management** - Just useState, no global state
3. **No error boundaries** - One crash kills the app
4. **No testing** - Zero tests, hard to refactor safely

---

## 🏗️ Architecture Decisions

### Tech Stack

**DO USE:**
- Next.js 15.x (stable, not canary)
- TypeScript (strict mode)
- Supabase for database + auth
- Tailwind CSS for styling
- Zod 3.x for validation (not 4.x - doesn't exist)
- date-fns-tz for timezone handling
- React Query for server state
- Zustand for client state

**DON'T USE:**
- Next.js canary builds
- Custom date manipulation (use date-fns)
- Ad-hoc Supabase clients (use centralized ones)
- Client-side pay calculations (use database triggers)

### Code Organization

**Target Structure:**
```
src/
├── features/           # Feature-based organization
│   ├── auth/
│   ├── shifts/
│   ├── admin/
│   └── schedule/
├── shared/             # Reusable components
│   ├── components/
│   ├── hooks/
│   └── utils/
└── lib/                # Core utilities
    ├── supabaseClient.ts
    ├── supabaseAdmin.ts
    ├── middleware/
    └── timezone.ts
```

**Component Size Limits:**
- Pages: < 200 lines
- Components: < 150 lines
- Hooks: < 80 lines

**If larger:** Extract into smaller pieces

---

## 🔐 Security Guidelines

### API Routes

**Every API route MUST:**
1. Use `withAuth` middleware
2. Validate input with Zod
3. Sanitize error messages
4. Log errors server-side
5. Return proper status codes

**Example:**
```typescript
import { withAuth } from '@/lib/middleware/withAuth';
import { handleApiError } from '@/lib/middleware/errorHandler';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    // Validate
    const data = schema.parse(req.body);

    // Business logic
    const result = await doSomething(data);

    return res.status(200).json({ data: result });
  } catch (error) {
    return handleApiError(error, res, 'Creating resource');
  }
}

export default withAuth(handler, { adminOnly: true });
```

### Environment Variables

**ALWAYS:**
- Use typed `env` object from `lib/env.ts`
- Never use `process.env.XXX!` directly
- Document new variables in `.env.example`
- Validate at startup with Zod

**Example:**
```typescript
import { env } from '@/lib/env';
const url = env.NEXT_PUBLIC_SUPABASE_URL; // ✅ Type-safe
```

### Database Access

**Rules:**
- Client-side: Use `supabase` from `lib/supabaseClient.ts`
- Server-side: Use `supabaseAdmin` from `lib/supabaseAdmin.ts`
- Never create clients ad-hoc
- Always rely on RLS policies
- Use database triggers for calculations

---

## 🧪 Testing Guidelines

### What to Test (Priority Order)

1. **Critical business logic** (100% coverage required):
   - Pay calculations (`lib/pay.ts`)
   - Authentication middleware
   - Timezone conversions
   - Validation schemas

2. **API routes** (90% coverage):
   - All POST/PUT/PATCH/DELETE endpoints
   - Error handling
   - Authorization checks

3. **React components** (80% coverage):
   - Forms
   - Tables
   - Modals

### Testing Patterns

**Unit Tests:**
```typescript
// lib/pay.test.ts
describe('calculatePay', () => {
  it('applies $50 minimum for Breakdown shifts', () => {
    const result = calculatePay({
      hours: 1,
      rate: 25,
      shiftType: 'Breakdown',
    });
    expect(result.finalPay).toBe(50);
  });
});
```

**API Tests:**
```typescript
// __tests__/api/shifts.test.ts
it('requires authentication', async () => {
  const { req, res } = createMocks({ method: 'POST' });
  await handler(req, res);
  expect(res._getStatusCode()).toBe(401);
});
```

---

## 📝 Code Style Guidelines

### TypeScript

**DO:**
```typescript
// ✅ Explicit types
function calculatePay(params: PayParams): PayResult {
  // ...
}

// ✅ Type imports
import type { Shift } from '@/types';

// ✅ Strict null checks
if (shift?.hours_worked) {
  // ...
}
```

**DON'T:**
```typescript
// ❌ Any types
function doSomething(data: any) { }

// ❌ Non-null assertions without checking
const hours = shift.hours_worked!;

// ❌ Implicit any
function helper(x) { }
```

### React Components

**DO:**
```typescript
// ✅ Functional components with hooks
function ShiftForm() {
  const [date, setDate] = useState('');

  return <form>...</form>;
}

// ✅ Separate concerns
function ShiftTable() {
  const { data, isLoading } = useShifts(); // Custom hook
  if (isLoading) return <Skeleton />;
  return <Table data={data} />;
}
```

**DON'T:**
```typescript
// ❌ God components
function Admin() {
  // 1000 lines of code
}

// ❌ Mixing concerns
function ShiftTable() {
  // Data fetching
  // Business logic
  // UI rendering
  // All in one component
}
```

### Error Handling

**DO:**
```typescript
// ✅ Try-catch with proper error handling
try {
  const result = await api.call();
  return result;
} catch (error) {
  console.error('API call failed:', error);
  throw new Error('Failed to fetch data');
}

// ✅ Error boundaries for React
<ErrorBoundary fallback={<ErrorPage />}>
  <App />
</ErrorBoundary>
```

**DON'T:**
```typescript
// ❌ Silent failures
try {
  await api.call();
} catch (error) {
  // Nothing - error swallowed
}

// ❌ Exposing internals
catch (error) {
  alert(error.message); // Might expose DB details
}
```

---

## 🔄 Git Workflow

### Branch Naming

```
feature/task-1.1-auth-middleware
fix/security-issue-3
refactor/admin-component
test/pay-calculations
docs/update-architecture
```

### Commit Messages

**Format:**
```
<type>: <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `test`: Adding tests
- `docs`: Documentation
- `chore`: Maintenance

**Examples:**
```
feat: add authentication middleware (Task 1.1)

- Created withAuth wrapper
- Implemented token validation
- Added role-based access control
- See REFACTORING_PLAN.md Phase 1

fix: sanitize error messages in API routes

Previously exposed raw database errors to clients.
Now logs errors server-side and returns generic messages.

Closes #5 from SECURITY.md
```

---

## 🎯 Current Phase Status

### Phase 1: Critical Security Fixes
**Status:** 🔴 NOT STARTED
**Priority:** P0 - CRITICAL
**Duration:** 1-2 days

**Tasks:**
- [ ] Task 1.1: Create authentication middleware (4h)
- [ ] Task 1.2: Protect API routes (3h)
- [ ] Task 1.3: Fix Supabase client inconsistencies (1h)
- [ ] Task 1.4: Environment variable validation (2h)
- [ ] Task 1.5: Document RLS policies (3h)
- [ ] Task 1.6: Sanitize error messages (2h)

**DO NOT PROCEED to Phase 2 until Phase 1 is COMPLETE.**

---

## 💬 How to Use This File

### For Claude (AI Assistant)

When you open this project:

1. **First, ask:** "What phase are we currently on?"
2. **Then, read:** The relevant phase documentation
3. **Before coding:** Confirm the approach aligns with the plan
4. **After coding:** Update TODO.md with progress

### Common Questions to Ask

**Starting a session:**
- "What's the current status of Phase 1?"
- "What task should I work on next?"
- "Are there any blockers?"

**During development:**
- "Does this approach match the architecture plan?"
- "What tests should I write for this?"
- "Should this be in a migration or can I change it directly?"

**Before committing:**
- "Did I update TODO.md?"
- "Did I follow the security guidelines?"
- "Did I add tests?"

---

## 🔍 Code Review Checklist

Before marking a task complete, verify:

**Security:**
- [ ] API routes have authentication
- [ ] Input validation with Zod
- [ ] Error messages sanitized
- [ ] No secrets in code

**Code Quality:**
- [ ] Component < 200 lines
- [ ] No duplicate logic
- [ ] Proper TypeScript types
- [ ] No console.logs left in

**Testing:**
- [ ] Unit tests for logic
- [ ] Integration tests for APIs
- [ ] Tests are passing

**Documentation:**
- [ ] TODO.md updated
- [ ] Comments on complex logic
- [ ] Migration created if needed
- [ ] .env.example updated if new vars

---

## 🚫 Anti-Patterns to Avoid

### Don't Do These:

1. **Skipping phases**
   - ❌ "Phase 1 is boring, let's do Phase 3 refactoring first"
   - ✅ Complete phases in order - they have dependencies

2. **Over-engineering**
   - ❌ "Let's add Redux, MobX, AND Zustand"
   - ✅ Stick to the chosen tech stack

3. **Breaking changes without migration**
   - ❌ Changing database schema directly in production
   - ✅ Create migration, test in dev, then deploy

4. **Optimistic updates without rollback**
   - ❌ Update UI, then call API, ignore errors
   - ✅ Use React Query for automatic cache management

5. **Testing later**
   - ❌ "I'll write tests after I finish all features"
   - ✅ Write tests as you go (after Phase 4 setup)

6. **Ad-hoc fixes**
   - ❌ Quick fix that doesn't align with architecture
   - ✅ Follow the plan, even if it takes longer

---

## 📞 When You're Stuck

1. **Check documentation:**
   - [REFACTORING_PLAN.md](REFACTORING_PLAN.md) - Implementation details
   - [ARCHITECTURE.md](ARCHITECTURE.md) - Design decisions
   - [SECURITY.md](SECURITY.md) - Security requirements

2. **Ask Claude:**
   - "What does the plan say about this?"
   - "Is there an example of this pattern in the docs?"
   - "What's the recommended approach for X?"

3. **Document your decision:**
   - Add notes to the relevant markdown file
   - Update TODO.md with blockers
   - Create a GitHub issue if needed

---

## 🎓 Learning Resources

### Key Technologies

- **Next.js:** https://nextjs.org/docs
- **Supabase:** https://supabase.com/docs
- **React Query:** https://tanstack.com/query/latest
- **Zod:** https://zod.dev
- **Tailwind CSS:** https://tailwindcss.com/docs

### Testing

- **Jest:** https://jestjs.io/
- **Testing Library:** https://testing-library.com/
- **Playwright:** https://playwright.dev/

---

## 📊 Success Metrics

We'll know the refactoring is successful when:

**Security:**
- ✅ Zero critical vulnerabilities
- ✅ All API routes protected
- ✅ RLS policies documented and tested

**Quality:**
- ✅ 80%+ test coverage
- ✅ All components < 200 lines
- ✅ Zero ESLint errors
- ✅ TypeScript strict mode passing

**Reliability:**
- ✅ Error tracking in place (Sentry)
- ✅ Monitoring dashboards setup
- ✅ Audit logging implemented
- ✅ Zero data integrity issues

**Developer Experience:**
- ✅ Clear documentation
- ✅ Easy to onboard new developers
- ✅ Fast CI/CD pipeline
- ✅ Pre-commit hooks working

---

## 🔄 Keeping This File Updated

**Update this file when:**
- Moving to a new phase
- Making architectural decisions
- Discovering new anti-patterns
- Learning important lessons
- Completing major milestones

**Format:**
```markdown
## [Date] - Phase X Update

**Completed:**
- Task X.Y

**Learned:**
- [Lesson learned]

**Next:**
- Starting Task X.Z
```

---

**Remember:** This refactoring is a marathon, not a sprint. Take it one phase at a time, follow the plan, and we'll get there! 🚀

---

**Last Updated:** 2024-12-24
**Current Phase:** Phase 1 - Critical Security Fixes
**Next Review:** After Phase 1 completion
