-- Migration: Add performance indexes
-- Created: 2024-12-24
-- Purpose: Improve query performance for common access patterns

-- Indexes for shifts table
CREATE INDEX IF NOT EXISTS idx_shifts_user_date
  ON shifts(user_id, shift_date DESC);

CREATE INDEX IF NOT EXISTS idx_shifts_paid
  ON shifts(is_paid)
  WHERE is_paid = false;

CREATE INDEX IF NOT EXISTS idx_shifts_date_range
  ON shifts(shift_date DESC);

CREATE INDEX IF NOT EXISTS idx_shifts_user_paid
  ON shifts(user_id, is_paid);

-- Indexes for schedule_shifts table
CREATE INDEX IF NOT EXISTS idx_schedule_shifts_start
  ON schedule_shifts(start_time DESC);

CREATE INDEX IF NOT EXISTS idx_schedule_shifts_status
  ON schedule_shifts(status);

-- Indexes for schedule_assignments table
CREATE INDEX IF NOT EXISTS idx_schedule_assignments_employee
  ON schedule_assignments(employee_id);

-- Indexes for profiles table
CREATE INDEX IF NOT EXISTS idx_profiles_role
  ON profiles(role);

-- Add comments
COMMENT ON INDEX idx_shifts_user_date IS 'Optimize employee dashboard queries';
COMMENT ON INDEX idx_shifts_paid IS 'Optimize unpaid shift queries for admin';
COMMENT ON INDEX idx_shifts_date_range IS 'Optimize date range filtering';
COMMENT ON INDEX idx_schedule_shifts_start IS 'Optimize schedule listing by date';
COMMENT ON INDEX idx_schedule_assignments_employee IS 'Optimize employee schedule lookups';
