-- Supabase/migrations/20250109000003_fix_breakdown_pay_manually.sql
-- Manual fix for existing Breakdown shifts since columns are generated
-- This deletes and recreates the shifts to force recalculation

-- Step 1: Get all Breakdown shift IDs
DO $$
DECLARE
  breakdown_ids uuid[];
BEGIN
  -- Collect all Breakdown shift IDs
  SELECT ARRAY_AGG(id) INTO breakdown_ids
  FROM shifts
  WHERE shift_type = 'Breakdown';

  -- If there are any Breakdown shifts, recreate them
  IF breakdown_ids IS NOT NULL THEN
    -- Create temp table with all Breakdown shift data (excluding generated columns)
    CREATE TEMP TABLE temp_breakdown_shifts AS
    SELECT id, user_id, time_in, time_out, shift_type, pay_rate, notes, created_at
    FROM shifts
    WHERE id = ANY(breakdown_ids);

    -- Delete the Breakdown shifts
    DELETE FROM shifts WHERE id = ANY(breakdown_ids);

    -- Re-insert them (trigger will recalculate pay_due and hours_worked)
    INSERT INTO shifts (id, user_id, time_in, time_out, shift_type, pay_rate, notes, created_at)
    SELECT id, user_id, time_in, time_out, shift_type, pay_rate, notes, created_at
    FROM temp_breakdown_shifts;

    -- Clean up
    DROP TABLE temp_breakdown_shifts;
  END IF;
END $$;

-- Log the fix
COMMENT ON TABLE shifts IS
  'Employee work shifts with automatic pay calculations.
   Last fixed: 2025-01-09 - Recreated Breakdown shifts with corrected pay logic.';
