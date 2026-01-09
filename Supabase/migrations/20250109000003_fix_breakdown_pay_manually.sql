-- Supabase/migrations/20250109000003_fix_breakdown_pay_manually.sql
-- Manual fix for existing Breakdown shifts since columns are generated
-- This deletes and recreates the shifts to force recalculation

-- Create a temporary table to store the breakdown shift data
CREATE TEMP TABLE temp_breakdown_shifts AS
SELECT *
FROM shifts
WHERE shift_type = 'Breakdown';

-- Delete the breakdown shifts (this will allow us to recreate them)
DELETE FROM shifts
WHERE shift_type = 'Breakdown';

-- Re-insert the breakdown shifts (trigger will calculate pay_due with new logic)
INSERT INTO shifts (
  id,
  user_id,
  date,
  time_in,
  time_out,
  shift_type,
  pay_rate,
  notes,
  created_at,
  updated_at
)
SELECT
  id,
  user_id,
  date,
  time_in,
  time_out,
  shift_type,
  pay_rate,
  notes,
  created_at,
  NOW() as updated_at
FROM temp_breakdown_shifts;

-- Drop the temp table
DROP TABLE temp_breakdown_shifts;

-- Log the fix
COMMENT ON TABLE shifts IS
  'Employee work shifts with automatic pay calculations.
   Last fixed: 2025-01-09 - Recreated Breakdown shifts with corrected pay logic.';
