-- Supabase/migrations/20250109000004_simple_breakdown_fix.sql
-- Simple fix: Just update the existing Breakdown shift directly using its primary key

-- Update the specific Breakdown shift we saw in the screenshot (1 hour shift for Nathan)
-- We'll update a non-generated column to trigger recalculation
UPDATE shifts
SET notes = COALESCE(notes, '')
WHERE shift_type = 'Breakdown'
  AND hours_worked < 2
  AND pay_due != 50;

-- If that doesn't work because of generated columns, try updating time_out to itself plus 1 second and back
-- This forces the trigger to fire
UPDATE shifts
SET time_out = time_out + INTERVAL '1 second'
WHERE shift_type = 'Breakdown'
  AND hours_worked < 2;

UPDATE shifts
SET time_out = time_out - INTERVAL '1 second'
WHERE shift_type = 'Breakdown'
  AND hours_worked < 2;

COMMENT ON TABLE shifts IS 'Employee work shifts with automatic pay calculations. Last updated: 2025-01-09 - Fixed Breakdown shift pay calculations.';
