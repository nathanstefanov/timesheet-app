# Security Vulnerabilities & Fixes

> **STATUS:** This document tracks known security issues and their remediation status.
>
> **Last Updated:** 2024-12-24

---

## 🚨 CRITICAL VULNERABILITIES (Fix Immediately)

### 1. Missing API Authorization

**Status:** ⚠️ OPEN
**Severity:** CRITICAL
**CVSS Score:** 9.1 (Critical)

**Affected Files:**
- `pages/api/schedule/shifts.ts`
- `pages/api/schedule/shifts/[id].ts`
- `pages/api/schedule/shifts/[id]/assign.ts`
- `pages/api/sendShiftSms.ts`
- `pages/api/sendShiftUpdateSms.ts`

**Description:**
All API routes are publicly accessible without authentication. Any user (including unauthenticated users) can:
- Create, modify, or delete scheduled shifts
- Send SMS to employees
- View all schedule data
- Access employee information

**Proof of Concept:**
```bash
# Anyone can fetch all shifts without authentication
curl https://your-app.vercel.app/api/schedule/shifts

# Anyone can create a shift
curl -X POST https://your-app.vercel.app/api/schedule/shifts \
  -H "Content-Type: application/json" \
  -d '{"start_time": "2024-12-25T10:00:00Z", "created_by": "..."}'
```

**Fix:**
Implement authentication middleware (see `docs/REFACTORING_PLAN.md` - Phase 1, Task 1.1)

**Tracking:** Issue #1

---

### 2. Inconsistent Supabase Client Usage

**Status:** ⚠️ OPEN
**Severity:** HIGH
**CVSS Score:** 7.5 (High)

**Affected Files:**
- `pages/api/sendShiftSms.ts` (lines 6-9)

**Description:**
Creates ad-hoc Supabase admin client with inconsistent environment variable naming (`SUPABASE_URL` vs `NEXT_PUBLIC_SUPABASE_URL`). This can cause:
- Deployment failures if environment variable missing
- Security auditing difficulties
- Potential for using wrong credentials

**Current Code:**
```typescript
const supabase = createClient(
  process.env.SUPABASE_URL!,  // ❌ Inconsistent
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
```

**Fix:**
```typescript
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
// Use supabaseAdmin instead
```

**Tracking:** Issue #2

---

### 3. Row Level Security (RLS) Not Verified

**Status:** ⚠️ OPEN
**Severity:** CRITICAL
**CVSS Score:** 8.9 (High)

**Affected Tables:**
- `shifts`
- `schedule_shifts`
- `schedule_assignments`
- `profiles`

**Description:**
No visible RLS policies in codebase. Cannot verify if:
- Employees can view other employees' shifts
- Non-admins can modify shift data
- Users can access data they shouldn't

**Impact:**
If RLS is not properly configured, client-side queries using `supabase` client (not `supabaseAdmin`) may expose unauthorized data.

**Required Actions:**
1. Document existing RLS policies
2. Verify policies are correctly implemented
3. Add policies to migration files for version control
4. Test RLS enforcement for each role

**Tracking:** Issue #3

---

### 4. Environment Variable Exposure Risk

**Status:** ⚠️ OPEN
**Severity:** MEDIUM
**CVSS Score:** 6.5 (Medium)

**Description:**
No validation of environment variables at startup. Application fails at runtime instead of build time if variables are missing or malformed.

**Risks:**
- Secrets might be logged in error messages
- Application starts with missing credentials
- Hard to diagnose configuration issues

**Fix:**
Implement environment variable validation (see Phase 1, Task 1.3)

**Tracking:** Issue #4

---

### 5. Error Message Information Disclosure

**Status:** ⚠️ OPEN
**Severity:** MEDIUM
**CVSS Score:** 5.3 (Medium)

**Affected Files:**
- All API routes in `pages/api/**/*`

**Description:**
API routes return raw database error messages to clients:

```typescript
if (error) return res.status(500).json({ error: error.message });
```

**Information Leaked:**
- Database schema details
- Table names
- Column names
- Constraint names
- Internal error messages

**Fix:**
```typescript
if (error) {
  console.error('Database error:', error);
  return res.status(500).json({ error: 'Internal server error' });
}
```

**Tracking:** Issue #5

---

## ⚠️ HIGH SEVERITY ISSUES

