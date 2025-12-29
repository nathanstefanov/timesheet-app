-- Add employee management fields to profiles table
-- Migration: 20241229000001_add_employee_management_fields.sql

-- Add is_active column (default TRUE)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Add pay_rate column (default $25/hour)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS pay_rate DECIMAL(10,2) DEFAULT 25.00;

-- Add index on is_active for faster filtering
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON profiles(is_active);

-- Add check constraint to ensure pay_rate is non-negative
ALTER TABLE profiles
DROP CONSTRAINT IF EXISTS check_pay_rate_positive;

ALTER TABLE profiles
ADD CONSTRAINT check_pay_rate_positive CHECK (pay_rate IS NULL OR pay_rate >= 0);

-- Update existing rows to have is_active = TRUE if NULL
UPDATE profiles
SET is_active = TRUE
WHERE is_active IS NULL;

-- Update existing rows to have pay_rate = 25.00 if NULL
UPDATE profiles
SET pay_rate = 25.00
WHERE pay_rate IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN profiles.is_active IS
  'Indicates if the employee is currently active. FALSE = soft deleted/deactivated.';

COMMENT ON COLUMN profiles.pay_rate IS
  'Hourly pay rate in dollars for this employee. Overrides default $25/hour if set.';
