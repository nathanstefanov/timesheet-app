-- Supabase/migrations/20250109000002_trigger_breakdown_recalculation.sql
-- Force recalculation of pay_due for Breakdown shifts by triggering the database trigger
-- Since pay_due is a generated column, we cannot UPDATE it directly
-- Instead, we update hours_worked to itself, which triggers calculate_shift_pay_trigger

-- Update all Breakdown shifts to force trigger recalculation
UPDATE shifts
SET hours_worked = hours_worked
WHERE shift_type = 'Breakdown';

-- Log the update
COMMENT ON TABLE shifts IS
  'Employee work shifts with automatic pay calculations.
   Last recalculated: 2025-01-09 - Triggered recalculation for Breakdown shifts.';