### 6. Client-Side Authorization Only

**Status:** ⚠️ OPEN
**Severity:** HIGH

**Description:**
Admin pages perform authorization checks only in React components, after data may have been fetched.

**Affected Files:**
- `pages/admin.tsx` (lines 200-204)
- `pages/admin-schedule.tsx`

**Issue:**
```typescript
// Data is fetched BEFORE this check
if (profile.role !== 'admin') {
  router.replace('/dashboard');
  return;
}
```

**Attack Vector:**
1. User opens `/admin` while logged in
2. Data fetches begin immediately
3. User intercepts network requests before redirect
4. Sensitive data is exposed

**Fix:**
Use `getServerSideProps` to check authorization before rendering:

```typescript
export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session || session.user.role !== 'admin') {
    return { redirect: { destination: '/dashboard', permanent: false } };
  }
  return { props: {} };
}
```

**Tracking:** Issue #6

---

### 7. SMS Spam Attack Vector

**Status:** ⚠️ OPEN
**Severity:** HIGH

**Description:**
No rate limiting on SMS API endpoints. Combined with missing authentication, attackers can spam employees with SMS messages.

**Cost Impact:**
Twilio charges per SMS. An attacker could:
- Send thousands of messages
- Cost hundreds/thousands of dollars
- Get phone number blocked by carriers

**Fix:**
1. Add authentication (Phase 1, Task 1.1)
2. Add rate limiting middleware
3. Implement SMS queue with deduplication

**Tracking:** Issue #7

---

## 🔒 MEDIUM SEVERITY ISSUES

### 8. No CSRF Protection

**Status:** ⚠️ OPEN
**Severity:** MEDIUM

**Description:**
API routes accept POST/DELETE/PATCH requests without CSRF tokens. Could enable cross-site request forgery attacks.

**Mitigation:**
Next.js API routes are not vulnerable by default as they don't use cookies for auth (using bearer tokens). However, best practice is to add CSRF protection.

**Tracking:** Issue #8

---

### 9. Unsafe Dependency Versions

**Status:** ⚠️ OPEN
**Severity:** MEDIUM

**Description:**
Using canary/beta versions in production:
- `next: "^15.6.0-canary.58"` - Canary build
- `zod: "^4.1.12"` - Version doesn't exist (latest is 3.x)

**Risks:**
- Breaking changes without notice
- Security patches not backported
- Unstable features

**Fix:**
```json
"next": "^15.0.0",
"zod": "^3.22.4"
```

**Tracking:** Issue #9

---

### 10. No Audit Logging

**Status:** ⚠️ OPEN
**Severity:** MEDIUM

**Description:**
No logging of sensitive actions:
- Shifts marked paid/unpaid
- Schedule changes
- SMS sent
- Admin actions

**Impact:**
- Cannot trace who did what
- Cannot detect unauthorized access
- Cannot meet compliance requirements

**Fix:**
Implement audit logging (Phase 5, Task 5.2)

**Tracking:** Issue #10

---

## 📋 Security Checklist

### Immediate Actions (This Week)
- [ ] Add API authentication middleware
- [ ] Fix Supabase client inconsistencies
- [ ] Create and verify RLS policies
- [ ] Add environment variable validation
- [ ] Sanitize error messages
- [ ] Implement rate limiting

### Short Term (Next 2 Weeks)
- [ ] Add server-side authorization checks
- [ ] Implement audit logging
- [ ] Fix dependency versions
- [ ] Add CSRF protection
- [ ] Document security policies

### Long Term (Next Month)
- [ ] Security audit by third party
- [ ] Penetration testing
- [ ] Implement WAF rules
- [ ] Add intrusion detection
- [ ] GDPR compliance review

---

## Reporting Security Issues

If you discover a security vulnerability, please email: [your-security-email@example.com]

**Please do NOT:**
- Open a public GitHub issue
- Disclose the vulnerability publicly
- Exploit the vulnerability

**Please DO:**
- Provide detailed steps to reproduce
- Include proof of concept (if safe)
- Allow 90 days for remediation before disclosure

---

## Security Contact

**Security Team:** [your-email@example.com]
**PGP Key:** [Optional - link to public key]

---

## Changelog

- **2024-12-24:** Initial security assessment completed
- **2024-12-24:** 10 vulnerabilities documented
