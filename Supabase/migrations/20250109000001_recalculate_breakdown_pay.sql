-- Supabase/migrations/20250109000001_recalculate_breakdown_pay.sql
-- Recalculate pay for existing Breakdown shifts with new logic
-- Breakdown shifts: under 2 hours = $50 flat, 2+ hours = normal rate

-- Update all Breakdown shifts to recalculate their pay_due
UPDATE shifts
SET
  pay_due = CASE
    WHEN shift_type = 'Breakdown' AND hours_worked < 2 THEN 50
    WHEN shift_type = 'Breakdown' AND hours_worked >= 2 THEN hours_worked * COALESCE(pay_rate, 25)
    ELSE hours_worked * COALESCE(pay_rate, 25)
  END
WHERE shift_type = 'Breakdown';

-- Log the update
COMMENT ON TABLE shifts IS
  'Employee work shifts with automatic pay calculations.
   Last recalculated: 2025-01-09 - Updated Breakdown shift pay logic.';
