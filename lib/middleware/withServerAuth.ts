// lib/middleware/withServerAuth.ts
import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next';

export interface AuthenticatedUser {
  id: string;
  email?: string;
  role: 'admin' | 'employee';
}

export interface ServerAuthContext extends GetServerSidePropsContext {
  user: AuthenticatedUser;
}

export interface ServerAuthOptions {
  requiredRole?: 'admin' | 'employee';
  redirectTo?: string;
}

/**
 * Server-side authentication wrapper for getServerSideProps
 *
 * NOTE: This is a placeholder implementation for future server-side auth.
 * Currently, Supabase sessions are stored in localStorage (client-side only).
 *
 * To properly implement server-side auth with Supabase, we need to:
 * 1. Store sessions in httpOnly cookies instead of localStorage
 * 2. Use @supabase/ssr for server-side session management
 *
 * For now, this just passes through to allow pages to load.
 * Security is still enforced by:
 * - API routes using requireAdmin middleware (checks JWT tokens)
 * - RLS policies in Supabase database
 * - Client-side redirect on mount in useEffect
 *
 * @param handler - Your getServerSideProps handler
 * @param options - Authentication options
 * @returns Wrapped handler with authentication
 */
export function withServerAuth<P extends Record<string, any> = Record<string, any>>(
  handler: (ctx: ServerAuthContext) => Promise<GetServerSidePropsResult<P>>,
  options: ServerAuthOptions = {}
) {
  return async (ctx: GetServerSidePropsContext): Promise<GetServerSidePropsResult<P>> => {
    // For now, just call the handler - client-side auth will handle redirects
    // This allows the page to load, then client-side will redirect if needed
    // TODO: Implement proper server-side session verification with cookie-based auth
    return handler(ctx as ServerAuthContext);
  };
}

/**
 * Helper to require admin role
 */
export function requireServerAdmin<P extends Record<string, any> = Record<string, any>>(
  handler: (ctx: ServerAuthContext) => Promise<GetServerSidePropsResult<P>>
) {
  return withServerAuth(handler, { requiredRole: 'admin' });
}

/**
 * Helper to require employee role (or admin)
 */
export function requireServerEmployee<P extends Record<string, any> = Record<string, any>>(
  handler: (ctx: ServerAuthContext) => Promise<GetServerSidePropsResult<P>>
) {
  return withServerAuth(handler, { requiredRole: 'employee' });
}
