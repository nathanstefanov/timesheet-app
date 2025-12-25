#!/usr/bin/env node
/**
 * Environment variable validation script
 * Run this before starting the dev server or building for production
 *
 * Usage: node scripts/validate-env.js
 */

const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];

const optional = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_FROM_NUMBER',
  'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY',
  'NEXT_PUBLIC_APP_URL',
];

function validateEnv() {
  const errors = [];
  const warnings = [];
  let hasErrors = false;

  console.log('🔍 Validating environment variables...\n');

  // Check required variables
  for (const key of required) {
    const value = process.env[key];
    if (!value || value.trim() === '') {
      errors.push(`❌ Missing required: ${key}`);
      hasErrors = true;
    } else {
      console.log(`✅ ${key}`);
    }
  }

  console.log('');

  // Check optional variables
  for (const key of optional) {
    const value = process.env[key];
    if (!value || value.trim() === '') {
      warnings.push(`⚠️  Optional not set: ${key}`);
    } else {
      console.log(`✅ ${key}`);
    }
  }

  console.log('');

  // Validate Supabase URL format
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl && !supabaseUrl.startsWith('https://')) {
    errors.push('❌ NEXT_PUBLIC_SUPABASE_URL must start with https://');
    hasErrors = true;
  }

  // Validate Twilio configuration (all or nothing)
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_FROM_NUMBER;

  const twilioVars = [twilioSid, twilioToken, twilioFrom].filter(Boolean);
  if (twilioVars.length > 0 && twilioVars.length < 3) {
    errors.push(
      '❌ Twilio incomplete: Set all three TWILIO_* variables or none'
    );
    hasErrors = true;
  }

  // Validate Twilio phone format (E.164)
  if (twilioFrom && !twilioFrom.match(/^\+[1-9]\d{1,14}$/)) {
    errors.push(
      '❌ TWILIO_FROM_NUMBER must be in E.164 format (e.g., +12025551234)'
    );
    hasErrors = true;
  }

  // Output results
  if (errors.length > 0) {
    console.error('\n❌ Environment validation FAILED:\n');
    errors.forEach(e => console.error(e));
    console.error('\n💡 Check your .env.local file or see .env.example\n');
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn('\n⚠️  Warnings (optional features may not work):\n');
    warnings.forEach(w => console.warn(w));
    console.warn('');
  }

  console.log('✅ Environment validation passed!\n');
}

validateEnv();
