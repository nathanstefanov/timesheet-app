-- Create calendar_events table
-- Migration: 20241229000002_create_calendar_events.sql

CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  location TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index on event_date for faster queries
CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(event_date);

-- Add index on created_by for faster user queries
CREATE INDEX IF NOT EXISTS idx_calendar_events_created_by ON calendar_events(created_by);

-- Enable Row Level Security
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can view calendar events
CREATE POLICY "Everyone can view calendar events"
  ON calendar_events
  FOR SELECT
  USING (true);

-- Policy: Only admins can insert calendar events
CREATE POLICY "Only admins can insert calendar events"
  ON calendar_events
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Policy: Only admins can update calendar events
CREATE POLICY "Only admins can update calendar events"
  ON calendar_events
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Policy: Only admins can delete calendar events
CREATE POLICY "Only admins can delete calendar events"
  ON calendar_events
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_calendar_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calendar_events_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION update_calendar_events_updated_at();

-- Add comments for documentation
COMMENT ON TABLE calendar_events IS 'Company calendar events visible to all users, editable by admins only';
COMMENT ON COLUMN calendar_events.title IS 'Event title/name';
COMMENT ON COLUMN calendar_events.description IS 'Detailed description of the event';
COMMENT ON COLUMN calendar_events.event_date IS 'Date when the event occurs';
COMMENT ON COLUMN calendar_events.start_time IS 'Optional start time for the event';
COMMENT ON COLUMN calendar_events.end_time IS 'Optional end time for the event';
COMMENT ON COLUMN calendar_events.location IS 'Optional location where the event takes place';
COMMENT ON COLUMN calendar_events.created_by IS 'User ID of the admin who created the event';
