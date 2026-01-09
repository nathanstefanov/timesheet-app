-- Supabase/migrations/20250109000002_trigger_breakdown_recalculation.sql
-- Force recalculation of pay_due for Breakdown shifts by triggering the database trigger
-- Since pay_due AND hours_worked are both generated columns, we touch time_in to trigger recalculation

-- Update all Breakdown shifts to force trigger recalculation
-- We set time_in to itself, which triggers calculate_shift_pay_trigger without changing data
UPDATE shifts
SET time_in = time_in
WHERE shift_type = 'Breakdown';

-- Log the update
COMMENT ON TABLE shifts IS
  'Employee work shifts with automatic pay calculations.
   Last recalculated: 2025-01-09 - Triggered recalculation for Breakdown shifts.';
