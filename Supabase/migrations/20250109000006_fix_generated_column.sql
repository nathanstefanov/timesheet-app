-- Supabase/migrations/20250109000006_fix_generated_column.sql
-- Fix the pay_due GENERATED column to include Breakdown $50 minimum logic

-- Drop the old generated column
ALTER TABLE shifts
DROP COLUMN pay_due;

-- Recreate it with the correct logic including Breakdown minimum
ALTER TABLE shifts
ADD COLUMN pay_due numeric GENERATED ALWAYS AS (
  CASE
    -- Breakdown shifts: under 2 hours = $50 flat, 2+ hours = normal rate
    WHEN shift_type = 'Breakdown' AND (EXTRACT(epoch FROM (time_out - time_in)) / 3600.0) < 2
    THEN 50
    -- All other shifts: hours * rate
    ELSE (EXTRACT(epoch FROM (time_out - time_in)) / 3600.0) * COALESCE(pay_rate, 25)
  END
) STORED;

COMMENT ON COLUMN shifts.pay_due IS 'Auto-calculated pay: Breakdown shifts under 2hrs = $50 flat, otherwise hours * rate';
