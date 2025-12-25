# Testing Strategy

> **Version:** 1.0
> **Last Updated:** 2024-12-24
> **Test Coverage Goal:** 80% for critical paths

---

## Table of Contents

- [Overview](#overview)
- [Testing Pyramid](#testing-pyramid)
- [Testing Tools](#testing-tools)
- [Unit Testing](#unit-testing)
- [Integration Testing](#integration-testing)
- [End-to-End Testing](#end-to-end-testing)
- [Test Organization](#test-organization)
- [CI/CD Integration](#cicd-integration)
- [Coverage Goals](#coverage-goals)

---

## Overview

### Current State
- ❌ **Zero tests** - No testing infrastructure
- ❌ **No CI/CD** - No automated testing
- ❌ **Manual testing only** - Risky deployments
- ❌ **No regression protection** - Changes break things unknowingly

### Goals
- ✅ Catch bugs before production
- ✅ Enable safe refactoring
- ✅ Document expected behavior
- ✅ Improve code confidence
- ✅ Speed up development (faster feedback)

---

## Testing Pyramid

```
         /\
        /  \
       / E2E \
      /  (5%) \
     /──────────\
    /            \
   / Integration \
  /     (25%)     \
 /────────────────\
/                  \
/   Unit Tests      \
/      (70%)         \
/────────────────────\
```

### Distribution

| Type | Count | Coverage | Purpose |
|------|-------|----------|---------|
| **Unit Tests** | ~150 | 70% | Test individual functions/components |
| **Integration Tests** | ~50 | 25% | Test API routes, database interactions |
| **E2E Tests** | ~10 | 5% | Test critical user flows |

---

## Testing Tools

### Core Testing Libraries

```json
{
  "devDependencies": {
    // Test Framework
    "jest": "^29.7.0",
    "@types/jest": "^29.5.0",

    // React Testing
    "@testing-library/react": "^14.1.0",
    "@testing-library/jest-dom": "^6.1.0",
    "@testing-library/user-event": "^14.5.0",

    // Mocking
    "msw": "^2.0.0",  // Mock Service Worker (API mocking)

    // E2E Testing
    "@playwright/test": "^1.40.0",

    // Coverage
    "@jest/coverage-istanbul": "^29.7.0"
  }
}
```

### Jest Configuration

```javascript
// jest.config.js
const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/lib/(.*)$': '<rootDir>/lib/$1',
  },
  collectCoverageFrom: [
    'lib/**/*.{js,jsx,ts,tsx}',
    'pages/**/*.{js,jsx,ts,tsx}',
    'components/**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
  ],
  coverageThresholds: {
    global: {
      statements: 70,
      branches: 65,
      functions: 70,
      lines: 70,
    },
    './lib/': {
      statements: 90,
      branches: 85,
      functions: 90,
      lines: 90,
    },
  },
};

module.exports = createJestConfig(customJestConfig);
```

```javascript
// jest.setup.js
import '@testing-library/jest-dom';

// Mock environment variables
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.TWILIO_ACCOUNT_SID = 'ACtest123';
process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';
process.env.TWILIO_PHONE_NUMBER = '+15555555555';
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
```

---

## Unit Testing

### What to Test

**Utilities & Pure Functions** (Priority: HIGH)
- [ ] Pay calculation logic (`lib/pay.ts`)
- [ ] Timezone conversions (`lib/timezone.ts`)
- [ ] Date helpers
- [ ] Formatting functions
- [ ] Validation schemas

**React Components** (Priority: MEDIUM)
- [ ] UI components (Button, Modal, Table)
- [ ] Form components
- [ ] Display components

**Custom Hooks** (Priority: HIGH)
- [ ] `useAuth`
- [ ] `useShifts`
- [ ] `useSchedule`

### Example: Testing Pay Calculation

```typescript
// lib/pay.test.ts
import { calculatePay } from './pay';

describe('calculatePay', () => {
  it('calculates basic pay correctly', () => {
    const result = calculatePay({
      hours: 4,
      rate: 25,
      shiftType: 'Setup',
    });

    expect(result).toEqual({
      hours: 4,
      basePay: 100,
      finalPay: 100,
      minimumApplied: false,
    });
  });

  it('applies $50 minimum for Breakdown shifts under 2 hours', () => {
    const result = calculatePay({
      hours: 1,
      rate: 25,
      shiftType: 'Breakdown',
    });

    expect(result).toEqual({
      hours: 1,
      basePay: 25,
      finalPay: 50,
      minimumApplied: true,
    });
  });

  it('does not apply minimum for Breakdown shifts over 2 hours', () => {
    const result = calculatePay({
      hours: 3,
      rate: 25,
      shiftType: 'Breakdown',
    });

    expect(result).toEqual({
      hours: 3,
      basePay: 75,
      finalPay: 75,
      minimumApplied: false,
    });
  });

  it('handles different pay rates', () => {
    const result = calculatePay({
      hours: 2,
      rate: 30,
      shiftType: 'Setup',
    });

    expect(result.finalPay).toBe(60);
  });

  it('throws error for negative hours', () => {
    expect(() => {
      calculatePay({ hours: -1, rate: 25, shiftType: 'Setup' });
    }).toThrow('Hours must be positive');
  });

  it('throws error for zero hours', () => {
    expect(() => {
      calculatePay({ hours: 0, rate: 25, shiftType: 'Setup' });
    }).toThrow('Hours must be positive');
  });
});
```

### Example: Testing Timezone Utilities

```typescript
// lib/timezone.test.ts
import { combineLocalWithTz, formatForDisplay } from './timezone';

describe('timezone utilities', () => {
  describe('combineLocalWithTz', () => {
    it('combines date and time in specified timezone', () => {
      const result = combineLocalWithTz('2024-12-24', '14:30', 'America/Chicago');

      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe('2024-12-24T20:30:00.000Z'); // CST is UTC-6
    });

    it('handles different timezones correctly', () => {
      const chicagoTime = combineLocalWithTz('2024-12-24', '14:30', 'America/Chicago');
      const laTime = combineLocalWithTz('2024-12-24', '14:30', 'America/Los_Angeles');

      // LA is 2 hours behind Chicago
      const diff = chicagoTime.getTime() - laTime.getTime();
      expect(diff).toBe(2 * 60 * 60 * 1000);
    });
  });

  describe('formatForDisplay', () => {
    it('formats timestamp in user timezone', () => {
      const iso = '2024-12-24T20:30:00Z';
      const formatted = formatForDisplay(iso, 'MMM d, yyyy h:mm a', 'America/Chicago');

      expect(formatted).toBe('Dec 24, 2024 2:30 PM');
    });
  });
});
```

### Example: Testing React Component

```typescript
// components/Button.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click me</Button>);

    fireEvent.click(screen.getByText('Click me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Click me</Button>);

    const button = screen.getByText('Click me');
    expect(button).toBeDisabled();
  });

  it('shows loading state', () => {
    render(<Button loading>Click me</Button>);

    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });
});
```

---

## Integration Testing

### What to Test

**API Routes** (Priority: CRITICAL)
- [ ] Authentication middleware
- [ ] Authorization (admin-only routes)
- [ ] Data validation (Zod schemas)
- [ ] Error handling
- [ ] Database operations

**Database Operations** (Priority: HIGH)
- [ ] CRUD operations
- [ ] Triggers
- [ ] Constraints
- [ ] RLS policies

### Example: Testing API Route

```typescript
// __tests__/api/shifts.test.ts
import { createMocks } from 'node-mocks-http';
import handler from '@/pages/api/shifts';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

jest.mock('@/lib/supabaseAdmin');

describe('/api/shifts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/shifts', () => {
    it('requires authentication', async () => {
      const { req, res } = createMocks({
        method: 'POST',
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Missing or invalid authorization header',
      });
    });

    it('validates request body', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token',
        },
        body: {
          // Missing required fields
          shift_date: '2024-12-24',
        },
      });

      // Mock successful auth
      (supabaseAdmin.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
    });

    it('creates shift successfully', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token',
        },
        body: {
          shift_date: '2024-12-24',
          shift_type: 'Setup',
          time_in: '2024-12-24T09:00:00Z',
          time_out: '2024-12-24T13:00:00Z',
        },
      });

      // Mock successful auth
      (supabaseAdmin.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null,
      });

      // Mock database insert
      (supabaseAdmin.from as jest.Mock).mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'shift-123',
                user_id: 'user-123',
                shift_date: '2024-12-24',
                hours_worked: 4,
                pay_due: 100,
              },
              error: null,
            }),
          }),
        }),
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(201);
      const data = JSON.parse(res._getData());
      expect(data).toHaveProperty('id', 'shift-123');
    });
  });
});
```

### Example: Testing Database Trigger

```typescript
// __tests__/database/triggers.test.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe('Database Triggers', () => {
  describe('calculate_shift_pay trigger', () => {
    afterEach(async () => {
      // Cleanup
      await supabase.from('shifts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    });

    it('automatically calculates hours_worked', async () => {
      const { data, error } = await supabase
        .from('shifts')
        .insert({
          user_id: 'test-user-id',
          shift_date: '2024-12-24',
          shift_type: 'Setup',
          time_in: '2024-12-24T09:00:00Z',
          time_out: '2024-12-24T13:00:00Z',
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.hours_worked).toBe(4);
    });

    it('automatically calculates pay_due', async () => {
      const { data } = await supabase
        .from('shifts')
        .insert({
          user_id: 'test-user-id',
          shift_date: '2024-12-24',
          shift_type: 'Setup',
          time_in: '2024-12-24T09:00:00Z',
          time_out: '2024-12-24T13:00:00Z',
        })
        .select()
        .single();

      expect(data.pay_due).toBe(100); // 4 hours * $25
    });

    it('applies $50 minimum for Breakdown shifts', async () => {
      const { data } = await supabase
        .from('shifts')
        .insert({
          user_id: 'test-user-id',
          shift_date: '2024-12-24',
          shift_type: 'Breakdown',
          time_in: '2024-12-24T09:00:00Z',
          time_out: '2024-12-24T10:00:00Z', // 1 hour
        })
        .select()
        .single();

      expect(data.hours_worked).toBe(1);
      expect(data.pay_due).toBe(50); // Minimum applied
    });
  });
});
```

---

## End-to-End Testing

### What to Test

**Critical User Flows** (Priority: CRITICAL)
- [ ] Employee: Login → Create shift → View dashboard
- [ ] Admin: Login → View all shifts → Mark as paid
- [ ] Admin: Create schedule → Assign employees → Send SMS

### Example: Playwright E2E Test

```typescript
// e2e/employee-flow.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Employee Shift Creation Flow', () => {
  test('employee can create a new shift', async ({ page }) => {
    // 1. Login
    await page.goto('/');
    await page.fill('input[name="email"]', 'employee@test.com');
    await page.fill('input[name="password"]', 'testpassword');
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await expect(page).toHaveURL('/dashboard');

    // 2. Navigate to new shift page
    await page.click('text=Log Shift');
    await expect(page).toHaveURL('/new-shift');

    // 3. Fill out shift form
    await page.fill('input[type="date"]', '2024-12-24');
    await page.selectOption('select', 'Setup');
    await page.fill('input[aria-label="Time In"]', '09:00');
    await page.fill('input[aria-label="Time Out"]', '13:00');
    await page.fill('textarea', 'Test shift notes');

    // 4. Submit form
    await page.click('button:has-text("Save Shift")');

    // 5. Verify redirect to dashboard
    await expect(page).toHaveURL('/dashboard');

    // 6. Verify shift appears in table
    await expect(page.locator('table')).toContainText('2024-12-24');
    await expect(page.locator('table')).toContainText('Setup');
    await expect(page.locator('table')).toContainText('4.00'); // hours
    await expect(page.locator('table')).toContainText('$100.00'); // pay
  });

  test('shows validation errors for invalid data', async ({ page }) => {
    await page.goto('/new-shift');

    // Try to submit without required fields
    await page.click('button:has-text("Save Shift")');

    // Should show error
    await expect(page.locator('.alert.error')).toBeVisible();
    await expect(page.locator('.alert.error')).toContainText('required');
  });
});
```

```typescript
// e2e/admin-flow.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Admin Dashboard Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/');
    await page.fill('input[name="email"]', 'admin@test.com');
    await page.fill('input[name="password"]', 'adminpassword');
    await page.click('button[type="submit"]');
  });

  test('admin can mark shift as paid', async ({ page }) => {
    await page.goto('/admin');

    // Find first unpaid shift
    const firstUnpaidRow = page.locator('tr:has(.badge-unpaid)').first();

    // Click checkbox to mark as paid
    await firstUnpaidRow.locator('input[type="checkbox"]').click();

    // Verify badge changed
    await expect(firstUnpaidRow.locator('.badge-paid')).toBeVisible();
  });

  test('admin can bulk mark all shifts paid for employee', async ({ page }) => {
    await page.goto('/admin');

    // Click "Mark ALL Paid" for first employee
    await page.locator('button:has-text("Mark ALL Paid")').first().click();

    // Confirm dialog
    page.on('dialog', dialog => dialog.accept());

    // Verify all shifts for that employee are marked paid
    // (Implementation depends on UI structure)
  });
});
```

### Playwright Configuration

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

---

## Test Organization

### Directory Structure

```
timesheet-app/
├── __tests__/
│   ├── lib/
│   │   ├── pay.test.ts
│   │   ├── timezone.test.ts
│   │   └── env.test.ts
│   ├── components/
│   │   ├── Button.test.tsx
│   │   ├── Modal.test.tsx
│   │   └── ShiftTable.test.tsx
│   ├── api/
│   │   ├── shifts.test.ts
│   │   ├── schedule.test.ts
│   │   └── auth.test.ts
│   └── database/
│       ├── triggers.test.ts
│       ├── constraints.test.ts
│       └── rls.test.ts
├── e2e/
│   ├── employee-flow.spec.ts
│   ├── admin-flow.spec.ts
│   └── schedule-flow.spec.ts
├── jest.config.js
├── jest.setup.js
└── playwright.config.ts
```

### Naming Conventions

- **Test files:** `*.test.ts` or `*.test.tsx` (co-located with code OR in `__tests__/`)
- **E2E files:** `*.spec.ts` (in `e2e/` directory)
- **Test suites:** `describe('ComponentName', () => { ... })`
- **Test cases:** `it('does something specific', () => { ... })`

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:unit

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: supabase/postgres
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run migrations
        run: npx supabase db push

      - name: Run integration tests
        run: npm run test:integration

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Run E2E tests
        run: npm run test:e2e

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

### Package.json Scripts

```json
{
  "scripts": {
    "test": "jest",
    "test:unit": "jest --coverage",
    "test:integration": "jest --testPathPattern=integration",
    "test:watch": "jest --watch",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:all": "npm run test:unit && npm run test:integration && npm run test:e2e"
  }
}
```

---

## Coverage Goals

### Overall Coverage Targets

| Metric | Minimum | Target | Stretch |
|--------|---------|--------|---------|
| **Statements** | 70% | 80% | 90% |
| **Branches** | 65% | 75% | 85% |
| **Functions** | 70% | 80% | 90% |
| **Lines** | 70% | 80% | 90% |

### Critical Path Coverage (Must be 100%)

- [ ] Pay calculation logic
- [ ] Authentication middleware
- [ ] Authorization checks
- [ ] Timezone conversions
- [ ] Data validation schemas

### Component Coverage (Target 80%)

- [ ] Forms
- [ ] Tables
- [ ] Modals
- [ ] Error boundaries

### API Route Coverage (Target 90%)

- [ ] All POST/PUT/PATCH/DELETE routes
- [ ] Error handling
- [ ] Validation

---

## Testing Best Practices

### DO ✅

- **Test behavior, not implementation** - Focus on what users see/do
- **Keep tests independent** - Each test should run in isolation
- **Use descriptive names** - `it('calculates pay correctly for 4-hour Setup shift')`
- **Arrange, Act, Assert** - Clear test structure
- **Mock external dependencies** - Database, APIs, etc.
- **Test edge cases** - Empty arrays, null values, boundary conditions
- **Clean up after tests** - Reset state, clear mocks

### DON'T ❌

- **Test implementation details** - Don't test internal state
- **Write flaky tests** - Tests should pass consistently
- **Share state between tests** - Use `beforeEach` to reset
- **Test third-party code** - Trust libraries are tested
- **Ignore failing tests** - Fix or remove
- **Over-mock** - Only mock what's necessary

---

## Next Steps

### Phase 1: Setup (Week 1)
- [ ] Install testing dependencies
- [ ] Configure Jest
- [ ] Configure Playwright
- [ ] Set up CI/CD pipeline
- [ ] Write first test

### Phase 2: Critical Coverage (Week 2)
- [ ] Test pay calculation logic (100%)
- [ ] Test authentication middleware (100%)
- [ ] Test timezone utilities (100%)
- [ ] Test validation schemas (90%)

### Phase 3: API Coverage (Week 3)
- [ ] Test all API routes (80%)
- [ ] Test error handling
- [ ] Test database triggers

### Phase 4: Component Coverage (Week 4)
- [ ] Test form components
- [ ] Test table components
- [ ] Test modals and dialogs

### Phase 5: E2E Coverage (Week 5)
- [ ] Employee flow tests
- [ ] Admin flow tests
- [ ] Schedule management tests

---

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Testing Library](https://testing-library.com/)
- [Playwright Documentation](https://playwright.dev/)
- [MSW (Mock Service Worker)](https://mswjs.io/)
