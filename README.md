# Timesheet Application

> A Next.js-based timesheet management system for tracking employee shifts and managing payroll.

**Status:** 🔄 Currently undergoing major refactoring - see [TODO.md](TODO.md)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Documentation](#documentation)
- [Development](#development)
- [Deployment](#deployment)
- [Contributing](#contributing)

---

## Overview

This application helps manage employee work shifts and payroll for a lighting/event services company. It includes:

- **Employee Portal:** Log work shifts, view schedule, track unpaid hours
- **Admin Dashboard:** View all shifts, mark as paid, manage schedules
- **Schedule Management:** Create shifts and assign employees
- **SMS Notifications:** Automatic notifications for shift assignments

---

## Features

### For Employees
- ✅ Log work shifts (Setup, Breakdown, Shop)
- ✅ View personal dashboard with earnings
- ✅ Filter shifts by week/month/all-time
- ✅ View assigned scheduled shifts
- ✅ Receive SMS notifications for new assignments
- ✅ Update password

### For Admins
- ✅ View all employee shifts
- ✅ Mark shifts as paid/unpaid (individual or bulk)
- ✅ Filter by date range or week
- ✅ Add private notes to shifts
- ✅ Flag shifts for review
- ✅ Create scheduled shifts with location
- ✅ Assign employees to shifts
- ✅ Send SMS notifications to employees
- ✅ View employee Venmo links for payment

### Business Logic
- ✅ Default pay rate: $25/hour
- ✅ Breakdown shifts have $50 minimum
- ✅ Automatic hour calculation
- ✅ Auto-flag Breakdown shifts ≥ 3 hours

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Framework** | Next.js | 15.x |
| **Language** | TypeScript | 5.x |
| **UI Library** | React | 19.x |
| **Styling** | Tailwind CSS | 4.x |
| **Database** | Supabase (PostgreSQL) | Cloud |
| **Authentication** | Supabase Auth | Cloud |
| **SMS** | Twilio | 5.x |
| **Validation** | Zod | 3.x |
| **Date Utils** | date-fns | 4.x |
| **Deployment** | Vercel | - |

---

## Getting Started

### Prerequisites

- Node.js 20.x or higher
- npm or yarn
- Supabase account
- Twilio account (for SMS features)
- Google Maps API key (for location picker)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd timesheet-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` with your credentials:
   ```bash
   # Supabase
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
   SUPABASE_SERVICE_ROLE_KEY=eyJxxx...

   # Twilio
   TWILIO_ACCOUNT_SID=ACxxxx
   TWILIO_AUTH_TOKEN=xxxx
   TWILIO_PHONE_NUMBER=+1234567890

   # App
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzxxx
   ```

4. **Set up Supabase database**
   ```bash
   # If using Supabase CLI
   npx supabase db push
   ```

   Or manually run migrations from `supabase/migrations/`

5. **Run the development server**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000)

---

## Project Structure

```
timesheet-app/
├── pages/                      # Next.js pages and API routes
│   ├── api/                   # Backend API endpoints
│   │   ├── schedule/         # Schedule management APIs
│   │   ├── twilio/           # Twilio webhooks
│   │   ├── sendShiftSms.ts   # SMS notifications
│   │   └── ...
│   ├── _app.tsx              # App wrapper with auth
│   ├── index.tsx             # Login page
│   ├── dashboard.tsx         # Employee dashboard
│   ├── admin.tsx             # Admin dashboard
│   ├── new-shift.tsx         # Log new shift
│   └── ...
├── lib/                       # Utilities and helpers
│   ├── supabaseClient.ts     # Client-side Supabase
│   ├── supabaseAdmin.ts      # Server-side Supabase
│   ├── pay.ts                # Pay calculation logic
│   └── ...
├── styles/                    # Global styles
│   └── globals.css
├── public/                    # Static assets
├── supabase/                  # Supabase configuration
│   ├── config.toml
│   └── migrations/           # Database migrations
├── docs/                      # Documentation
│   ├── SECURITY.md           # Security vulnerabilities
│   ├── REFACTORING_PLAN.md   # Refactoring roadmap
│   ├── ARCHITECTURE.md       # Architecture docs
│   └── TESTING_STRATEGY.md   # Testing approach
├── .env.example              # Environment variables template
├── TODO.md                   # Prioritized task list
└── README.md                 # This file
```

---

## Documentation

**⚠️ IMPORTANT:** This project is currently undergoing a major refactoring effort. Please read the following documents before making changes:

### Planning Documents
- **[TODO.md](TODO.md)** - Prioritized task list with phases
- **[REFACTORING_PLAN.md](REFACTORING_PLAN.md)** - Detailed refactoring plan with implementation guidance
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Current and target architecture
- **[SECURITY.md](SECURITY.md)** - Known security vulnerabilities and fixes
- **[TESTING_STRATEGY.md](TESTING_STRATEGY.md)** - Testing approach and coverage goals

### Key Issues to Address
1. **🚨 CRITICAL:** API routes have no authentication (see [SECURITY.md](SECURITY.md))
2. **🚨 CRITICAL:** No Row Level Security verification
3. **⚠️ HIGH:** Data calculations done client-side (inconsistent)
4. **⚠️ HIGH:** Timezone handling is broken
5. **⚠️ MEDIUM:** Using canary/beta dependencies in production

**Start with:** [TODO.md - Quick Wins](TODO.md#-quick-wins-do-this-week) for immediate improvements.

---

## Development

### Available Scripts

```bash
# Development
npm run dev          # Start dev server with Turbopack
npm run build        # Build for production
npm start            # Start production server
npm run lint         # Run ESLint

# Testing (to be added in Phase 4)
npm test            # Run all tests
npm run test:unit   # Run unit tests
npm run test:e2e    # Run E2E tests
npm run test:watch  # Run tests in watch mode
```

### Code Style

- **TypeScript:** Strict mode enabled
- **Linting:** ESLint with Next.js config
- **Formatting:** (To be added: Prettier)
- **Commit Hooks:** (To be added: Husky + lint-staged)

### Database Migrations

```bash
# Create a new migration
npx supabase migration new <migration-name>

# Apply migrations
npx supabase db push

# Reset database (⚠️ destroys data)
npx supabase db reset
```

---

## Deployment

### Vercel (Recommended)

1. **Connect your repository to Vercel**

2. **Configure environment variables** in Vercel dashboard

3. **Deploy**
   ```bash
   vercel --prod
   ```

### Environment Variables

All environment variables from `.env.example` must be configured in your deployment platform.

**Required:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`

### Post-Deployment Checklist

- [ ] Verify environment variables are set
- [ ] Run database migrations
- [ ] Test authentication flow
- [ ] Test admin access control
- [ ] Verify SMS sending works
- [ ] Check error tracking (Sentry)
- [ ] Monitor performance (Vercel Analytics)

---

## API Routes

### Public Endpoints
- `POST /api/twilio/inbound` - Twilio webhook for SMS replies

### Protected Endpoints (Require Authentication)
⚠️ **WARNING:** Currently NOT protected - see [SECURITY.md](SECURITY.md)

- `GET /api/schedule/me` - Get current user's schedule
- `GET /api/shifts` - Get user's shifts
- `POST /api/shifts` - Create new shift

### Admin-Only Endpoints
⚠️ **WARNING:** Currently NOT protected - see [SECURITY.md](SECURITY.md)

- `GET /api/schedule/shifts` - List all scheduled shifts
- `POST /api/schedule/shifts` - Create scheduled shift
- `PATCH /api/schedule/shifts/[id]` - Update shift
- `DELETE /api/schedule/shifts/[id]` - Delete shift
- `POST /api/schedule/shifts/[id]/assign` - Assign employees
- `POST /api/sendShiftSms` - Send SMS to employees

---

## Database Schema

### Main Tables

**profiles**
- User information and roles
- Columns: `id`, `full_name`, `role`, `phone`, `sms_opt_in`, `venmo_url`

**shifts**
- Employee work logs
- Columns: `id`, `user_id`, `shift_date`, `shift_type`, `time_in`, `time_out`, `hours_worked`, `pay_due`, `is_paid`, `notes`, `admin_flag`, `admin_note`

**schedule_shifts**
- Admin-created scheduled work
- Columns: `id`, `start_time`, `end_time`, `location_name`, `address`, `job_type`, `notes`, `status`

**schedule_assignments**
- Employee assignments to shifts
- Columns: `schedule_shift_id`, `employee_id`

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed schema.

---

## Contributing

### Before Making Changes

1. **Read the documentation:**
   - [TODO.md](TODO.md) - Check what's planned
   - [SECURITY.md](SECURITY.md) - Understand vulnerabilities
   - [REFACTORING_PLAN.md](REFACTORING_PLAN.md) - Follow the plan

2. **Check for existing tasks:**
   - Look in [TODO.md](TODO.md) to avoid duplicate work
   - Update task status when you start working

3. **Follow the refactoring plan:**
   - Stick to the phased approach
   - Don't introduce new patterns that conflict with target architecture
   - Security fixes (Phase 1) have highest priority

### Development Workflow

1. Create a feature branch
   ```bash
   git checkout -b feature/task-name
   ```

2. Make your changes following the coding standards

3. Write tests (after Phase 4 setup is complete)

4. Update documentation if needed

5. Commit with descriptive messages
   ```bash
   git commit -m "feat: add authentication middleware (Task 1.1)"
   ```

6. Push and create a pull request

### Commit Message Format

```
<type>: <description>

[optional body]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `docs`: Documentation changes
- `test`: Adding tests
- `chore`: Maintenance tasks

---

## Troubleshooting

### Common Issues

**"Missing environment variables"**
- Copy `.env.example` to `.env.local`
- Fill in all required values

**"Supabase connection failed"**
- Verify `NEXT_PUBLIC_SUPABASE_URL` is correct
- Check Supabase project is running
- Verify API keys are valid

**"SMS not sending"**
- Check Twilio credentials are correct
- Verify phone numbers are in E.164 format (+1234567890)
- Check Twilio account balance

**"Unauthorized access to admin pages"**
- ⚠️ Known issue - see [SECURITY.md](SECURITY.md)
- Fix is planned in Phase 1

---

## Support

For questions or issues:
1. Check existing documentation
2. Search [TODO.md](TODO.md) for planned fixes
3. Create a GitHub issue
4. Contact the development team

---

## License

[Your License Here]

---

## Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- Database by [Supabase](https://supabase.com/)
- SMS by [Twilio](https://www.twilio.com/)
- Deployed on [Vercel](https://vercel.com/)

---

## Roadmap

See [TODO.md](TODO.md) for the complete roadmap.

**Current Priority:** Phase 1 - Critical Security Fixes

**Next Up:**
- ✅ Week 1: Security fixes and quick wins
- ✅ Week 2: Data integrity improvements
- ✅ Weeks 3-4: Architecture refactoring and testing
- ✅ Week 5+: Monitoring, UX improvements, compliance

---

**Last Updated:** 2024-12-24
