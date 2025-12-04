// lib/supabaseAdmin.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
	// Provide a clear runtime error to make debugging on server/deployments easier
	throw new Error('Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.\nPlease set these in your deployment (or .env.local for local dev).');
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
