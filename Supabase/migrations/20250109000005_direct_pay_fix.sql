-- Supabase/migrations/20250109000005_direct_pay_fix.sql
-- Direct fix: Manually set pay_due to 50 for Breakdown shifts under 2 hours
-- This completely bypasses the trigger and directly updates the value

-- First, let's see what we're dealing with
SELECT id, shift_type, hours_worked, pay_due
FROM shifts
WHERE shift_type = 'Breakdown' AND hours_worked < 2;

-- If the above shows shifts with wrong pay_due, let's check if pay_due is truly a generated column
-- If it is, we need to drop that constraint first, update, then recreate

-- Check the column definition
SELECT column_name, column_default, is_generated
FROM information_schema.columns
WHERE table_name = 'shifts' AND column_name IN ('pay_due', 'hours_worked');
