# Quick Wins - Implementation Checklist

> **Total Time:** 4-6 hours
> **Impact:** High - Immediate improvements to stability and development experience

---

## ✅ Completed by Claude

- [x] **Enable TypeScript strict checks** - Updated `next.config.js`
- [x] **Update .gitignore** - Added IDE, test coverage, and build artifacts
- [x] **Create database index migration** - Created SQL migration file

---

## 🔧 Tasks for You to Run in Terminal

### 1. Fix Dependency Versions (15-30 minutes)

```bash
cd /Users/nathanstefanov/Desktop/FLSTimesheet/timesheet-app

# Install correct Next.js and Zod versions
npm install next@15.1.0 zod@3.22.4

# Remove unused dependencies
npm uninstall swr @supabase/auth-helpers-react

# Verify changes
npm list next zod swr
```

**Expected output:**

- `next@15.1.0` (was `15.6.0-canary.58`)
- `zod@3.22.4` (was `4.1.12` - invalid)
- `swr` should be removed

---

### 2. Add Pre-commit Hooks (30 minutes)

```bash
# Install Husky and lint-staged
npm install -D husky lint-staged

# Initialize Husky
npx husky init

# Create pre-commit hook
echo 'npx lint-staged' > .husky/pre-commit

# Make it executable
chmod +x .husky/pre-commit
```

**Then add to `package.json`:**

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md}": ["prettier --write"]
  }
}
```

---

### 3. Apply Database Indexes (1 hour)

**Option A: Using Supabase CLI (recommended)**

```bash
# If you have Supabase CLI installed
npx supabase db push
```

**Option B: Manually in Supabase Dashboard**

1. Go to: https://app.supabase.com/project/YOUR_PROJECT/sql
2. Open: `supabase/migrations/20241224000001_add_indexes.sql`
3. Copy and paste the SQL
4. Click "Run"

---

### 4. Test the Build (15 minutes)

```bash
# Test that build works with new strict checks
npm run build

# If there are TypeScript errors, we'll fix them next
# (This is expected - strict mode will catch issues)
```

---

### 5. Commit the Changes

```bash
git add .
git commit -m "chore: complete Quick Wins - dependency fixes and improvements

- Updated Next.js from canary to stable (15.1.0)
- Fixed Zod version (3.22.4, was invalid 4.x)
- Removed unused dependencies (swr, auth-helpers-react)
- Enabled TypeScript strict mode in builds
- Updated .gitignore for test coverage and IDE files
- Added database indexes for performance
- Added pre-commit hooks with Husky

🤖 Generated with Claude Code"

git push origin main
```

---

## 📊 Progress Tracking

**Completed:**

- [x] TypeScript strict checks enabled
- [x] .gitignore updated
- [x] Database index migration created

**To Complete:**

- [ ] Fix Next.js version
- [ ] Fix Zod version
- [ ] Remove unused dependencies
- [ ] Add pre-commit hooks
- [ ] Apply database indexes
- [ ] Test build
- [ ] Commit changes

---

## 🐛 Troubleshooting

### If `npm install` fails:

```bash
# Clear cache and try again
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### If build fails with TypeScript errors:

This is expected! Enabling strict mode will surface existing issues.
We'll fix these in Phase 1 as we refactor the code.

For now, you can temporarily disable it to test:

```javascript
// next.config.js
typescript: { ignoreBuildErrors: true }, // Temporary
```

### If database migration fails:

Check that:

1. You're connected to the right Supabase project
2. Tables exist (shifts, schedule_shifts, etc.)
3. No duplicate index names

---

## ⏭️ What's Next?

After completing Quick Wins:

1. **Phase 1: Critical Security Fixes** (1-2 days)
   - Create authentication middleware
   - Protect all API routes
   - Fix environment variables
   - Document RLS policies

2. **Verify Everything Works**
   - Run `npm run dev`
   - Test login flow
   - Test creating a shift
   - Check admin dashboard

---

**Questions?** Check [TODO.md](TODO.md) or [REFACTORING_PLAN.md](REFACTORING_PLAN.md)
