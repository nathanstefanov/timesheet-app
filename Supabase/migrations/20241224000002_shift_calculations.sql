-- Supabase/migrations/20241224000002_shift_calculations.sql
-- Database triggers for automatic shift calculations
-- Phase 2: Data Integrity Fixes

-- Function to calculate shift pay automatically
CREATE OR REPLACE FUNCTION calculate_shift_pay()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate hours if time_in and time_out are provided
  IF NEW.time_in IS NOT NULL AND NEW.time_out IS NOT NULL THEN
    NEW.hours_worked := EXTRACT(EPOCH FROM (NEW.time_out - NEW.time_in)) / 3600;
  END IF;

  -- Set default pay rate if not provided
  IF NEW.pay_rate IS NULL THEN
    NEW.pay_rate := 25;
  END IF;

  -- Calculate base pay
  IF NEW.hours_worked IS NOT NULL AND NEW.hours_worked > 0 THEN
    NEW.pay_due := NEW.hours_worked * COALESCE(NEW.pay_rate, 25);

    -- Apply $50 minimum for Breakdown shifts
    IF NEW.shift_type = 'Breakdown' AND NEW.pay_due < 50 THEN
      NEW.pay_due := 50;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic calculations on INSERT and UPDATE
DROP TRIGGER IF EXISTS calculate_shift_pay_trigger ON shifts;
CREATE TRIGGER calculate_shift_pay_trigger
  BEFORE INSERT OR UPDATE ON shifts
  FOR EACH ROW
  EXECUTE FUNCTION calculate_shift_pay();

-- Add check constraints for data validation
-- Note: These constraints may fail if existing data is invalid
-- You may need to clean up existing data first

-- Ensure time_out is after time_in
ALTER TABLE shifts
  DROP CONSTRAINT IF EXISTS check_time_out_after_time_in;
ALTER TABLE shifts
  ADD CONSTRAINT check_time_out_after_time_in
  CHECK (time_out IS NULL OR time_in IS NULL OR time_out > time_in);

-- Ensure hours_worked is positive
ALTER TABLE shifts
  DROP CONSTRAINT IF EXISTS check_hours_positive;
ALTER TABLE shifts
  ADD CONSTRAINT check_hours_positive
  CHECK (hours_worked IS NULL OR hours_worked > 0);

-- Ensure pay_due is non-negative
ALTER TABLE shifts
  DROP CONSTRAINT IF EXISTS check_pay_non_negative;
ALTER TABLE shifts
  ADD CONSTRAINT check_pay_non_negative
  CHECK (pay_due IS NULL OR pay_due >= 0);

-- Comment for documentation
COMMENT ON FUNCTION calculate_shift_pay IS
  'Automatically calculates hours_worked and pay_due for shifts.
   Sets default pay_rate of $25/hour if not provided.
   Applies $50 minimum for Breakdown shifts.';

COMMENT ON TRIGGER calculate_shift_pay_trigger ON shifts IS
  'Triggers before INSERT or UPDATE to automatically calculate shift pay';
