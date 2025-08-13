// lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://miwlxkotxlldqwcmifow.supabase.co/',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pd2x4a290eGxsZHF3Y21pZm93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxMDQxMzIsImV4cCI6MjA3MDY4MDEzMn0.GJzvIYlf719eewsrNT28b466ikkSj41OEP3a3cJyLio'
);