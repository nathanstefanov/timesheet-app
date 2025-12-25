// lib/api.ts
/**
 * Authenticated API client
 *
 * This module provides a wrapper around fetch() that automatically
 * includes authentication headers from the current Supabase session.
 */

import { supabase } from './supabaseClient';

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Make an authenticated API request
 *
 * @param url - API endpoint (e.g., '/api/schedule/shifts')
 * @param options - Fetch options (method, body, etc.)
 * @returns Response data
 * @throws ApiError if request fails
 */
export async function apiRequest<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  // Get current session
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    throw new ApiError('Failed to get session', 500);
  }

  if (!session) {
    throw new ApiError('Not authenticated', 401, 'UNAUTHENTICATED');
  }

  // Prepare headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  // Add auth header
  if (session.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  // Make request
  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Parse response
  let data: any;
  const contentType = response.headers.get('content-type');

  if (contentType?.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  // Handle errors
  if (!response.ok) {
    const errorMessage = data?.error || data?.message || `Request failed with status ${response.status}`;
    const errorCode = data?.code;

    throw new ApiError(errorMessage, response.status, errorCode);
  }

  return data;
}

/**
 * Convenience methods for common HTTP verbs
 */

export async function get<T = any>(url: string): Promise<T> {
  return apiRequest<T>(url, { method: 'GET' });
}

export async function post<T = any>(url: string, body?: any): Promise<T> {
  return apiRequest<T>(url, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function patch<T = any>(url: string, body?: any): Promise<T> {
  return apiRequest<T>(url, {
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function del<T = any>(url: string, body?: any): Promise<T> {
  return apiRequest<T>(url, {
    method: 'DELETE',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Example usage:
 *
 * import { get, post, ApiError } from '@/lib/api';
 *
 * try {
 *   const shifts = await get('/api/schedule/shifts');
 *   console.log(shifts);
 * } catch (error) {
 *   if (error instanceof ApiError) {
 *     if (error.statusCode === 401) {
 *       // Redirect to login
 *       router.push('/login');
 *     } else if (error.statusCode === 403) {
 *       // Show permission error
 *       alert('You do not have permission to perform this action');
 *     } else {
 *       // Show error message
 *       alert(error.message);
 *     }
 *   }
 * }
 */
