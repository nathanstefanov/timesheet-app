// lib/env.ts
/**
 * Environment variable validation
 *
 * This module validates that all required environment variables are present
 * and properly formatted. Call validateEnv() at application startup.
 */

export interface EnvConfig {
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;

  // Twilio (optional for SMS features)
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;

  // Google Maps (optional for address autocomplete)
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?: string;

  // Application
  NEXT_PUBLIC_APP_URL?: string;
}

export class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvValidationError';
  }
}

/**
 * Validates that required environment variables are present
 * @throws {EnvValidationError} if validation fails
 */
export function validateEnv(): EnvConfig {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required variables
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ] as const;

  for (const key of required) {
    const value = process.env[key];
    if (!value || value.trim() === '') {
      errors.push(`Missing required environment variable: ${key}`);
    }
  }

  // Optional but recommended variables
  const optional = [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_FROM_NUMBER',
    'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY',
    'NEXT_PUBLIC_APP_URL',
  ] as const;

  for (const key of optional) {
    const value = process.env[key];
    if (!value || value.trim() === '') {
      warnings.push(`Optional environment variable not set: ${key}`);
    }
  }

  // Validate Supabase URL format
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl && !supabaseUrl.startsWith('https://')) {
    errors.push('NEXT_PUBLIC_SUPABASE_URL must start with https://');
  }

  // Validate Twilio configuration (all or nothing)
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_FROM_NUMBER;

  const twilioVars = [twilioSid, twilioToken, twilioFrom];
  const twilioCount = twilioVars.filter(Boolean).length;

  if (twilioCount > 0 && twilioCount < 3) {
    errors.push(
      'Twilio configuration incomplete. Set all three: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER'
    );
  }

  // Validate Twilio phone number format (E.164)
  if (twilioFrom && !twilioFrom.match(/^\+[1-9]\d{1,14}$/)) {
    errors.push(
      'TWILIO_FROM_NUMBER must be in E.164 format (e.g., +12025551234)'
    );
  }

  // If there are errors, throw
  if (errors.length > 0) {
    const errorMessage = [
      '❌ Environment variable validation failed:',
      '',
      ...errors.map(e => `  • ${e}`),
      '',
      'Please check your .env.local file and ensure all required variables are set.',
      'See .env.example for reference.',
    ].join('\n');

    throw new EnvValidationError(errorMessage);
  }

  // Log warnings (non-fatal)
  if (warnings.length > 0 && process.env.NODE_ENV !== 'production') {
    console.warn('⚠️  Environment variable warnings:');
    warnings.forEach(w => console.warn(`  • ${w}`));
    console.warn('');
  }

  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_FROM_NUMBER: process.env.TWILIO_FROM_NUMBER,
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  };
}

/**
 * Helper to check if Twilio is configured
 */
export function isTwilioConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  );
}

/**
 * Helper to check if Google Maps is configured
 */
export function isGoogleMapsConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
}
