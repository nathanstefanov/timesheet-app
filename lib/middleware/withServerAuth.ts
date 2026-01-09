// lib/middleware/withServerAuth.ts
import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { supabaseAdmin } from '../supabaseAdmin';

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
 * Usage:
 * export const getServerSideProps = withServerAuth(async (ctx) => {
 *   // ctx.user is guaranteed to exist here
 *   const userId = ctx.user.id;
 *   return { props: {} };
 * }, { requiredRole: 'admin' });
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
    try {
      // Create Supabase client from request context
      const supabase = createServerSupabaseClient(ctx);

      // Get the user session
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      // If no session, redirect to login
      if (sessionError || !session?.user) {
        console.log('[withServerAuth] No session found, redirecting to login');
        return {
          redirect: {
            destination: options.redirectTo || '/login',
            permanent: false,
          },
        };
      }

      const user = session.user;

      // Fetch user profile to get role
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.error('[withServerAuth] Profile fetch error:', profileError.message);
        // If profile doesn't exist, redirect to login
        return {
          redirect: {
            destination: options.redirectTo || '/login',
            permanent: false,
          },
        };
      }

      const userRole = profile?.role as 'admin' | 'employee' | undefined;

      // If no role assigned, redirect to login
      if (!userRole) {
        console.log('[withServerAuth] User has no role assigned');
        return {
          redirect: {
            destination: options.redirectTo || '/login',
            permanent: false,
          },
        };
      }

      // Check role requirement
      if (options.requiredRole && userRole !== options.requiredRole) {
        console.log(
          `[withServerAuth] Access denied: required=${options.requiredRole}, actual=${userRole}`
        );

        // Redirect non-admin users to dashboard
        return {
          redirect: {
            destination: '/dashboard',
            permanent: false,
          },
        };
      }

      // Attach user to context
      const authContext = ctx as ServerAuthContext;
      authContext.user = {
        id: user.id,
        email: user.email,
        role: userRole,
      };

      // Call the handler
      return handler(authContext);
    } catch (error) {
      console.error('[withServerAuth] Unexpected error:', error);

      // On error, redirect to login
      return {
        redirect: {
          destination: options.redirectTo || '/login',
          permanent: false,
        },
      };
    }
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
