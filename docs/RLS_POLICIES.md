# Row Level Security (RLS) Policies

> **Status**: Documentation complete | Verification pending
> **Last Updated**: December 24, 2024

This document describes the Row Level Security (RLS) policies that should be configured in Supabase to protect your database.

## Overview

Row Level Security (RLS) is PostgreSQL's built-in security feature that restricts which rows users can access in database tables. Even though our API routes are now protected with authentication middleware, RLS provides **defense in depth** - a critical second layer of security.

### Why RLS Matters

1. **Defense in depth**: Even if API authentication is bypassed, RLS prevents unauthorized data access
2. **Direct database protection**: Protects against direct database connections
3. **Supabase client safety**: Ensures client-side Supabase calls are secure
4. **Audit compliance**: Industry best practice for multi-tenant applications

---

## Current Status

### ✅ API Layer Protection (COMPLETE)
- All API routes now require authentication
- Role-based access control implemented
- Server-side session validation

### ⚠️ RLS Layer (NEEDS VERIFICATION)
- RLS policies may already exist in Supabase
- **Action required**: Verify and document existing policies
- If missing, policies must be created

---

## Required RLS Policies

### 1. `profiles` Table

**Purpose**: User profile information (name, role, phone, etc.)

```sql
-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Policy: Admins can read all profiles
CREATE POLICY "Admins can read all profiles"
  ON profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy: Admins can update all profiles
CREATE POLICY "Admins can update all profiles"
  ON profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy: Admins can insert profiles
CREATE POLICY "Admins can insert profiles"
  ON profiles
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
```

---

### 2. `shifts` Table

**Purpose**: Employee timesheets and work hours

```sql
-- Enable RLS
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

-- Policy: Employees can read their own shifts
CREATE POLICY "Employees can read own shifts"
  ON shifts
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Employees can create their own shifts
CREATE POLICY "Employees can create own shifts"
  ON shifts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Employees can update their own unpaid shifts
CREATE POLICY "Employees can update own unpaid shifts"
  ON shifts
  FOR UPDATE
  USING (auth.uid() = user_id AND is_paid = false)
  WITH CHECK (auth.uid() = user_id AND is_paid = false);

-- Policy: Admins can read all shifts
CREATE POLICY "Admins can read all shifts"
  ON shifts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy: Admins can update all shifts
CREATE POLICY "Admins can update all shifts"
  ON shifts
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy: Admins can delete shifts
CREATE POLICY "Admins can delete shifts"
  ON shifts
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
```

---

### 3. `schedule_shifts` Table

**Purpose**: Scheduled future shifts created by admins

```sql
-- Enable RLS
ALTER TABLE schedule_shifts ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can read schedule shifts
-- (Employees need to see shifts they might be assigned to)
CREATE POLICY "Authenticated users can read schedule shifts"
  ON schedule_shifts
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Policy: Admins can create schedule shifts
CREATE POLICY "Admins can create schedule shifts"
  ON schedule_shifts
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy: Admins can update schedule shifts
CREATE POLICY "Admins can update schedule shifts"
  ON schedule_shifts
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy: Admins can delete schedule shifts
CREATE POLICY "Admins can delete schedule shifts"
  ON schedule_shifts
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
```

---

### 4. `schedule_assignments` Table

**Purpose**: Links employees to scheduled shifts

```sql
-- Enable RLS
ALTER TABLE schedule_assignments ENABLE ROW LEVEL SECURITY;

-- Policy: Employees can read their own assignments
CREATE POLICY "Employees can read own assignments"
  ON schedule_assignments
  FOR SELECT
  USING (auth.uid() = employee_id);

-- Policy: Admins can read all assignments
CREATE POLICY "Admins can read all assignments"
  ON schedule_assignments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy: Admins can create assignments
CREATE POLICY "Admins can create assignments"
  ON schedule_assignments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy: Admins can delete assignments
CREATE POLICY "Admins can delete assignments"
  ON schedule_assignments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
```

---

## Verification Steps

### Step 1: Check if RLS is Enabled

Run this query in Supabase SQL Editor:

```sql
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'shifts', 'schedule_shifts', 'schedule_assignments')
ORDER BY tablename;
```

**Expected result**: `rowsecurity` should be `true` for all tables.

---

### Step 2: List Existing Policies

```sql
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

This shows all current RLS policies. Compare with the policies above.

---

### Step 3: Test RLS Policies

**Test as Employee:**

```sql
-- Set context to a test employee user
SET LOCAL role authenticated;
SET LOCAL request.jwt.claim.sub = '<employee-user-id>';

-- Try to read another employee's shifts (should return empty)
SELECT * FROM shifts WHERE user_id != '<employee-user-id>';

-- Try to read own shifts (should work)
SELECT * FROM shifts WHERE user_id = '<employee-user-id>';
```

**Test as Admin:**

```sql
-- Set context to an admin user
SET LOCAL role authenticated;
SET LOCAL request.jwt.claim.sub = '<admin-user-id>';

-- Try to read all shifts (should work)
SELECT * FROM shifts;

-- Try to update any shift (should work)
UPDATE shifts SET notes = 'test' WHERE id = '<any-shift-id>';
```

---

## Implementation Checklist

- [ ] **Verify RLS is enabled** on all four tables
- [ ] **Document existing policies** (if any) in this file
- [ ] **Apply missing policies** using the SQL above
- [ ] **Test employee access** (should only see own data)
- [ ] **Test admin access** (should see all data)
- [ ] **Test unauthenticated access** (should be denied)
- [ ] **Update TODO.md** with RLS verification status

---

## Security Notes

### Service Role Key Bypasses RLS

⚠️ **Important**: The `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS completely.

- Our API routes use `supabaseAdmin` (service role) for operations
- This is correct because API routes handle their own authentication
- Never expose the service role key to the client
- Client-side code must use the anon key (which respects RLS)

### Defense in Depth

With both API authentication and RLS:

1. **API Layer**: `withAuth` middleware validates sessions and roles
2. **Database Layer**: RLS policies enforce row-level permissions
3. **Result**: Even if one layer fails, the other protects your data

### Common Pitfall

If you use the anon key server-side for queries, RLS will apply based on the current auth context. Our current implementation correctly uses the service role key with manual authentication checks.

---

## Troubleshooting

### Issue: Policies Not Working

**Symptom**: Users can access data they shouldn't

**Solutions**:
1. Verify RLS is enabled: `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;`
2. Check policy syntax for errors
3. Ensure `auth.uid()` is being set correctly
4. Verify you're not using service role key client-side

### Issue: Can't Access Own Data

**Symptom**: Employee can't see their own shifts

**Solutions**:
1. Check that `auth.uid()` matches the user's ID
2. Verify the user is authenticated
3. Check for conflicting policies
4. Review policy `USING` and `WITH CHECK` clauses

---

## Next Steps

1. Run verification queries in Supabase dashboard
2. Document actual policies found
3. Create/update policies as needed
4. Add RLS tests to your test suite (Phase 4)
5. Update this document with verification results

---

## References

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL RLS Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [SECURITY.md](../SECURITY.md) - Security issues and mitigations
