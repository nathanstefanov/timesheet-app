// lib/middleware/withAuth.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';

export interface AuthenticatedRequest extends NextApiRequest {
  user: {
    id: string;
    email?: string;
    role?: 'admin' | 'employee';
  };
}

export interface AuthOptions {
  requireAuth?: boolean;
  requiredRole?: 'admin' | 'employee';
}

/**
 * Authentication middleware for API routes
 *
 * Usage:
 * export default withAuth(async (req, res) => {
 *   // req.user is guaranteed to exist here
 *   const userId = req.user.id;
 * }, { requiredRole: 'admin' });
 *
 * @param handler - Your API route handler
 * @param options - Authentication options
 * @returns Wrapped handler with authentication
 */
export function withAuth(
  handler: (req: AuthenticatedRequest, res: NextApiResponse) => Promise<void>,
  options: AuthOptions = { requireAuth: true }
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    // Allow OPTIONS requests (CORS preflight)
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    // If auth is not required, pass through
    if (!options.requireAuth) {
      return handler(req as AuthenticatedRequest, res);
    }

    try {
      // Create Supabase client for server-side auth
      const supabase = createServerSupabaseClient({ req, res });

      // Get the current session
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('[withAuth] Session error:', sessionError);
        return res.status(401).json({
          error: 'Authentication failed',
          code: 'AUTH_ERROR'
        });
      }

      if (!session?.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'UNAUTHENTICATED'
        });
      }

      // Fetch user profile to get role
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        // PGRST116 = no rows returned, which is okay (new user)
        console.error('[withAuth] Profile fetch error:', profileError);
      }

      const userRole = profile?.role as 'admin' | 'employee' | undefined;

      // Check role requirement
      if (options.requiredRole && userRole !== options.requiredRole) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          code: 'FORBIDDEN',
          required: options.requiredRole,
          actual: userRole || 'none'
        });
      }

      // Attach user to request
      (req as AuthenticatedRequest).user = {
        id: session.user.id,
        email: session.user.email,
        role: userRole,
      };

      // Call the handler
      return handler(req as AuthenticatedRequest, res);
    } catch (error) {
      console.error('[withAuth] Unexpected error:', error);
      return res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  };
}

/**
 * Helper to check if user is admin
 */
export function requireAdmin(
  handler: (req: AuthenticatedRequest, res: NextApiResponse) => Promise<void>
) {
  return withAuth(handler, { requireAuth: true, requiredRole: 'admin' });
}

/**
 * Helper to check if user is employee (or admin)
 */
export function requireEmployee(
  handler: (req: AuthenticatedRequest, res: NextApiResponse) => Promise<void>
) {
  return withAuth(handler, { requireAuth: true, requiredRole: 'employee' });
}
