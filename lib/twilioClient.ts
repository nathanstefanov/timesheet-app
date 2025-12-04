// lib/twilioClient.ts
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

if (!accountSid || !authToken) {
  throw new Error('Missing Twilio environment variables');
}

export const twilioClient = twilio(accountSid, authToken);